import {
  RangeSet,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type Text
} from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  type ViewUpdate
} from "@codemirror/view";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  isJapaneseLintSourceTooLarge
} from "../../shared/japaneseLint";
import {
  durationSincePerformanceMark,
  logRendererDebugEvent
} from "../debugLog";
import type {
  JapaneseLintDiagnostic,
  JapaneseLintRequest,
  JapaneseLintResponse,
  JapaneseLintSource
} from "../../shared/japaneseLint";
import errorIconUrl from "../../../assets/icons/codicons/general/error.svg?url";
import infoIconUrl from "../../../assets/icons/codicons/general/info.svg?url";
import warningIconUrl from "../../../assets/icons/codicons/general/warning.svg?url";

/**
 * #625 Slice 2: Japanese lint results shown as editor gutter icons with a
 * tooltip. Deliberately separate from the Markdown syntax checker
 * (@codemirror/lint): its own gutter lane, state, and no text underline, so
 * the two linters never overwrite each other's markers.
 */

/** Severity of a gutter marker. `error` exists for the icon set only. */
export type JapaneseLintMarkerSeverity = "info" | "warning" | "error";

/**
 * Japanese lint is a light hint, never a hard error: textlint's `error` is
 * shown as `warning`, `info` stays `info`.
 */
export function markerSeverityFor(
  severity: JapaneseLintDiagnostic["severity"]
): JapaneseLintMarkerSeverity {
  return severity === "info" ? "info" : "warning";
}

const severityRank: Readonly<Record<JapaneseLintMarkerSeverity, number>> = {
  info: 0,
  warning: 1,
  error: 2
};

export interface JapaneseLintLineMarker {
  /** 1-based line number. */
  readonly line: number;
  readonly severity: JapaneseLintMarkerSeverity;
  /** Multi-line tooltip text: "message\n(textlint-rule-<id>)" per diagnostic. */
  readonly tooltip: string;
}

export function formatDiagnosticTooltip(
  diagnostic: JapaneseLintDiagnostic
): string {
  return `${diagnostic.message}\n(textlint-rule-${diagnostic.ruleId})`;
}

/**
 * Groups diagnostics into one marker per line (the strongest severity wins,
 * tooltips are stacked). Lines outside 1..lineCount are dropped.
 */
export function buildLineMarkers(
  diagnostics: readonly JapaneseLintDiagnostic[],
  lineCount: number
): JapaneseLintLineMarker[] {
  const byLine = new Map<
    number,
    { severity: JapaneseLintMarkerSeverity; tooltips: string[] }
  >();

  for (const diagnostic of diagnostics) {
    if (diagnostic.line < 1 || diagnostic.line > lineCount) {
      continue;
    }

    const severity = markerSeverityFor(diagnostic.severity);
    const entry = byLine.get(diagnostic.line);

    if (entry === undefined) {
      byLine.set(diagnostic.line, {
        severity,
        tooltips: [formatDiagnosticTooltip(diagnostic)]
      });
    } else {
      if (severityRank[severity] > severityRank[entry.severity]) {
        entry.severity = severity;
      }
      entry.tooltips.push(formatDiagnosticTooltip(diagnostic));
    }
  }

  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([line, entry]) => ({
      line,
      severity: entry.severity,
      tooltip: entry.tooltips.join("\n\n")
    }));
}

const iconUrlBySeverity: Readonly<Record<JapaneseLintMarkerSeverity, string>> = {
  info: infoIconUrl,
  warning: warningIconUrl,
  error: errorIconUrl
};

class JapaneseLintMarker extends GutterMarker {
  constructor(
    readonly severity: JapaneseLintMarkerSeverity,
    readonly tooltip: string
  ) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return (
      other instanceof JapaneseLintMarker &&
      other.severity === this.severity &&
      other.tooltip === this.tooltip
    );
  }

  override toDOM(): Node {
    // Single-color icon drawn as a mask (see MaskedIcon.tsx), colored by the
    // per-severity theme tokens in styles.css.
    const element = document.createElement("span");

    element.className = "maskedIcon cm-pergamum-japaneseLintMarker";
    element.dataset.severity = this.severity;
    element.style.setProperty(
      "--masked-icon-url",
      `url("${iconUrlBySeverity[this.severity]}")`
    );
    element.title = this.tooltip;
    element.setAttribute("aria-label", this.tooltip);
    element.setAttribute("role", "img");

    return element;
  }
}

const setJapaneseLintMarkers = StateEffect.define<
  readonly JapaneseLintLineMarker[]
>();

const japaneseLintMarkersField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(markers, transaction) {
    let next = markers.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setJapaneseLintMarkers)) {
        const doc = transaction.state.doc;

        next = RangeSet.of(
          effect.value
            .filter((marker) => marker.line >= 1 && marker.line <= doc.lines)
            .map((marker) =>
              new JapaneseLintMarker(marker.severity, marker.tooltip).range(
                doc.line(marker.line).from
              )
            ),
          true
        );
      }
    }

    return next;
  }
});

// ---------------------------------------------------------------------------
// Driver: debounced lint requests with stale-result protection.
// ---------------------------------------------------------------------------

/**
 * A user-visible note about a lint pass that could not show everything:
 * the document is too large to lint at all, or the result was cut.
 */
export type JapaneseLintNotice = "too-large" | "truncated";

export interface JapaneseLintDriverConfig {
  /**
   * Called when a pass ends in a notice-worthy state. Fired once per state
   * change (not on every debounced re-lint) and re-armed when the linter is
   * turned OFF.
   */
  readonly onNotice?: (notice: JapaneseLintNotice) => void;
  /**
   * The source to lint as, or null while the linter is OFF or the active
   * surface is unsupported (then any markers are cleared).
   */
  readonly getSource: () => JapaneseLintSource | null;
  readonly lint: (request: JapaneseLintRequest) => Promise<JapaneseLintResponse>;
  /** Debounce for edits, ms. Matches the Markdown syntax checker (400). */
  readonly debounceMs?: number;
}

export const JAPANESE_LINT_DEBOUNCE_MS = 400;

const driverConfigs = new WeakMap<EditorView, JapaneseLintDriverConfig>();

export function registerJapaneseLintDriver(
  view: EditorView,
  config: JapaneseLintDriverConfig
): void {
  driverConfigs.set(view, config);
}

export function unregisterJapaneseLintDriver(view: EditorView): void {
  driverConfigs.delete(view);
}

class JapaneseLintDriver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;
  private destroyed = false;
  private lastNotice: JapaneseLintNotice | null = null;

  constructor(private readonly view: EditorView) {
    // The view registers its config right after construction, so run on the
    // next tick (this also covers a document switch, which rebuilds plugins).
    this.schedule(0);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this.schedule(
        driverConfigs.get(this.view)?.debounceMs ?? JAPANESE_LINT_DEBOUNCE_MS
      );
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.token += 1;

    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
  }

  /** Re-evaluates immediately (toggle, source change). */
  refresh(): void {
    this.schedule(0);
  }

  private schedule(delayMs: number): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    // Any pending response is now stale.
    this.token += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
  }

  private setMarkers(markers: readonly JapaneseLintLineMarker[]): void {
    this.view.dispatch({
      effects: setJapaneseLintMarkers.of(markers),
      annotations: Transaction.addToHistory.of(false)
    });
  }

  private clearMarkers(): void {
    if (this.view.state.field(japaneseLintMarkersField).size > 0) {
      this.setMarkers([]);
    }
  }

  /** Notifies once per state change; null re-arms the notice. */
  private notify(
    config: JapaneseLintDriverConfig,
    notice: JapaneseLintNotice | null
  ): void {
    if (notice === this.lastNotice) {
      return;
    }

    this.lastNotice = notice;

    if (notice !== null) {
      try {
        config.onNotice?.(notice);
      } catch {
        /* a notice must never break linting */
      }
    }
  }

  private async run(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const config = driverConfigs.get(this.view);
    const source = config?.getSource() ?? null;

    if (config === undefined || source === null) {
      this.clearMarkers();
      this.lastNotice = null;

      return;
    }

    const doc: Text = this.view.state.doc;
    const token = ++this.token;

    // Renderer-side guard: never even send a novel-sized text over IPC (the
    // Main Process would only refuse it).
    if (isJapaneseLintSourceTooLarge(doc.length)) {
      logRendererDebugEvent({
        level: "debug",
        event: "japaneseLint.request.completed",
        details: {
          result: "ignored",
          reason: "too_large",
          characterLength: doc.length,
          lineCount: doc.lines
        }
      });
      this.clearMarkers();
      this.notify(config, "too-large");

      return;
    }

    let response: JapaneseLintResponse;
    const requestStartedAt = performance.now();

    logRendererDebugEvent({
      level: "debug",
      event: "japaneseLint.request.started",
      details: {
        characterLength: doc.length,
        lineCount: doc.lines,
        extension: source.ext
      }
    });

    try {
      response = await config.lint({ text: doc.toString(), ...source });
    } catch {
      // The bridge threw or the IPC rejected: treat as a failed lint.
      response = { ok: false, reason: "lint-failed" };
    }

    logRendererDebugEvent({
      level: "debug",
      event: "japaneseLint.request.completed",
      details: {
        durationMs: durationSincePerformanceMark(requestStartedAt),
        result: response.ok
          ? "succeeded"
          : response.reason === "too-large"
            ? "ignored"
            : "failed",
        ...(response.ok
          ? { count: response.diagnostics.length }
          : {
              reason:
                response.reason === "too-large"
                  ? "too_large"
                  : response.reason === "invalid-request"
                    ? "validation_failed"
                    : "lint_failed"
            })
      }
    });

    // Discard stale results: a newer request/edit/toggle superseded this one,
    // or the document is no longer the one that was linted.
    if (
      this.destroyed ||
      token !== this.token ||
      this.view.state.doc !== doc ||
      config.getSource() === null
    ) {
      return;
    }

    if (!response.ok) {
      // A failed / skipped lint shows no diagnostics rather than markers that
      // may no longer match the text.
      this.clearMarkers();
      this.notify(config, response.reason === "too-large" ? "too-large" : null);

      return;
    }

    // Defensive: the Main Process already caps the result, but a marker pass
    // must stay cheap whatever arrives.
    const diagnostics = response.diagnostics.slice(
      0,
      JAPANESE_LINT_MAX_RESULT_COUNT
    );
    const truncated =
      response.truncated ||
      response.diagnostics.length > JAPANESE_LINT_MAX_RESULT_COUNT;
    const buildStartedAt = performance.now();
    const markers = buildLineMarkers(diagnostics, doc.lines);

    logRendererDebugEvent({
      level: "debug",
      event: "japaneseLint.markers.built",
      details: {
        durationMs: durationSincePerformanceMark(buildStartedAt),
        count: markers.length
      }
    });

    const applyStartedAt = performance.now();

    this.setMarkers(markers);
    logRendererDebugEvent({
      level: "debug",
      event: "japaneseLint.markers.applied",
      details: {
        durationMs: durationSincePerformanceMark(applyStartedAt),
        count: markers.length
      }
    });
    this.notify(config, truncated ? "truncated" : null);
  }
}

const japaneseLintDriverPlugin = ViewPlugin.fromClass(JapaneseLintDriver);

/** Re-runs (or clears) the Japanese lint for `view` right away. */
export function refreshJapaneseLint(view: EditorView): void {
  view.plugin(japaneseLintDriverPlugin)?.refresh();
}

export function createJapaneseLintExtension(): Extension {
  return [
    japaneseLintMarkersField,
    // No initialSpacer: with no markers the lane collapses to zero width, so
    // an editor with the linter OFF looks exactly as before.
    gutter({
      class: "cm-pergamum-japaneseLintGutter",
      markers: (view) => view.state.field(japaneseLintMarkersField)
    }),
    japaneseLintDriverPlugin
  ];
}

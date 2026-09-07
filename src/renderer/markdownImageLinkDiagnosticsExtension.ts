/**
 * #411: CodeMirror lint extension that surfaces broken project-local image
 * links in the active Markdown editor as `warning` diagnostics (lint gutter
 * marker + an inline underline on the link path + a hover message).
 *
 * `warning`, not `error`: the Markdown text is still perfectly saveable — only
 * the image *display* is broken.
 *
 * Read-only. The linter extracts every project-local image link and its
 * offsets ({@link extractProjectLocalImageLinks}), asks the main process which
 * are broken (`window.pergamum.markdownImageLinkDiagnostics.validate` — main
 * owns the project root and every filesystem check), and maps the answer back
 * onto CodeMirror `Diagnostic`s. It never edits the document.
 *
 * Wired for a project Markdown document editor (`sourceFile` context) and the
 * Glossary editor (`projectRoot` context) — see MarkdownEditor.tsx. When
 * `getResolutionContext()` returns `{ kind: "none" }` (a standalone /
 * non-project / read-only surface) the linter is a no-op and produces zero
 * diagnostics.
 *
 * Staleness: the linter re-runs on document change (debounced). An in-flight
 * IPC response is discarded unless BOTH the document is byte-for-byte
 * unchanged since the request AND the resolution context is still the same —
 * so a tab switch / close / external edit can never leave a stale marker.
 * Offsets from main are clamped to the current document length before use.
 *
 * The per-`EditorView` options map mirrors #407's paste extension: the #392
 * per-tab EditorState cache bakes this extension into a cached state, so the
 * options object captured at build time can outlive its React closure. The
 * map is refreshed on every view (re)creation, and the linter reads the
 * freshest entry.
 */

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";

import { extractProjectLocalImageLinks } from "../shared/markdownImageLinkExtraction";
import type {
  MarkdownImageLinkDiagnosticReason,
  MarkdownImageLinkDiagnosticsRequest,
  MarkdownImageLinkDiagnosticsResult,
  ProjectLocalImageResolutionContext
} from "../shared/api";

/** Stable identity key for a resolution context (for the staleness guard). */
function resolutionContextKey(
  context: ProjectLocalImageResolutionContext
): string {
  return context.kind === "sourceFile"
    ? `sourceFile:${context.sourceMarkdownProjectRelativePath}`
    : context.kind;
}

export interface MarkdownImageLinkDiagnosticsExtensionOptions {
  /**
   * How the edited surface anchors project-local links, or `{ kind: "none" }`
   * when diagnostics must not run (standalone / non-project / read-only).
   * `sourceFile` for a Markdown document editor, `projectRoot` for the
   * Glossary editor. Read fresh on every lint pass.
   */
  readonly getResolutionContext: () => ProjectLocalImageResolutionContext;
  /** Bridge to the main-process validator (usually the preload IPC method). */
  readonly validate: (
    request: MarkdownImageLinkDiagnosticsRequest
  ) => Promise<MarkdownImageLinkDiagnosticsResult>;
  /** Localized hover message for a `reason` + offending `src`. */
  readonly formatMessage: (
    reason: MarkdownImageLinkDiagnosticReason,
    src: string
  ) => string;
  /** Lint debounce, ms. Defaults to 400. */
  readonly debounceMs?: number;
}

export const editorViewImageLinkDiagnosticsOptionsMap = new WeakMap<
  EditorView,
  MarkdownImageLinkDiagnosticsExtensionOptions
>();

export function registerEditorViewImageLinkDiagnosticsOptions(
  view: EditorView,
  options: MarkdownImageLinkDiagnosticsExtensionOptions
): void {
  editorViewImageLinkDiagnosticsOptionsMap.set(view, options);
}

export function unregisterEditorViewImageLinkDiagnosticsOptions(
  view: EditorView
): void {
  editorViewImageLinkDiagnosticsOptionsMap.delete(view);
}

const DIAGNOSTIC_SOURCE = "pergamum-image-link";

/**
 * Run one lint pass for `view`. Exported for tests (which drive it with a
 * fake view + injected options rather than a real EditorView).
 */
export async function runMarkdownImageLinkDiagnostics(
  view: {
    readonly state: {
      readonly doc: {
        readonly length: number;
        toString(): string;
      };
    };
  },
  options: MarkdownImageLinkDiagnosticsExtensionOptions
): Promise<Diagnostic[]> {
  const context = options.getResolutionContext();
  if (context.kind === "none") {
    return [];
  }
  const contextKey = resolutionContextKey(context);

  const docText = view.state.doc.toString();
  const links = extractProjectLocalImageLinks(docText);
  if (links.length === 0) {
    return [];
  }

  let result: MarkdownImageLinkDiagnosticsResult;
  try {
    result = await options.validate({
      resolutionContext: context,
      links: links.map((link) => ({
        src: link.src,
        from: link.from,
        to: link.to
      }))
    });
  } catch {
    return [];
  }

  // Staleness guard: only apply if nothing that would invalidate this pass
  // changed while the IPC was in flight.
  if (
    !result.ok ||
    view.state.doc.toString() !== docText ||
    resolutionContextKey(options.getResolutionContext()) !== contextKey
  ) {
    return [];
  }

  const docLength = view.state.doc.length;
  return result.diagnostics.map((diagnostic) => {
    const from = Math.max(0, Math.min(diagnostic.from, docLength));
    const to = Math.max(from, Math.min(diagnostic.to, docLength));
    return {
      from,
      to,
      severity: "warning" as const,
      source: DIAGNOSTIC_SOURCE,
      message: options.formatMessage(diagnostic.reason, diagnostic.src)
    };
  });
}

export function createMarkdownImageLinkDiagnosticsExtension(
  options: MarkdownImageLinkDiagnosticsExtensionOptions
): Extension {
  const lintSource = (view: EditorView): Promise<Diagnostic[]> => {
    const activeOptions =
      editorViewImageLinkDiagnosticsOptionsMap.get(view) ?? options;
    return runMarkdownImageLinkDiagnostics(view, activeOptions);
  };

  return [
    lintGutter(),
    linter(lintSource, { delay: options.debounceMs ?? 400 })
  ];
}

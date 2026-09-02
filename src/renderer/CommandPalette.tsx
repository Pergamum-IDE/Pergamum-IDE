import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject
} from "react";
import type { CommandContext } from "../shared/commandEnablement";
import type { CommandId, CommandRegistry } from "../shared/commandRegistry";
import { editorCommandIds } from "../shared/commandIds";
import type { ProjectDocument } from "../shared/api";
import type {
  Translate,
  TranslationKey,
  TranslationValues
} from "../shared/i18n";
import {
  builtInDefaultSettings,
  type CommandPaletteFooterDetailSettings
} from "../shared/settings";
import {
  type CommandPaletteFilteredEntry,
  type CommandPaletteMatchRange,
  commandPaletteResultCountKey,
  filterCommandPaletteEntries,
  listCommandPaletteEntries,
  mergeCommandPaletteMatchRanges,
  moveCommandPaletteSelection,
  resolveCommandPalettePagedSelection,
  resolveCommandPaletteSelection,
  type CommandPalettePagedTarget
} from "./commandPaletteEntries";
import {
  commandPaletteNotImplementedStatusIndicator,
  resolveDisabledCommandPaletteStatusIndicator,
  type CommandPaletteStatusIndicator
} from "./commandPaletteStatusIndicators";
import {
  lineJumpMessageKey,
  resolveLineJumpFooterModel,
  resolveLineJumpPaletteState,
  type LineJumpPaletteState
} from "./lineJumpPaletteState";
import type { LineJumpEditorSnapshot } from "./lineJumpQuery";
import {
  projectFileQuickOpenCandidates,
  resolveProjectFileQuickOpenSelection,
  type ProjectFileQuickOpenCandidate
} from "./projectFileQuickOpen";
import {
  parseQuickAccessInput,
  type QuickAccessMode
} from "./quickAccessInputParser";

export interface CommandPaletteProps {
  commandRegistry: CommandRegistry;
  translate: Translate;
  isComposing: () => boolean;
  /**
   * The live command context at the moment the Palette renders. Captured
   * once at mount into an eager, copied snapshot (#128) — the Palette must
   * not re-read live state while open, both to avoid the DOM focus trap
   * (opening the Palette steals focus) and to keep display-time enablement
   * stable until the Palette closes, even if the live context changes.
   */
  commandContext: CommandContext;
  onExecuteCommand: (
    commandId: CommandId<readonly unknown[], unknown>,
    ...args: readonly unknown[]
  ) => void;
  /** Debug-only UI-level block diagnostic, distinct from `command.ignored`. */
  onBlockedCommand: (commandId: CommandId<readonly unknown[], unknown>) => void;
  onClose: () => void;
  /**
   * Overrides the starting search input value (including the leading `>`
   * mode prefix). Defaults to `>` (Command Palette mode, empty query).
   * Exists so tests can render the Palette already in a non-empty-query
   * state — this project has no interactive DOM testing library, so
   * keystrokes cannot be simulated against a static render.
   */
  initialInputValue?: string;
  /**
   * Line count / line text of the active line-addressable editor, for line
   * jump candidate generation and preview (#140, expanded to prefix
   * candidates in #148); null when there is no such editor active. Optional/
   * defaulted so callers that don't need line jump (and existing tests) are
   * unaffected. The Palette never inspects editor/document internals
   * itself — App.tsx supplies this, typically via
   * `createLineJumpEditorSnapshot`, which caches the "\n" split so up to
   * `maxCandidates` preview lookups per keystroke stay cheap.
   */
  lineJumpEditorSnapshot?: LineJumpEditorSnapshot | null;
  projectFileQuickOpenDocuments?: readonly ProjectDocument[];
  recentProjectFileQuickOpenDocuments?: readonly ProjectDocument[];
  onOpenProjectFileQuickOpenCandidate?: (relativePath: string) => void;
  /**
   * #372: fetch the footer detail preview line (first non-empty Markdown line)
   * for the selected file quick open candidate. Resolves to `null` when there
   * is nothing to show. The Palette reads only the currently selected
   * candidate, ignores stale results, and never reads the filesystem itself —
   * App.tsx wires this to the Main Process
   * `projects.readProjectDocumentPreviewLine` API.
   */
  onRequestProjectFileQuickOpenPreview?: (
    relativePath: string
  ) => Promise<string | null>;
  footerDetailSettings?: CommandPaletteFooterDetailSettings;
}

const defaultInputValue = ">";
const defaultFooterDetailSettings =
  builtInDefaultSettings.commandPalette.footerDetail;
const useCommandPaletteLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface CommandPaletteFooterModel {
  readonly statusKey: TranslationKey | null;
  readonly statusValues?: TranslationValues;
  readonly statusText?: string;
  readonly detailText?: string;
  readonly detailResetKey?: string;
  readonly canRunSelected: boolean;
}

export interface CommandPaletteFooterDetailMarqueeInput {
  readonly enabled: boolean;
  readonly reducedMotion: boolean;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly delayMs: number;
  readonly speedPxPerSecond: number;
}

export interface CommandPaletteFooterDetailMarqueeState {
  readonly overflowing: boolean;
  readonly active: boolean;
  readonly distancePx: number;
  readonly durationMs: number;
  readonly delayMs: number;
  readonly speedPxPerSecond: number;
}

const inactiveCommandPaletteFooterDetailMarqueeState: CommandPaletteFooterDetailMarqueeState =
  {
    overflowing: false,
    active: false,
    distancePx: 0,
    durationMs: 0,
    delayMs: 0,
    speedPxPerSecond: 0
  };

export function resolveCommandPaletteFooterDetailMarquee(
  input: CommandPaletteFooterDetailMarqueeInput
): CommandPaletteFooterDetailMarqueeState {
  const distancePx = Math.max(0, input.scrollWidth - input.clientWidth);
  const overflowing = distancePx > 0;

  if (
    !input.enabled ||
    input.reducedMotion ||
    !overflowing ||
    input.speedPxPerSecond <= 0
  ) {
    return {
      overflowing,
      active: false,
      distancePx,
      durationMs: 0,
      delayMs: input.delayMs,
      speedPxPerSecond: input.speedPxPerSecond
    };
  }

  return {
    overflowing,
    active: true,
    distancePx,
    durationMs: (distancePx / input.speedPxPerSecond) * 1000,
    delayMs: input.delayMs,
    speedPxPerSecond: input.speedPxPerSecond
  };
}

export interface CommandPaletteScrollTarget {
  scrollIntoView(options?: ScrollIntoViewOptions): void;
}

function reservedPlaceholderKey(mode: QuickAccessMode): TranslationKey | null {
  switch (mode) {
    case "file":
      return null;
    case "line":
      // Line mode is implemented (#140); it renders its own body instead of
      // this reserved-placeholder text.
      return null;
    case "heading":
      return "commandPalette.reserved.heading";
    case "glossary":
      return "commandPalette.reserved.glossary";
    case "command":
      return null;
  }
}

export function commandPaletteItemClassName(
  selected: boolean,
  enabled: boolean
): string {
  const classNames = ["commandPaletteItem"];

  if (selected) {
    classNames.push("commandPaletteItemSelected");
  }

  if (!enabled) {
    classNames.push("commandPaletteItemDisabled");
  }

  return classNames.join(" ");
}

export function scrollCommandPaletteSelectionIntoView(
  selectedItem: CommandPaletteScrollTarget | null
): void {
  selectedItem?.scrollIntoView({ block: "nearest" });
}

function selectedCommandPaletteEntry(
  entries: readonly CommandPaletteFilteredEntry[],
  selectedIndex: number | null
): CommandPaletteFilteredEntry | null {
  return selectedIndex === null ? null : entries[selectedIndex] ?? null;
}

function selectedProjectFileQuickOpenCandidate(
  candidates: readonly ProjectFileQuickOpenCandidate[],
  selectedIndex: number | null
): ProjectFileQuickOpenCandidate | null {
  return selectedIndex === null ? null : candidates[selectedIndex] ?? null;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    setPrefersReducedMotion(media.matches);

    function handleChange(event: MediaQueryListEvent): void {
      setPrefersReducedMotion(event.matches);
    }

    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  return prefersReducedMotion;
}

function useCommandPaletteFooterDetailMarquee(input: {
  readonly enabled: boolean;
  readonly resetKey: string;
  readonly settings: CommandPaletteFooterDetailSettings;
}): {
  readonly containerRef: RefObject<HTMLDivElement>;
  readonly textRef: RefObject<HTMLSpanElement>;
  readonly state: CommandPaletteFooterDetailMarqueeState;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<CommandPaletteFooterDetailMarqueeState>(
    inactiveCommandPaletteFooterDetailMarqueeState
  );

  useCommandPaletteLayoutEffect(() => {
    setState(inactiveCommandPaletteFooterDetailMarqueeState);

    if (!input.enabled) {
      return;
    }

    const container = containerRef.current;
    const text = textRef.current;

    if (!container || !text) {
      return;
    }

    const measure = () => {
      setState(
        resolveCommandPaletteFooterDetailMarquee({
          enabled: input.enabled,
          reducedMotion,
          scrollWidth: text.scrollWidth,
          clientWidth: container.clientWidth,
          delayMs: input.settings.marquee.delay,
          speedPxPerSecond: input.settings.marquee.speed
        })
      );
    };

    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      measure();
      return;
    }

    const animationFrame = window.requestAnimationFrame(measure);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    input.enabled,
    input.resetKey,
    input.settings.marquee.delay,
    input.settings.marquee.speed,
    reducedMotion
  ]);

  return { containerRef, textRef, state };
}

/**
 * Footer status priority (highest first):
 *  1. disabled selected command message
 *  2. enabled selected command detail
 *  3. non-empty query result count
 *  4. command mode empty-query hint — only once the user has actually typed
 *     the `>` prefix, not for a fully empty input (which shows the native
 *     placeholder instead, per #129)
 *  5. empty status
 *
 * `inputValue` is taken separately from `query` so this function can react
 * to the raw input rather than just the parsed query; `mode !== "command"`
 * already covers the fully-empty case today (empty input parses to file
 * mode, per #139/#145), but the check is kept so command-mode empty-query
 * display does not depend on that no-longer-obvious invariant.
 */
export function resolveCommandPaletteFooterModel(input: {
  readonly mode: QuickAccessMode;
  readonly query: string;
  readonly inputValue: string;
  readonly entries: readonly CommandPaletteFilteredEntry[];
  readonly selectedIndex: number | null;
  readonly detailEnabled?: boolean;
}): CommandPaletteFooterModel {
  const selectedEntry = selectedCommandPaletteEntry(
    input.entries,
    input.selectedIndex
  );
  const canRunSelected = selectedEntry?.enabled === true;

  if (input.mode !== "command") {
    return {
      statusKey: null,
      canRunSelected: false
    };
  }

  if (selectedEntry && !selectedEntry.enabled) {
    return {
      statusKey:
        selectedEntry.disabledReason === "readOnlyProject"
          ? "command.disabled.readOnlyProject"
          : "commandPalette.footer.disabled",
      canRunSelected
    };
  }

  if (
    input.detailEnabled !== false &&
    selectedEntry?.enabled === true &&
    selectedEntry.description
  ) {
    return {
      statusKey: null,
      detailText: selectedEntry.description,
      detailResetKey: String(selectedEntry.id),
      canRunSelected
    };
  }

  if (input.query.trim().length > 0) {
    return {
      statusKey: commandPaletteResultCountKey(input.entries.length),
      statusValues: { count: input.entries.length },
      canRunSelected
    };
  }

  if (input.inputValue.trim().length > 0) {
    return {
      statusKey: "commandPalette.footer.searchHint",
      canRunSelected
    };
  }

  return {
    statusKey: null,
    canRunSelected
  };
}

/**
 * #372: whether the Palette should ask Main for a footer detail preview line
 * for the currently selected file quick open candidate. Only prefix-less file
 * quick open mode qualifies, only with footer detail enabled (#370), and only
 * when a candidate is actually selected. Project-not-open collapses to "no
 * candidate", so it is covered by `activeRelativePath === null`.
 */
export function shouldRequestProjectFileQuickOpenPreview(input: {
  readonly mode: QuickAccessMode;
  readonly activeRelativePath: string | null;
  readonly detailEnabled: boolean;
}): boolean {
  return (
    input.mode === "file" &&
    input.detailEnabled &&
    input.activeRelativePath !== null
  );
}

/**
 * #372: footer model for prefix-less file quick open mode. The preview line
 * (when present, and footer detail is enabled) rides the #370 footer detail
 * channel — `detailText` + `detailResetKey`. `detailResetKey` includes the
 * selected file's project-relative path so the marquee resets on selection
 * change. The candidate list itself is never touched.
 */
export function resolveProjectFileQuickOpenFooterModel(input: {
  readonly activeCandidate: ProjectFileQuickOpenCandidate | null;
  readonly previewText: string | null;
  readonly detailEnabled: boolean;
}): CommandPaletteFooterModel {
  const canRunSelected = input.activeCandidate !== null;

  if (
    input.detailEnabled &&
    input.activeCandidate !== null &&
    input.previewText !== null &&
    input.previewText.length > 0
  ) {
    return {
      statusKey: null,
      detailText: input.previewText,
      detailResetKey: `projectFileQuickOpenPreview:${input.activeCandidate.document.relativePath}`,
      canRunSelected
    };
  }

  return {
    statusKey: null,
    canRunSelected
  };
}

export function CommandPaletteHighlightedText({
  text,
  ranges
}: {
  readonly text: string;
  readonly ranges: readonly CommandPaletteMatchRange[];
}): JSX.Element {
  const mergedRanges = mergeCommandPaletteMatchRanges(ranges);

  if (mergedRanges.length === 0) {
    return <>{text}</>;
  }

  const nodes: ReactNode[] = [];
  let offset = 0;

  for (const range of mergedRanges) {
    if (range.start > offset) {
      nodes.push(text.slice(offset, range.start));
    }

    nodes.push(
      <mark
        className="commandPaletteMatch"
        key={`${range.start}:${range.end}`}
      >
        {text.slice(range.start, range.end)}
      </mark>
    );
    offset = range.end;
  }

  if (offset < text.length) {
    nodes.push(text.slice(offset));
  }

  return <>{nodes}</>;
}

function commandPaletteInputPlaceholderKey(
  mode: QuickAccessMode
): TranslationKey {
  return mode === "file"
    ? "commandPalette.projectFileQuickOpen.inputPlaceholder"
    : "commandPalette.inputPlaceholder";
}

function commandPaletteEmptyResultKey(mode: QuickAccessMode): TranslationKey {
  return mode === "file"
    ? "commandPalette.projectFileQuickOpen.noResults"
    : "commandPalette.noResults";
}

function CommandPaletteStatusColumn({
  indicator
}: {
  readonly indicator: CommandPaletteStatusIndicator | null;
}): JSX.Element {
  return (
    <span className="commandPaletteStatusColumn" aria-hidden="true">
      {indicator ? (
        <span
          className={`commandPaletteStatusIcon commandPaletteStatusIcon-${indicator.kind}`}
          data-command-palette-status-icon={indicator.kind}
          dangerouslySetInnerHTML={{ __html: indicator.iconSvg }}
        />
      ) : null}
    </span>
  );
}

function CommandPaletteItemContent({
  indicator,
  primary,
  secondary = null
}: {
  readonly indicator: CommandPaletteStatusIndicator | null;
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
}): JSX.Element {
  return (
    <>
      <CommandPaletteStatusColumn indicator={indicator} />
      <div className="commandPaletteItemText">
        <div className="commandPaletteItemPrimary">{primary}</div>
        {secondary ? (
          <div className="commandPaletteItemSecondary">{secondary}</div>
        ) : null}
      </div>
    </>
  );
}

function CommandPaletteReservedPlaceholder({
  indicator,
  children
}: {
  readonly indicator: CommandPaletteStatusIndicator | null;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="commandPaletteReservedPlaceholder">
      <CommandPaletteStatusColumn indicator={indicator} />
      <span className="commandPaletteReservedPlaceholderText">{children}</span>
    </div>
  );
}

export function CommandPalette({
  commandRegistry,
  translate,
  isComposing,
  commandContext,
  onExecuteCommand,
  onBlockedCommand,
  onClose,
  initialInputValue = defaultInputValue,
  lineJumpEditorSnapshot = null,
  projectFileQuickOpenDocuments = [],
  recentProjectFileQuickOpenDocuments = [],
  onOpenProjectFileQuickOpenCandidate = () => undefined,
  onRequestProjectFileQuickOpenPreview,
  footerDetailSettings = defaultFooterDetailSettings
}: CommandPaletteProps): JSX.Element {
  const [snapshot] = useState<CommandContext>(() => commandContext);
  const [inputValue, setInputValue] = useState(initialInputValue);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(() => {
    const initialParsed = parseQuickAccessInput(initialInputValue);

    if (initialParsed.mode === "file") {
      return resolveProjectFileQuickOpenSelection(
        projectFileQuickOpenCandidates({
          documents: projectFileQuickOpenDocuments,
          recentDocuments: recentProjectFileQuickOpenDocuments,
          query: initialParsed.query
        })
      );
    }

    if (initialParsed.mode === "line") {
      const initialState = resolveLineJumpPaletteState(
        initialParsed.query,
        lineJumpEditorSnapshot
      );

      return initialState.kind === "executable" ? 0 : null;
    }

    if (initialParsed.mode !== "command") {
      return null;
    }

    // #316: seed the active selection with the *actual* initial query, not
    // "" — an initial non-empty query must not point the selection into the
    // unfiltered list (stale / out-of-range on the very first ENTER).
    return resolveCommandPaletteSelection(
      filterCommandPaletteEntries(
        listCommandPaletteEntries(commandRegistry, snapshot),
        initialParsed.query
      )
    );
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedItemRef = useRef<HTMLLIElement | null>(null);
  const paletteId = useId();
  const listboxId = `${paletteId}-listbox`;
  const optionId = (index: number): string => `${paletteId}-option-${index}`;

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const { mode, query } = parseQuickAccessInput(inputValue);
  const fileQuickOpenCandidates =
    mode === "file"
      ? projectFileQuickOpenCandidates({
          documents: projectFileQuickOpenDocuments,
          recentDocuments: recentProjectFileQuickOpenDocuments,
          query
        })
      : [];
  const entries =
    mode === "command"
      ? filterCommandPaletteEntries(
          listCommandPaletteEntries(commandRegistry, snapshot),
          query
        )
      : [];
  const lineJumpState: LineJumpPaletteState | null =
    mode === "line"
      ? resolveLineJumpPaletteState(query, lineJumpEditorSnapshot)
      : null;
  const lineJumpCandidates =
    lineJumpState?.kind === "executable" ? lineJumpState.candidates : null;
  // ArrowUp/ArrowDown and scroll-into-view operate on whichever list is
  // showing: command entries, line jump candidates, or (for the disabled
  // row, which is always exactly one item) a length of 1.
  const selectionLength =
    mode === "command"
      ? entries.length
      : mode === "file"
        ? fileQuickOpenCandidates.length
        : (lineJumpCandidates?.length ??
          (lineJumpState?.kind === "disabled" ? 1 : 0));

  useEffect(() => {
    scrollCommandPaletteSelectionIntoView(selectedItemRef.current);
  }, [selectionLength, mode, query, selectedIndex]);

  // #316: keep the command-mode active selection valid whenever the list
  // itself changes (a new query, or a `commandRegistry` re-memo). A
  // still-valid, still-enabled selection is kept; a stale / out-of-range /
  // now-disabled one is replaced. Runs as a *layout* effect so the
  // normalization (and its re-render) is committed before the browser can
  // deliver the next keydown — so a fast ENTER can never act on a stale
  // `selectedIndex`. It is NOT keyed on `selectedIndex`, so ArrowUp/ArrowDown
  // onto a disabled row inside an unchanged list is left alone.
  useCommandPaletteLayoutEffect(() => {
    if (mode !== "command") {
      return;
    }

    setSelectedIndex((current) =>
      resolveCommandPaletteSelection(entries, current)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, query, commandRegistry, snapshot]);

  useCommandPaletteLayoutEffect(() => {
    if (mode !== "file") {
      return;
    }

    setSelectedIndex((current) =>
      resolveProjectFileQuickOpenSelection(fileQuickOpenCandidates, current)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    query,
    projectFileQuickOpenDocuments,
    recentProjectFileQuickOpenDocuments
  ]);

  function updateInput(value: string): void {
    setInputValue(value);

    const resolved = parseQuickAccessInput(value);

    if (resolved.mode === "command") {
      const nextEntries = filterCommandPaletteEntries(
        listCommandPaletteEntries(commandRegistry, snapshot),
        resolved.query
      );

      // A new query means a new list — keep the active command if it is
      // still present and enabled, otherwise fall back to the first enabled
      // row (or row 0 when every match is disabled).
      setSelectedIndex((current) =>
        resolveCommandPaletteSelection(nextEntries, current)
      );
      return;
    }

    if (resolved.mode === "line") {
      // Selection always resets to the first candidate on a query change
      // (never preserves the previous index — a different query means a
      // different candidate list, so the old index could point at an
      // unrelated line, per #148).
      const nextState = resolveLineJumpPaletteState(
        resolved.query,
        lineJumpEditorSnapshot
      );

      setSelectedIndex(nextState.kind === "executable" ? 0 : null);
      return;
    }

    if (resolved.mode === "file") {
      const nextCandidates = projectFileQuickOpenCandidates({
        documents: projectFileQuickOpenDocuments,
        recentDocuments: recentProjectFileQuickOpenDocuments,
        query: resolved.query
      });

      setSelectedIndex((current) =>
        resolveProjectFileQuickOpenSelection(nextCandidates, current)
      );
      return;
    }

    setSelectedIndex(null);
  }

  // #316: the single current-render active command in command mode. Every
  // consumer — ENTER, the footer, `aria-activedescendant`, the selected row
  // — is derived from this, so visual selection and execution target can
  // never diverge.
  const activeEntry =
    mode === "command"
      ? selectedCommandPaletteEntry(entries, selectedIndex)
      : null;
  const activeProjectFileQuickOpenCandidate =
    mode === "file"
      ? selectedProjectFileQuickOpenCandidate(
          fileQuickOpenCandidates,
          selectedIndex
        )
      : null;
  const activeProjectFileQuickOpenRelativePath =
    activeProjectFileQuickOpenCandidate?.document.relativePath ?? null;

  // #372: footer detail preview line for the selected file quick open
  // candidate. Only the selected candidate is ever read; a stale async result
  // (input / selection moved on) is dropped via a monotonic request id, so
  // the footer never shows a preview for a file that is no longer selected. A
  // failed fetch simply leaves the preview empty and never closes the Palette.
  const [projectFileQuickOpenPreview, setProjectFileQuickOpenPreview] =
    useState<string | null>(null);
  const projectFileQuickOpenPreviewRequestRef = useRef(0);
  // Held in a ref so a caller passing a fresh function identity each render
  // (App.tsx does) cannot retrigger the fetch effect — only the selected
  // file, the mode, and the footer-detail toggle do.
  const requestProjectFileQuickOpenPreviewRef = useRef(
    onRequestProjectFileQuickOpenPreview
  );
  requestProjectFileQuickOpenPreviewRef.current =
    onRequestProjectFileQuickOpenPreview;

  useEffect(() => {
    projectFileQuickOpenPreviewRequestRef.current += 1;
    const requestId = projectFileQuickOpenPreviewRequestRef.current;
    const isStale = (): boolean =>
      projectFileQuickOpenPreviewRequestRef.current !== requestId;
    const request = requestProjectFileQuickOpenPreviewRef.current;

    // Nothing displayed while loading / when there is nothing to load.
    setProjectFileQuickOpenPreview(null);

    if (
      !request ||
      !shouldRequestProjectFileQuickOpenPreview({
        mode,
        activeRelativePath: activeProjectFileQuickOpenRelativePath,
        detailEnabled: footerDetailSettings.enable
      })
    ) {
      return;
    }

    void request(activeProjectFileQuickOpenRelativePath as string)
      .then((preview) => {
        if (isStale()) {
          return;
        }

        setProjectFileQuickOpenPreview(
          typeof preview === "string" && preview.length > 0 ? preview : null
        );
      })
      .catch(() => {
        if (isStale()) {
          return;
        }

        setProjectFileQuickOpenPreview(null);
      });
    // `onRequestProjectFileQuickOpenPreview` is read through a ref on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    activeProjectFileQuickOpenRelativePath,
    footerDetailSettings.enable
  ]);

  const activeCommandId = activeEntry?.id ?? null;
  const activeOptionId =
    mode === "command" && activeEntry !== null && selectedIndex !== null
      ? optionId(selectedIndex)
      : mode === "file" &&
          activeProjectFileQuickOpenCandidate !== null &&
          selectedIndex !== null
        ? optionId(selectedIndex)
        : undefined;

  function executeEntryAt(index: number): void {
    const entry = entries[index];

    if (!entry) {
      return;
    }

    if (!entry.enabled) {
      onBlockedCommand(entry.id);
      return;
    }

    onExecuteCommand(entry.id);
  }

  function executeLineJumpCandidateAt(index: number): void {
    const candidate = lineJumpCandidates?.[index];

    if (!candidate) {
      return;
    }

    onExecuteCommand(editorCommandIds.goToLine, candidate.line);
  }

  function executeProjectFileQuickOpenCandidateAt(index: number): void {
    const candidate = fileQuickOpenCandidates[index];

    if (!candidate) {
      return;
    }

    onOpenProjectFileQuickOpenCandidate(candidate.document.relativePath);
  }

  /** Handles Enter for line mode: the disabled row, or the selected candidate. */
  function executeLineJumpResult(): void {
    if (!lineJumpState) {
      return;
    }

    if (lineJumpState.kind === "disabled") {
      onBlockedCommand(editorCommandIds.goToLine);
      return;
    }

    if (lineJumpState.kind === "executable") {
      executeLineJumpCandidateAt(selectedIndex ?? 0);
    }
  }

  /**
   * #316: whether this keydown is part of an IME composition. The Palette
   * reuses the app-wide `isComposing()` guard AND the standard per-event
   * signals (`KeyboardEvent.isComposing`, the legacy `keyCode === 229`
   * sentinel) so the decision does not depend on the ordering of
   * `compositionend` relative to this keydown. No new composition-tracking
   * state is introduced.
   */
  function isImeCompositionKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>
  ): boolean {
    return (
      isComposing() ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    );
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    switch (event.key) {
      case "Escape": {
        if (isImeCompositionKeyDown(event)) {
          return;
        }
        event.preventDefault();
        onClose();
        return;
      }
      case "ArrowDown": {
        if (isImeCompositionKeyDown(event)) {
          return;
        }
        event.preventDefault();
        setSelectedIndex((current) =>
          moveCommandPaletteSelection(selectionLength, current, 1)
        );
        return;
      }
      case "ArrowUp": {
        if (isImeCompositionKeyDown(event)) {
          return;
        }
        event.preventDefault();
        setSelectedIndex((current) =>
          moveCommandPaletteSelection(selectionLength, current, -1)
        );
        return;
      }
      case "Home":
      case "End":
      case "PageUp":
      case "PageDown": {
        if (isImeCompositionKeyDown(event)) {
          return;
        }
        // #316 follow-up: the "big move" keys are command-mode only — line
        // jump navigation stays on ArrowUp/ArrowDown as before.
        if (mode !== "command") {
          return;
        }
        event.preventDefault();
        const pagedTarget: CommandPalettePagedTarget =
          event.key === "Home"
            ? "home"
            : event.key === "End"
              ? "end"
              : event.key === "PageUp"
                ? "pageUp"
                : "pageDown";
        setSelectedIndex((current) =>
          resolveCommandPalettePagedSelection(
            selectionLength,
            current,
            pagedTarget
          )
        );
        return;
      }
      case "Enter": {
        if (isImeCompositionKeyDown(event)) {
          // The ENTER that commits an IME candidate never runs a command.
          return;
        }
        event.preventDefault();

        if (mode === "line") {
          executeLineJumpResult();
          return;
        }

        if (mode === "file") {
          executeProjectFileQuickOpenCandidateAt(selectedIndex ?? 0);
          return;
        }

        const entry = activeEntry;

        if (!entry) {
          return;
        }

        if (!entry.enabled) {
          onBlockedCommand(entry.id);
          return;
        }

        onExecuteCommand(entry.id);
        return;
      }
      default:
        return;
    }
  }

  const reservedKey = reservedPlaceholderKey(mode);
  const footer = lineJumpState
    ? resolveLineJumpFooterModel(lineJumpState)
    : mode === "file"
      ? resolveProjectFileQuickOpenFooterModel({
          activeCandidate: activeProjectFileQuickOpenCandidate,
          previewText: projectFileQuickOpenPreview,
          detailEnabled: footerDetailSettings.enable
        })
    : resolveCommandPaletteFooterModel({
        mode,
        query,
        inputValue,
        entries,
        selectedIndex,
        detailEnabled: footerDetailSettings.enable
      });
  const runHintClassName = footer.canRunSelected
    ? "commandPaletteFooterHint"
    : "commandPaletteFooterHint commandPaletteFooterHintUnavailable";
  const footerStatusText =
    footer.detailText ??
    footer.statusText ??
    (footer.statusKey ? translate(footer.statusKey, footer.statusValues) : null);
  const footerDetailResetKey =
    footer.detailText !== undefined
      ? `${footer.detailResetKey ?? ""}:${footer.detailText}`
      : "";
  const footerDetailMarquee = useCommandPaletteFooterDetailMarquee({
    enabled: footer.detailText !== undefined && footerDetailSettings.enable,
    resetKey: footerDetailResetKey,
    settings: footerDetailSettings
  });
  const footerStatusClassName = footerDetailMarquee.state.active
    ? "commandPaletteFooterStatusText commandPaletteFooterStatusText-marquee"
    : "commandPaletteFooterStatusText";
  const footerStatusStyle = footerDetailMarquee.state.active
    ? ({
        "--command-palette-footer-detail-marquee-delay": `${footerDetailMarquee.state.delayMs}ms`,
        "--command-palette-footer-detail-marquee-duration": `${footerDetailMarquee.state.durationMs}ms`,
        "--command-palette-footer-detail-marquee-distance": `${footerDetailMarquee.state.distancePx}px`
      } as CSSProperties)
    : undefined;
  // #316: a `role="listbox"` popup is on screen (command mode always renders
  // one — empty state included — plus the two line-jump list states). Used to
  // drive the input's combobox ARIA.
  const hasListbox = lineJumpState
    ? lineJumpState.kind === "executable" || lineJumpState.kind === "disabled"
    : !reservedKey;

  return (
    <div className="commandPaletteBackdrop" onClick={onClose}>
      <div
        className="commandPalette"
        role="dialog"
        aria-modal="true"
        aria-label={translate("commandPalette.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="commandPaletteInputRow">
          <input
            ref={inputRef}
            type="text"
            className="commandPaletteInput"
            value={inputValue}
            onChange={(event) => updateInput(event.target.value)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-label={translate("commandPalette.searchLabel")}
            aria-expanded={hasListbox ? "true" : "false"}
            aria-controls={hasListbox ? listboxId : undefined}
            aria-activedescendant={activeOptionId}
            placeholder={translate(commandPaletteInputPlaceholderKey(mode))}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="commandPaletteCloseButton"
            onClick={onClose}
            aria-label={translate("commandPalette.close")}
          >
            ×
          </button>
        </div>
        {lineJumpState ? (
          lineJumpState.kind === "executable" ? (
            <ul
              id={listboxId}
              className="commandPaletteList"
              role="listbox"
            >
              {lineJumpState.candidates.map((candidate, index) => (
                <li
                  key={candidate.line}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-disabled="false"
                  ref={index === selectedIndex ? selectedItemRef : null}
                  className={commandPaletteItemClassName(
                    index === selectedIndex,
                    true
                  )}
                  onClick={() => executeLineJumpCandidateAt(index)}
                >
                  <CommandPaletteItemContent
                    indicator={null}
                    primary={translate("commandPalette.lineJump.goToLine", {
                      line: candidate.line
                    })}
                    secondary={
                      candidate.preview.kind === "empty"
                        ? translate("commandPalette.lineJump.emptyLine")
                        : candidate.preview.text
                    }
                  />
                </li>
              ))}
            </ul>
          ) : lineJumpState.kind === "disabled" ? (
            <ul
              id={listboxId}
              className="commandPaletteList"
              role="listbox"
            >
              <li
                role="option"
                aria-selected="true"
                aria-disabled="true"
                ref={selectedItemRef}
                className={commandPaletteItemClassName(true, false)}
                onClick={executeLineJumpResult}
              >
                <CommandPaletteItemContent
                  indicator={resolveDisabledCommandPaletteStatusIndicator({
                    enabled: false,
                    disabledReason: null
                  })}
                  primary={translate("commandPalette.lineJump.goToLine", {
                    line: lineJumpState.line
                  })}
                />
              </li>
            </ul>
          ) : (
            <CommandPaletteReservedPlaceholder indicator={null}>
              {translate(
                lineJumpMessageKey(lineJumpState) ?? "commandPalette.lineJump.invalid"
              )}
            </CommandPaletteReservedPlaceholder>
          )
        ) : reservedKey ? (
          <CommandPaletteReservedPlaceholder
            indicator={commandPaletteNotImplementedStatusIndicator()}
          >
            {translate(reservedKey)}
          </CommandPaletteReservedPlaceholder>
        ) : (
          <ul
            id={listboxId}
            className="commandPaletteList"
            role="listbox"
            aria-label={translate("commandPalette.searchLabel")}
          >
            {mode === "file" ? (
              fileQuickOpenCandidates.length === 0 ? (
                <li role="presentation" className="commandPaletteEmpty">
                  {translate(commandPaletteEmptyResultKey(mode))}
                </li>
              ) : (
                fileQuickOpenCandidates.map((candidate, index) => (
                  <li
                    key={candidate.document.relativePath}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === selectedIndex}
                    aria-disabled="false"
                    aria-label={`${candidate.filename.text} ${candidate.relativePath.text}`}
                    ref={index === selectedIndex ? selectedItemRef : null}
                    className={commandPaletteItemClassName(
                      index === selectedIndex,
                      true
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onMouseMove={() => {
                      if (selectedIndex !== index) {
                        setSelectedIndex(index);
                      }
                    }}
                    onClick={() => executeProjectFileQuickOpenCandidateAt(index)}
                  >
                    <CommandPaletteItemContent
                      indicator={null}
                      primary={
                        <CommandPaletteHighlightedText
                          text={candidate.filename.text}
                          ranges={candidate.filename.ranges}
                        />
                      }
                      secondary={
                        <CommandPaletteHighlightedText
                          text={candidate.relativePath.text}
                          ranges={candidate.relativePath.ranges}
                        />
                      }
                    />
                  </li>
                ))
              )
            ) : entries.length === 0 ? (
              <li role="presentation" className="commandPaletteEmpty">
                {translate(commandPaletteEmptyResultKey(mode))}
              </li>
            ) : (
              entries.map((entry, index) => (
                <li
                  key={entry.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-disabled={!entry.enabled}
                  aria-label={entry.primary.text}
                  ref={index === selectedIndex ? selectedItemRef : null}
                  className={commandPaletteItemClassName(
                    index === selectedIndex,
                    entry.enabled
                  )}
                  onMouseDown={(event) => {
                    // #316 follow-up: keep DOM focus on the input — the
                    // Palette is an input-owned combobox/listbox, the row is
                    // a virtual-focus target (aria-activedescendant), never a
                    // DOM focus target. The click still runs the command.
                    event.preventDefault();
                  }}
                  onMouseMove={() => {
                    if (selectedIndex !== index) {
                      setSelectedIndex(index);
                    }
                  }}
                  onClick={() => executeEntryAt(index)}
                >
                  <CommandPaletteItemContent
                    indicator={resolveDisabledCommandPaletteStatusIndicator(
                      entry
                    )}
                    primary={
                      <CommandPaletteHighlightedText
                        text={entry.primary.text}
                        ranges={entry.primary.ranges}
                      />
                    }
                    secondary={
                      !entry.enabled &&
                      entry.disabledReason === "readOnlyProject" ? (
                        translate("command.disabled.readOnlyProject")
                      ) : (
                        <CommandPaletteHighlightedText
                          text={entry.secondary.text}
                          ranges={entry.secondary.ranges}
                        />
                      )
                    }
                  />
                </li>
              ))
            )}
          </ul>
        )}
        <div className="commandPaletteFooter">
          <div
            className="commandPaletteFooterStatus"
            ref={footerDetailMarquee.containerRef}
          >
            {footerStatusText ? (
              <span
                className={footerStatusClassName}
                key={footerDetailResetKey || footerStatusText}
                ref={footerDetailMarquee.textRef}
                style={footerStatusStyle}
              >
                {footerStatusText}
              </span>
            ) : null}
          </div>
          <div className="commandPaletteFooterHints">
            <span className="commandPaletteFooterHint">
              {translate("commandPalette.footer.selectHint")}
            </span>
            <span className={runHintClassName}>
              {translate("commandPalette.footer.runHint")}
            </span>
            <span className="commandPaletteFooterHint">
              {translate("commandPalette.footer.closeHint")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * #457 — resolves the text currently selected ANYWHERE in the Pergamum UI,
 * for Ctrl+Shift+F / Ctrl+Shift+H to seed into the Project Search / Replace
 * query textarea. Deliberately NOT limited to the active Markdown editor -
 * a Glossary Atom field, a Glossary Description editor, a Markdown/Glossary
 * preview pane, a Search result preview row, or any other selectable text
 * inside the app should all work.
 *
 * Priority order (first usable result wins):
 *
 * 1. A focused `<input>` / `<textarea>` with a non-collapsed selection -
 *    read via `selectionStart` / `selectionEnd`. Form controls' internal
 *    selection is invisible to `window.getSelection()`, so this needs its
 *    own path. Covers the Search / Replace textareas themselves, Glossary
 *    Atom edit fields, and any other plain form control.
 * 2/3. A non-collapsed `window.getSelection()` whose range sits inside the
 *    Pergamum app root (`#root`). This single check covers BOTH a focused
 *    contenteditable region (CodeMirror's own content DOM is
 *    `contenteditable`, and the Glossary Description field is itself a
 *    CodeMirror editor - see below) AND plain, non-form selectable text
 *    (Markdown preview, Glossary preview/display text, search result rows,
 *    ...) - there is no separate non-CodeMirror contenteditable surface in
 *    this app, so a dedicated step 2 would just duplicate this one.
 * 4. The active Markdown editor's own CodeMirror primary selection, read
 *    through {@link getCurrentActiveEditorSelectionText} - a fallback for
 *    when that selection is not (or no longer) reflected as a normal DOM
 *    Selection (e.g. focus moved to a plain input elsewhere while the
 *    editor still holds a model selection).
 *
 * The returned text is always RAW - never trimmed, NFC/NFD-normalized,
 * regex-escaped, or otherwise post-processed. Use {@link isUsableSelectedText}
 * separately to decide whether it is worth seeding.
 */

import { getCurrentActiveEditorSelectionText } from "./find/activeEditorSelectionAccess";

/** The DOM id of the single ReactDOM root the whole Pergamum UI renders into
 *  (see `src/renderer/main.tsx` / `index.html`) - the narrowest stable
 *  boundary for "is this selection inside the Pergamum app". */
const APP_ROOT_ELEMENT_ID = "root";

export interface ProjectSearchSelectionResolverOverrides {
  /** Defaults to `document.activeElement`. */
  readonly activeElement?: Element | null;
  /** Defaults to `() => window.getSelection()`. */
  readonly getSelection?: () => Selection | null;
  /** Defaults to `document.getElementById("root")`. */
  readonly appRoot?: Element | null;
  /** Defaults to {@link getCurrentActiveEditorSelectionText}. */
  readonly getActiveEditorSelectionText?: () => string;
}

function isTextSelectionFormControl(
  value: Element | null
): value is HTMLInputElement | HTMLTextAreaElement {
  return (
    value !== null &&
    (value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement)
  );
}

/** Priority 1: a focused `<input>` / `<textarea>` with a non-collapsed
 *  selection, read raw from `.value` via `selectionStart` / `selectionEnd`. */
function resolveFormControlSelection(activeElement: Element | null): string | null {
  if (!isTextSelectionFormControl(activeElement)) {
    return null;
  }
  const { selectionStart, selectionEnd, value } = activeElement;
  if (
    selectionStart === null ||
    selectionEnd === null ||
    selectionStart === selectionEnd
  ) {
    return null;
  }
  return value.slice(selectionStart, selectionEnd);
}

function isNodeInsideAppRoot(node: Node | null, appRoot: Element | null): boolean {
  return node !== null && appRoot !== null && appRoot.contains(node);
}

/** Priorities 2/3: a non-collapsed DOM `Selection` whose endpoints are both
 *  inside the Pergamum app root - covers a focused contenteditable region
 *  and plain selectable preview/display text alike. */
function resolveDomSelectionInAppRoot(
  getSelection: () => Selection | null,
  appRoot: Element | null
): string | null {
  const selection = getSelection();
  if (!selection || selection.isCollapsed) {
    return null;
  }
  if (
    !isNodeInsideAppRoot(selection.anchorNode, appRoot) ||
    !isNodeInsideAppRoot(selection.focusNode, appRoot)
  ) {
    return null;
  }
  const text = selection.toString();
  return text.length > 0 ? text : null;
}

/** Priority 4: the active Markdown editor's own CodeMirror primary
 *  selection, for when it is not reflected as a normal DOM Selection. */
function resolveActiveEditorSelection(
  getActiveEditorSelectionText: () => string
): string | null {
  const text = getActiveEditorSelectionText();
  return text.length > 0 ? text : null;
}

/**
 * The current selected text, RAW, trying each resolver in priority order.
 * `""` when nothing usable was found. Must be called before any focus
 * change (opening/focusing the Search pane can itself clear a form
 * control's selection or move `document.activeElement`).
 */
export function resolveCurrentSelectedTextForProjectSearch(
  overrides: ProjectSearchSelectionResolverOverrides = {}
): string {
  const activeElement =
    overrides.activeElement !== undefined
      ? overrides.activeElement
      : typeof document === "undefined"
        ? null
        : document.activeElement;
  const getSelection =
    overrides.getSelection ??
    (typeof window === "undefined" ? () => null : () => window.getSelection());
  const appRoot =
    overrides.appRoot !== undefined
      ? overrides.appRoot
      : typeof document === "undefined"
        ? null
        : document.getElementById(APP_ROOT_ELEMENT_ID);
  const getActiveEditorSelectionText =
    overrides.getActiveEditorSelectionText ?? getCurrentActiveEditorSelectionText;

  return (
    resolveFormControlSelection(activeElement) ??
    resolveDomSelectionInAppRoot(getSelection, appRoot) ??
    resolveActiveEditorSelection(getActiveEditorSelectionText) ??
    ""
  );
}

/**
 * Whether `selectedText` is worth seeding into Project Search / Replace -
 * whitespace/newline-only text (e.g. `"\n\n"`) is not. This is ONLY a
 * usability check: the value actually seeded must remain the untrimmed,
 * raw `selectedText`.
 */
export function isUsableSelectedText(selectedText: string): boolean {
  return selectedText.trim().length > 0;
}

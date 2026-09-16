import {
  getCatalogDefaultValue,
  validateCatalogValue
} from "../shared/settingsCatalog";
import {
  buildFontFamilyCss,
  FONT_SLOT_GENERIC_FALLBACKS,
  type FontFamilySetting
} from "../shared/fontSettings";

// UI chrome only (sidebar, status bar, command palette, tabs) — see
// styles.css selectors that read this via var(). Editor/preview body text
// deliberately do not consume it (#173 D-1).
export const workbenchFontFamilyCustomProperty =
  "--pergamum-workbench-font-family";
export const editorFontFamilyCustomProperty =
  "--pergamum-editor-font-family";

export const workbenchUiFontFamilyListCustomProperty =
  "--pergamum-workbench-ui-font-family-list";
export const editorFontFamilyListCustomProperty =
  "--pergamum-editor-font-family-list";
export const previewFontFamilyListCustomProperty =
  "--pergamum-preview-font-family-list";

// The main process already validates workbench.fontFamily against the
// catalog before it reaches effective settings (#173 D-4), but the
// renderer must not trust that as given (ADR-0006 S-15): it re-runs the
// same shared catalog validation here rather than trusting the IPC payload
// or duplicating a validation regex.
export function resolveSafeWorkbenchFontFamily(fontFamily: string): string {
  return validateCatalogValue("workbench.fontFamily", fontFamily).ok
    ? fontFamily
    : getCatalogDefaultValue("workbench.fontFamily");
}

export function resolveSafeEditorFontFamily(fontFamily: string): string {
  return validateCatalogValue("editor.fontFamily", fontFamily).ok
    ? fontFamily
    : getCatalogDefaultValue("editor.fontFamily");
}

export function resolveSafeWorkbenchUiFontFamilyList(
  fontFamilyList: readonly FontFamilySetting[]
): string {
  const validated = validateCatalogValue(
    "workbench.uiFontFamilyList",
    fontFamilyList
  );
  const list = validated.ok
    ? (validated.value as FontFamilySetting[])
    : (getCatalogDefaultValue("workbench.uiFontFamilyList") as FontFamilySetting[]);
  return buildFontFamilyCss(
    list,
    FONT_SLOT_GENERIC_FALLBACKS["workbench.uiFontFamilyList"]
  );
}

export function resolveSafeEditorFontFamilyList(
  fontFamilyList: readonly FontFamilySetting[]
): string {
  const validated = validateCatalogValue(
    "editor.fontFamilyList",
    fontFamilyList
  );
  const list = validated.ok
    ? (validated.value as FontFamilySetting[])
    : (getCatalogDefaultValue("editor.fontFamilyList") as FontFamilySetting[]);
  return buildFontFamilyCss(
    list,
    FONT_SLOT_GENERIC_FALLBACKS["editor.fontFamilyList"]
  );
}

export function resolveSafePreviewFontFamilyList(
  fontFamilyList: readonly FontFamilySetting[]
): string {
  const validated = validateCatalogValue(
    "preview.fontFamilyList",
    fontFamilyList
  );
  const list = validated.ok
    ? (validated.value as FontFamilySetting[])
    : (getCatalogDefaultValue("preview.fontFamilyList") as FontFamilySetting[]);
  return buildFontFamilyCss(
    list,
    FONT_SLOT_GENERIC_FALLBACKS["preview.fontFamilyList"]
  );
}

// `target` defaults to the live document root, but accepts an injected
// CSSStyleDeclaration so this stays testable without a DOM environment.
export function applyWorkbenchFontFamily(
  fontFamily: string,
  target: CSSStyleDeclaration = document.documentElement.style
): void {
  target.setProperty(
    workbenchFontFamilyCustomProperty,
    resolveSafeWorkbenchFontFamily(fontFamily)
  );
}

export function applyEditorFontFamily(
  fontFamily: string,
  target: CSSStyleDeclaration = document.documentElement.style
): void {
  target.setProperty(
    editorFontFamilyCustomProperty,
    resolveSafeEditorFontFamily(fontFamily)
  );
}

export function applyWorkbenchUiFontFamilyList(
  fontFamilyList: readonly FontFamilySetting[],
  target: CSSStyleDeclaration = document.documentElement.style
): void {
  target.setProperty(
    workbenchUiFontFamilyListCustomProperty,
    resolveSafeWorkbenchUiFontFamilyList(fontFamilyList)
  );
}

export function applyEditorFontFamilyList(
  fontFamilyList: readonly FontFamilySetting[],
  target: CSSStyleDeclaration = document.documentElement.style
): void {
  target.setProperty(
    editorFontFamilyListCustomProperty,
    resolveSafeEditorFontFamilyList(fontFamilyList)
  );
}

export function applyPreviewFontFamilyList(
  fontFamilyList: readonly FontFamilySetting[],
  target: CSSStyleDeclaration = document.documentElement.style
): void {
  target.setProperty(
    previewFontFamilyListCustomProperty,
    resolveSafePreviewFontFamilyList(fontFamilyList)
  );
}

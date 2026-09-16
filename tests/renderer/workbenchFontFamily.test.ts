import { describe, expect, it, vi } from "vitest";
import {
  applyEditorFontFamily,
  applyEditorFontFamilyList,
  applyPreviewFontFamilyList,
  applyWorkbenchFontFamily,
  applyWorkbenchUiFontFamilyList,
  editorFontFamilyCustomProperty,
  editorFontFamilyListCustomProperty,
  previewFontFamilyListCustomProperty,
  resolveSafeEditorFontFamily,
  resolveSafeEditorFontFamilyList,
  resolveSafePreviewFontFamilyList,
  resolveSafeWorkbenchFontFamily,
  resolveSafeWorkbenchUiFontFamilyList,
  workbenchFontFamilyCustomProperty,
  workbenchUiFontFamilyListCustomProperty
} from "../../src/renderer/workbenchFontFamily";
import { getCatalogDefaultValue } from "../../src/shared/settingsCatalog";

const workbenchCatalogDefault = getCatalogDefaultValue("workbench.fontFamily");
const editorCatalogDefault = getCatalogDefaultValue("editor.fontFamily");
const controlCharacterFontFamily = "Fira" + String.fromCharCode(0) + "Code";

function fakeStyleTarget(): CSSStyleDeclaration {
  return { setProperty: vi.fn() } as unknown as CSSStyleDeclaration;
}

describe("resolveSafeWorkbenchFontFamily (#173 renderer-side defensive sanitization)", () => {
  it("passes through a valid non-default value", () => {
    expect(resolveSafeWorkbenchFontFamily("Fira Code")).toBe("Fira Code");
  });

  it("falls back to the catalog default for a control-character value", () => {
    expect(resolveSafeWorkbenchFontFamily(controlCharacterFontFamily)).toBe(
      workbenchCatalogDefault
    );
  });

  it("falls back to the catalog default for an overlong (>128 char) value", () => {
    expect(resolveSafeWorkbenchFontFamily("A".repeat(129))).toBe(
      workbenchCatalogDefault
    );
  });

  it("falls back to the catalog default for a value containing a quote/semicolon (CSS injection shape)", () => {
    expect(
      resolveSafeWorkbenchFontFamily('Fira Code"; } body { color: red')
    ).toBe(workbenchCatalogDefault);
  });
});

describe("resolveSafeEditorFontFamily (#195 renderer-side defensive sanitization)", () => {
  it("passes through a valid non-default value", () => {
    expect(resolveSafeEditorFontFamily("Fira Code")).toBe("Fira Code");
  });

  it("falls back to the catalog default for an invalid value", () => {
    expect(resolveSafeEditorFontFamily(controlCharacterFontFamily)).toBe(
      editorCatalogDefault
    );
  });
});

describe("resolveSafe*FontFamilyList (#497 slot CSS values)", () => {
  it("resolves empty slot lists to the slot generic fallback only", () => {
    expect(resolveSafeWorkbenchUiFontFamilyList([])).toBe("sans-serif");
    expect(resolveSafeEditorFontFamilyList([])).toBe("monospace");
    expect(resolveSafePreviewFontFamilyList([])).toBe("serif");
  });

  it("uses family, not localized displayName, when building CSS font-family lists", () => {
    const css = resolveSafeEditorFontFamilyList([
      { family: "Yu Gothic", displayName: "游ゴシック" }
    ]);

    expect(css).toBe('"Yu Gothic", monospace');
    expect(css).not.toContain("游ゴシック");
  });

  it("quotes and orders configured families before the slot fallback", () => {
    expect(
      resolveSafePreviewFontFamilyList([
        { family: "Yu Mincho", displayName: "游明朝" },
        { family: "Georgia", displayName: "Georgia" }
      ])
    ).toBe('"Yu Mincho", "Georgia", serif');
  });
});

describe("applyWorkbenchFontFamily (#173)", () => {
  it("sets --pergamum-workbench-font-family to a valid value on the given target", () => {
    const target = fakeStyleTarget();

    applyWorkbenchFontFamily("Fira Code", target);

    expect(target.setProperty).toHaveBeenCalledWith(
      workbenchFontFamilyCustomProperty,
      "Fira Code"
    );
  });

  it("sets --pergamum-workbench-font-family to the catalog default when passed an intentionally invalid value", () => {
    const target = fakeStyleTarget();

    applyWorkbenchFontFamily('Fira Code"; } body { color: red', target);

    expect(target.setProperty).toHaveBeenCalledWith(
      workbenchFontFamilyCustomProperty,
      workbenchCatalogDefault
    );
  });
});

describe("applyEditorFontFamily (#195)", () => {
  it("sets --pergamum-editor-font-family to a valid value on the given target", () => {
    const target = fakeStyleTarget();

    applyEditorFontFamily("Fira Code", target);

    expect(target.setProperty).toHaveBeenCalledWith(
      editorFontFamilyCustomProperty,
      "Fira Code"
    );
  });

  it("sets --pergamum-editor-font-family to the catalog default for invalid input", () => {
    const target = fakeStyleTarget();

    applyEditorFontFamily('Fira Code"; } body { color: red', target);

    expect(target.setProperty).toHaveBeenCalledWith(
      editorFontFamilyCustomProperty,
      editorCatalogDefault
    );
  });
});

describe("apply*FontFamilyList (#497)", () => {
  it("sets the workbench UI font-family list custom property", () => {
    const target = fakeStyleTarget();

    applyWorkbenchUiFontFamilyList(
      [{ family: "Noto Sans JP", displayName: "Noto Sans JP" }],
      target
    );

    expect(target.setProperty).toHaveBeenCalledWith(
      workbenchUiFontFamilyListCustomProperty,
      '"Noto Sans JP", sans-serif'
    );
  });

  it("sets the editor font-family list custom property", () => {
    const target = fakeStyleTarget();

    applyEditorFontFamilyList(
      [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
      target
    );

    expect(target.setProperty).toHaveBeenCalledWith(
      editorFontFamilyListCustomProperty,
      '"Cascadia Code", monospace'
    );
  });

  it("sets the preview font-family list custom property", () => {
    const target = fakeStyleTarget();

    applyPreviewFontFamilyList(
      [{ family: "Yu Mincho", displayName: "游明朝" }],
      target
    );

    expect(target.setProperty).toHaveBeenCalledWith(
      previewFontFamilyListCustomProperty,
      '"Yu Mincho", serif'
    );
  });
});

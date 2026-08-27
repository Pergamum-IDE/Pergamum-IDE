import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("line jump wiring (#140 / #148)", () => {
  const source = readFileSync("src/renderer/App.tsx", "utf8");

  it("registers the line jump command with only a goToLine controller method (#148: no canGoToLine/isEnabled)", () => {
    expect(source).toContain("registerLineJumpCommands(");
    expect(source).toContain("goToLine: (line) => goToLineCommandRef.current(line)");
    expect(source).not.toContain("canGoToLineCommandRef");
    expect(source).not.toContain("canGoToLine:");
  });

  it("resolves goToLine from the live current editor, not a captured render-time closure", () => {
    const start = source.indexOf("goToLineCommandRef.current = (line) => {");
    const end = source.indexOf("const lineJumpEditorSnapshot =");
    const body = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    // Reassigned on every render (same pattern as
    // canSaveCurrentDocumentCommandRef), so command execution always sees
    // the editor active at activation time, not a stale Palette-open-time
    // snapshot (#128 current-editor requirement).
    expect(body).toContain('if (currentEditor?.kind !== "markdown") {');
  });

  it("does not jump directly into editor internals: it computes an offset and reuses the existing pendingMarkdownSelection channel", () => {
    const start = source.indexOf("goToLineCommandRef.current = (line) => {");
    const end = source.indexOf("const lineJumpEditorSnapshot =");
    const body = source.slice(start, end);

    expect(body).toContain("documentLineStartOffset(");
    expect(body).toContain(
      "setPendingMarkdownSelection({ start: offset, end: offset });"
    );
    expect(body).toContain("currentDocumentContent(currentEditor.document)");
  });

  it("silently no-ops on an out-of-range line (command-body validation, not registry enablement) instead of throwing (#148)", () => {
    const start = source.indexOf("goToLineCommandRef.current = (line) => {");
    const end = source.indexOf("const lineJumpEditorSnapshot =");
    const body = source.slice(start, end);

    expect(body).toContain("if (offset === null) {");
    expect(body).not.toContain("throw");
  });

  it("does not add a new editor-open/navigation-history entry for line jump (#140: in-editor cursor movement only)", () => {
    const start = source.indexOf("goToLineCommandRef.current = (line) => {");
    const end = source.indexOf("const lineJumpEditorSnapshot =");
    const body = source.slice(start, end);

    expect(body).not.toContain("editorNavigationRef");
    expect(body).not.toContain(".openEditor(");
  });

  it("supplies lineJumpEditorSnapshot from the live current editor, lazily split via createLineJumpEditorSnapshot (#148)", () => {
    const start = source.indexOf("const lineJumpEditorSnapshot =");
    const end = source.indexOf(
      "async function activateProjectDocument(",
      start
    );
    const body = source.slice(start, end);
    const componentIndex = source.indexOf("<CommandPalette");
    const closeIndex = source.indexOf("/>", componentIndex);
    const propsBlock = source.slice(componentIndex, closeIndex);

    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('currentEditor?.kind === "markdown"');
    expect(body).toContain("createLineJumpEditorSnapshot(");
    expect(body).toContain("currentDocumentContent(currentEditor.document)");
    expect(propsBlock).toContain(
      "lineJumpEditorSnapshot={lineJumpEditorSnapshot}"
    );
  });

  it("does not reference the retired preview-only prop/ref (#148 replaced it with lineJumpEditorSnapshot)", () => {
    expect(source).not.toContain("previewLineTextCommandRef");
    expect(source).not.toContain("resolveLineJumpPreviewLine");
    expect(source).not.toContain("documentLineText(");
  });

  it("passes command arguments through onExecuteCommand to executeUiCommand, so Palette callers can execute commands that take arguments", () => {
    const componentIndex = source.indexOf("<CommandPalette");
    const closeIndex = source.indexOf("/>", componentIndex);
    const propsBlock = source.slice(componentIndex, closeIndex);

    expect(propsBlock).toContain("onExecuteCommand={(commandId, ...args) => {");
    expect(propsBlock).toContain(
      'executeUiCommand(commandId, { source: "commandPalette" }, ...args);'
    );
  });
});

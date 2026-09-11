import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

/** A window of App source starting at `header`, for scoped `toContain` checks. */
function region(source: string, header: string, length = 1200): string {
  const index = source.indexOf(header);
  expect(index, `App source is missing: ${header}`).toBeGreaterThan(-1);
  return source.slice(index, index + length);
}

// #436 Slice 12: Ctrl+G — the active Markdown editor's CodeMirror keydown
// (glossarySelectionShortcutExtension.ts) bubbles the raw selection up
// through EditorSurface's `onGlossarySelectionShortcut` prop to
// `handleGlossarySelectionShortcut` in App.tsx, which dispatches the new
// `glossary.openFromEditorSelection` command. The command's controller
// (`openGlossaryEntryEditorPaneFromSelection`, shared with a future
// right-click entry point) resolves the target via
// `resolveGlossaryEntryEditorPaneTargetFromSelection` against the live
// `glossaryEntries` list, then routes through the SAME dirty-confirm
// transition every other "open create/edit pane" caller already uses.
describe("Ctrl+G glossary-from-selection wiring (#436 Slice 12)", () => {
  it("EditorSurface JSX wires onGlossarySelectionShortcut to handleGlossarySelectionShortcut", () => {
    const source = appSource();
    const surfaceStart = source.indexOf("<EditorSurface");
    expect(surfaceStart).toBeGreaterThan(-1);
    const surfaceElement = source.slice(
      surfaceStart,
      source.indexOf("/>", surfaceStart) + 2
    );

    expect(surfaceElement).toContain("onGlossarySelectionShortcut={");
    expect(surfaceElement).toContain("handleGlossarySelectionShortcut");
  });

  it("handleGlossarySelectionShortcut dispatches glossary.openFromEditorSelection through the command registry", () => {
    const body = region(
      appSource(),
      "function handleGlossarySelectionShortcut(selectedText: string): void {"
    );

    expect(body).toContain("executeUiCommand(");
    expect(body).toContain(
      "glossaryEntryEditorPaneCommandIds.openFromEditorSelection"
    );
    expect(body).toContain("selectedText");
  });

  it("the command controller routes through openGlossaryEntryEditorPaneFromSelection with source editor-selection", () => {
    const body = region(
      appSource(),
      "registerGlossaryEntryEditorPaneCommands(",
      1400
    );

    expect(body).toContain("openGlossaryEntryEditorPaneFromSelection: async (selectedText) => {");
    expect(body).toContain('"editor-selection"');
  });

  it("openGlossaryEntryEditorPaneFromSelection resolves via the pure resolver against glossaryEntries, then transitions", () => {
    const body = region(
      appSource(),
      "async function openGlossaryEntryEditorPaneFromSelection(",
      1200
    );

    expect(body).toContain("resolveGlossaryEntryEditorPaneTargetFromSelection(");
    expect(body).toContain("glossaryEntries");
    // All 3 resolution outcomes are handled.
    expect(body).toContain('resolution.kind === "ambiguous"');
    expect(body).toContain('resolution.kind === "create"');
    expect(body).toContain("transitionGlossaryEntryEditorPane(");
    expect(body).toContain("openGlossaryEntryCreatePane({");
    expect(body).toContain("openGlossaryEntryEditPane({");
    // Ambiguous never silently picks a result — status only, no transition.
    expect(body).toContain(
      'setStatus({ key: "status.glossaryCreateFromSelectionAmbiguous" });'
    );
    // Never touches pane state directly, bypassing the dirty confirm.
    expect(body).not.toContain("setGlossaryEntryEditorPane(open");
  });

  it("i18n: the command title/description and the ambiguous-match status exist for ja and en", async () => {
    const { jaTranslations } = await import("../../src/shared/i18n/ja");
    const { enTranslations } = await import("../../src/shared/i18n/en");

    for (const key of [
      "command.glossary.openFromEditorSelection",
      "command.glossary.openFromEditorSelection.description",
      "status.glossaryCreateFromSelectionAmbiguous"
    ]) {
      expect(
        (jaTranslations as Record<string, string>)[key],
        `ja missing ${key}`
      ).toBeTruthy();
      expect(
        (enTranslations as Record<string, string>)[key],
        `en missing ${key}`
      ).toBeTruthy();
    }
  });

  it("the Ctrl+G keymap extension is wired in ONLY when glossarySelectionShortcutEnabled is true (remediation)", () => {
    const source = readFileSync(
      "src/renderer/markdownEditorDocumentState.ts",
      "utf8"
    );
    expect(source).toContain(
      'from "./glossarySelectionShortcutExtension"'
    );
    expect(source).toContain(
      "...(options.glossarySelectionShortcutEnabled\n        ? [createGlossarySelectionShortcutKeymapExtension()]\n        : []),"
    );
  });

  it("MarkdownEditor only marks glossarySelectionShortcutEnabled true for the instance that receives the prop (remediation)", () => {
    const source = readFileSync("src/renderer/MarkdownEditor.tsx", "utf8");
    expect(source).toContain(
      "glossarySelectionShortcutEnabled: (glossarySelectionShortcut ?? null) !== null,"
    );
  });

  it("MarkdownEditor publishes glossarySelectionShortcut the same way it publishes activeFind (module-level slot)", () => {
    const source = readFileSync("src/renderer/MarkdownEditor.tsx", "utf8");
    expect(source).toContain("publishCurrentGlossarySelectionShortcutConfig(");
    expect(source).toContain(
      "unpublishCurrentGlossarySelectionShortcutConfig(glossarySelectionShortcut)"
    );
  });

  it("only EditorSurface's MarkdownEditor gets the shortcut — the Glossary description field stays inert", () => {
    const editorSurfaceSource = readFileSync(
      "src/renderer/EditorSurface.tsx",
      "utf8"
    );
    expect(editorSurfaceSource).toContain(
      "glossarySelectionShortcut={glossarySelectionShortcutConfig}"
    );

    const glossaryEditorSource = readFileSync(
      "src/renderer/GlossaryEditor.tsx",
      "utf8"
    );
    expect(glossaryEditorSource).not.toContain("glossarySelectionShortcut");
  });

  it("does not implement the right-click context menu yet (Slice 12 non-goal)", () => {
    const source = appSource();
    // "editor-context-menu" as a SOURCE VALUE is never actually passed
    // anywhere yet — only mentioned in a doc comment about future reuse.
    expect(source).not.toContain('"editor-context-menu"');
    expect(source).not.toMatch(/onContextMenu.*[Gg]lossary/);
  });

  it("regression: does not revive the old glossaryEntry tab or occurrence navigation UI", () => {
    const source = appSource();
    expect(source).not.toContain("function createGlossaryEntryFromSidebar");

    const editorSource = readFileSync(
      "src/renderer/GlossaryEditor.tsx",
      "utf8"
    );
    expect(editorSource).not.toContain("onNavigateToPreviousOccurrence");
    expect(editorSource).not.toContain("onNavigateToNextOccurrence");
  });
});

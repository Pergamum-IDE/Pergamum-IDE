import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { editCommandIds } from "../../src/shared/commandIds";

const sourceRoots = ["src/main", "src/preload", "src/renderer", "src/shared"];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = path.join(directory, entry);
    const stat = statSync(filePath);

    return stat.isDirectory() ? sourceFiles(filePath) : [filePath];
  });
}

function allSourceText(): string {
  return sourceRoots
    .flatMap(sourceFiles)
    .filter((filePath) => /\.(ts|tsx)$/.test(filePath))
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

/**
 * CommandPalette.tsx is a deliberate exception to the no-onKeyDown rule
 * below: ArrowUp/ArrowDown/Enter/Escape navigation inside its own,
 * already-focused search input is local widget interaction (Issue #126),
 * not a competing global shortcut system, and it reuses the existing IME
 * composition signal rather than adding new composition tracking.
 *
 * ConfirmDialog.tsx (#182) is the same category of exception: its
 * `onKeyDown` implements Escape-to-cancel and the modal's own Tab focus
 * trap, scoped to the dialog's own subtree while it is open — not a
 * document-level/global shortcut listener, and unrelated to the Markdown
 * editor's native-edit-command delegation this guard otherwise protects.
 *
 * ChoiceDialog.tsx (#192) is the same dialog-local exception: Escape
 * resolves dismissed and Tab stays inside the modal focus trap; it does not
 * implement app/global shortcut suppression.
 *
 * InfoDialog.tsx (#221) is the same dialog-local exception: Escape closes the
 * information modal and Tab stays inside the modal focus trap.
 *
 * DocumentTabBar.tsx (#184) is the same category of exception again: each
 * tab's `onKeyDown` implements Enter/Space activation for its own
 * `role="tab"` element (a `<div>`, not a native `<button>`, since a nested
 * close `<button>` cannot live inside a `<button>`), scoped to that one
 * tab — not a document-level/global shortcut listener.
 *
 * FileExplorer.tsx (#323) is the same category of exception: its
 * `onKeyDown` handlers implement roving-tabindex Arrow navigation and
 * Space multi-selection for the File Explorer's own `role="treeitem"`
 * rows, scoped to the tree while it is focused — a local ARIA tree widget,
 * not a document-level/global shortcut listener, and it never touches the
 * Markdown editor's native-edit-command delegation.
 *
 * GlossaryEditor.tsx (#375) is the same category again: the per-atom drag
 * handle's `onKeyDown` implements Arrow Up / Down reorder for its own
 * `<button>` while that handle is focused — a keyboard fallback for the D&D
 * reorder, scoped to the handle, not a document-level/global shortcut
 * listener.
 *
 * GlossaryTagManager.tsx (#375) is the same category once more: the per-row
 * tag drag handle's `onKeyDown` implements Arrow Up / Down reorder for its own
 * `<button>` while that handle is focused — the keyboard fallback for the tag
 * sortOrder D&D reorder, scoped to the handle, not a global shortcut listener.
 *
 * GlossaryEntryTagAssignmentEditor.tsx (#375) is the same category again: each
 * tag drag handle's `onKeyDown` is the keyboard fallback for the two-list tag
 * assignment D&D (Arrow Up / Down reorders an assigned tag; Enter / Space
 * assigns an available one), scoped to that handle `<button>`, not a global
 * shortcut listener.
 *
 * DocumentMapSettingsSection.tsx (#375) is the same category once more: the
 * dialogue-pair drag handle's `onKeyDown` is the Arrow Up / Down keyboard
 * fallback for reordering `documentMap.dialogueDelimiterPairs`, scoped to that
 * handle `<button>`, not a global shortcut listener.
 *
 * GlossaryEntryManager.tsx (#375) is the same category once more: the per-row
 * entry drag handle's `onKeyDown` implements Arrow Up / Down reorder for its
 * own `<button>` while focused — the keyboard fallback for the
 * `glossary_entries.sort_order` D&D reorder, not a global shortcut listener.
 */
const onKeyDownExemptFileNames = new Set([
  "CommandPalette.tsx",
  "ChoiceDialog.tsx",
  "ConfirmDialog.tsx",
  "InfoDialog.tsx",
  "DocumentTabBar.tsx",
  "FileExplorer.tsx",
  "GlossaryEditor.tsx",
  "GlossaryTagManager.tsx",
  "GlossaryEntryTagAssignmentEditor.tsx",
  "DocumentMapSettingsSection.tsx",
  "GlossaryEntryManager.tsx"
]);

function allSourceTextExcludingCommandPalette(): string {
  return sourceRoots
    .flatMap(sourceFiles)
    .filter(
      (filePath) =>
        /\.(ts|tsx)$/.test(filePath) &&
        !onKeyDownExemptFileNames.has(path.basename(filePath))
    )
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

/**
 * `clipboardAdapter.ts` (#182 D-9) is a deliberate, isolated exception to
 * the no-`navigator.clipboard` rule below: the dialog foundation's copy
 * diagnostic button writes through this single testable adapter — never
 * called directly from `ConfirmDialog.tsx` — and is unrelated to the
 * Markdown editor's native cut/copy/paste delegation this guard otherwise
 * protects against ad-hoc reimplementation.
 */
function allSourceTextExcludingClipboardAdapter(): string {
  return sourceRoots
    .flatMap(sourceFiles)
    .filter(
      (filePath) =>
        /\.(ts|tsx)$/.test(filePath) &&
        path.basename(filePath) !== "clipboardAdapter.ts"
    )
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

function sourceText(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

describe("edit context menu source checks", () => {
  it("does not add shortcut or clipboard implementations", () => {
    const source = allSourceText();
    const sourceExcludingClipboardAdapter =
      allSourceTextExcludingClipboardAdapter();

    expect(source).not.toContain("globalShortcut");
    expect(source).not.toContain("document.execCommand");
    expect(sourceExcludingClipboardAdapter).not.toContain(
      "navigator.clipboard"
    );
    expect(source).not.toContain("selectionchange");
    expect(source).not.toContain("clipboardBuffer");
  });

  it("does not add app-wide keyboard shortcut listeners outside the Command Palette's own input", () => {
    const source = allSourceTextExcludingCommandPalette();

    expect(source).not.toMatch(/addEventListener\(["']keydown/);
    expect(source).not.toContain("onKeyDown");
  });

  it("keeps Edit command strings defined only in shared command IDs", () => {
    const source = allSourceText();

    for (const commandId of editCommandIds) {
      const exactStringOccurrences =
        source.match(new RegExp(`["']${commandId}["']`, "g")) ?? [];

      expect(exactStringOccurrences).toHaveLength(1);
    }
  });

  it("keeps context menu route logs free of operation and itemCount details", () => {
    const source = [
      sourceText("src/main/contextMenuIpc.ts"),
      sourceText("src/renderer/editContextMenuBridge.ts")
    ].join("\n");

    expect(source).not.toContain("operation");
    expect(source).not.toContain("itemCount");
  });

  it("does not bridge Application menu Edit roles into the new context/edit route", () => {
    const source = sourceText("src/main/menu.ts");

    expect(source).toContain('roleItem("cut"');
    expect(source).toContain('roleItem("copy"');
    expect(source).toContain('roleItem("paste"');
    expect(source).toContain('roleItem("selectAll"');
    expect(source).not.toContain("contextMenu.");
    expect(source).not.toContain("edit.command.");
  });
});

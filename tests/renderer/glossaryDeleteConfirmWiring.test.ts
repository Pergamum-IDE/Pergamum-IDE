import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

function block(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("Glossary delete confirmation wiring (#375)", () => {
  it("confirms an entry delete through the Pergamum destructive confirm dialog, not a native box", () => {
    const source = appSource();
    const confirmFn = block(
      source,
      "async function confirmDeleteGlossaryEntry(",
      "async function deleteActiveGlossaryEntry()"
    );

    expect(confirmFn).toContain("confirmDialog({");
    expect(confirmFn).toContain('tone: "destructive"');
    expect(confirmFn).toContain(
      'confirmLabel: translate("glossary.deleteDialog.delete")'
    );
    expect(confirmFn).toContain(
      'cancelLabel: translate("glossary.deleteDialog.cancel")'
    );
    expect(confirmFn).toContain("dismissOnBackdropClick: false");
    expect(confirmFn).toContain('translate("glossary.deleteDialog.title")');
    // The representative atom names the target.
    expect(confirmFn).toContain("representativeGlossaryAtomDraft(draft)");
    // Escape / Cancel / backdrop → "cancel" → do not delete.
    expect(confirmFn).toContain('return result === "confirm";');
  });

  it("only deletes the entry after the dialog resolves confirm, and passes just an id to IPC", () => {
    const source = appSource();
    const deleteFn = block(
      source,
      "async function deleteActiveGlossaryEntry()",
      "function openUtilityWindowOnOccurrencesTab()"
    );

    const confirmIndex = deleteFn.indexOf(
      "if (!(await confirmDeleteGlossaryEntry(draft)))"
    );
    const ipcIndex = deleteFn.indexOf(
      "await window.pergamum.glossary.delete(entryIdToDelete)"
    );

    expect(confirmIndex).toBeGreaterThan(-1);
    expect(ipcIndex).toBeGreaterThan(confirmIndex);
    // No confirmMessage argument any more.
    expect(deleteFn).not.toContain("deleteEntryConfirmMessage");
    // Double-press guard.
    expect(deleteFn).toContain("glossaryDeleteInFlightRef.current");
    // Existing post-delete behaviour is kept.
    expect(deleteFn).toContain("closeOpenEditor(state, documentIdToDelete)");
    expect(deleteFn).toContain("setGlossaryRefreshToken((token) => token + 1)");
  });

  it("confirms a tag delete through the same dialog before calling deleteTag(id)", () => {
    const source = appSource();
    const tagDeleteFn = block(
      source,
      "async function handleDeleteGlossaryTag(",
      "function navigateGlossaryOccurrenceFromSidebar("
    );

    const confirmIndex = tagDeleteFn.indexOf("confirmDialog({");
    const ipcIndex = tagDeleteFn.indexOf(
      "await window.pergamum.glossary.deleteTag(tagId)"
    );

    expect(confirmIndex).toBeGreaterThan(-1);
    expect(ipcIndex).toBeGreaterThan(confirmIndex);
    expect(tagDeleteFn).toContain('tone: "destructive"');
    expect(tagDeleteFn).toContain(
      'translate("glossary.tagManager.deleteDialog.title")'
    );
    expect(tagDeleteFn).toContain(
      'translate("glossary.tagManager.deleteDialog.message")'
    );
    expect(tagDeleteFn).toContain("value: tagLabel");
    expect(tagDeleteFn).not.toContain("confirmMessage");
  });

  it("keeps native / browser confirm out of the renderer entirely", () => {
    const source = appSource();
    expect(source).not.toContain("window.confirm(");
    expect(source).not.toMatch(/\bconfirm\(["'`]/);
    expect(source).not.toContain("showMessageBox");
  });
});

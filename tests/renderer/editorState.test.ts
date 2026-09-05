import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isEditorConflicted,
  type EditorSaveState,
  type EditorSyncState
} from "../../src/renderer/editorState";
import {
  createFileDocument,
  isCurrentDocumentDirty,
  markCurrentDocumentSaved,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";

describe("editor state vocabulary", () => {
  it("derives conflict only from dirty + stale", () => {
    expect(isEditorConflicted("dirty", "stale")).toBe(true);
    expect(isEditorConflicted("clean", "stale")).toBe(false);
    expect(isEditorConflicted("dirty", "fresh")).toBe(false);
  });

  it("does not derive conflict from any other save/sync combination", () => {
    const nonConflictingCombinations: Array<
      readonly [EditorSaveState, EditorSyncState]
    > = [
      ["clean", "fresh"],
      ["clean", "stale"],
      ["clean", "deleted"],
      ["dirty", "fresh"],
      ["dirty", "deleted"],
      ["saving", "fresh"],
      ["saving", "stale"],
      ["saving", "deleted"],
      ["saveFailed", "fresh"],
      ["saveFailed", "stale"],
      ["saveFailed", "deleted"]
    ];

    for (const [saveState, syncState] of nonConflictingCombinations) {
      expect(isEditorConflicted(saveState, syncState)).toBe(false);
    }
  });

  it("keeps editor state vocabulary independent from React and DOM APIs", () => {
    const source = readFileSync("src/renderer/editorState.ts", "utf8");

    expect(source).not.toContain("from \"react\"");
    expect(source).not.toContain("from 'react'");
    expect(source).not.toContain("window.");
    expect(source).not.toContain("document.");
    expect(source).not.toContain("HTMLElement");
    expect(source).not.toContain("JSX");
  });

  it("preserves existing Markdown dirty and mark-saved behavior", () => {
    const document = createFileDocument({
      path: "C:\\Novel\\chapter.md",
      content: "saved",
      metadata: {
        encoding: "utf8",
        lineEnding: "lf",
        byteLength: 5,
        characterLength: 5,
        hadBom: false
      }
    });
    const updatedDocument = updateCurrentDocumentContent(
      document,
      "changed",
      buildLineEndingBreakSet(analyzeLineEndings("changed"))
    );
    const savedDocument = markCurrentDocumentSaved(updatedDocument);

    expect(isCurrentDocumentDirty(document)).toBe(false);
    expect(isCurrentDocumentDirty(updatedDocument)).toBe(true);
    expect(isCurrentDocumentDirty(savedDocument)).toBe(false);
  });
});

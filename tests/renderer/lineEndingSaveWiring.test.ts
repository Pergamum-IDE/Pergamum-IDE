import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

function sourceBlock(
  source: string,
  startNeedle: string,
  endNeedle: string
): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("line-ending preservation on save (#253)", () => {
  it("computes the serialized (original line-ending) content once per save, ahead of both save branches", () => {
    const source = appSource();
    const saveBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );

    const serializeIndex = saveBlock.indexOf(
      "const serializedContentToSave = serializeLineEndings("
    );
    const projectBranchIndex = saveBlock.indexOf(
      "isProjectCurrentDocument(documentToSave)"
    );
    const standaloneBranchIndex = saveBlock.indexOf("const existingSavePath =");

    expect(serializeIndex).toBeGreaterThan(-1);
    expect(projectBranchIndex).toBeGreaterThan(serializeIndex);
    expect(standaloneBranchIndex).toBeGreaterThan(projectBranchIndex);

    expect(saveBlock).toContain(
      "serializeLineEndings(\n            documentToSave.content,\n            lineEndingBreakSetToArray(documentToSave.lineEndingBreaks)\n          )"
    );
  });

  it("uses the same serialized content at the project save call site", () => {
    const source = appSource();
    const saveBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const projectSaveBlock = sourceBlock(
      saveBlock,
      "isProjectCurrentDocument(documentToSave)",
      "return \"saved\";"
    );

    expect(projectSaveBlock).toContain(
      "window.pergamum.projects.saveProjectDocument(\n                documentToSave.relativePath,\n                serializedContentToSave\n              )"
    );
    // Never the un-serialized (LF-only-normalized) content.
    expect(projectSaveBlock).not.toContain(
      "saveProjectDocument(\n                documentToSave.relativePath,\n                documentToSave.content\n              )"
    );
  });

  it("uses the same serialized content at both standalone writeMarkdown call sites", () => {
    const source = appSource();
    const saveBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );

    const writeMarkdownCalls = saveBlock.match(
      /window\.pergamum\.files\.writeMarkdown\(/g
    );
    expect(writeMarkdownCalls).toHaveLength(2);

    expect(saveBlock).toContain(
      "window.pergamum.files.writeMarkdown(\n                existingSavePath,\n                serializedContentToSave\n              )"
    );
    expect(saveBlock).toContain(
      "window.pergamum.files.writeMarkdown(\n                  selectedTarget.path,\n                  serializedContentToSave\n                )"
    );
  });

  it("carries the document's tracked line-ending breaks forward through updateCurrentDocumentContent", () => {
    const source = appSource();

    expect(source).toContain(
      "updateCurrentDocumentContent(\n          document,\n          nextContent,\n          nextLineEndingBreaks\n        )"
    );
  });
});

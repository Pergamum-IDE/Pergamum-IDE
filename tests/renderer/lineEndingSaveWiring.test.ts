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
  it("prepares the storage document once per save, ahead of both save branches", () => {
    const source = appSource();
    const saveBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );

    const prepareIndex = saveBlock.indexOf(
      "const preparedDocumentForStorage ="
    );
    const serializedIndex = saveBlock.indexOf(
      "const serializedContentToSave =\n            preparedDocumentForStorage.serializedContent"
    );
    const projectBranchIndex = saveBlock.indexOf(
      "isProjectCurrentDocument(documentToSave)"
    );
    const standaloneBranchIndex = saveBlock.indexOf("const existingSavePath =");

    expect(prepareIndex).toBeGreaterThan(-1);
    expect(serializedIndex).toBeGreaterThan(prepareIndex);
    expect(projectBranchIndex).toBeGreaterThan(serializedIndex);
    expect(standaloneBranchIndex).toBeGreaterThan(projectBranchIndex);

    expect(saveBlock).toContain(
      "prepareCurrentDocumentForMarkdownStorage(originalDocumentToSave, {\n              normalizeUnicodeToNfc:\n                effectiveSettings.workbench.normalizeUnicodeToNfc\n            })"
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

  it("#449 syncs an NFC-normalized active editor buffer only when the live buffer still matches the save-start snapshot", () => {
    const source = appSource();
    const saveBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const projectResolutionNeedle =
      "const savedProjectOpenState = resolveSavedDocumentForOpenState(\n              documentIdToSave,\n              originalDocumentToSave,\n              savedProjectSnapshot\n            );";
    const projectSyncNeedle =
      "syncActiveMarkdownBufferToSavedDocument(\n              documentIdToSave,\n              savedProjectSnapshot,\n              savedProjectOpenState.canSyncActiveBuffer &&\n                preparedDocumentForStorage.didNormalizeText\n            );";
    const projectReplaceNeedle =
      "replaceSavedDocument(\n              documentIdToSave,\n              savedProjectOpenState.document\n            );";
    const standaloneResolutionNeedle =
      "const savedStandaloneOpenState = resolveSavedDocumentForOpenState(\n            documentIdToSave,\n            originalDocumentToSave,\n            savedDocument\n          );";
    const standaloneSyncNeedle =
      "syncActiveMarkdownBufferToSavedDocument(\n            documentIdToSave,\n            savedDocument,\n            savedStandaloneOpenState.canSyncActiveBuffer &&\n              preparedDocumentForStorage.didNormalizeText\n          );";
    const standaloneReplaceNeedle =
      "savedStandaloneOpenState.document";

    expect(saveBlock).toContain(projectResolutionNeedle);
    expect(saveBlock).toContain(projectSyncNeedle);
    expect(saveBlock.indexOf(projectResolutionNeedle)).toBeLessThan(
      saveBlock.indexOf(projectSyncNeedle)
    );
    expect(saveBlock.indexOf(projectSyncNeedle)).toBeLessThan(
      saveBlock.indexOf(projectReplaceNeedle)
    );

    expect(saveBlock).toContain(standaloneResolutionNeedle);
    expect(saveBlock).toContain(standaloneSyncNeedle);
    expect(saveBlock.indexOf(standaloneResolutionNeedle)).toBeLessThan(
      saveBlock.indexOf(standaloneSyncNeedle)
    );
    expect(saveBlock.indexOf(standaloneSyncNeedle)).toBeLessThan(
      saveBlock.indexOf(standaloneReplaceNeedle)
    );
  });
});

import { readFileSync } from "node:fs";
import { Compartment } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  createGlossaryDescriptionEditorId,
  createProjectDocumentEditorId,
  serializeEditorId
} from "../../src/shared/editorId";
import {
  markdownImageLinkForAttachment,
  markdownImageLinksForAttachments,
  markdownImageLinksForAttachmentsFromBase
} from "../../src/shared/markdownImageLink";
import { resolveProjectLocalImageSrc } from "../../src/shared/projectLocalImageLink";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  createGlossaryDescriptionCurrentEditor,
  createMarkdownCurrentEditor,
  isCurrentEditorDirty,
  markdownDocumentForEditor,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import { createGlossaryDescriptionMarkdownSurfaceSource } from "../../src/renderer/markdownSurfaceSource";
import {
  createMarkdownEditorDocumentState,
  type MarkdownEditorDocumentState
} from "../../src/renderer/markdownEditorDocumentState";
import { addPendingImageAttachmentPosition } from "../../src/renderer/markdownImageAttachmentPositionTracker";
import {
  imageAttachmentSourceEditorId,
  insertMarkdownImageLinkIntoTarget,
  resolveImageAttachmentPasteTarget,
  type ImageAttachmentProjectContext
} from "../../src/renderer/imageAttachmentPasteAppDeps";
import type { PendingImageAttachment } from "../../src/renderer/clipboardImageAttachment";
import type { OpenDocumentsState } from "../../src/renderer/openDocuments";
import type {
  MarkdownEditorParagraphIndentController,
  MarkdownImageAttachmentPositionController
} from "../../src/renderer/MarkdownEditor";

const PROJECT_FILE = "C:/project/novel.pergamum";
const projectContext = { rootPath: "C:/project" };
const entryId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f9a0b";
const glossaryId = createGlossaryDescriptionEditorId(entryId);
const glossaryKey = serializeEditorId(glossaryId);
const chapterId = createProjectDocumentEditorId("novel/ch01.md", projectContext);

function entry(description: string): GlossaryEntry {
  return {
    id: entryId,
    description,
    atoms: [
      {
        id: "0190b6a1-1c2d-7e3f-8a4b-000000000001",
        entryId,
        sortOrder: 0,
        value: "コードフェンス",
        matchFlags: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    tags: [],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  };
}

function project(
  overrides: Partial<ImageAttachmentProjectContext> = {}
): ImageAttachmentProjectContext {
  return {
    activeProjectFilePath: PROJECT_FILE,
    accessMode: { kind: "readWrite" },
    config: { settings: {} },
    ...overrides
  };
}

function pending(): PendingImageAttachment {
  return {
    id: "pending-1",
    positionTrackingId: "track-1",
    sourceDocumentId: glossaryKey,
    sourceEditorId: imageAttachmentSourceEditorId(PROJECT_FILE, glossaryKey),
    initialPosition: 2,
    bytes: new Uint8Array([1]),
    reportedMimeType: "image/png",
    detectedFormat: "png",
    originalFileName: "pic.png",
    actualBytes: 1,
    hadMultipleImages: false,
    ignoredAdditionalImageCount: 0
  };
}

function ref<T>(value: T): { current: T } {
  return { current: value };
}

function cachedState(doc: string, markerPosition: number): MarkdownEditorDocumentState {
  const created = createMarkdownEditorDocumentState({
    doc,
    initialLineEndingBreaks: [],
    undoHistoryMinDepth: 100,
    newFileLineEndingFallbackRef: ref<"lf" | "crlf" | "cr">("lf"),
    readOnlyCompartment: new Compartment(),
    readOnlyRef: ref(false),
    visibilityCompartment: new Compartment(),
    markerGlyph: "⏎" as const,
    expectedLineEndingRef: ref<"lf" | "crlf" | "cr">("lf"),
    markerGlyphRef: ref("⏎" as const),
    whitespaceCompartment: new Compartment(),
    whitespaceSettingsRef: ref({
      renderIdeographicSpace: false,
      renderAsciiSpace: false,
      renderTab: false,
      renderOtherUnicodeSpace: false
    }),
    selectionHighlightCompartment: new Compartment(),
    selectionHighlightModeRef: ref("default" as const),
    findGutterMarkerCompartment: new Compartment(),
    findGutterMarkersRef: ref(false),
    glossaryCompletionRef: ref(null),
    createUpdateListenerExtension: () => []
  });

  return {
    ...created,
    state: created.state.update({
      effects: addPendingImageAttachmentPosition.of({
        id: "track-1",
        position: markerPosition
      })
    }).state
  };
}

function glossaryAndChapterState(activeGlossary: boolean): OpenDocumentsState {
  return {
    documents: [
      {
        id: glossaryId,
        editor: createGlossaryDescriptionCurrentEditor(entry("説明"))
      },
      {
        id: chapterId,
        editor: createMarkdownCurrentEditor(
          createProjectDocument(
            { name: "ch01.md", relativePath: "novel/ch01.md" },
            "本文"
          )
        )
      }
    ],
    activeDocumentId: activeGlossary ? glossaryId : chapterId,
    nextUntitledId: 1
  };
}

describe("glossary Description image link policy (#573 Slice 6)", () => {
  it("builds project-root-relative links for a glossary Description", () => {
    expect(
      markdownImageLinksForAttachmentsFromBase({
        base: { kind: "projectRoot" },
        imageRelativePaths: ["assets/images/a.png", "assets/my pics/b.png"]
      })
    ).toBe("![](assets/images/a.png)\n\n![](<assets/my pics/b.png>)");
  });

  it("is byte-identical to the document pipeline for a sourceFile base", () => {
    for (const markdownRelativePath of ["ch.md", "novel/ch.md", "a/b/c.md"]) {
      expect(
        markdownImageLinksForAttachmentsFromBase({
          base: {
            kind: "sourceFile",
            sourceMarkdownProjectRelativePath: markdownRelativePath
          },
          imageRelativePaths: ["assets/x.png", "a/b/y.png"]
        })
      ).toBe(
        markdownImageLinksForAttachments({
          markdownRelativePath,
          imageRelativePaths: ["assets/x.png", "a/b/y.png"]
        })
      );
    }
  });

  it("round-trips: the inserted link resolves back to the saved image in the glossary Preview", () => {
    const source = createGlossaryDescriptionMarkdownSurfaceSource(
      createGlossaryDescriptionCurrentEditor(entry(""))
    );

    expect(source.imageResolution).toEqual({ kind: "projectRoot" });
    for (const saved of ["assets/images/a.png", "img/深い/b.webp"]) {
      const link = markdownImageLinksForAttachmentsFromBase({
        base: { kind: "projectRoot" },
        imageRelativePaths: [saved]
      });
      const src = /^!\[\]\(<?([^>)]+)>?\)$/.exec(link)![1];

      expect(resolveProjectLocalImageSrc(src, source.imageResolution)).toMatchObject(
        { kind: "rewrite", projectRelativePath: saved }
      );
    }
  });

  it("equals the policy of a root-level project document (the code-proven equivalence)", () => {
    expect(
      markdownImageLinksForAttachmentsFromBase({
        base: { kind: "projectRoot" },
        imageRelativePaths: ["assets/a.png"]
      })
    ).toBe(
      markdownImageLinkForAttachment({
        markdownRelativePath: "root-level.md",
        imageRelativePath: "assets/a.png"
      })
    );
  });
});

describe("glossary Description image paste target (#573 Slice 6)", () => {
  it("resolves a glossary tab as a project-root paste target", () => {
    const result = resolveImageAttachmentPasteTarget({
      pending: pending(),
      openDocumentsState: glossaryAndChapterState(false),
      isEditorAreaSpecialTabActive: false,
      currentProject: project(),
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      cachedDocumentStates: new Map([[glossaryKey, cachedState("説明", 2)]])
    });

    expect(result).toEqual({
      ok: true,
      target: {
        documentId: glossaryKey,
        imageLinkBase: { kind: "projectRoot" },
        documentName: "語彙: コードフェンス",
        isActive: false,
        position: 2
      }
    });
  });

  it("rejects a read-only project", () => {
    expect(
      resolveImageAttachmentPasteTarget({
        pending: pending(),
        openDocumentsState: glossaryAndChapterState(true),
        isEditorAreaSpecialTabActive: false,
        currentProject: project({ accessMode: { kind: "readOnly" } }),
        isLifecycleCommitBarrierActive: false,
        livePositionController: null,
        cachedDocumentStates: new Map()
      })
    ).toEqual({ ok: false, reason: "targetDocumentReadOnly" });
  });

  it("inserts into the ACTIVE glossary editor through the live controller", () => {
    const livePositionController = {
      resolvePendingPosition: vi.fn(() => ({ ok: true, position: 2 })),
      clearPendingPosition: vi.fn(() => true)
    } as unknown as MarkdownImageAttachmentPositionController;
    const applyReplaceInBufferChanges = vi.fn(() => true);
    const liveParagraphIndentController = {
      applyReplaceInBufferChanges
    } as unknown as MarkdownEditorParagraphIndentController;
    const state = glossaryAndChapterState(true);
    const target = resolveImageAttachmentPasteTarget({
      pending: pending(),
      openDocumentsState: state,
      isEditorAreaSpecialTabActive: false,
      currentProject: project(),
      isLifecycleCommitBarrierActive: false,
      livePositionController,
      cachedDocumentStates: new Map()
    });

    expect(target.ok && target.target.isActive).toBe(true);
    if (!target.ok) {
      return;
    }

    const setOpenDocumentsState = vi.fn();
    expect(
      insertMarkdownImageLinkIntoTarget({
        request: {
          pending: pending(),
          target: target.target,
          markdownLink: "![](assets/a.png)"
        },
        openDocumentsState: state,
        isEditorAreaSpecialTabActive: false,
        currentProject: project(),
        isLifecycleCommitBarrierActive: false,
        livePositionController,
        liveParagraphIndentController,
        cachedDocumentStates: new Map(),
        setOpenDocumentsState
      })
    ).toBe(true);
    // The live editor's own change → onChangeMarkdownContent → draft
    // (Slice 3 path); no direct state write here.
    expect(applyReplaceInBufferChanges).toHaveBeenCalledWith([
      { from: 2, to: 2, insert: "![](assets/a.png)" }
    ]);
    expect(setOpenDocumentsState).not.toHaveBeenCalled();
  });

  it("inserts into an INACTIVE glossary tab's draft and makes it dirty", () => {
    const state = glossaryAndChapterState(false);
    const cachedDocumentStates = new Map([[glossaryKey, cachedState("説明", 2)]]);
    let next: OpenDocumentsState | null = null;

    expect(
      insertMarkdownImageLinkIntoTarget({
        request: {
          pending: pending(),
          target: {
            documentId: glossaryKey,
            imageLinkBase: { kind: "projectRoot" },
            documentName: "語彙: コードフェンス",
            isActive: false,
            position: 2
          },
          markdownLink: "![](assets/a.png)"
        },
        openDocumentsState: state,
        isEditorAreaSpecialTabActive: false,
        currentProject: project(),
        isLifecycleCommitBarrierActive: false,
        livePositionController: null,
        liveParagraphIndentController: null,
        cachedDocumentStates,
        setOpenDocumentsState: (value) => {
          next = value;
        }
      })
    ).toBe(true);

    const glossary = next!.documents[0].editor as GlossaryDescriptionCurrentEditor;
    expect(glossary.draft.description).toBe("説明![](assets/a.png)");
    expect(isCurrentEditorDirty(glossary)).toBe(true);
    expect(markdownDocumentForEditor(glossary)).toBeNull();
    expect(cachedDocumentStates.get(glossaryKey)!.state.doc.toString()).toBe(
      "説明![](assets/a.png)"
    );
    // The project document is untouched.
    expect(next!.documents[1]).toBe(state.documents[1]);
  });
});

describe("App glossary Description image wiring (#573 Slice 6)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  it("enables image paste and the Insert image button for glossary tabs", () => {
    expect(appSource).toContain(
      "const canInsertImage =\n    canUseMarkdownToolbarCommands &&\n    (activeMarkdownDocument?.kind === \"project\" ||\n      isGlossaryDescriptionEditorActive);"
    );
    expect(appSource).toContain(
      "(isGlossaryDescriptionEditorActive ||\n                            (currentEditor?.kind === \"markdown\" &&\n                              activeMarkdownDocument?.kind === \"project\")) &&\n                          project?.accessMode.kind === \"readWrite\" &&"
    );
  });

  it("inserts toolbar images with the surface's link base, only into the editor it started from", () => {
    const start = appSource.indexOf("const handleInsertImage = useCallback(");
    const block = appSource.slice(
      start,
      appSource.indexOf("const markdownToolbarShortcutConfig", start)
    );

    expect(block).toContain('imageLinkBase = { kind: "projectRoot" };');
    expect(block).toContain(
      'kind: "sourceFile",\n          sourceMarkdownProjectRelativePath: doc.relativePath'
    );
    expect(block).toContain("!editorIdEquals(targetEditorId, currentActiveId)");
    expect(block).toContain("markdownImageLinksForAttachmentsFromBase({");
    expect(block.indexOf("!editorIdEquals(targetEditorId, currentActiveId)")).toBeLessThan(
      block.indexOf("applyReplaceInBufferChanges(")
    );
  });
});

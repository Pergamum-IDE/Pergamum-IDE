import { Compartment, type EditorState } from "@codemirror/state";
import { undo, undoDepth } from "@codemirror/commands";
import { describe, expect, it, vi } from "vitest";
import {
  createProjectDocumentEditorId,
  createGlossaryEntryEditorId,
  serializeEditorId
} from "../../src/shared/editorId";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  createMarkdownCurrentEditor,
  createGlossaryEntryCurrentEditor
} from "../../src/renderer/currentEditor";
import {
  createMarkdownEditorDocumentState,
  type MarkdownEditorDocumentState
} from "../../src/renderer/markdownEditorDocumentState";
import {
  addPendingImageAttachmentPosition,
  resolvePendingImageAttachmentPosition
} from "../../src/renderer/markdownImageAttachmentPositionTracker";
import {
  clearImageAttachmentPendingPosition,
  imageAttachmentSourceEditorId,
  insertMarkdownImageLinkIntoTarget,
  resolveImageAttachmentPasteTarget,
  saveImageAttachmentProjectSettingsFromPrompt,
  type ImageAttachmentProjectContext
} from "../../src/renderer/imageAttachmentPasteAppDeps";
import {
  defaultApplicationSettings,
  resolveEffectiveSettings,
  type EffectiveImageAttachmentSettings,
  type ProjectSettings
} from "../../src/shared/settings";
import { runImageAttachmentPasteOrchestration } from "../../src/renderer/imageAttachmentPasteOrchestration";
import type { PendingImageAttachment } from "../../src/renderer/clipboardImageAttachment";
import type { OpenDocumentsState } from "../../src/renderer/openDocuments";
import type { GlossaryEntry } from "../../src/shared/glossary";

function ref<T>(value: T): { current: T } {
  return { current: value };
}

function baseEditorStateOptions(
  overrides: Partial<Parameters<typeof createMarkdownEditorDocumentState>[0]> = {}
) {
  return {
    doc: "hello world",
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
    glossaryCompletionRef: ref(null),
    createUpdateListenerExtension: () => [],
    ...overrides
  };
}

function undoOnce(state: EditorState): EditorState | null {
  let next: EditorState | null = null;
  undo({
    state,
    dispatch: (tr) => {
      next = tr.state;
    }
  });
  return next;
}

const PROJECT_ROOT = "C:/project";
const PROJECT_FILE = "C:/project/novel.pergamum";

function createProjectContext(
  overrides: Partial<ImageAttachmentProjectContext> = {}
): ImageAttachmentProjectContext {
  return {
    activeProjectFilePath: PROJECT_FILE,
    accessMode: { kind: "readWrite" },
    config: { settings: {} },
    ...overrides
  };
}

function makePending(
  overrides: Partial<PendingImageAttachment> = {}
): PendingImageAttachment {
  const docId = "doc:A";
  return {
    id: "pending-1",
    positionTrackingId: "track-1",
    sourceDocumentId: docId,
    sourceEditorId: imageAttachmentSourceEditorId(PROJECT_FILE, docId),
    initialPosition: 0,
    bytes: new Uint8Array(),
    reportedMimeType: "image/png",
    detectedFormat: "png",
    originalFileName: "pic.png",
    actualBytes: 0,
    hadMultipleImages: false,
    ignoredAdditionalImageCount: 0,
    ...overrides
  };
}

describe("imageAttachmentPasteAppDeps behavioral tests (#407 B4 remediation)", () => {
  it("inactive document link insertion: updates cached state, preserves undo history, calls setOpenDocumentsState, and leaves active document untouched", () => {
    const activeProjectContext = { rootPath: PROJECT_ROOT };
    const docIdA = createProjectDocumentEditorId("novel/chapter01.md", activeProjectContext);
    const serializedDocIdA = serializeEditorId(docIdA);
    const docIdB = createProjectDocumentEditorId("novel/chapter02.md", activeProjectContext);

    const docA = createProjectDocument(
      { name: "chapter01.md", relativePath: "novel/chapter01.md" },
      "hello world"
    );
    const docB = createProjectDocument(
      { name: "chapter02.md", relativePath: "novel/chapter02.md" },
      "chapter two content"
    );

    // Initial state with a prior edit (hello -> hello world) so undo depth > 0
    const initialDocAState = createMarkdownEditorDocumentState(
      baseEditorStateOptions({ doc: "hello" })
    );
    const priorTr = initialDocAState.state.update({
      changes: { from: 5, to: 5, insert: " world" },
      userEvent: "input.type"
    });
    // Add pending position marker at position 5
    const withMarkerTr = priorTr.state.update({
      effects: addPendingImageAttachmentPosition.of({
        id: "track-1",
        position: 5
      })
    });
    const cachedDocA: MarkdownEditorDocumentState = {
      state: withMarkerTr.state,
      lineEndingField: initialDocAState.lineEndingField
    };

    const cachedDocumentStates = new Map<string, MarkdownEditorDocumentState>([
      [serializedDocIdA, cachedDocA]
    ]);

    const openDocumentsState: OpenDocumentsState = {
      documents: [
        { id: docIdA, editor: createMarkdownCurrentEditor(docA) },
        { id: docIdB, editor: createMarkdownCurrentEditor(docB) }
      ],
      activeDocumentId: docIdB, // Doc B is active, Doc A is inactive
      nextUntitledId: 3
    };

    const currentProject = createProjectContext();
    const pending: PendingImageAttachment = {
      id: "pending-1",
      positionTrackingId: "track-1",
      sourceDocumentId: serializedDocIdA,
      sourceEditorId: imageAttachmentSourceEditorId(
        currentProject.activeProjectFilePath,
        serializedDocIdA
      ),
      initialPosition: 5,
      bytes: new Uint8Array([1, 2, 3]),
      reportedMimeType: "image/png",
      detectedFormat: "png",
      originalFileName: "pasted.png",
      actualBytes: 3,
      hadMultipleImages: false,
      ignoredAdditionalImageCount: 0
    };

    // 1. Resolve target
    const targetResolution = resolveImageAttachmentPasteTarget({
      pending,
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      cachedDocumentStates
    });

    expect(targetResolution).toEqual({
      ok: true,
      target: {
        documentId: serializedDocIdA,
        markdownRelativePath: "novel/chapter01.md",
        documentName: "chapter01.md",
        isActive: false,
        position: 5
      }
    });

    if (!targetResolution.ok) {
      throw new Error("Target resolution failed");
    }

    // 2. Insert Markdown link into inactive target
    let updatedOpenDocumentsState: OpenDocumentsState | null = null;
    const setOpenDocumentsState = vi.fn((next: OpenDocumentsState) => {
      updatedOpenDocumentsState = next;
    });

    const insertResult = insertMarkdownImageLinkIntoTarget({
      request: {
        pending,
        target: targetResolution.target,
        markdownLink: "![](../assets/images/pic.png)"
      },
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      liveParagraphIndentController: null,
      cachedDocumentStates,
      setOpenDocumentsState
    });

    expect(insertResult).toBe(true);

    // Verify Doc A content updated in openDocumentsState
    expect(setOpenDocumentsState).toHaveBeenCalledTimes(1);
    expect(updatedOpenDocumentsState).not.toBeNull();
    const updatedDocA = updatedOpenDocumentsState!.documents.find(
      (d) => serializeEditorId(d.id) === serializedDocIdA
    );
    expect(updatedDocA?.editor.kind).toBe("markdown");
    if (updatedDocA?.editor.kind === "markdown") {
      expect(updatedDocA.editor.document.content).toBe(
        "hello![](../assets/images/pic.png) world"
      );
    }

    // Verify Doc B (active) was untouched
    const untouchedDocB = updatedOpenDocumentsState!.documents.find(
      (d) => serializeEditorId(d.id) === serializeEditorId(docIdB)
    );
    expect(untouchedDocB?.editor.kind).toBe("markdown");
    if (untouchedDocB?.editor.kind === "markdown") {
      expect(untouchedDocB.editor.document.content).toBe("chapter two content");
    }

    // Verify cached state updated and undo history is intact
    const nextCachedDocA = cachedDocumentStates.get(serializedDocIdA);
    expect(nextCachedDocA).toBeDefined();
    expect(nextCachedDocA!.state.doc.toString()).toBe(
      "hello![](../assets/images/pic.png) world"
    );
    expect(undoDepth(nextCachedDocA!.state)).toBe(2);

    // Undo 1: restores "hello world"
    const afterUndoLink = undoOnce(nextCachedDocA!.state);
    expect(afterUndoLink?.doc.toString()).toBe("hello world");
    expect(undoDepth(afterUndoLink!)).toBe(1);

    // Undo 2: restores prior edit "hello"
    const afterUndoPrior = undoOnce(afterUndoLink!);
    expect(afterUndoPrior?.doc.toString()).toBe("hello");
    expect(undoDepth(afterUndoPrior!)).toBe(0);
  });

  it("cached marker clear: removes pending position marker from cached EditorState", () => {
    const activeProjectContext = { rootPath: PROJECT_ROOT };
    const docIdA = createProjectDocumentEditorId("novel/chapter01.md", activeProjectContext);
    const serializedDocIdA = serializeEditorId(docIdA);
    const docA = createProjectDocument(
      { name: "chapter01.md", relativePath: "novel/chapter01.md" },
      "hello world"
    );

    const initialDocAState = createMarkdownEditorDocumentState(
      baseEditorStateOptions({ doc: "hello world" })
    );
    const withMarkerTr = initialDocAState.state.update({
      effects: addPendingImageAttachmentPosition.of({
        id: "track-clear-1",
        position: 5
      })
    });
    const cachedDocA: MarkdownEditorDocumentState = {
      state: withMarkerTr.state,
      lineEndingField: initialDocAState.lineEndingField
    };

    const cachedDocumentStates = new Map<string, MarkdownEditorDocumentState>([
      [serializedDocIdA, cachedDocA]
    ]);

    const openDocumentsState: OpenDocumentsState = {
      documents: [{ id: docIdA, editor: createMarkdownCurrentEditor(docA) }],
      activeDocumentId: null,
      nextUntitledId: 2
    };

    // Marker is present initially
    expect(
      resolvePendingImageAttachmentPosition(cachedDocumentStates.get(serializedDocIdA)!.state, "track-clear-1")
    ).toEqual({
      ok: true,
      id: "track-clear-1",
      initialPosition: 5,
      position: 5
    });

    // Clear marker
    clearImageAttachmentPendingPosition({
      result: {
        ok: true,
        pending: {
          id: "pending-1",
          positionTrackingId: "track-clear-1",
          sourceDocumentId: serializedDocIdA,
          sourceEditorId: "irrelevant",
          initialPosition: 5,
          bytes: new Uint8Array(),
          reportedMimeType: "image/png",
          detectedFormat: "png",
          originalFileName: "pic.png",
          actualBytes: 0,
          hadMultipleImages: false,
          ignoredAdditionalImageCount: 0
        }
      },
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      livePositionController: null,
      cachedDocumentStates
    });

    // Marker is removed
    expect(
      resolvePendingImageAttachmentPosition(cachedDocumentStates.get(serializedDocIdA)!.state, "track-clear-1")
    ).toBeNull();
  });

  it("target document close/unavailable: reports targetDocumentUnavailable and rejects link insertion", () => {
    const activeProjectContext = { rootPath: PROJECT_ROOT };
    const docIdA = createProjectDocumentEditorId("novel/chapter01.md", activeProjectContext);
    const serializedDocIdA = serializeEditorId(docIdA);
    const currentProject = createProjectContext();

    const openDocumentsState: OpenDocumentsState = {
      documents: [], // Document closed
      activeDocumentId: null,
      nextUntitledId: 1
    };

    const pending: PendingImageAttachment = {
      id: "pending-1",
      positionTrackingId: "track-1",
      sourceDocumentId: serializedDocIdA,
      sourceEditorId: imageAttachmentSourceEditorId(
        currentProject.activeProjectFilePath,
        serializedDocIdA
      ),
      initialPosition: 0,
      bytes: new Uint8Array(),
      reportedMimeType: "image/png",
      detectedFormat: "png",
      originalFileName: "pic.png",
      actualBytes: 0,
      hadMultipleImages: false,
      ignoredAdditionalImageCount: 0
    };

    const targetResolution = resolveImageAttachmentPasteTarget({
      pending,
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      cachedDocumentStates: new Map()
    });

    expect(targetResolution).toEqual({
      ok: false,
      reason: "targetDocumentUnavailable"
    });

    const insertResult = insertMarkdownImageLinkIntoTarget({
      request: {
        pending,
        target: {
          documentId: serializedDocIdA,
          markdownRelativePath: "novel/chapter01.md",
          documentName: "chapter01.md",
          isActive: false,
          position: 0
        },
        markdownLink: "![](pic.png)"
      },
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      liveParagraphIndentController: null,
      cachedDocumentStates: new Map(),
      setOpenDocumentsState: vi.fn()
    });

    expect(insertResult).toBe(false);
  });

  it("position deleted: reports positionDeleted when marker position was deleted in cached state", () => {
    const activeProjectContext = { rootPath: PROJECT_ROOT };
    const docIdA = createProjectDocumentEditorId("novel/chapter01.md", activeProjectContext);
    const serializedDocIdA = serializeEditorId(docIdA);
    const docA = createProjectDocument(
      { name: "chapter01.md", relativePath: "novel/chapter01.md" },
      "hello world"
    );

    const initialDocAState = createMarkdownEditorDocumentState(
      baseEditorStateOptions({ doc: "hello world" })
    );
    // Add marker at position 5
    const withMarkerTr = initialDocAState.state.update({
      effects: addPendingImageAttachmentPosition.of({
        id: "track-del",
        position: 5
      })
    });
    // Delete range crossing position 5 (e.g. from 2 to 8)
    const delTr = withMarkerTr.state.update({
      changes: { from: 2, to: 8, insert: "" }
    });
    const cachedDocA: MarkdownEditorDocumentState = {
      state: delTr.state,
      lineEndingField: initialDocAState.lineEndingField
    };

    const cachedDocumentStates = new Map<string, MarkdownEditorDocumentState>([
      [serializedDocIdA, cachedDocA]
    ]);

    const openDocumentsState: OpenDocumentsState = {
      documents: [{ id: docIdA, editor: createMarkdownCurrentEditor(docA) }],
      activeDocumentId: null,
      nextUntitledId: 2
    };
    const currentProject = createProjectContext();
    const pending: PendingImageAttachment = {
      id: "pending-1",
      positionTrackingId: "track-del",
      sourceDocumentId: serializedDocIdA,
      sourceEditorId: imageAttachmentSourceEditorId(
        currentProject.activeProjectFilePath,
        serializedDocIdA
      ),
      initialPosition: 5,
      bytes: new Uint8Array(),
      reportedMimeType: "image/png",
      detectedFormat: "png",
      originalFileName: "pic.png",
      actualBytes: 0,
      hadMultipleImages: false,
      ignoredAdditionalImageCount: 0
    };

    const targetResolution = resolveImageAttachmentPasteTarget({
      pending,
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      cachedDocumentStates
    });

    expect(targetResolution).toEqual({
      ok: false,
      reason: "positionDeleted"
    });
  });

  it("target document read-only or lifecycle barrier active: reports targetDocumentReadOnly and rejects link insertion", () => {
    const activeProjectContext = { rootPath: PROJECT_ROOT };
    const docIdA = createProjectDocumentEditorId("novel/chapter01.md", activeProjectContext);
    const serializedDocIdA = serializeEditorId(docIdA);
    const docA = createProjectDocument(
      { name: "chapter01.md", relativePath: "novel/chapter01.md" },
      "hello world"
    );

    const openDocumentsState: OpenDocumentsState = {
      documents: [{ id: docIdA, editor: createMarkdownCurrentEditor(docA) }],
      activeDocumentId: null,
      nextUntitledId: 2
    };

    const readOnlyProject = createProjectContext({
      accessMode: { kind: "readOnly" }
    });

    const pending: PendingImageAttachment = {
      id: "pending-1",
      positionTrackingId: "track-1",
      sourceDocumentId: serializedDocIdA,
      sourceEditorId: imageAttachmentSourceEditorId(
        readOnlyProject.activeProjectFilePath,
        serializedDocIdA
      ),
      initialPosition: 0,
      bytes: new Uint8Array(),
      reportedMimeType: "image/png",
      detectedFormat: "png",
      originalFileName: "pic.png",
      actualBytes: 0,
      hadMultipleImages: false,
      ignoredAdditionalImageCount: 0
    };

    // 1. Read-only project
    const readOnlyResolution = resolveImageAttachmentPasteTarget({
      pending,
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject: readOnlyProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      cachedDocumentStates: new Map()
    });
    expect(readOnlyResolution).toEqual({
      ok: false,
      reason: "targetDocumentReadOnly"
    });

    // 2. Lifecycle commit barrier active
    const barrierResolution = resolveImageAttachmentPasteTarget({
      pending,
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject: createProjectContext(),
      isLifecycleCommitBarrierActive: true,
      livePositionController: null,
      cachedDocumentStates: new Map()
    });
    expect(barrierResolution).toEqual({
      ok: false,
      reason: "targetDocumentReadOnly"
    });

    // Insertion rejected under read-only
    const insertResult = insertMarkdownImageLinkIntoTarget({
      request: {
        pending,
        target: {
          documentId: serializedDocIdA,
          markdownRelativePath: "novel/chapter01.md",
          documentName: "chapter01.md",
          isActive: false,
          position: 0
        },
        markdownLink: "![](pic.png)"
      },
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject: readOnlyProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      liveParagraphIndentController: null,
      cachedDocumentStates: new Map(),
      setOpenDocumentsState: vi.fn()
    });
    expect(insertResult).toBe(false);
  });

  it("target document not markdown: reports targetDocumentNotMarkdown and rejects link insertion", () => {
    const activeProjectContext = { rootPath: PROJECT_ROOT };
    const validUuidv7 = "018d3e26-f72c-7b44-9352-8706d95393d9";
    const glossaryId = createGlossaryEntryEditorId(validUuidv7, activeProjectContext);
    const serializedGlossaryId = serializeEditorId(glossaryId);
    const glossaryEntry: GlossaryEntry = {
      id: validUuidv7,
      description: "Description",
      atoms: [
        {
          id: "018d3e26-f72c-7b44-9352-8706d95393da",
          entryId: validUuidv7,
          sortOrder: 0,
          value: "Terminology",
          matchFlags: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };

    const openDocumentsState: OpenDocumentsState = {
      documents: [{ id: glossaryId, editor: createGlossaryEntryCurrentEditor(glossaryEntry) }],
      activeDocumentId: glossaryId,
      nextUntitledId: 2
    };
    const currentProject = createProjectContext();
    const pending: PendingImageAttachment = {
      id: "pending-1",
      positionTrackingId: "track-1",
      sourceDocumentId: serializedGlossaryId,
      sourceEditorId: imageAttachmentSourceEditorId(
        currentProject.activeProjectFilePath,
        serializedGlossaryId
      ),
      initialPosition: 0,
      bytes: new Uint8Array(),
      reportedMimeType: "image/png",
      detectedFormat: "png",
      originalFileName: "pic.png",
      actualBytes: 0,
      hadMultipleImages: false,
      ignoredAdditionalImageCount: 0
    };

    const resolution = resolveImageAttachmentPasteTarget({
      pending,
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      cachedDocumentStates: new Map()
    });

    expect(resolution).toEqual({
      ok: false,
      reason: "targetDocumentNotMarkdown"
    });

    const insertResult = insertMarkdownImageLinkIntoTarget({
      request: {
        pending,
        target: {
          documentId: serializedGlossaryId,
          markdownRelativePath: "irrelevant",
          documentName: "irrelevant",
          isActive: false,
          position: 0
        },
        markdownLink: "![](pic.png)"
      },
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      liveParagraphIndentController: null,
      cachedDocumentStates: new Map(),
      setOpenDocumentsState: vi.fn()
    });

    expect(insertResult).toBe(false);
  });

  it("project context mismatch or sourceEditorId stale: rejects target resolution and settings save", async () => {
    const activeProjectContext = { rootPath: PROJECT_ROOT };
    const docIdA = createProjectDocumentEditorId("novel/chapter01.md", activeProjectContext);
    const serializedDocIdA = serializeEditorId(docIdA);
    const docA = createProjectDocument(
      { name: "chapter01.md", relativePath: "novel/chapter01.md" },
      "hello world"
    );

    const openDocumentsState: OpenDocumentsState = {
      documents: [{ id: docIdA, editor: createMarkdownCurrentEditor(docA) }],
      activeDocumentId: null,
      nextUntitledId: 2
    };

    const currentProject = createProjectContext({
      activeProjectFilePath: "C:/other-project/novel.pergamum"
    });

    const pending: PendingImageAttachment = {
      id: "pending-1",
      positionTrackingId: "track-1",
      sourceDocumentId: serializedDocIdA,
      // Stale sourceEditorId matching C:/project/novel.pergamum, not C:/other-project/novel.pergamum
      sourceEditorId: imageAttachmentSourceEditorId(
        PROJECT_FILE,
        serializedDocIdA
      ),
      initialPosition: 0,
      bytes: new Uint8Array(),
      reportedMimeType: "image/png",
      detectedFormat: "png",
      originalFileName: "pic.png",
      actualBytes: 0,
      hadMultipleImages: false,
      ignoredAdditionalImageCount: 0
    };

    // Stale sourceEditorId returns targetDocumentUnavailable
    const resolution = resolveImageAttachmentPasteTarget({
      pending,
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      cachedDocumentStates: new Map()
    });
    expect(resolution).toEqual({
      ok: false,
      reason: "targetDocumentUnavailable"
    });

    // Null project returns projectNotOpen
    const nullProjectResolution = resolveImageAttachmentPasteTarget({
      pending,
      openDocumentsState,
      isEditorAreaSpecialTabActive: false,
      currentProject: null,
      isLifecycleCommitBarrierActive: false,
      livePositionController: null,
      cachedDocumentStates: new Map()
    });
    expect(nullProjectResolution).toEqual({
      ok: false,
      reason: "projectNotOpen"
    });

    // Settings save with stale sourceEditorId returns targetStale
    const saveResultStale = await saveImageAttachmentProjectSettingsFromPrompt({
      nextSettings: {
        saveDirectory: "attachments",
        insertMarkdownLink: true
      },
      pending,
      currentProject,
      applicationSettings: defaultApplicationSettings,
      saveProjectSettings: vi.fn()
    });
    expect(saveResultStale).toBe("targetStale");

    // Settings save with null project returns targetStale
    const saveResultNullProject = await saveImageAttachmentProjectSettingsFromPrompt({
      nextSettings: {
        saveDirectory: "attachments",
        insertMarkdownLink: true
      },
      pending,
      currentProject: null,
      applicationSettings: defaultApplicationSettings,
      saveProjectSettings: vi.fn()
    });
    expect(saveResultNullProject).toBe("targetStale");
  });

  describe("saveImageAttachmentProjectSettingsFromPrompt outcomes", () => {
    const nextSettings: EffectiveImageAttachmentSettings = {
      saveDirectory: "attachments",
      insertMarkdownLink: true
    };

    it("returns 'saved' when saveProjectSettings resolves with updated settings", async () => {
      const pending = makePending();
      const currentProject = createProjectContext();
      const updatedSettings: ProjectSettings = {
        imageAttachment: { saveDirectory: "attachments", insertMarkdownLink: true }
      };
      const saveProjectSettings = vi.fn(async () => updatedSettings);

      const result = await saveImageAttachmentProjectSettingsFromPrompt({
        nextSettings,
        pending,
        currentProject,
        applicationSettings: defaultApplicationSettings,
        saveProjectSettings
      });

      expect(result).toBe("saved");
      expect(saveProjectSettings).toHaveBeenCalledWith({
        set: {
          "imageAttachment.saveDirectory": "attachments"
        }
      });
    });

    it("returns 'saved' without calling saveProjectSettings when prompt settings already match application settings", async () => {
      const pending = makePending();
      const currentProject = createProjectContext();
      const saveProjectSettings = vi.fn();

      // Set application settings to already match nextSettings
      const applicationSettings = {
        ...defaultApplicationSettings,
        imageAttachment: {
          saveDirectory: "attachments",
          insertMarkdownLink: true
        }
      };

      const result = await saveImageAttachmentProjectSettingsFromPrompt({
        nextSettings,
        pending,
        currentProject,
        applicationSettings,
        saveProjectSettings
      });

      expect(result).toBe("saved");
      expect(saveProjectSettings).not.toHaveBeenCalled();
    });

    it("returns 'settingsSaveFailed' when saveProjectSettings returns undefined", async () => {
      const pending = makePending();
      const currentProject = createProjectContext();
      const saveProjectSettings = vi.fn(async () => undefined);

      const result = await saveImageAttachmentProjectSettingsFromPrompt({
        nextSettings,
        pending,
        currentProject,
        applicationSettings: defaultApplicationSettings,
        saveProjectSettings
      });

      expect(result).toBe("settingsSaveFailed");
      expect(saveProjectSettings).toHaveBeenCalledTimes(1);
    });

    it("returns 'settingsSaveFailed' when saveProjectSettings rejects with an error", async () => {
      const pending = makePending();
      const currentProject = createProjectContext();
      const saveProjectSettings = vi.fn(async () => {
        throw new Error("Disk full or permission denied");
      });

      const result = await saveImageAttachmentProjectSettingsFromPrompt({
        nextSettings,
        pending,
        currentProject,
        applicationSettings: defaultApplicationSettings,
        saveProjectSettings
      });

      expect(result).toBe("settingsSaveFailed");
      expect(saveProjectSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe("dogfood blocker regression: reset saveDirectory triggers pastePrompt", () => {
    it("opens pastePrompt and does not call save IPC after saveDirectory is set to 'assets' then reset in Application and Project settings", async () => {
      // 1. Initially configured with "assets"
      let applicationSettings = {
        ...defaultApplicationSettings,
        imageAttachment: {
          saveDirectory: "assets",
          insertMarkdownLink: true
        }
      };
      let projectSettings: ProjectSettings = {
        imageAttachment: {
          saveDirectory: "assets",
          insertMarkdownLink: true
        }
      };

      // Live getter simulating App.tsx currentImageAttachmentSettings() backed by settingsRef
      const getSettings = () =>
        resolveEffectiveSettings(applicationSettings, projectSettings).imageAttachment;

      expect(getSettings().saveDirectory).toBe("assets");

      // 2. Application Settings reset to ""
      applicationSettings = {
        ...applicationSettings,
        imageAttachment: {
          ...applicationSettings.imageAttachment,
          saveDirectory: ""
        }
      };

      // 3. Project Settings override reset to absent
      projectSettings = {};

      // Effective settings must now be ""
      expect(getSettings().saveDirectory).toBe("");

      // 4. Run paste orchestration
      const saveImageAttachment = vi.fn();
      const promptForSettings = vi.fn(async () => ({
        kind: "cancelled" as const
      }));
      const clearPosition = vi.fn();
      const showWarningDialog = vi.fn();
      const showSettingsSaveFailedDialog = vi.fn();
      const showSuccessToast = vi.fn();
      const showInfoToast = vi.fn();
      const insertMarkdownLink = vi.fn();
      const saveProjectSettingsFromPrompt = vi.fn();

      const preparationResult = {
        ok: true as const,
        pending: makePending()
      };

      const resolveTarget = vi.fn(() => ({
        ok: true as const,
        target: {
          documentId: "doc-1",
          markdownRelativePath: "chapter.md",
          documentName: "chapter.md",
          isActive: true,
          position: 10
        }
      }));

      const status = await runImageAttachmentPasteOrchestration(
        preparationResult,
        {
          translate: (key: string) => key,
          getSettings,
          resolveTarget,
          clearPosition,
          promptForSettings,
          saveProjectSettingsFromPrompt,
          saveImageAttachment,
          insertMarkdownLink,
          showWarningDialog,
          showSettingsSaveFailedDialog,
          showSuccessToast,
          showInfoToast
        }
      );

      // 5. save IPC is NOT called
      expect(saveImageAttachment).not.toHaveBeenCalled();

      // 6. SaveDestinationDialog pastePrompt was opened (promptForSettings called with empty saveDirectory)
      expect(promptForSettings).toHaveBeenCalledTimes(1);
      expect(promptForSettings).toHaveBeenCalledWith({
        pending: preparationResult.pending,
        currentSettings: expect.objectContaining({
          saveDirectory: ""
        })
      });

      // Since prompt was cancelled in this test run, position was cleared and status was promptCancelled
      expect(status).toBe("promptCancelled");
      expect(clearPosition).toHaveBeenCalledTimes(1);
    });
  });
});

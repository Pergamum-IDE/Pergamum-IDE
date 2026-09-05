import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  activeCurrentEditor,
  activeOpenDocument,
  closeOpenEditor,
  createInitialOpenDocumentsState,
  openOrActivateDocument,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import { shouldShowWelcomeSurface } from "../../src/renderer/welcomeSurface";
import { buildCommandContextSnapshot } from "../../src/renderer/commandContextSnapshot";
import {
  saveAsCommandWhen,
  saveDocumentCommandWhen
} from "../../src/renderer/editorCommands";
import { evaluateCommandEnablement } from "../../src/shared/commandEnablement";
import type { ActiveProjectContext } from "../../src/shared/editorId";
import type { ProjectDocument } from "../../src/shared/api";

const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };

const projectDocument: ProjectDocument = {
  relativePath: "chapter-01.md",
  name: "chapter-01.md"
};

function zeroTabState(): OpenDocumentsState {
  return createInitialOpenDocumentsState();
}

function oneMarkdownTabState(): OpenDocumentsState {
  return openOrActivateDocument(
    zeroTabState(),
    createProjectDocument(projectDocument, "content"),
    projectContext
  );
}

describe("#262 zero-tab state", () => {
  it("starts with no tabs, no active editor, and no placeholder Untitled.md", () => {
    const state = zeroTabState();

    expect(state.documents).toEqual([]);
    expect(state.activeDocumentId).toBeNull();
    expect(activeOpenDocument(state)).toBeNull();
    expect(activeCurrentEditor(state)).toBeNull();
  });

  it("has no active editor after the last tab is closed", () => {
    const opened = oneMarkdownTabState();
    const closed = closeOpenEditor(
      opened,
      opened.activeDocumentId as NonNullable<typeof opened.activeDocumentId>
    );

    expect(closed.documents).toEqual([]);
    expect(closed.activeDocumentId).toBeNull();
    expect(activeCurrentEditor(closed)).toBeNull();
  });

  it("regains an active Markdown editor once a document tab is opened", () => {
    const state = oneMarkdownTabState();

    expect(state.documents).toHaveLength(1);
    expect(activeCurrentEditor(state)?.kind).toBe("markdown");
  });
});

describe("#262 Welcome surface visibility", () => {
  it("shows Welcome only when there are zero open tabs of any kind", () => {
    expect(
      shouldShowWelcomeSurface({
        openDocumentsState: zeroTabState(),
        isSettingsTabOpen: false
      })
    ).toBe(true);

    expect(
      shouldShowWelcomeSurface({
        openDocumentsState: oneMarkdownTabState(),
        isSettingsTabOpen: false
      })
    ).toBe(false);
  });

  it("does not show Welcome while the Application Settings tab is open", () => {
    expect(
      shouldShowWelcomeSurface({
        openDocumentsState: zeroTabState(),
        isSettingsTabOpen: true
      })
    ).toBe(false);

    expect(
      shouldShowWelcomeSurface({
        openDocumentsState: oneMarkdownTabState(),
        isSettingsTabOpen: true
      })
    ).toBe(false);
  });

  it("is independent of project state — zero tabs shows Welcome whether or not a project is open", () => {
    // `shouldShowWelcomeSurface` takes no project argument by design; a project
    // being open never suppresses Welcome nor forces a placeholder editor. The
    // App call site passes only these two inputs.
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");
    const callStart = appSource.indexOf("shouldShowWelcomeSurface({");
    const callBlock = appSource.slice(callStart, callStart + 120);

    expect(callStart).toBeGreaterThan(-1);
    expect(callBlock).toContain("openDocumentsState");
    expect(callBlock).toContain("isSettingsTabOpen");
    expect(callBlock).not.toContain("project");
    expect(
      shouldShowWelcomeSurface({
        openDocumentsState: zeroTabState(),
        isSettingsTabOpen: false
      })
    ).toBe(true);
  });
});

describe("#262 document-dependent commands in the zero-tab state", () => {
  const zeroTabContext = buildCommandContextSnapshot({
    projectIsOpen: false,
    projectAccessReadWrite: false,
    projectAccessReadOnly: false,
    editorHasDocument: false,
    editorIsDirty: false,
    editorKindMarkdown: false,
    editorKindGlossary: false,
    editorDocumentProjectOwned: false,
    editorDocumentProjectFile: false,
    activeEditorSaveBlockedByReadOnlyProjectRootForUi: false,
    occurrenceTrackingActive: false,
    recoveryOwner: false,
    recoveryHasRecoverableCandidates: false
  });

  const markdownTabContext = buildCommandContextSnapshot({
    projectIsOpen: false,
    projectAccessReadWrite: false,
    projectAccessReadOnly: false,
    editorHasDocument: true,
    editorIsDirty: true,
    editorKindMarkdown: true,
    editorKindGlossary: false,
    editorDocumentProjectOwned: false,
    editorDocumentProjectFile: false,
    activeEditorSaveBlockedByReadOnlyProjectRootForUi: false,
    occurrenceTrackingActive: false,
    recoveryOwner: false,
    recoveryHasRecoverableCandidates: false
  });

  it("leaves Save and Save As disabled", () => {
    expect(
      evaluateCommandEnablement(saveDocumentCommandWhen, zeroTabContext)
    ).toBe(false);
    expect(evaluateCommandEnablement(saveAsCommandWhen, zeroTabContext)).toBe(
      false
    );
  });

  it("re-enables Save and Save As once a Markdown editor is active", () => {
    expect(
      evaluateCommandEnablement(saveDocumentCommandWhen, markdownTabContext)
    ).toBe(true);
    expect(
      evaluateCommandEnablement(saveAsCommandWhen, markdownTabContext)
    ).toBe(true);
  });
});

describe("#262 App wiring", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");
  const openDocumentsSource = readFileSync(
    "src/renderer/openDocuments.ts",
    "utf8"
  );

  it("derives Welcome visibility from the shared zero-tab predicate", () => {
    expect(appSource).toContain("shouldShowWelcomeSurface({");
    expect(appSource).not.toContain("isOnlyInitialUntitledDocument");
  });

  it("gates the #259 character count on an active Markdown editor being present", () => {
    expect(appSource).toContain(
      'currentEditor?.kind === "markdown"'
    );
  });

  it("never fabricates a placeholder Untitled document for the zero-tab state", () => {
    expect(openDocumentsSource).not.toContain("createUntitledDocument()");
    expect(openDocumentsSource).toContain("activeDocumentId: null");
  });
});

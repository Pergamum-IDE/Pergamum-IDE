import { describe, expect, it } from "vitest";
import {
  sanitizeDebugLogDetails,
  sanitizeErrorForDebugLog,
  type DebugLogRuntimeDetails
} from "../../src/main/debugLogSanitizer";

const runtime: DebugLogRuntimeDetails = {
  appVersion: "0.1.0",
  platform: "win32",
  arch: "x64",
  locale: "ja",
  electronVersion: "39.8.10",
  nodeVersion: "20.19.11",
  debugMode: true
};

function context(knownRefs: {
  projectRefs?: readonly string[];
  documentRefs?: readonly string[];
} = {}) {
  const projectRefs = new Set(knownRefs.projectRefs ?? []);
  const documentRefs = new Set(knownRefs.documentRefs ?? []);

  return {
    runtime,
    isKnownProjectRef: (projectRef: string) => projectRefs.has(projectRef),
    isKnownDocumentRef: (documentRef: string) => documentRefs.has(documentRef)
  };
}

describe("debug log details sanitizer", () => {
  it("drops unknown detail keys without writing their names or values", () => {
    const details = sanitizeDebugLogDetails(
      {
        documentRef: "document:session:001",
        fileName: "secret-title.md",
        absolutePath: "C:\\Users\\name\\Documents\\secret-title.md",
        itemCount: 12
      },
      context({
        documentRefs: ["document:session:001"]
      })
    );

    expect(details).toEqual({
      documentRef: "document:session:001",
      droppedKeyCount: 3
    });
    expect(JSON.stringify(details)).not.toContain("fileName");
    expect(JSON.stringify(details)).not.toContain("secret-title");
    expect(JSON.stringify(details)).not.toContain("absolutePath");
    expect(details).not.toHaveProperty("itemCount");
  });

  it("normalizes enum-like values and known catalogs", () => {
    const details = sanitizeDebugLogDetails(
      {
        commandId: "unknown.command.id",
        statusKey: "status.notInCatalog",
        operation: "publish",
        result: "partial",
        editorIdKind: "custom",
        reason: "custom_reason",
        trigger: "shortcut",
        source: "bogusSource",
        saveTargetKind: "custom_target"
      },
      context()
    );

    expect(details).toEqual({
      commandId: "unknown",
      statusKey: "unknown",
      operation: "unknown",
      result: "unknown",
      editorIdKind: "unknown",
      reason: "unknown",
      trigger: "unknown",
      source: "unknown",
      saveTargetKind: "unknown"
    });
  });

  it("accepts known command execution sources", () => {
    const details = sanitizeDebugLogDetails(
      {
        commandId: "glossary.occurrences.next",
        source: "utilityWindow",
        reason: "disabled_command"
      },
      context()
    );

    expect(details).toEqual({
      commandId: "glossary.occurrences.next",
      source: "utilityWindow",
      reason: "disabled_command"
    });
  });

  it("accepts only safe IME diagnostic booleans", () => {
    const details = sanitizeDebugLogDetails(
      {
        hasPendingSave: true,
        hasScheduledSave: false,
        isComposing: true,
        isDirty: true,
        canSave: false,
        hasRelatedTarget: false,
        nextTargetInsideAppShell: true,
        documentHasFocus: "yes",
        willClearPendingSave: true
      },
      context()
    );

    expect(details).toEqual({
      hasPendingSave: true,
      hasScheduledSave: false,
      isComposing: true,
      isDirty: true,
      canSave: false,
      hasRelatedTarget: false,
      nextTargetInsideAppShell: true,
      willClearPendingSave: true
    });
  });

  it("accepts safe context menu diagnostics and drops disallowed detail keys", () => {
    const details = sanitizeDebugLogDetails(
      {
        interactionId: "contextMenu.12",
        commandId: "editor.selection.cut",
        requestedSurface: "markdownEditor",
        delegatedSurface: "unknownEditable",
        hasSelection: false,
        itemCount: 4,
        clipboardText: "secret",
        selectedText: "secret"
      },
      context()
    );

    expect(details).toEqual({
      interactionId: "contextMenu.12",
      commandId: "editor.selection.cut",
      requestedSurface: "markdownEditor",
      delegatedSurface: "unknownEditable",
      hasSelection: false,
      droppedKeyCount: 3
    });
    expect(JSON.stringify(details)).not.toContain("secret");
    expect(details).not.toHaveProperty("itemCount");
  });

  it("normalizes unsupported surface strings to unknownEditable", () => {
    const details = sanitizeDebugLogDetails(
      {
        requestedSurface: "unsupported",
        delegatedSurface: "custom"
      },
      context()
    );

    expect(details).toEqual({
      requestedSurface: "unknownEditable",
      delegatedSurface: "unknownEditable"
    });
  });

  it("accepts safe DB operation diagnostics and drops unsafe DB details", () => {
    const details = sanitizeDebugLogDetails(
      {
        dbOperationId: "dbOperation.12",
        dbOperation: "read",
        dbEntityKind: "glossaryEntry",
        result: "succeeded",
        reason: "validation_failed",
        durationMs: 12.5,
        count: 0,
        sql: "SELECT * FROM glossary_entries",
        parameters: ["secret"],
        markdownContent: "本文",
        glossarySurface: "王都アルセリア",
        glossaryDescription: "首都",
        absolutePath: "C:\\Users\\name\\novel.md",
        rowData: { surface: "王都アルセリア" }
      },
      context()
    );

    expect(details).toEqual({
      dbOperationId: "dbOperation.12",
      dbOperation: "read",
      dbEntityKind: "glossaryEntry",
      result: "succeeded",
      reason: "validation_failed",
      durationMs: 12.5,
      count: 0,
      droppedKeyCount: 7
    });
    expect(JSON.stringify(details)).not.toContain("SELECT");
    expect(JSON.stringify(details)).not.toContain("secret");
    expect(JSON.stringify(details)).not.toContain("本文");
    expect(JSON.stringify(details)).not.toContain("王都");
    expect(JSON.stringify(details)).not.toContain("novel.md");
  });

  it("handles invalid DB enum details according to each catalog policy", () => {
    const details = sanitizeDebugLogDetails(
      {
        dbOperation: "migrate",
        dbEntityKind: "settings",
        reason: "custom_reason"
      },
      context()
    );

    expect(details).toEqual({
      dbEntityKind: "unknown",
      reason: "unknown",
      droppedKeyCount: 1
    });
    expect(details).not.toHaveProperty("dbOperation");
  });

  it("drops invalid DB operation IDs and counts", () => {
    const details = sanitizeDebugLogDetails(
      {
        dbOperationId: "db operation with spaces",
        count: -1
      },
      context()
    );

    expect(details).toBeUndefined();
  });

  it("uses main-process runtime values instead of renderer-provided versions", () => {
    const details = sanitizeDebugLogDetails(
      {
        appVersion: "renderer-version",
        locale: "renderer-locale",
        electronVersion: "renderer-electron",
        nodeVersion: "renderer-node",
        debugMode: false
      },
      context()
    );

    expect(details).toMatchObject({
      appVersion: runtime.appVersion,
      locale: runtime.locale,
      electronVersion: runtime.electronVersion,
      nodeVersion: runtime.nodeVersion,
      debugMode: true
    });
  });

  it("accepts only issued session-local opaque references", () => {
    const details = sanitizeDebugLogDetails(
      {
        projectRef: "project:session:001",
        documentRef: "document:session:999"
      },
      context({
        projectRefs: ["project:session:001"],
        documentRefs: ["document:session:001"]
      })
    );

    expect(details).toEqual({
      projectRef: "project:session:001",
      droppedKeyCount: 1
    });
  });

  it("accepts document-open timing details and drops manuscript-shaped extras (#152)", () => {
    const details = sanitizeDebugLogDetails(
      {
        documentOpenId: "documentOpen.1",
        durationMs: 1234.5,
        fileSizeBytes: 1_048_576,
        documentKind: "file",
        editorKind: "markdown",
        lineCount: 9001,
        sizeBucket: "large",
        manuscriptText: "吾輩は猫である。名前はまだ無い。",
        previewText: "<p>吾輩は猫である</p>",
        glossarySurface: "吾輩",
        absolutePath: "C:\\Users\\name\\catfood.md"
      },
      context()
    );

    expect(details).toEqual({
      documentOpenId: "documentOpen.1",
      durationMs: 1234.5,
      fileSizeBytes: 1_048_576,
      documentKind: "file",
      editorKind: "markdown",
      lineCount: 9001,
      sizeBucket: "large",
      droppedKeyCount: 4
    });
    expect(JSON.stringify(details)).not.toContain("吾輩");
    expect(JSON.stringify(details)).not.toContain("catfood.md");
    expect(JSON.stringify(details)).not.toContain("previewText");
  });

  it("normalizes unknown documentKind/editorKind instead of passing them through", () => {
    const details = sanitizeDebugLogDetails(
      {
        documentKind: "spreadsheet",
        editorKind: "terminal"
      },
      context()
    );

    expect(details).toEqual({
      documentKind: "unknown",
      editorKind: "unknown"
    });
  });

  it("drops a malformed documentOpenId (not a safe code string)", () => {
    const details = sanitizeDebugLogDetails(
      {
        documentOpenId: "documentOpen with spaces and 吾輩は猫である"
      },
      context()
    );

    expect(details).toBeUndefined();
  });

  it("accepts preview DOM commit / decoration timing details and drops manuscript-shaped extras (#154)", () => {
    const details = sanitizeDebugLogDetails(
      {
        documentOpenId: "documentOpen.1",
        durationMs: 42,
        previewNodeCount: 120,
        visitedTextNodeCount: 84,
        decoratedNodeCount: 6,
        matchCount: 9,
        previewHtml: "<p>吾輩は猫である</p>",
        glossarySurfaceText: "吾輩"
      },
      context()
    );

    expect(details).toEqual({
      documentOpenId: "documentOpen.1",
      durationMs: 42,
      previewNodeCount: 120,
      visitedTextNodeCount: 84,
      decoratedNodeCount: 6,
      matchCount: 9,
      droppedKeyCount: 2
    });
    expect(JSON.stringify(details)).not.toContain("吾輩");
  });

  it("drops negative or non-integer previewNodeCount / visitedTextNodeCount / decoratedNodeCount / matchCount", () => {
    expect(
      sanitizeDebugLogDetails({ previewNodeCount: -1 }, context())
    ).toBeUndefined();
    expect(
      sanitizeDebugLogDetails({ visitedTextNodeCount: 1.5 }, context())
    ).toBeUndefined();
    expect(
      sanitizeDebugLogDetails({ decoratedNodeCount: -1 }, context())
    ).toBeUndefined();
    expect(
      sanitizeDebugLogDetails({ matchCount: 1.5 }, context())
    ).toBeUndefined();
  });

  it("drops a negative or non-integer fileSizeBytes", () => {
    const negative = sanitizeDebugLogDetails({ fileSizeBytes: -1 }, context());
    const fractional = sanitizeDebugLogDetails(
      { fileSizeBytes: 1.5 },
      context()
    );

    expect(negative).toBeUndefined();
    expect(fractional).toBeUndefined();
  });

  it("accepts the document.open.completed aggregate metric details (#161)", () => {
    const details = sanitizeDebugLogDetails(
      {
        documentOpenId: "documentOpen.1",
        result: "succeeded",
        durationMs: 42,
        documentCharCount: 120000,
        documentLineCount: 1,
        documentMaxLineLength: 119998,
        appWindowWidth: 1920,
        appWindowHeight: 1080,
        editorPaneWidth: 960,
        editorPaneHeight: 1020,
        previewPaneWidth: 954,
        previewPaneHeight: 1020
      },
      context()
    );

    expect(details).toEqual({
      documentOpenId: "documentOpen.1",
      result: "succeeded",
      durationMs: 42,
      documentCharCount: 120000,
      documentLineCount: 1,
      documentMaxLineLength: 119998,
      appWindowWidth: 1920,
      appWindowHeight: 1080,
      editorPaneWidth: 960,
      editorPaneHeight: 1020,
      previewPaneWidth: 954,
      previewPaneHeight: 1020
    });
  });

  it("drops negative, fractional, NaN, Infinity, or string values for every #161 aggregate metric key", () => {
    const keys = [
      "documentCharCount",
      "documentLineCount",
      "documentMaxLineLength",
      "appWindowWidth",
      "appWindowHeight",
      "editorPaneWidth",
      "editorPaneHeight",
      "previewPaneWidth",
      "previewPaneHeight"
    ] as const;
    const invalidValues: unknown[] = [-1, 1.5, NaN, Infinity, "120000"];

    for (const key of keys) {
      for (const invalidValue of invalidValues) {
        expect(
          sanitizeDebugLogDetails({ [key]: invalidValue }, context())
        ).toBeUndefined();
      }

      expect(
        sanitizeDebugLogDetails({ [key]: 0 }, context())
      ).toEqual({ [key]: 0 });
    }
  });

  it("accepts layout.viewport.changed's size + viewportChangeSource details (#162)", () => {
    const details = sanitizeDebugLogDetails(
      {
        appWindowWidth: 1280,
        appWindowHeight: 800,
        editorPaneWidth: 640,
        editorPaneHeight: 740,
        previewPaneWidth: 634,
        previewPaneHeight: 740,
        viewportChangeSource: "windowResize"
      },
      context()
    );

    expect(details).toEqual({
      appWindowWidth: 1280,
      appWindowHeight: 800,
      editorPaneWidth: 640,
      editorPaneHeight: 740,
      previewPaneWidth: 634,
      previewPaneHeight: 740,
      viewportChangeSource: "windowResize"
    });
  });

  it("normalizes an unrecognized viewportChangeSource to unknown rather than dropping the whole event", () => {
    const details = sanitizeDebugLogDetails(
      { viewportChangeSource: "dragResize" },
      context()
    );

    expect(details).toEqual({ viewportChangeSource: "unknown" });
  });

  it("keeps viewportChangeSource's catalog independent from the generic command-execution source key (#162)", () => {
    // "windowResize"/"paneResize" are not in debugLogCommandExecutionSources
    // — passed under the generic `source` key they must normalize to
    // "unknown", not leak through as a command-execution source value.
    const details = sanitizeDebugLogDetails(
      { source: "windowResize" },
      context()
    );

    expect(details).toEqual({ source: "unknown" });
  });

  it("sanitizes errors without message or stack summaries", () => {
    const error = new Error("C:\\Users\\name\\secret.md could not be opened");
    Object.assign(error, {
      code: "ENOENT",
      stack: "stack with C:\\Users\\name\\secret.md"
    });

    const sanitized = sanitizeErrorForDebugLog(error);

    expect(sanitized).toEqual({
      name: "Error",
      code: "ENOENT",
      category: "notFound"
    });
    expect(sanitized).not.toHaveProperty("messageSummary");
    expect(sanitized).not.toHaveProperty("stackSummary");
    expect(JSON.stringify(sanitized)).not.toContain("secret.md");
  });

  it("keeps the #293 stale-lock owner diagnostics only in safe scalar form", () => {
    const details = sanitizeDebugLogDetails(
      {
        pathKind: "appData",
        result: "succeeded",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: "2026-08-29T08:06:16.724Z"
      },
      context()
    );

    expect(details).toEqual({
      pathKind: "appData",
      result: "succeeded",
      ownerPid: 62368,
      ownerAppVersion: "0.60.0",
      ownerCreatedAt: "2026-08-29T08:06:16.724Z"
    });
  });

  it("silently omits #293 owner diagnostics that are malformed or path-like", () => {
    // A recognized key with a bad value is dropped WITHOUT surfacing its
    // name or value (and without counting as an unknown key).
    const details = sanitizeDebugLogDetails(
      {
        ownerPid: 0,
        ownerAppVersion: "C:\\Users\\name\\Recovery\\Recovery.lock",
        ownerCreatedAt: "not-a-timestamp"
      },
      context()
    );

    expect(details).toBeUndefined();

    // Alongside a valid key, only the good value survives.
    const mixed = sanitizeDebugLogDetails(
      {
        pathKind: "appData",
        ownerPid: -5,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: `2026-08-29T08:06:16.724Z${" ".repeat(64)}`
      },
      context()
    );
    expect(mixed).toEqual({ pathKind: "appData", ownerAppVersion: "0.60.0" });
    expect(JSON.stringify(mixed)).not.toContain("Recovery.lock");
    expect(mixed).not.toHaveProperty("ownerPid");
    expect(mixed).not.toHaveProperty("ownerCreatedAt");
  });

  it("rejects a non-integer ownerPid", () => {
    expect(
      sanitizeDebugLogDetails({ pathKind: "appData", ownerPid: 1.5 }, context())
    ).toEqual({ pathKind: "appData" });
  });
});

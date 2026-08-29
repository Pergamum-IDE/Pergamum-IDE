import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import {
  createFileDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";
import {
  createInitialOpenDocumentsState,
  openOrActivateEditor
} from "../../src/renderer/openDocuments";
import { buildSessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function read(relativePath: string): string {
  return stripComments(readFileSync(relativePath, "utf8"));
}

/**
 * #286: the ONLY durable location for unsaved manuscript body text is
 * `<userData>/Recovery/Recovery.db` `documents.payload_text`. It must never
 * leak into the Session Store, the project DB, or the debug log.
 */

const MANUSCRIPT_FREE_MODULES = [
  // Session Store — identity / layout / view state only.
  "src/shared/session.ts",
  "src/shared/sessionRestore.ts",
  "src/main/sessionStore.ts",
  "src/main/sessionStoreIpc.ts",
  "src/main/sessionRestoreRead.ts",
  "src/main/coldStartRestoreIpc.ts",
  "src/renderer/session/sessionSnapshot.ts",
  "src/renderer/session/sessionPersistenceCoordinator.ts",
  "src/renderer/session/coldStartRestore.ts",
  // Project DB — canonical structured data, NOT a manuscript recovery store.
  "src/main/projectDatabase.ts",
  "src/main/projectIpc.ts",
  // Debug log — never carries body text.
  "src/shared/debugLog.ts",
  "src/main/debugLogSanitizer.ts",
  "src/main/dbOperationLog.ts"
];

describe("#286 manuscript body stays only in Recovery.db payload_text", () => {
  it("no Session / project-DB / debug-log module references payloadText or payload_text", () => {
    for (const modulePath of MANUSCRIPT_FREE_MODULES) {
      const source = read(modulePath);
      expect(source, modulePath).not.toMatch(/payloadText/);
      expect(source, modulePath).not.toMatch(/payload_text/);
      expect(source, modulePath).not.toMatch(/recoveryDocument/);
    }
  });

  it("the project DB schema has no manuscript-body column", () => {
    const source = read("src/main/projectDatabase.ts");
    // metadata / glossary_entries / glossary_forms — no body payload.
    expect(source).not.toMatch(/payload/i);
    expect(source).not.toMatch(/body_text|document_body|content_text/);
  });

  it("a payload_text SQL column is declared ONLY by the Recovery Store DB", () => {
    const recoverySchema = read("src/main/recoveryStoreDatabase.ts");
    expect(recoverySchema).toMatch(/payload_text TEXT NOT NULL/);

    for (const modulePath of [
      "src/main/projectDatabase.ts",
      "src/main/sessionStore.ts"
    ]) {
      expect(read(modulePath)).not.toMatch(/payload_text/);
    }
  });

  it("the debug log detail allowlist has no body-bearing key", () => {
    const sanitizer = read("src/main/debugLogSanitizer.ts");
    expect(sanitizer).not.toMatch(/case "payloadText"/);
    expect(sanitizer).not.toMatch(/case "payload_text"/);
    expect(sanitizer).not.toMatch(/case "body"/);
    expect(sanitizer).not.toMatch(/case "content"/);
  });

  it("buildSessionSnapshotInputs never emits a dirty document's body", () => {
    const MARKER = "SECRET_MANUSCRIPT_BODY_SEPARATION_MARKER";
    const loaded = createFileDocument({
      path: "C:/Novel/chapter.md",
      content: "clean baseline\n",
      metadata: {
        encoding: "utf8",
        lineEnding: "lf",
        byteLength: 15,
        characterLength: 15,
        hadBom: false
      }
    });
    const dirty = updateCurrentDocumentContent(
      loaded,
      `clean baseline\n${MARKER}\n`,
      buildLineEndingBreakSet(analyzeLineEndings(`clean baseline\n${MARKER}\n`))
    );

    let state = createInitialOpenDocumentsState();
    state = openOrActivateEditor(
      state,
      createMarkdownCurrentEditor(dirty),
      null
    );

    const inputs = buildSessionSnapshotInputs("session-x", null, state);
    expect(JSON.stringify(inputs)).not.toContain(MARKER);
    expect(JSON.stringify(inputs)).not.toContain("clean baseline");
  });

  it("the renderer Recovery coordinator is the only renderer path that sends body text over IPC", () => {
    // preload forwards an opaque payload; the shape is defined in the shared
    // Recovery contract, and the coordinator is the sole caller.
    const preload = read("src/preload/preload.ts");
    expect(preload).toMatch(/RECOVERY_CHANNELS\.upsertDocument/);
    // Session preload transport carries a snapshot, never a body.
    const sessionCoordinator = read(
      "src/renderer/session/sessionPersistenceCoordinator.ts"
    );
    expect(sessionCoordinator).not.toMatch(/upsertDocument|payloadText/);
  });
});

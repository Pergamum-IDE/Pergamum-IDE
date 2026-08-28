import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-level scope guards for Session persistence (#272) and cold-start
 * Session restore (#274):
 *
 *   - Session persistence / restore never reach into Recovery, the Project
 *     DB, or a Project directory (their own storage lane).
 *   - A failed restore is a READ operation — it never escalates to a
 *     destructive maintenance operation (delete / repair / rewrite /
 *     synthesize).
 */

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function read(relativePath: string): string {
  return stripComments(readFileSync(relativePath, "utf8"));
}

const sessionModules = [
  "src/shared/session.ts",
  "src/shared/sessionRestore.ts",
  "src/shared/uuidv7.ts",
  "src/shared/sessionPersistenceFailure.ts",
  "src/main/sessionStore.ts",
  "src/main/sessionStoreIpc.ts",
  "src/main/sessionRestoreRead.ts",
  "src/main/coldStartRestoreIpc.ts",
  "src/main/windowStateRestore.ts",
  "src/main/sessionManifestLock.ts",
  "src/main/windowSessionState.ts",
  "src/main/atomicFileWrite.ts",
  "src/renderer/session/sessionSnapshot.ts",
  "src/renderer/session/sessionPersistenceCoordinator.ts",
  "src/renderer/session/coldStartRestore.ts",
  "src/renderer/explicitProjectCloseCommit.ts"
].map((path) => ({ path, source: read(path) }));

/**
 * Modules that make up the #274 cold-start restore read/reconstruct path.
 * `sessionStore.ts` is deliberately excluded — it owns the (#272) write
 * side too; its read-only `readRestoreSetForColdStart` is covered by
 * behavior tests instead.
 */
const restoreModules = [
  "src/shared/sessionRestore.ts",
  "src/main/sessionRestoreRead.ts",
  "src/main/coldStartRestoreIpc.ts",
  "src/main/windowStateRestore.ts",
  "src/main/startupLaunchTarget.ts",
  "src/renderer/session/coldStartRestore.ts"
].map((path) => ({ path, source: read(path) }));

describe("Session persistence stays in its own storage lane (#272)", () => {
  it("no Session module touches Recovery, the Project DB, or a Project directory", () => {
    for (const { path, source } of sessionModules) {
      expect(source, path).not.toMatch(/\.pergamum_recovery/);
      expect(source, path).not.toMatch(/better-sqlite3|projectDatabase/);
      expect(source, path).not.toMatch(/projectConfigStore|pergamum\.json/);
      expect(source, path).not.toMatch(/recovery/i);
    }
  });

  it("the Session Store roots itself at <userData>/sessions, nothing else", () => {
    const main = read("src/main/main.ts");
    expect(main).toMatch(
      /createSessionStore\(\{\s*baseDirectory:\s*path\.join\(\s*app\.getPath\("userData"\),\s*"sessions"\s*\)/
    );
  });
});

describe("#274 cold-start restore is read/reconstruct only — no destructive fallback", () => {
  it("no restore module deletes / repairs / rewrites Session, manifest, Recovery, or authoritative data", () => {
    for (const { path, source } of restoreModules) {
      // No filesystem removal / write of Session, manifest, or Recovery data.
      expect(source, path).not.toMatch(
        /\b(rm|rmdir|unlink|rmSync|unlinkSync)\b/
      );
      expect(source, path).not.toMatch(
        /writeFile|writeFileSync|writeFileAtomic|persistSession|removeSessionFromRestoreSet/
      );
      expect(source, path).not.toMatch(/\.pergamum_recovery/);
      expect(source, path).not.toMatch(/recovery/i);
      // No Project DB / Project directory maintenance (a filename-extension
      // import is fine; opening / repairing the DB is not).
      expect(source, path).not.toMatch(
        /better-sqlite3|openProjectDatabase|createProjectDatabase|readProjectMetadata/
      );
      expect(source, path).not.toMatch(/projectConfigStore|pergamum\.json/);
      // No manifest repair / schema rewrite from the restore path.
      expect(source, path).not.toMatch(
        /manifestRepair|repairManifest|rewriteSchema|migrateSession/
      );
    }
  });

  it("the cold-start read + IPC modules never mutate the store", () => {
    for (const path of [
      "src/main/sessionRestoreRead.ts",
      "src/main/coldStartRestoreIpc.ts"
    ]) {
      const source = read(path);
      // They only ever call the read-only cold-start reader.
      expect(source, path).not.toMatch(/\.persistSession\(|\.removeSessionFromRestoreSet\(/);
    }
  });

  it("the renderer restore coordinator never synthesizes a fake editor body / empty replacement", () => {
    const source = read("src/renderer/session/coldStartRestore.ts");
    expect(source).not.toMatch(/createUntitledDocument|initialDocumentContent/);
    // untitled editors are skipped, not rebuilt.
    expect(source).toMatch(/case "untitled":[\s\S]{0,400}return null/);
  });

  it("main reads the restore set only through the bounded cold-start reader", () => {
    const main = read("src/main/main.ts");
    // The bounded reader is used; the raw unbounded reader is not called
    // from startup, and no repair/rewrite is invoked.
    expect(main).toMatch(/readColdStartRestoreSet\(/);
    expect(main).not.toMatch(/\.readRestoreSet\(\)/);
    expect(main).not.toMatch(/repairSession|rewriteSession|deleteSession/);
  });
});

describe("Session persistence SUSPENSION never touches document editing / saving (#272 PO decision)", () => {
  const suspensionModules = [
    "src/renderer/session/sessionPersistenceCoordinator.ts",
    "src/shared/sessionPersistenceFailure.ts",
    "src/renderer/explicitProjectCloseCommit.ts"
  ].map((path) => ({ path, source: read(path) }));

  it("no SUSPENSION-path module can disable editing or reach document Save", () => {
    for (const { path, source } of suspensionModules) {
      // "make the editor read-only" symbols (not the TS `readonly` modifier).
      expect(source, path).not.toMatch(
        /isEditorReadOnly|EditorState\.readOnly|editable\.of\(\s*false/
      );
      expect(source, path).not.toMatch(/setOpenDocumentsState/);
      expect(source, path).not.toMatch(/\bsaveFile\b|writeMarkdown|saveMarkdown/);
      expect(source, path).not.toMatch(/saveProjectDocument|readProjectDocument/);
      expect(source, path).not.toMatch(
        /window\.pergamum\.files|window\.pergamum\.projects/
      );
    }
  });

  it("App.tsx's suspension handler only routes to the Error dialog — it does not disable editing / saving", () => {
    const app = read("src/renderer/App.tsx");

    const handlerStart = app.indexOf(
      "function handleSessionPersistenceSuspended("
    );
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerBody = app.slice(
      handlerStart,
      app.indexOf("\n  }", handlerStart) + 4
    );
    // The handler defers presentation through the idle-aware presenter
    // (BLOCKER 3: the dialog is shown once, deferred behind any open modal).
    expect(handlerBody).toContain(
      "presentSessionPersistenceSuspendedDialogIfIdle"
    );
    expect(handlerBody).not.toMatch(
      /setOpenDocumentsState|readOnly|saveFile|writeMarkdown|saveProjectDocument/
    );

    const presenterStart = app.indexOf(
      "function presentSessionPersistenceSuspendedDialogIfIdle("
    );
    expect(presenterStart).toBeGreaterThan(-1);
    const presenterBody = app.slice(
      presenterStart,
      app.indexOf("\n  }", presenterStart) + 4
    );
    expect(presenterBody).toContain("showSessionPersistenceSuspendedDialog");
    expect(presenterBody).not.toMatch(
      /setOpenDocumentsState|readOnly|saveFile|writeMarkdown|saveProjectDocument/
    );
  });

  it("the suspension Error dialog is distinct from the Markdown document Save failure path", () => {
    const en = readFileSync("src/shared/i18n/en.ts", "utf8");
    const ja = readFileSync("src/shared/i18n/ja.ts", "utf8");
    for (const src of [en, ja]) {
      expect(src).toContain("dialog.sessionPersistenceSuspended.title");
      expect(src).toContain("dialog.sessionPersistenceSuspended.message");
    }
    // The ja copy is the PO-mandated text.
    expect(ja).toContain("Pergamumの作業情報を保存できないため、自動保存を一時停止しました。");
  });
});

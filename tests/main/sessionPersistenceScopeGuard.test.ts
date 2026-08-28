import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #272 is the "write it out" side only. These source-level guards make the
 * scope boundary explicit: no cold-start restore, and Session persistence
 * never reaches into Recovery / the Project DB / the Project directory.
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
  "src/shared/uuidv7.ts",
  "src/shared/sessionPersistenceFailure.ts",
  "src/main/sessionStore.ts",
  "src/main/sessionStoreIpc.ts",
  "src/main/sessionManifestLock.ts",
  "src/main/windowSessionState.ts",
  "src/main/atomicFileWrite.ts",
  "src/renderer/session/sessionSnapshot.ts",
  "src/renderer/session/sessionPersistenceCoordinator.ts",
  "src/renderer/explicitProjectCloseCommit.ts"
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

describe("#272 does not implement cold-start Session Restore", () => {
  it("main startup never reads the restore set back", () => {
    const main = read("src/main/main.ts");
    expect(main).not.toMatch(/readRestoreSet/);
    expect(main).not.toMatch(/restoreSession|applySession|reopenFromSession/);
  });

  it("the renderer has no Session restore/apply wiring", () => {
    const app = read("src/renderer/App.tsx");
    expect(app).not.toMatch(/readRestoreSet|restoreSession|applySessionRecord/);
  });

  it("the coordinator only writes out — it never reads a restore set", () => {
    const coordinator = read(
      "src/renderer/session/sessionPersistenceCoordinator.ts"
    );
    // `dropFromRestoreSet` (membership removal) is write-side and allowed;
    // reading the set back is not.
    expect(coordinator).not.toMatch(/readRestoreSet|restoreSession|applySession/);
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

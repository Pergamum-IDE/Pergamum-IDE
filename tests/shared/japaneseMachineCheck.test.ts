import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  estimateJapaneseMachineCheck,
  isJapaneseMachineCheckPath,
  japaneseMachineCheckFormatForPath,
  parseJapaneseMachineCheckRequest,
  JAPANESE_MACHINE_CHECK_MAX_RELATIVE_PATH_LENGTH
} from "../../src/shared/japaneseMachineCheck";

describe("Japanese machine check shared helpers (#625 P2a)", () => {
  it("accepts only .md / .markdown / .txt, case-insensitively", () => {
    for (const ok of ["a.md", "a.MD", "d/b.markdown", "c.txt", "C.TXT"]) {
      expect(isJapaneseMachineCheckPath(ok), ok).toBe(true);
    }
    for (const no of ["a.png", "a.md.bak", "a.docx", "folder", ""]) {
      expect(isJapaneseMachineCheckPath(no), no).toBe(false);
    }
  });

  it("maps the extension to the lint format", () => {
    expect(japaneseMachineCheckFormatForPath("a.md")).toBe("markdown");
    expect(japaneseMachineCheckFormatForPath("a.markdown")).toBe("markdown");
    expect(japaneseMachineCheckFormatForPath("a.txt")).toBe("text");
    expect(japaneseMachineCheckFormatForPath("a.png")).toBeNull();
  });

  it("classes the size for the estimate (boundaries inclusive)", () => {
    expect(estimateJapaneseMachineCheck(0)).toBe("short");
    expect(estimateJapaneseMachineCheck(20_000)).toBe("short");
    expect(estimateJapaneseMachineCheck(20_001)).toBe("medium");
    expect(estimateJapaneseMachineCheck(100_000)).toBe("medium");
    expect(estimateJapaneseMachineCheck(100_001)).toBe("long");
  });

  it("validates a projectFile target", () => {
    expect(
      parseJapaneseMachineCheckRequest({ kind: "projectFile", relativePath: "chapter/01.md", isDirty: true })
    ).toEqual({ kind: "projectFile", relativePath: "chapter/01.md", isDirty: true });
    expect(
      parseJapaneseMachineCheckRequest({ kind: "projectFile", relativePath: "a.md", x: 1 })
    ).toEqual({ kind: "projectFile", relativePath: "a.md" });
    // A wrongly typed isDirty is dropped, not trusted.
    expect(
      parseJapaneseMachineCheckRequest({ kind: "projectFile", relativePath: "a.md", isDirty: "yes" })
    ).toEqual({ kind: "projectFile", relativePath: "a.md" });
    for (const bad of [
      null,
      "a.md",
      {},
      { relativePath: "a.md" },
      { kind: "projectFile" },
      { kind: "projectFile", relativePath: "" },
      { kind: "projectFile", relativePath: 3 },
      { kind: "projectFile", relativePath: "a\0.md" },
      { kind: "projectFile", relativePath: "a".repeat(JAPANESE_MACHINE_CHECK_MAX_RELATIVE_PATH_LENGTH + 1) },
      { kind: "unknown", relativePath: "a.md" }
    ]) {
      expect(parseJapaneseMachineCheckRequest(bad)).toBeNull();
    }
    expect(
      parseJapaneseMachineCheckRequest({
        kind: "projectFile",
        relativePath: "a".repeat(JAPANESE_MACHINE_CHECK_MAX_RELATIVE_PATH_LENGTH)
      })
    ).not.toBeNull();
  });

  it("validates a glossaryDescription target", () => {
    expect(
      parseJapaneseMachineCheckRequest({
        kind: "glossaryDescription",
        text: "説明本文",
        displayName: "アリス / Description",
        extra: 1
      })
    ).toEqual({
      kind: "glossaryDescription",
      text: "説明本文",
      displayName: "アリス / Description"
    });
    // An empty body is a valid snapshot (Slice 2 decides what to do with it).
    expect(
      parseJapaneseMachineCheckRequest({ kind: "glossaryDescription", text: "", displayName: "A" })
    ).not.toBeNull();
    for (const bad of [
      { kind: "glossaryDescriptions", text: "x", displayName: "A" },
      { kind: "glossaryDescription", text: 1, displayName: "A" },
      { kind: "glossaryDescription", displayName: "A" },
      { kind: "glossaryDescription", text: "x", displayName: 1 },
      { kind: "glossaryDescription", text: "x" },
      { kind: "glossaryDescription", text: "x", displayName: "" },
      { kind: "glossaryDescription", text: "x", displayName: "a\0b" },
      { kind: "glossaryDescription", text: "x", displayName: "   " },
      { kind: "glossaryDescription", text: "x", displayName: "\t\n" }
    ]) {
      expect(parseJapaneseMachineCheckRequest(bad)).toBeNull();
    }
  });

  it("keeps a glossary displayName whole, however long (no length limit)", () => {
    for (const displayName of [
      "あ".repeat(257),
      "a".repeat(5000),
      "𠮷".repeat(400)
    ]) {
      expect(
        parseJapaneseMachineCheckRequest({
          kind: "glossaryDescription",
          text: "x",
          displayName
        })
      ).toEqual({ kind: "glossaryDescription", text: "x", displayName });
    }
  });

  it("limits metadata only: the body text has no size limit and no fake path field", () => {
    const huge = "あ".repeat(2_000_000);
    const parsed = parseJapaneseMachineCheckRequest({
      kind: "glossaryDescription",
      text: huge,
      displayName: "A"
    });

    expect(parsed).toEqual({
      kind: "glossaryDescription",
      text: huge,
      displayName: "A"
    });
    expect(parsed).not.toHaveProperty("relativePath");
    expect(parsed).not.toHaveProperty("path");
  });
});

describe("Japanese machine check wiring (#625 P2a)", () => {
  const read = (file: string): string => readFileSync(file, "utf8");

  it("the Main service runs textlint only through the Worker Host", () => {
    const ipc = read("src/main/japaneseMachineCheckIpc.ts");

    expect(ipc).not.toContain("textlint/japaneseLintEngine");
    expect(ipc).toContain("createElectronJapaneseLintHost");
    expect(ipc).toContain("lintDocument(");
  });

  it("main.ts registers the IPC and disposes on quit", () => {
    const main = read("src/main/main.ts");

    expect(main).toContain("registerJapaneseMachineCheckIpc();");
    expect(main).toContain("await disposeJapaneseMachineCheck();");
  });

  it("preload exposes prepare / run / cancel / onProgress", () => {
    const preload = read("src/preload/preload.ts");

    for (const name of ["prepare", "run", "cancel", "onProgress"]) {
      expect(preload).toContain(`${name}:`);
    }
    expect(preload).toContain("JAPANESE_MACHINE_CHECK_CHANNELS.progress");
  });

  it("App opens the dialog from the File Explorer menu with the dirty flag", () => {
    const app = read("src/renderer/App.tsx");

    expect(app).toContain("onFileExplorerJapaneseMachineCheck");
    expect(app).toContain("fileExplorerDirtyProjectDocumentPaths.includes(");
    expect(app).toContain("<JapaneseMachineCheckDialog");
  });

  it("App holds one frozen target (a project file or a glossary Description) and the dialog passes it unchanged to prepare and run (#688)", () => {
    const app = read("src/renderer/App.tsx");
    const dialog = read("src/renderer/dialog/JapaneseMachineCheckDialog.tsx");

    expect(app).toContain("useState<JapaneseMachineCheckTarget | null>(null)");
    // The File Explorer entry still builds a projectFile target itself.
    expect(app.match(/kind: "projectFile"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(app).toContain("target={japaneseMachineCheckTarget}");
    // One source of truth: no separate relativePath / isDirty props.
    expect(dialog).not.toContain("readonly isDirty: boolean;");
    expect(dialog).not.toContain("relativePath={");
    expect(dialog).toContain(".prepare(target)");
    expect(dialog).toContain(".run({ ...target, runId })");
  });

  it("the user-facing name is 日本語表現チェック / Japanese Style Check", () => {
    for (const [lang, file] of [["ja", "src/shared/i18n/ja.ts"], ["en", "src/shared/i18n/en.ts"]]) {
      const source = read(file);

      expect(source, lang).not.toContain("機械チェック");
      expect(source, lang).not.toContain("Machine Check");
      expect(source, lang).not.toContain("machine check");
    }
    expect(read("src/shared/i18n/ja.ts")).toContain(
      '"japaneseMachineCheck.title": "日本語表現チェック"'
    );
    expect(read("src/shared/i18n/en.ts")).toContain(
      '"japaneseMachineCheck.title": "Japanese Style Check"'
    );
  });

  it("the report is built and written in the Main Process; the Renderer sends only a result id", () => {
    const dialog = read("src/renderer/dialog/JapaneseMachineCheckDialog.tsx");
    const ipc = read("src/main/japaneseMachineCheckIpc.ts");
    const preload = read("src/preload/preload.ts");

    // Renderer: no report building, no source text, no paths.
    expect(dialog).not.toContain("buildJapaneseStyleCheckReport");
    expect(dialog).toContain(".saveReport({ resultId })");
    // Main: dialog, default name, atomic write.
    expect(ipc).toContain("buildJapaneseStyleCheckReport");
    expect(ipc).toContain("`${run.displayName}.lint.md`");
    expect(ipc).toContain("path.dirname(run.absolutePath)");
    expect(ipc).toContain("dialog.showSaveDialog");
    expect(ipc).toContain("writeFileAtomic");
    expect(preload).toContain("JAPANESE_MACHINE_CHECK_CHANNELS.saveReport");
  });

  it("App closes the wizard when the project is closed or switched", () => {
    const app = read("src/renderer/App.tsx");

    expect(app).toContain("japaneseStyleCheckProjectKey");
    expect(app).toMatch(
      /useEffect\(\(\) => \{\s*setJapaneseMachineCheckTarget\(null\);\s*\}, \[japaneseStyleCheckProjectKey\]\);/
    );
  });

  it("app quit disposes the wizard (main.ts shutdown cleanup)", () => {
    expect(read("src/main/main.ts")).toContain("await disposeJapaneseMachineCheck();");
  });

  it("the save dialog offers Markdown Files and All Files", () => {
    const ipc = read("src/main/japaneseMachineCheckIpc.ts");

    expect(ipc).toContain('name: "Markdown Files", extensions: ["md"]');
    expect(ipc).toContain('name: "All Files", extensions: ["*"]');
  });
});

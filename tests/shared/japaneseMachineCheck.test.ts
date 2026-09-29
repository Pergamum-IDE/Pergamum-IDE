import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  estimateJapaneseMachineCheck,
  isJapaneseMachineCheckPath,
  japaneseMachineCheckFormatForPath,
  parseJapaneseMachineCheckRequest
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

  it("validates the untrusted request", () => {
    expect(parseJapaneseMachineCheckRequest({ relativePath: "a.md" })).toEqual({
      relativePath: "a.md"
    });
    expect(
      parseJapaneseMachineCheckRequest({ relativePath: "a.md", isDirty: true, x: 1 })
    ).toEqual({ relativePath: "a.md", isDirty: true });
    for (const bad of [
      null,
      "a.md",
      {},
      { relativePath: "" },
      { relativePath: 3 },
      { relativePath: "a\0.md" },
      { relativePath: "a".repeat(5000) }
    ]) {
      expect(parseJapaneseMachineCheckRequest(bad)).toBeNull();
    }
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
    expect(ipc).toContain("`${run.fileName}.lint.md`");
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

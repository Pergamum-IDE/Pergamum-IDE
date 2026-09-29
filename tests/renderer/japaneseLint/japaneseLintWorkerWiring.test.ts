import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string): string => readFileSync(file, "utf8");

describe("instant japanese lint -> Worker wiring (#625 P1c)", () => {
  it("the Main IPC no longer runs textlint in the Main Process", () => {
    const ipc = source("src/main/japaneseLintIpc.ts");

    expect(ipc).not.toContain("textlint/japaneseLintEngine");
    expect(ipc).not.toContain("lintJapanese(");
    expect(ipc).toContain("createElectronJapaneseLintHost");
    expect(ipc).toContain("lintDocument(");
  });

  it("exposes release through preload and the shared API", () => {
    expect(source("src/shared/api.ts")).toContain('release: "japaneseLint:release"');
    expect(source("src/shared/api.ts")).toContain("release: () => Promise<void>");
    expect(source("src/preload/preload.ts")).toContain(
      "ipcRenderer.invoke(JAPANESE_LINT_CHANNELS.release)"
    );
  });

  it("App releases the Worker whenever the Linter is OFF, guarded", () => {
    const app = source("src/renderer/App.tsx");

    expect(app).toContain("window.pergamum.japaneseLint.release()");
    expect(app).toMatch(/if \(isJapaneseLintActive\) \{\s*return;\s*\}/);
    expect(app).toContain("}, [isJapaneseLintActive]);");
  });

  it("the renderer keeps its own 50,000-character guard before any IPC", () => {
    const driver = source("src/renderer/japaneseLint/japaneseLintGutterExtension.ts");

    expect(driver.indexOf("isJapaneseLintSourceTooLarge(doc.length)")).toBeGreaterThan(0);
    expect(driver.indexOf("isJapaneseLintSourceTooLarge(doc.length)")).toBeLessThan(
      driver.indexOf("config.lint(")
    );
  });

  it("app quit disposes the Worker", () => {
    const main = source("src/main/main.ts");

    expect(main).toContain("await releaseJapaneseLintWorker();");
  });
});

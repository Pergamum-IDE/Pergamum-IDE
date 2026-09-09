import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadProjectConfig,
  projectConfigFileName,
  readProjectConfig,
  saveProjectSettings
} from "../../src/main/projectConfigStore";

describe("projectConfigStore rename / source-of-truth decoupling (#422)", () => {
  let projectRootPath: string;

  beforeEach(async () => {
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-config-rename-")
    );
  });

  afterEach(async () => {
    await fs.rm(projectRootPath, { recursive: true, force: true });
  });

  it("existing legacy pergamum.json.name (string or non-string) does not fail project open and is omitted from parsed config", async () => {
    const configPath = path.join(projectRootPath, projectConfigFileName);
    await fs.writeFile(
      configPath,
      JSON.stringify({ name: "Legacy Config Name", settings: {} }),
      "utf8"
    );

    const config = await readProjectConfig(projectRootPath);
    expect(config).toBeDefined();
    expect((config as Record<string, unknown>).name).toBeUndefined();

    const loaded = await loadProjectConfig(projectRootPath);
    expect(loaded).toBeDefined();
    expect((loaded?.config as Record<string, unknown>).name).toBeUndefined();
    expect(loaded?.rawSnapshot.name).toBe("Legacy Config Name");
  });

  it("non-string name in pergamum.json does not fail project open and is ignored", async () => {
    const configPath = path.join(projectRootPath, projectConfigFileName);
    await fs.writeFile(
      configPath,
      JSON.stringify({ name: 12345, settings: {} }),
      "utf8"
    );

    const config = await readProjectConfig(projectRootPath);
    expect(config).toBeDefined();
    expect((config as Record<string, unknown>).name).toBeUndefined();

    const loaded = await loadProjectConfig(projectRootPath);
    expect(loaded).toBeDefined();
    expect((loaded?.config as Record<string, unknown>).name).toBeUndefined();
    expect(loaded?.rawSnapshot.name).toBe(12345);
  });

  it("saveProjectSettings does not reintroduce top-level name into pergamum.json on save", async () => {
    const configPath = path.join(projectRootPath, projectConfigFileName);
    await fs.writeFile(
      configPath,
      JSON.stringify({
        otherCustomField: "keep",
        settings: { "editor.lineEnding.expected": "lf" }
      }),
      "utf8"
    );

    const loaded = await loadProjectConfig(projectRootPath);
    expect(loaded?.rawSnapshot?.name).toBeUndefined();

    const result = await saveProjectSettings({
      rootPath: projectRootPath,
      rawSnapshot: loaded?.rawSnapshot ?? null,
      request: {
        set: { "editor.fontFamily": "Yu Mincho" }
      }
    });

    expect((result.config as Record<string, unknown>).name).toBeUndefined();

    // Verify on disk that "name" was NOT introduced
    const writtenOnDisk = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(writtenOnDisk.name).toBeUndefined();
    expect(writtenOnDisk.otherCustomField).toBe("keep");
    expect(writtenOnDisk.settings["editor.fontFamily"]).toBe("Yu Mincho");
  });
});

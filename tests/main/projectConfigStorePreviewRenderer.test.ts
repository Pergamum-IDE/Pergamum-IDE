import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn()
}));

vi.mock("node:fs", () => ({
  promises: fsMock
}));

import { readProjectConfig } from "../../src/main/projectConfigStore";
import {
  defaultApplicationSettings,
  resolveEffectiveSettings
} from "../../src/shared/settings";

describe("projectConfigStore preview.renderer read-path hardening (#170, ADR-0006 S-23)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
  });

  it("returns null when pergamum.json is missing (unchanged behavior)", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "ENOENT" })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config).toBeNull();
  });

  it("malformed JSON still fails project open", async () => {
    fsMock.readFile.mockResolvedValue("{ not valid json");

    await expect(readProjectConfig("C:\\fake-project")).rejects.toThrow(
      /Invalid pergamum\.json/
    );
  });

  it("non-object JSON root still fails project open", async () => {
    fsMock.readFile.mockResolvedValue(JSON.stringify("not an object"));

    await expect(readProjectConfig("C:\\fake-project")).rejects.toThrow(
      /expected a JSON object/
    );
  });

  it("legacy non-string name outside settings does not fail project open", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: 123
      })
    );

    const config = await readProjectConfig("C:\\fake-project");
    expect(config?.settings).toBeUndefined();
  });

  it("opens with no project settings when settings is missing", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project"
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config?.settings).toBeUndefined();
  });

  it("opens with no accepted project settings when settings is not an object (string)", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: "not an object"
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config?.settings).toBeUndefined();
  });

  it("opens with no accepted project settings when settings is an array", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: []
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config?.settings).toBeUndefined();
  });

  it("opens with no accepted project settings when settings is null", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: null
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config?.settings).toBeUndefined();
  });

  it("opens with no accepted project settings when settings is a number", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: 1
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config?.settings).toBeUndefined();
  });

  it("opens with no preview override when settings is empty object", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: {}
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config?.settings?.preview).toBeUndefined();
    expect(config?.settings).toBeUndefined();
  });

  it("accepts settings[\"preview.renderer\"] = \"markdown\" as a project override", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: { "preview.renderer": "markdown" }
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config?.settings?.preview?.renderer).toBe("markdown");
  });

  it("rejects settings[\"preview.renderer\"] = \"html\" without failing project open, and it does not appear as an accepted project override", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: { "preview.renderer": "html" }
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config).not.toBeNull();
    expect(config?.settings?.preview).toBeUndefined();
    expect(config?.settings).toBeUndefined();
  });

  it("rejects settings[\"preview.renderer\"] = 1 without failing project open, and it does not appear as an accepted project override", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: { "preview.renderer": 1 }
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config).not.toBeNull();
    expect(config?.settings?.preview).toBeUndefined();
    expect(config?.settings).toBeUndefined();
  });

  it("does not fail project open for an application-only key under settings, and does not accept it as a project override", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: {
          "workbench.language": "en",
          "preview.renderer": "markdown"
        }
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config).not.toBeNull();
    expect(config?.settings?.preview?.renderer).toBe("markdown");
    expect(
      (config?.settings as Record<string, unknown>)["workbench.language"]
    ).toBeUndefined();
  });

  it("missing and rejected settings[\"preview.renderer\"] produce the same effective value under the same application/default inputs", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "Missing renderer project",
        settings: {}
      })
    );
    const missingConfig = await readProjectConfig("C:\\fake-project");

    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "Rejected renderer project",
        settings: { "preview.renderer": "html" }
      })
    );
    const rejectedConfig = await readProjectConfig("C:\\fake-project");

    const missingEffective = resolveEffectiveSettings(
      defaultApplicationSettings,
      missingConfig?.settings
    );
    const rejectedEffective = resolveEffectiveSettings(
      defaultApplicationSettings,
      rejectedConfig?.settings
    );

    expect(missingEffective.preview.renderer).toBe(
      rejectedEffective.preview.renderer
    );
  });
});

describe("projectConfigStore: pergamum.json settings[\"workbench.fontFamily\"] has no effect (#173)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
  });

  it("does not read settings[\"workbench.fontFamily\"] from pergamum.json — ProjectSettings is not typed with a workbench field", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: {
          "preview.renderer": "markdown",
          "workbench.fontFamily": "Fira Code"
        }
      })
    );

    const config = await readProjectConfig("C:\\fake-project");

    expect(config?.settings?.preview?.renderer).toBe("markdown");
    expect(
      (config?.settings as Record<string, unknown>).workbench
    ).toBeUndefined();
    expect(
      (config?.settings as Record<string, unknown>)["workbench.fontFamily"]
    ).toBeUndefined();
  });

  it("workbench.fontFamily is applicationOnly, so it never affects resolveEffectiveSettings via a project override — an application-scope value passes through unchanged regardless of pergamum.json content", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        name: "My Project",
        settings: { "workbench.fontFamily": "Fira Code" }
      })
    );
    const projectConfig = await readProjectConfig("C:\\fake-project");

    const applicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        fontFamily: "Cascadia Code"
      }
    };

    const effective = resolveEffectiveSettings(
      applicationSettings,
      projectConfig?.settings
    );

    expect(effective.workbench.fontFamily).toBe("Cascadia Code");
  });
});

import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveJapaneseLintDictionaryPath } from "../../../src/main/linterWorker/japaneseLintDictionary";

vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
  MessageChannelMain: class {},
  utilityProcess: { fork: () => undefined }
}));

import { resolveJapaneseLintWorkerEntry } from "../../../src/main/linterWorker/japaneseLintHostElectron";

const require = createRequire(import.meta.url);

interface ForgeConfig {
  packagerConfig: {
    asar: { unpack: string };
    ignore: (file: string) => boolean;
  };
  plugins: {
    name?: string;
    config?: { build?: { entry: string; target: string; config: string }[] };
  }[];
}

const forge = require("../../../forge.config.js") as ForgeConfig;

describe("Linter Worker packaging (#625 P1a)", () => {
  it("builds the Worker as its own bundle next to main.js", () => {
    const viteBuilds =
      forge.plugins.find((plugin) => plugin.name === "@electron-forge/plugin-vite")
        ?.config?.build ?? [];
    const worker = viteBuilds.find(
      (build) => build.entry === "src/main/linterWorker/japaneseLintWorker.ts"
    );

    expect(worker).toBeDefined();
    expect(worker?.target).toBe("main");
    // main.ts and the worker are distinct entries: a Worker crash cannot
    // share a module graph with the app.
    expect(
      viteBuilds.filter((build) => build.entry === "src/main/main.ts")
    ).toHaveLength(1);
  });

  it("the Worker's bundle name is what the Host forks", () => {
    expect(resolveJapaneseLintWorkerEntry(path.join("x", ".vite", "build"))).toBe(
      path.join("x", ".vite", "build", "japaneseLintWorker.js")
    );
  });

  it("the Worker entry imports neither Electron nor the app", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/main/linterWorker/japaneseLintWorker.ts",
      "utf8"
    );
    const core = readFileSync(
      "src/main/linterWorker/japaneseLintWorkerCore.ts",
      "utf8"
    );

    for (const text of [source, core]) {
      expect(text).not.toMatch(/from ["']electron["']/);
      expect(text).not.toMatch(/from ["']\.\.\/(main|debugLogger|settingsStore)/);
    }
  });

  it("ships kuromoji's dictionary unpacked (asar.unpack), outside the archive", () => {
    expect(forge.packagerConfig.asar.unpack).toBe(
      "**/node_modules/kuromoji/dict/**"
    );
  });

  it("still lets the dictionary (and only it) through the package whitelist", () => {
    const ignored = forge.packagerConfig.ignore;

    expect(ignored("/node_modules/kuromoji/dict/base.dat.gz")).toBe(false);
    expect(ignored("/node_modules/kuromoji/dict/unk_pos.dat.gz")).toBe(false);
    expect(ignored("/node_modules/kuromoji/src/kuromoji.js")).toBe(true);
    expect(ignored("/.vite/build/japaneseLintWorker.js")).toBe(false);
  });
});

describe("kuromoji dictionary path resolution (#625 P1a)", () => {
  it("development: <appPath>/node_modules/kuromoji/dict", () => {
    expect(
      resolveJapaneseLintDictionaryPath({
        isPackaged: false,
        resourcesPath: "C:\\ignored",
        appPath: "C:\\dev\\Pergamum"
      })
    ).toBe(path.join("C:\\dev\\Pergamum", "node_modules", "kuromoji", "dict"));
  });

  it("packaged: <resourcesPath>/app.asar.unpacked/node_modules/kuromoji/dict", () => {
    expect(
      resolveJapaneseLintDictionaryPath({
        isPackaged: true,
        resourcesPath: "C:\\Apps\\Pergamum\\resources",
        appPath: "C:\\Apps\\Pergamum\\resources\\app.asar"
      })
    ).toBe(
      path.join(
        "C:\\Apps\\Pergamum\\resources",
        "app.asar.unpacked",
        "node_modules",
        "kuromoji",
        "dict"
      )
    );
  });

  it("never depends on require.resolve('kuromoji') in the Worker or Host", async () => {
    const { readFileSync } = await import("node:fs");

    for (const file of [
      "src/main/linterWorker/japaneseLintWorker.ts",
      "src/main/linterWorker/japaneseLintWorkerCore.ts",
      "src/main/linterWorker/japaneseLintHost.ts",
      "src/main/linterWorker/japaneseLintHostElectron.ts"
    ]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /require\.resolve\(\s*["']kuromoji/
      );
    }
  });

  it("the instant-check IPC resolves the dictionary through the same function", async () => {
    const { readFileSync } = await import("node:fs");
    const ipc = readFileSync("src/main/japaneseLintIpc.ts", "utf8");
    const host = readFileSync(
      "src/main/linterWorker/japaneseLintHostElectron.ts",
      "utf8"
    );

    // The IPC builds its Worker Host with the Electron factory, which pins
    // the dictionary with the shared resolver.
    expect(ipc).toContain("createElectronJapaneseLintHost");
    expect(host).toContain("resolveJapaneseLintDictionaryPath({");
  });
});

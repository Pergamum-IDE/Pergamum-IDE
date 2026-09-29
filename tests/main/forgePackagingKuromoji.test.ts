import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("forge packaging whitelist for the Japanese lint dictionary (#625)", () => {
  const config = require("../../forge.config.js") as {
    packagerConfig: { ignore: (file: string) => boolean };
  };
  const ignored = (file: string): boolean => config.packagerConfig.ignore(file);

  it("ships kuromoji's dictionary files and the directories leading to them", () => {
    expect(ignored("/node_modules/kuromoji")).toBe(false);
    expect(ignored("/node_modules/kuromoji/dict")).toBe(false);
    expect(ignored("/node_modules/kuromoji/dict/base.dat.gz")).toBe(false);
    expect(ignored("/node_modules/kuromoji/dict/cc.dat.gz")).toBe(false);
  });

  it("does not ship the rest of kuromoji or of textlint (those are bundled by Vite)", () => {
    expect(ignored("/node_modules/kuromoji/src/kuromoji.js")).toBe(true);
    expect(ignored("/node_modules/kuromoji/package.json")).toBe(true);
    expect(ignored("/node_modules/textlint")).toBe(true);
    expect(ignored("/node_modules/@textlint/kernel")).toBe(true);
  });

  it("keeps the existing packaged dependencies", () => {
    expect(ignored("/node_modules/better-sqlite3/package.json")).toBe(false);
    expect(ignored("/node_modules/bindings")).toBe(false);
    expect(ignored("/node_modules/file-uri-to-path")).toBe(false);
    expect(ignored("/.vite/build/main.js")).toBe(false);
  });
});

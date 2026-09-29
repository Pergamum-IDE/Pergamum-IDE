import { builtinModules } from "node:module";
import { describe, expect, it } from "vitest";
import { build } from "vite";

/**
 * The Worker is a standalone bundle: textlint / kuromoji must be inlined
 * (only the archive's own files exist at run time), and nothing may reach
 * for Electron or ship source maps (#625 P1b).
 */
async function bundleWorker(): Promise<string> {
  const output = await build({
    configFile: "vite.main.config.mts",
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      lib: {
        entry: "src/main/linterWorker/japaneseLintWorker.ts",
        formats: ["cjs"],
        fileName: () => "japaneseLintWorker.js"
      },
      rollupOptions: {
        external: [
          "electron",
          "better-sqlite3",
          ...builtinModules,
          ...builtinModules.map((name) => `node:${name}`)
        ]
      }
    }
  });
  const results = Array.isArray(output) ? output : [output];
  const chunks = results.flatMap((result) =>
    "output" in result ? result.output : []
  );

  return chunks
    .map((chunk) => ("code" in chunk ? chunk.code : ""))
    .join("\n");
}

describe("Linter Worker bundle (#625 P1b)", () => {
  it(
    "inlines textlint and never requires Electron or app modules",
    async () => {
      const code = await bundleWorker();

      expect(code).toContain("TextlintKernel");
      expect(code).not.toMatch(/require\(["']electron["']\)/);
      expect(code).not.toMatch(/require\(["']textlint/);
      expect(code).not.toMatch(/require\(["']@textlint/);
      expect(code).not.toMatch(/require\(["']kuromoji/);
      expect(code).not.toMatch(/require\(["']kuromojin/);
      expect(code).not.toMatch(/require\(["']better-sqlite3["']\)/);
    },
    120_000
  );

  it(
    "carries no source map reference",
    async () => {
      const code = await bundleWorker();

      expect(code).not.toContain("sourceMappingURL");
    },
    120_000
  );
});

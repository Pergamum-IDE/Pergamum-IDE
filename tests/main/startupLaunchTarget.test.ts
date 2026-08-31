import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  coldStartLaunchTargetFromClassification,
  extractColdStartLaunchTarget,
  resolveColdStartLaunchTarget
} from "../../src/main/startupLaunchTarget";
import type { StartupMarkdownClassification } from "../../src/main/startupMarkdownRouting";

const packaged = { isPackaged: true };
const dev = { isPackaged: false };

describe("extractColdStartLaunchTarget (#274 / #347)", () => {
  it("extracts a `.pergamum` project target (packaged)", () => {
    expect(
      extractColdStartLaunchTarget(
        ["/opt/pergamum", "/home/w/Book/Book.pergamum"],
        packaged
      )
    ).toEqual({
      kind: "pergamum",
      filePath: path.resolve("/home/w/Book/Book.pergamum")
    });
  });

  it("returns a raw Markdown CANDIDATE for any single non-`.pergamum` arg", () => {
    // #347: extension policy / filesystem checks now happen in the
    // classifier, so extraction is deliberately permissive here.
    for (const name of ["a.md", "a.markdown", "a.mkd", "a.mdown", "notes.txt"]) {
      expect(
        extractColdStartLaunchTarget(["/opt/pergamum", `/x/${name}`], packaged)
      ).toEqual({ kind: "markdown", rawInput: `/x/${name}` });
    }
  });

  it("keeps a URL-like argument as a raw Markdown candidate, never `.pergamum`", () => {
    expect(
      extractColdStartLaunchTarget(
        ["/opt/pergamum", "https://example.com/Book.pergamum"],
        packaged
      )
    ).toEqual({
      kind: "markdown",
      rawInput: "https://example.com/Book.pergamum"
    });
  });

  it("drops the dev-mode script path argument", () => {
    expect(
      extractColdStartLaunchTarget([process.execPath, ".", "/x/a.md"], dev)
    ).toEqual({ kind: "markdown", rawInput: "/x/a.md" });
  });

  it("ignores option flags", () => {
    expect(
      extractColdStartLaunchTarget(
        ["/opt/pergamum", "--pergamum-debug", "/x/a.md"],
        packaged
      )
    ).toEqual({ kind: "markdown", rawInput: "/x/a.md" });
  });

  it("returns null when there is no single positional target", () => {
    expect(extractColdStartLaunchTarget(["/opt/pergamum"], packaged)).toBeNull();
    expect(
      extractColdStartLaunchTarget(
        ["/opt/pergamum", "/x/a.md", "/x/b.md"],
        packaged
      )
    ).toBeNull();
  });
});

describe("coldStartLaunchTargetFromClassification (#347)", () => {
  it("maps `externalFile` to a Markdown target with an externalFile route", () => {
    const classification: StartupMarkdownClassification = {
      kind: "externalFile",
      filePath: path.resolve("/x/a.md")
    };

    expect(coldStartLaunchTargetFromClassification(classification)).toEqual({
      kind: "markdown",
      filePath: path.resolve("/x/a.md"),
      markdownRoute: { kind: "externalFile" }
    });
  });

  it("promotes `enclosingProject` to a `.pergamum` target with openProjectMarkdownAfter", () => {
    const classification: StartupMarkdownClassification = {
      kind: "enclosingProject",
      filePath: path.resolve("/proj/manuscripts/ch1.md"),
      projectFilePath: path.resolve("/proj/Book.pergamum"),
      projectRootPath: path.resolve("/proj")
    };

    expect(coldStartLaunchTargetFromClassification(classification)).toEqual({
      kind: "pergamum",
      filePath: path.resolve("/proj/Book.pergamum"),
      openProjectMarkdownAfter: path.resolve("/proj/manuscripts/ch1.md")
    });
  });

  it("maps `rejected` to a Markdown target carrying the rejection reason", () => {
    const classification: StartupMarkdownClassification = {
      kind: "rejected",
      filePath: path.resolve("/x/a.txt"),
      reason: "unsupportedExtension"
    };

    expect(coldStartLaunchTargetFromClassification(classification)).toEqual({
      kind: "markdown",
      filePath: path.resolve("/x/a.txt"),
      markdownRoute: { kind: "rejected", reason: "unsupportedExtension" }
    });
  });
});

describe("resolveColdStartLaunchTarget (#347)", () => {
  const passthroughDeps = {
    stat: async () => {
      throw new Error("stat should not be called for a .pergamum target");
    },
    readdir: async () => {
      throw new Error("readdir should not be called for a .pergamum target");
    },
    realpath: async () => {
      throw new Error("realpath should not be called for a .pergamum target");
    }
  };

  it("passes a `.pergamum` target straight through without touching the fs", async () => {
    expect(
      await resolveColdStartLaunchTarget(
        ["/opt/pergamum", "/home/w/Book/Book.pergamum"],
        packaged,
        passthroughDeps
      )
    ).toEqual({
      kind: "pergamum",
      filePath: path.resolve("/home/w/Book/Book.pergamum")
    });
  });

  it("returns null when there is no launch target", async () => {
    expect(
      await resolveColdStartLaunchTarget(["/opt/pergamum"], packaged, passthroughDeps)
    ).toBeNull();
  });

  it("classifies a Markdown candidate and routes it (externalFile)", async () => {
    const target = await resolveColdStartLaunchTarget(
      ["/opt/pergamum", "/x/a.md"],
      packaged,
      {
        stat: async () => ({ isFile: () => true, isDirectory: () => false }),
        realpath: async (p: string) => p,
        readdir: async (directoryPath: string) => {
          // no `.pergamum` anywhere up the tree
          return path.dirname(directoryPath) === directoryPath ? [] : [];
        }
      }
    );

    expect(target).toEqual({
      kind: "markdown",
      filePath: path.resolve("/x/a.md"),
      markdownRoute: { kind: "externalFile" }
    });
  });

  it("rejects a URL-like Markdown candidate", async () => {
    const target = await resolveColdStartLaunchTarget(
      ["/opt/pergamum", "https://example.com/notes.md"],
      packaged,
      passthroughDeps
    );

    expect(target).toEqual({
      kind: "markdown",
      filePath: "https://example.com/notes.md",
      markdownRoute: { kind: "rejected", reason: "urlLikeInput" }
    });
  });
});

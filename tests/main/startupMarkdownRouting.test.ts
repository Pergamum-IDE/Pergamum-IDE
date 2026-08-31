import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyStartupMarkdownTarget,
  isUrlLikeStartupInput,
  type StartupMarkdownClassification,
  type StartupMarkdownRoutingDeps
} from "../../src/main/startupMarkdownRouting";

/**
 * In-memory filesystem for the classifier. `dirs` maps an absolute directory
 * path to its entry names; `files` is the set of absolute regular-file
 * paths. A directory / file not present throws `ENOENT`; a path listed in
 * `readdirErrors` throws that code from `readdir`.
 */
function makeDeps(spec: {
  files?: readonly string[];
  dirs?: Record<string, readonly string[]>;
  readdirErrors?: Record<string, string>;
  statErrors?: Record<string, string>;
  /** absolute symlink path → absolute real path */
  symlinks?: Record<string, string>;
  realpathErrors?: Record<string, string>;
}): StartupMarkdownRoutingDeps {
  const files = new Set((spec.files ?? []).map((p) => path.resolve(p)));
  const dirs = new Map<string, readonly string[]>(
    Object.entries(spec.dirs ?? {}).map(([k, v]) => [path.resolve(k), v])
  );
  const readdirErrors = new Map<string, string>(
    Object.entries(spec.readdirErrors ?? {}).map(([k, v]) => [
      path.resolve(k),
      v
    ])
  );
  const statErrors = new Map<string, string>(
    Object.entries(spec.statErrors ?? {}).map(([k, v]) => [path.resolve(k), v])
  );
  const symlinks = new Map<string, string>(
    Object.entries(spec.symlinks ?? {}).map(([k, v]) => [
      path.resolve(k),
      path.resolve(v)
    ])
  );
  const realpathErrors = new Map<string, string>(
    Object.entries(spec.realpathErrors ?? {}).map(([k, v]) => [
      path.resolve(k),
      v
    ])
  );

  const fsError = (code: string): NodeJS.ErrnoException => {
    const error = new Error(code) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  };

  return {
    stat: async (target) => {
      const resolved = symlinks.get(path.resolve(target)) ?? path.resolve(target);

      if (statErrors.has(resolved)) {
        throw fsError(statErrors.get(resolved)!);
      }

      if (dirs.has(resolved)) {
        return { isFile: () => false, isDirectory: () => true };
      }

      if (files.has(resolved)) {
        return { isFile: () => true, isDirectory: () => false };
      }

      throw fsError("ENOENT");
    },
    readdir: async (directory) => {
      const resolved = path.resolve(directory);

      if (readdirErrors.has(resolved)) {
        throw fsError(readdirErrors.get(resolved)!);
      }

      if (dirs.has(resolved)) {
        return [...dirs.get(resolved)!];
      }

      throw fsError("ENOENT");
    },
    realpath: async (target) => {
      const resolved = path.resolve(target);

      if (realpathErrors.has(resolved)) {
        throw fsError(realpathErrors.get(resolved)!);
      }

      return symlinks.get(resolved) ?? resolved;
    }
  };
}

/** The classification `kind` for a given input against a given fs spec. */
async function classify(
  input: string,
  spec: Parameters<typeof makeDeps>[0]
): Promise<StartupMarkdownClassification> {
  return classifyStartupMarkdownTarget(input, makeDeps(spec));
}

describe("classifyStartupMarkdownTarget (#347)", () => {
  // A project root with exactly one `.pergamum`, a nested manuscripts folder,
  // and an outer folder with no project file.
  const projectRoot = path.resolve("/work/novels/Book");
  const nested = path.join(projectRoot, "manuscripts");
  const outsideDir = path.resolve("/work/scratch");

  const oneProjectSpec = {
    dirs: {
      "/": ["work"],
      "/work": ["novels", "scratch"],
      "/work/novels": ["Book"],
      [projectRoot]: ["Book.pergamum", "pergamum.json", "manuscripts", "notes.md"],
      [nested]: ["ch1.md", "ch2.markdown"],
      [outsideDir]: ["loose.md", "loose.markdown", "notes.txt"]
    }
  };

  it("1. `.md` outside any project → external file document route", async () => {
    const result = await classify(path.join(outsideDir, "loose.md"), {
      ...oneProjectSpec,
      files: [path.join(outsideDir, "loose.md")]
    });

    expect(result).toEqual({
      kind: "externalFile",
      filePath: path.join(outsideDir, "loose.md")
    });
  });

  it("2. `.markdown` outside any project → external file document route", async () => {
    const result = await classify(path.join(outsideDir, "loose.markdown"), {
      ...oneProjectSpec,
      files: [path.join(outsideDir, "loose.markdown")]
    });

    expect(result.kind).toBe("externalFile");
  });

  it("3. `.md` directly under a project root with one `.pergamum` → enclosing project route", async () => {
    const md = path.join(projectRoot, "notes.md");
    const result = await classify(md, { ...oneProjectSpec, files: [md] });

    expect(result).toEqual({
      kind: "enclosingProject",
      filePath: md,
      projectFilePath: path.join(projectRoot, "Book.pergamum"),
      projectRootPath: projectRoot
    });
  });

  it("4. `.markdown` under a project root with one `.pergamum` → enclosing project route", async () => {
    const md = path.join(nested, "ch2.markdown");
    const result = await classify(md, { ...oneProjectSpec, files: [md] });

    expect(result).toMatchObject({
      kind: "enclosingProject",
      projectFilePath: path.join(projectRoot, "Book.pergamum")
    });
  });

  it("5. nested folder under a project root → nearest enclosing project root wins", async () => {
    // An INNER project nested inside an OUTER project. The Markdown in the
    // inner tree must resolve to the inner `.pergamum`.
    const innerRoot = path.join(projectRoot, "sub", "Inner");
    const innerMd = path.join(innerRoot, "draft.md");

    const result = await classify(innerMd, {
      files: [innerMd],
      dirs: {
        [projectRoot]: ["Book.pergamum", "sub"],
        [path.join(projectRoot, "sub")]: ["Inner"],
        [innerRoot]: ["Inner.pergamum", "draft.md"]
      }
    });

    expect(result).toMatchObject({
      kind: "enclosingProject",
      projectFilePath: path.join(innerRoot, "Inner.pergamum"),
      projectRootPath: innerRoot
    });
  });

  it("6. folder with multiple `.pergamum` files → ambiguous reject", async () => {
    const md = path.join(projectRoot, "notes.md");
    const result = await classify(md, {
      files: [md],
      dirs: {
        [projectRoot]: [
          "Book.pergamum",
          "Book - copy.pergamum",
          "notes.md"
        ]
      }
    });

    expect(result).toEqual({
      kind: "rejected",
      filePath: md,
      reason: "ambiguousProject"
    });
  });

  it("7. `.mdown` → unsupported", async () => {
    const p = path.join(outsideDir, "x.mdown");
    expect(await classify(p, { ...oneProjectSpec, files: [p] })).toMatchObject({
      kind: "rejected",
      reason: "unsupportedExtension"
    });
  });

  it("8. `.mkd` → unsupported", async () => {
    const p = path.join(outsideDir, "x.mkd");
    expect(await classify(p, { ...oneProjectSpec, files: [p] })).toMatchObject({
      kind: "rejected",
      reason: "unsupportedExtension"
    });
  });

  it("9. `.txt` → unsupported", async () => {
    const p = path.join(outsideDir, "notes.txt");
    expect(await classify(p, { ...oneProjectSpec, files: [p] })).toMatchObject({
      kind: "rejected",
      reason: "unsupportedExtension"
    });
  });

  it("10. extensionless file → unsupported", async () => {
    const p = path.join(outsideDir, "README");
    expect(await classify(p, { ...oneProjectSpec, files: [p] })).toMatchObject({
      kind: "rejected",
      reason: "unsupportedExtension"
    });
  });

  it("11. directory path → unsupported", async () => {
    const result = await classify(nested, oneProjectSpec);

    expect(result).toEqual({
      kind: "rejected",
      filePath: nested,
      reason: "isDirectory"
    });
  });

  it("12. URL-like string ending in `.md` → unsupported", async () => {
    for (const url of [
      "https://example.com/notes.md",
      "http://host/x.md",
      "file:///C:/Users/w/notes.md"
    ]) {
      expect(await classify(url, {})).toEqual({
        kind: "rejected",
        filePath: url,
        reason: "urlLikeInput"
      });
    }
  });

  it("13. missing file → safe reject", async () => {
    const p = path.join(outsideDir, "gone.md");
    // not in `files`, so stat throws ENOENT
    expect(await classify(p, oneProjectSpec)).toEqual({
      kind: "rejected",
      filePath: p,
      reason: "notFound"
    });
  });

  it("14. project-owned Markdown NEVER routes to the standalone/external route", async () => {
    // A table of Markdown paths that all live inside a single-`.pergamum`
    // project. None may classify as `externalFile`.
    const md1 = path.join(projectRoot, "notes.md");
    const md2 = path.join(nested, "ch1.md");
    const md3 = path.join(nested, "ch2.markdown");

    for (const md of [md1, md2, md3]) {
      const result = await classify(md, { ...oneProjectSpec, files: [md] });

      expect(result.kind).not.toBe("externalFile");
      expect(result.kind).toBe("enclosingProject");
    }
  });

  it("15. locked / any live-process concern is NOT decided here — it stays `enclosingProject`", async () => {
    // #347 decision: the classifier does no lock probe. A locked enclosing
    // project still routes as `enclosingProject`; the existing project-open
    // read-only lifecycle owns the locked outcome. The invariant the
    // classifier guarantees is only "never externalFile for a project-owned
    // Markdown".
    const md = path.join(nested, "ch1.md");
    const result = await classify(md, { ...oneProjectSpec, files: [md] });

    expect(result.kind).toBe("enclosingProject");
  });

  it("16. a symlink OUTSIDE any project pointing AT a project-owned Markdown resolves as project-owned (LOCK-STARTUP-1)", async () => {
    // ProjectZ/chapter.md  <—  outside/chapter-link.md
    const projectZ = path.resolve("/work/ProjectZ");
    const realMd = path.join(projectZ, "chapter.md");
    const linkDir = path.resolve("/work/outside");
    const linkMd = path.join(linkDir, "chapter-link.md");

    const result = await classify(linkMd, {
      files: [realMd],
      symlinks: { [linkMd]: realMd },
      dirs: {
        [linkDir]: ["chapter-link.md"],
        [projectZ]: ["ProjectZ.pergamum", "chapter.md"]
      }
    });

    expect(result.kind).not.toBe("externalFile");
    expect(result).toEqual({
      kind: "enclosingProject",
      filePath: realMd,
      projectFilePath: path.join(projectZ, "ProjectZ.pergamum"),
      projectRootPath: projectZ
    });
  });

  it("16b. a symlink INSIDE project A pointing at a Markdown in project B routes to project B (nearest to the real file)", async () => {
    const projectA = path.resolve("/work/A");
    const projectB = path.resolve("/work/B");
    const linkMd = path.join(projectA, "link-to-b.md");
    const realMd = path.join(projectB, "real.md");

    const result = await classify(linkMd, {
      files: [realMd],
      symlinks: { [linkMd]: realMd },
      dirs: {
        [projectA]: ["A.pergamum", "link-to-b.md"],
        [projectB]: ["B.pergamum", "real.md"]
      }
    });

    expect(result).toMatchObject({
      kind: "enclosingProject",
      projectFilePath: path.join(projectB, "B.pergamum"),
      projectRootPath: projectB
    });
  });

  it("17. a broken symlink → safe `notFound`, never external", async () => {
    const linkDir = path.resolve("/work/outside");
    const linkMd = path.join(linkDir, "dangling.md");

    const result = await classify(linkMd, {
      files: [linkMd], // stat (follows the link) succeeds in this stub…
      dirs: { [linkDir]: ["dangling.md"] },
      realpathErrors: { [linkMd]: "ENOENT" } // …but realpath cannot resolve it
    });

    expect(result).toEqual({
      kind: "rejected",
      filePath: linkMd,
      reason: "notFound"
    });
  });

  it("18. realpath permission error → safe `discoveryFailed`, never external", async () => {
    const linkDir = path.resolve("/work/outside");
    const linkMd = path.join(linkDir, "x.md");

    const result = await classify(linkMd, {
      files: [linkMd],
      dirs: { [linkDir]: ["x.md"] },
      realpathErrors: { [linkMd]: "EACCES" }
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "discoveryFailed"
    });
  });

  it("readdir permission error on an ancestor → safe `discoveryFailed`, never external", async () => {
    const md = path.join(outsideDir, "loose.md");
    const result = await classify(md, {
      files: [md],
      dirs: { [outsideDir]: ["loose.md"] },
      readdirErrors: { [outsideDir]: "EACCES" }
    });

    expect(result).toEqual({
      kind: "rejected",
      filePath: md,
      reason: "discoveryFailed"
    });
  });

  it("stat permission error → safe `discoveryFailed`", async () => {
    const md = path.join(outsideDir, "loose.md");
    const result = await classify(md, {
      files: [md],
      statErrors: { [md]: "EACCES" }
    });

    expect(result).toMatchObject({ kind: "rejected", reason: "discoveryFailed" });
  });
});

describe("isUrlLikeStartupInput (#347 / LOCK-STARTUP-5)", () => {
  it("treats scheme://authority and bare-scheme inputs as URL-like", () => {
    for (const url of [
      "https://example.com/notes.md",
      "http://host/x.md",
      "file:///C:/x.md",
      "ftp://host/x.md",
      "mailto:someone@example.com",
      "about:blank"
    ]) {
      expect(isUrlLikeStartupInput(url)).toBe(true);
    }
  });

  it("treats local filesystem paths as NOT URL-like", () => {
    for (const local of [
      "C:\\Users\\w\\notes.md",
      "C:/Users/w/notes.md",
      "C:",
      "\\\\server\\share\\notes.md",
      "/home/w/notes.md",
      "./notes.md",
      "../notes.md",
      "notes.md",
      "my notes.md"
    ]) {
      expect(isUrlLikeStartupInput(local)).toBe(false);
    }
  });
});

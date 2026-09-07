import { describe, expect, it, vi } from "vitest";
import {
  computeMarkdownImageLinkDiagnostics,
  registerMarkdownImageLinkDiagnosticsIpc
} from "../../src/main/markdownImageLinkDiagnosticsIpc";
import {
  MARKDOWN_IMAGE_LINK_DIAGNOSTICS_CHANNELS,
  type ProjectLocalImageResolutionContext
} from "../../src/shared/api";
import type { ProjectLocalImageFileValidationResult } from "../../src/main/projectLocalImageFileValidation";

const PROJECT_ROOT = "/projects/novel";

/** #412: a Markdown document editor context anchored at `path`'s folder. */
function srcCtx(
  sourceMarkdownProjectRelativePath: string
): ProjectLocalImageResolutionContext {
  return { kind: "sourceFile", sourceMarkdownProjectRelativePath };
}
const PROJECT_ROOT_CTX: ProjectLocalImageResolutionContext = {
  kind: "projectRoot"
};

function link(src: string, from = 0, to = src.length) {
  return { src, from, to };
}

/** A `validateFile` stub keyed by the joined project-relative segment path. */
function fakeValidateFile(
  byPath: Record<string, ProjectLocalImageFileValidationResult>
) {
  return vi.fn(async (input: { projectRelativeSegments: readonly string[] }) => {
    const key = input.projectRelativeSegments.join("/");
    return (
      byPath[key] ?? ({ ok: false, reason: "missing" } as const)
    );
  });
}

const OK: ProjectLocalImageFileValidationResult = {
  ok: true,
  format: "png",
  resolvedRealPath: "/x",
  bytes: new Uint8Array()
};

describe("computeMarkdownImageLinkDiagnostics (#411)", () => {
  it("returns ok:false when no project is open", async () => {
    const result = await computeMarkdownImageLinkDiagnostics(
      { resolutionContext: srcCtx("doc.md"), links: [link("a.png")] },
      { currentProjectRootPath: () => null, validateFile: fakeValidateFile({}) }
    );
    expect(result).toEqual({ ok: false, diagnostics: [] });
  });

  it("returns ok:false for a malformed request", async () => {
    const deps = {
      currentProjectRootPath: () => PROJECT_ROOT,
      validateFile: fakeValidateFile({})
    };
    expect(
      await computeMarkdownImageLinkDiagnostics({ links: [] }, deps)
    ).toEqual({ ok: false, diagnostics: [] });
    expect(await computeMarkdownImageLinkDiagnostics(null, deps)).toEqual({
      ok: false,
      diagnostics: []
    });
  });

  it("returns ok:false when the source path escapes the project root", async () => {
    const result = await computeMarkdownImageLinkDiagnostics(
      {
        resolutionContext: srcCtx("../evil.md"),
        links: [link("a.png")]
      },
      {
        currentProjectRootPath: () => PROJECT_ROOT,
        validateFile: fakeValidateFile({})
      }
    );
    expect(result).toEqual({ ok: false, diagnostics: [] });
  });

  it("produces no diagnostics when every candidate file is valid", async () => {
    const validateFile = fakeValidateFile({
      "chapters/images/a.png": OK,
      "assets/b.png": OK
    });
    const result = await computeMarkdownImageLinkDiagnostics(
      {
        resolutionContext: srcCtx("chapters/chapter01.md"),
        links: [link("images/a.png"), link("../assets/b.png")]
      },
      { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
    );
    expect(result).toEqual({ ok: true, diagnostics: [] });
  });

  it("reports a missing candidate file with its request offsets echoed back", async () => {
    const result = await computeMarkdownImageLinkDiagnostics(
      {
        resolutionContext: srcCtx("chapter01.md"),
        links: [{ src: "assets/images/missing.png", from: 10, to: 33 }]
      },
      {
        currentProjectRootPath: () => PROJECT_ROOT,
        validateFile: fakeValidateFile({})
      }
    );
    expect(result).toEqual({
      ok: true,
      diagnostics: [
        {
          from: 10,
          to: 33,
          src: "assets/images/missing.png",
          reason: "missing"
        }
      ]
    });
  });

  it("classifies shape problems without hitting the filesystem", async () => {
    const validateFile = fakeValidateFile({});
    const result = await computeMarkdownImageLinkDiagnostics(
      {
        resolutionContext: srcCtx("chapters/chapter01.md"),
        links: [
          link("images\\foo.png"),
          link("../../../outside.png"),
          link("diagram.svg")
        ]
      },
      { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
    );
    expect(result.diagnostics.map((d) => d.reason)).toEqual([
      "invalidPath",
      "outsideProject",
      "unsupportedFormat"
    ]);
    expect(validateFile).not.toHaveBeenCalled();
  });

  it("skips external / data / blob links entirely", async () => {
    const result = await computeMarkdownImageLinkDiagnostics(
      {
        resolutionContext: srcCtx("doc.md"),
        links: [
          link("https://example.com/a.png"),
          link("data:image/png;base64,AAAA"),
          link("blob:abcd")
        ]
      },
      {
        currentProjectRootPath: () => PROJECT_ROOT,
        validateFile: fakeValidateFile({})
      }
    );
    expect(result).toEqual({ ok: true, diagnostics: [] });
  });

  it("validates each distinct src only once but emits a diagnostic per occurrence", async () => {
    const validateFile = fakeValidateFile({});
    const result = await computeMarkdownImageLinkDiagnostics(
      {
        resolutionContext: srcCtx("doc.md"),
        links: [
          { src: "a.png", from: 0, to: 5 },
          { src: "a.png", from: 40, to: 45 }
        ]
      },
      { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
    );
    expect(validateFile).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.map((d) => d.from)).toEqual([0, 40]);
  });

  it("maps every rejection reason straight through", async () => {
    for (const reason of [
      "directory",
      "protectedLocation",
      "formatMismatch",
      "tooLarge",
      "outsideProject"
    ] as const) {
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: srcCtx("doc.md"),
          links: [link("a.png")]
        },
        {
          currentProjectRootPath: () => PROJECT_ROOT,
          validateFile: fakeValidateFile({ "a.png": { ok: false, reason } })
        }
      );
      expect(result.diagnostics[0]?.reason).toBe(reason);
    }
  });

  describe("percent-encoded destinations (#411 follow-up)", () => {
    it("resolves against the DECODED path so a %20 link to an existing file is not flagged", async () => {
      const validateFile = fakeValidateFile({
        "assets/figure image.png": OK
      });
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: srcCtx("chapter01.md"),
          links: [link("assets/figure%20image.png")]
        },
        { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
      );
      expect(result).toEqual({ ok: true, diagnostics: [] });
      expect(validateFile).toHaveBeenCalledTimes(1);
      expect(
        validateFile.mock.calls[0][0].projectRelativeSegments.join("/")
      ).toBe("assets/figure image.png");
    });

    it("flags a missing %20 link and keeps the ENCODED src in the diagnostic", async () => {
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: srcCtx("chapter01.md"),
          links: [{ src: "assets/figure%20image.png", from: 4, to: 33 }]
        },
        {
          currentProjectRootPath: () => PROJECT_ROOT,
          validateFile: fakeValidateFile({})
        }
      );
      expect(result.diagnostics).toEqual([
        {
          from: 4,
          to: 33,
          src: "assets/figure%20image.png",
          reason: "missing"
        }
      ]);
    });

    it("decodes non-ASCII percent-escapes (%E6%8C%BF%E7%B5%B5 → 挿絵)", async () => {
      const validateFile = fakeValidateFile({ "assets/挿絵.png": OK });
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: srcCtx("chapter01.md"),
          links: [link("assets/%E6%8C%BF%E7%B5%B5.png")]
        },
        { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
      );
      expect(result).toEqual({ ok: true, diagnostics: [] });
    });

    it("leaves a malformed escape (%zz) as authored and resolves that literally", async () => {
      const validateFile = fakeValidateFile({});
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: srcCtx("chapter01.md"),
          links: [link("assets/%zz.png")]
        },
        { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
      );
      expect(result.diagnostics[0]).toMatchObject({
        src: "assets/%zz.png",
        reason: "missing"
      });
      expect(
        validateFile.mock.calls[0][0].projectRelativeSegments.join("/")
      ).toBe("assets/%zz.png");
    });

    it("catches traversal hidden behind percent-encoded separators (%2e%2e%2f)", async () => {
      const validateFile = fakeValidateFile({});
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: srcCtx("chapter01.md"),
          links: [link("%2e%2e%2f%2e%2e%2foutside.png")]
        },
        { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
      );
      expect(result.diagnostics[0]?.reason).toBe("outsideProject");
      expect(validateFile).not.toHaveBeenCalled();
    });
  });

  describe("projectRoot context — Glossary editor (#412)", () => {
    it("resolves candidates against the project ROOT, not a source folder", async () => {
      const validateFile = fakeValidateFile({ "assets/existing.png": OK });
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: PROJECT_ROOT_CTX,
          links: [link("assets/existing.png"), link("images/missing.png")]
        },
        { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
      );
      expect(
        validateFile.mock.calls.map((c) =>
          c[0].projectRelativeSegments.join("/")
        )
      ).toEqual(["assets/existing.png", "images/missing.png"]);
      expect(result.diagnostics.map((d) => [d.src, d.reason])).toEqual([
        ["images/missing.png", "missing"]
      ]);
    });

    it("flags a ../ link as outsideProject (Glossary has no folder to climb from)", async () => {
      const validateFile = fakeValidateFile({});
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: PROJECT_ROOT_CTX,
          links: [link("../assets/foo.png")]
        },
        { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
      );
      expect(result.diagnostics[0]?.reason).toBe("outsideProject");
      expect(validateFile).not.toHaveBeenCalled();
    });

    it.each([
      [".pergamum/secret.png", "protectedLocation"],
      ["assets/foo.svg", "unsupportedFormat"],
      ["images\\foo.png", "invalidPath"]
    ])("flags %s as %s", async (src, reason) => {
      const validateFile = fakeValidateFile({
        ".pergamum/secret.png": { ok: false, reason: "protectedLocation" }
      });
      const result = await computeMarkdownImageLinkDiagnostics(
        { resolutionContext: PROJECT_ROOT_CTX, links: [link(src)] },
        { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
      );
      expect(result.diagnostics[0]?.reason).toBe(reason);
    });

    it("does not flag external / data / blob links", async () => {
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: PROJECT_ROOT_CTX,
          links: [
            link("https://example.com/foo.png"),
            link("data:image/png;base64,AAAA"),
            link("blob:abcd")
          ]
        },
        {
          currentProjectRootPath: () => PROJECT_ROOT,
          validateFile: fakeValidateFile({})
        }
      );
      expect(result).toEqual({ ok: true, diagnostics: [] });
    });

    it("handles %20 / balanced parens the same as a document context", async () => {
      const validateFile = fakeValidateFile({
        "assets/my images/existing.png": OK,
        "assets/figure(1).png": OK
      });
      const result = await computeMarkdownImageLinkDiagnostics(
        {
          resolutionContext: PROJECT_ROOT_CTX,
          links: [
            link("assets/my%20images/existing.png"),
            link("assets/figure(1).png")
          ]
        },
        { currentProjectRootPath: () => PROJECT_ROOT, validateFile }
      );
      expect(result).toEqual({ ok: true, diagnostics: [] });
    });
  });

  it("returns ok:false for a { kind: 'none' } context", async () => {
    const result = await computeMarkdownImageLinkDiagnostics(
      { resolutionContext: { kind: "none" }, links: [link("a.png")] },
      {
        currentProjectRootPath: () => PROJECT_ROOT,
        validateFile: fakeValidateFile({})
      }
    );
    expect(result).toEqual({ ok: false, diagnostics: [] });
  });
});

describe("registerMarkdownImageLinkDiagnosticsIpc (#411)", () => {
  it("registers a handler on the validate channel", () => {
    const handle = vi.fn();
    registerMarkdownImageLinkDiagnosticsIpc({
      ipcMain: { handle },
      currentProjectRootPath: () => PROJECT_ROOT
    });
    expect(handle).toHaveBeenCalledWith(
      MARKDOWN_IMAGE_LINK_DIAGNOSTICS_CHANNELS.validate,
      expect.any(Function)
    );
  });

  it("the registered handler forwards to computeMarkdownImageLinkDiagnostics", async () => {
    const captured: Array<
      (event: unknown, payload: unknown) => Promise<unknown>
    > = [];
    registerMarkdownImageLinkDiagnosticsIpc({
      ipcMain: {
        handle: (_channel, listener) => {
          captured.push(
            listener as (event: unknown, payload: unknown) => Promise<unknown>
          );
        }
      },
      currentProjectRootPath: () => PROJECT_ROOT,
      validateFile: fakeValidateFile({})
    });
    const handler = captured[0];
    expect(handler).toBeTypeOf("function");
    const result = await handler(
      {},
      {
        resolutionContext: srcCtx("doc.md"),
        links: [{ src: "gone.png", from: 3, to: 11 }]
      }
    );
    expect(result).toEqual({
      ok: true,
      diagnostics: [{ from: 3, to: 11, src: "gone.png", reason: "missing" }]
    });
  });
});

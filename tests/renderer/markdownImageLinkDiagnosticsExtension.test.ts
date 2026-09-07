import { describe, expect, it, vi } from "vitest";
import {
  runMarkdownImageLinkDiagnostics,
  type MarkdownImageLinkDiagnosticsExtensionOptions
} from "../../src/renderer/markdownImageLinkDiagnosticsExtension";
import type {
  MarkdownImageLinkDiagnosticReason,
  MarkdownImageLinkDiagnosticsResult
} from "../../src/shared/api";

interface MutableDoc {
  text: string;
}

function fakeView(doc: MutableDoc) {
  return {
    state: {
      doc: {
        get length() {
          return doc.text.length;
        },
        toString() {
          return doc.text;
        }
      }
    }
  };
}

function makeOptions(
  overrides: Partial<MarkdownImageLinkDiagnosticsExtensionOptions>
): MarkdownImageLinkDiagnosticsExtensionOptions {
  return {
    getSourceProjectRelativePath: () => "chapters/chapter01.md",
    validate: async () => ({ ok: true, diagnostics: [] }),
    formatMessage: (reason: MarkdownImageLinkDiagnosticReason, src: string) =>
      `${reason}:${src}`,
    ...overrides
  };
}

describe("runMarkdownImageLinkDiagnostics (#411)", () => {
  it("is a no-op for a non-project / read-only document (null source path)", async () => {
    const validate = vi.fn();
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text: "![](assets/missing.png)" }),
      makeOptions({ getSourceProjectRelativePath: () => null, validate })
    );
    expect(result).toEqual([]);
    expect(validate).not.toHaveBeenCalled();
  });

  it("does not call the validator when the document has no project-local image links", async () => {
    const validate = vi.fn();
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text: "# Title\n\n![](https://example.com/a.png)\n" }),
      makeOptions({ validate })
    );
    expect(result).toEqual([]);
    expect(validate).not.toHaveBeenCalled();
  });

  it("produces no diagnostics when main reports none", async () => {
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text: "![](assets/ok.png)" }),
      makeOptions({ validate: async () => ({ ok: true, diagnostics: [] }) })
    );
    expect(result).toEqual([]);
  });

  it("maps a `missing` result to a warning diagnostic on the link range", async () => {
    const text = "see ![cat](assets/images/missing.png) here";
    const from = text.indexOf("assets/");
    const to = from + "assets/images/missing.png".length;
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text }),
      makeOptions({
        validate: async (request) => {
          expect(request.sourceMarkdownProjectRelativePath).toBe(
            "chapters/chapter01.md"
          );
          expect(request.links).toEqual([
            { src: "assets/images/missing.png", from, to }
          ]);
          return {
            ok: true,
            diagnostics: [
              { from, to, src: "assets/images/missing.png", reason: "missing" }
            ]
          };
        }
      })
    );
    expect(result).toEqual([
      {
        from,
        to,
        severity: "warning",
        source: "pergamum-image-link",
        message: "missing:assets/images/missing.png"
      }
    ]);
  });

  it("maps an `invalidPath` result to a diagnostic", async () => {
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text: "![](images\\foo.png)" }),
      makeOptions({
        validate: async () => ({
          ok: true,
          diagnostics: [
            { from: 4, to: 18, src: "images\\foo.png", reason: "invalidPath" }
          ]
        })
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: "warning",
      message: "invalidPath:images\\foo.png"
    });
  });

  it("clamps out-of-range offsets from main to the current document length", async () => {
    const text = "![](a.png)";
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text }),
      makeOptions({
        validate: async () => ({
          ok: true,
          diagnostics: [{ from: 4, to: 9999, src: "a.png", reason: "missing" }]
        })
      })
    );
    expect(result[0].from).toBe(4);
    expect(result[0].to).toBe(text.length);
  });

  it("discards a stale async result after the document changed mid-flight", async () => {
    const doc: MutableDoc = { text: "![](assets/missing.png)" };
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView(doc),
      makeOptions({
        validate: async (): Promise<MarkdownImageLinkDiagnosticsResult> => {
          doc.text = "different content, image link gone";
          return {
            ok: true,
            diagnostics: [
              { from: 4, to: 21, src: "assets/missing.png", reason: "missing" }
            ]
          };
        }
      })
    );
    expect(result).toEqual([]);
  });

  it("discards a stale async result after a tab switch changed the source path", async () => {
    let sourcePath: string | null = "chapters/chapter01.md";
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text: "![](assets/missing.png)" }),
      makeOptions({
        getSourceProjectRelativePath: () => sourcePath,
        validate: async () => {
          sourcePath = "chapters/chapter02.md";
          return {
            ok: true,
            diagnostics: [
              { from: 4, to: 21, src: "assets/missing.png", reason: "missing" }
            ]
          };
        }
      })
    );
    expect(result).toEqual([]);
  });

  it("discards the result when main reports ok:false", async () => {
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text: "![](assets/missing.png)" }),
      makeOptions({
        validate: async () => ({ ok: false, diagnostics: [] })
      })
    );
    expect(result).toEqual([]);
  });

  it("swallows an IPC rejection and produces no diagnostics", async () => {
    const result = await runMarkdownImageLinkDiagnostics(
      fakeView({ text: "![](assets/missing.png)" }),
      makeOptions({
        validate: async () => {
          throw new Error("ipc down");
        }
      })
    );
    expect(result).toEqual([]);
  });
});

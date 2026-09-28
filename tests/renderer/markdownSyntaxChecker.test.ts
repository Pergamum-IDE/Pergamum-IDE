// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { diagnosticCount } from "@codemirror/lint";
import { runMarkdownSyntaxCheck } from "../../src/renderer/markdownSyntaxChecker/runMarkdownSyntaxCheck";
import {
  createMarkdownSyntaxCheckerExtension,
  runMarkdownSyntaxCheckPass,
  triggerMarkdownSyntaxCheckNow,
  type MarkdownSyntaxCheckerOptions
} from "../../src/renderer/markdownSyntaxChecker/markdownSyntaxCheckerExtension";

describe("runMarkdownSyntaxCheck", () => {
  it("returns empty array for valid markdown content", () => {
    const text = "# Heading 1\n\nParagraph text here.\n";
    const diagnostics = runMarkdownSyntaxCheck(text);
    expect(diagnostics).toEqual([]);
  });

  it("returns diagnostics for syntax violations", () => {
    const text = "Paragraph\n# Heading 1\nParagraph";
    const diagnostics = runMarkdownSyntaxCheck(text);
    expect(diagnostics.length).toBeGreaterThan(0);
    const md022 = diagnostics.find((d) => d.ruleName === "MD022");
    expect(md022).toBeDefined();
    expect(md022?.line).toBe(2);
    expect(md022?.message).toBeTruthy();
  });

  it("ignores disabled rules (MD013 line length, MD041 first line heading)", () => {
    const longLine = "This is a very long line. ".repeat(10);
    const text = `${longLine}\n\nAnother paragraph without heading on line 1.`;
    const diagnostics = runMarkdownSyntaxCheck(text);
    const md013 = diagnostics.find((d) => d.ruleName === "MD013");
    const md041 = diagnostics.find((d) => d.ruleName === "MD041");
    expect(md013).toBeUndefined();
    expect(md041).toBeUndefined();
  });
});

describe("runMarkdownSyntaxCheckPass", () => {
  const fakeLineMap: Record<number, { from: number; to: number }> = {
    1: { from: 0, to: 9 },
    2: { from: 10, to: 21 },
    3: { from: 22, to: 31 }
  };

  function createFakeView(docText: string) {
    return {
      state: {
        doc: {
          length: docText.length,
          line(n: number) {
            return fakeLineMap[n] ?? { from: 0, to: docText.length };
          },
          toString() {
            return docText;
          }
        }
      }
    };
  }

  it("returns empty array when checker is inactive", () => {
    const options: MarkdownSyntaxCheckerOptions = {
      getIsActive: () => false,
      getIsMarkdownDocument: () => true
    };
    const view = createFakeView("Paragraph\n# Heading 1\nParagraph");
    const diagnostics = runMarkdownSyntaxCheckPass(view, options);
    expect(diagnostics).toEqual([]);
  });

  it("returns empty array when surface is not a Markdown document", () => {
    const options: MarkdownSyntaxCheckerOptions = {
      getIsActive: () => true,
      getIsMarkdownDocument: () => false
    };
    const view = createFakeView("Paragraph\n# Heading 1\nParagraph");
    const diagnostics = runMarkdownSyntaxCheckPass(view, options);
    expect(diagnostics).toEqual([]);
  });

  it("returns formatted diagnostics when active on Markdown document", () => {
    const options: MarkdownSyntaxCheckerOptions = {
      getIsActive: () => true,
      getIsMarkdownDocument: () => true
    };
    const view = createFakeView("Paragraph\n# Heading 1\nParagraph");
    const diagnostics = runMarkdownSyntaxCheckPass(view, options);
    expect(diagnostics.length).toBeGreaterThan(0);
    const first = diagnostics[0];
    expect(first.severity).toBe("warning");
    expect(first.source).toBe("markdownlint");
    expect(first.message).toMatch(/^MD\d+: /);
  });
});

describe("triggerMarkdownSyntaxCheckNow", () => {
  it("dispatches diagnostics synchronously to the EditorView", () => {
    let isActive = false;
    const options: MarkdownSyntaxCheckerOptions = {
      getIsActive: () => isActive,
      getIsMarkdownDocument: () => true
    };

    const state = EditorState.create({
      doc: "Paragraph\n# Heading 1\nParagraph",
      extensions: [markdown(), createMarkdownSyntaxCheckerExtension(options)]
    });

    const host = document.createElement("div");
    const view = new EditorView({ state, parent: host });

    try {
      // While inactive, trigger should dispatch empty diagnostics
      triggerMarkdownSyntaxCheckNow(view, options);

      // Now activate MD linter and trigger immediately
      isActive = true;
      triggerMarkdownSyntaxCheckNow(view, options);

      // Diagnostic state should now hold warnings without waiting for debounce/input
      expect(diagnosticCount(view.state)).toBeGreaterThan(0);

      // Deactivate MD linter and trigger immediately
      isActive = false;
      triggerMarkdownSyntaxCheckNow(view, options);
      expect(diagnosticCount(view.state)).toBe(0);
    } finally {
      view.destroy();
      host.remove();
    }
  });
});

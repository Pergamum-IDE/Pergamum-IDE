import { describe, it, expect } from "vitest";
import { editorCommandIds } from "../../src/shared/commandIds";
import { runMarkdownSyntaxCheck } from "../../src/renderer/markdownSyntaxChecker/runMarkdownSyntaxCheck";
import { runMarkdownSyntaxCheckPass } from "../../src/renderer/markdownSyntaxChecker/markdownSyntaxCheckerExtension";

describe("Markdown Syntax Checker Command & State Rules", () => {
  it("defines the expected command ID editor.markdown.toggleSyntaxChecker", () => {
    expect(editorCommandIds.toggleSyntaxChecker).toBe(
      "editor.markdown.toggleSyntaxChecker"
    );
  });

  it("lints active document and formats rule ID + message correctly", () => {
    const markdownWithWarning = "Paragraph\n# Heading 1\nParagraph";
    const rawDiagnostics = runMarkdownSyntaxCheck(markdownWithWarning);
    expect(rawDiagnostics.length).toBeGreaterThan(0);

    const md022 = rawDiagnostics.find((d) => d.ruleName === "MD022");
    expect(md022).toBeDefined();

    // Verify format: MDxxx: <message>
    const formattedMessage = `${md022!.ruleName}: ${md022!.message}`;
    expect(formattedMessage).toMatch(/^MD022: /);
  });

  it("suppresses MD013 (line-length) and MD041 (first-line-h1) by default", () => {
    const text = "Very long paragraph ".repeat(15) + "\n\nNo h1 at top.";
    const rawDiagnostics = runMarkdownSyntaxCheck(text);
    const md013 = rawDiagnostics.find((d) => d.ruleName === "MD013");
    const md041 = rawDiagnostics.find((d) => d.ruleName === "MD041");
    expect(md013).toBeUndefined();
    expect(md041).toBeUndefined();
  });

  it("does not run diagnostics on unsupported surface or when checker is inactive", () => {
    const text = "Paragraph\n# Heading 1\nParagraph";

    const inactivePass = runMarkdownSyntaxCheckPass(
      {
        state: {
          doc: {
            length: text.length,
            line: () => ({ from: 0, to: text.length }),
            toString: () => text
          }
        }
      },
      {
        getIsActive: () => false,
        getIsMarkdownDocument: () => true
      }
    );
    expect(inactivePass).toEqual([]);

    const nonMarkdownPass = runMarkdownSyntaxCheckPass(
      {
        state: {
          doc: {
            length: text.length,
            line: () => ({ from: 0, to: text.length }),
            toString: () => text
          }
        }
      },
      {
        getIsActive: () => true,
        getIsMarkdownDocument: () => false
      }
    );
    expect(nonMarkdownPass).toEqual([]);
  });
});

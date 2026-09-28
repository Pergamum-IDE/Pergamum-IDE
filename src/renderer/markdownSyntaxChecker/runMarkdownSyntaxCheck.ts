import { lint } from "markdownlint/sync";

export interface MarkdownSyntaxDiagnostic {
  line: number;
  column?: number;
  ruleName: string;
  message: string;
}

export const DEFAULT_MARKDOWN_SYNTAX_CHECKER_CONFIG: Record<string, boolean> = {
  default: true,
  MD013: false, // line-length
  MD041: false, // first-line-heading / first-line-h1
  MD033: false, // inline-html (allow inline HTML for ruby/callout markup)
  MD028: false, // no-blanks-blockquote (allow blank lines in blockquotes)
  MD024: false // no-duplicate-heading (novel chapters/sections often use identical sub-headings)
};

export function runMarkdownSyntaxCheck(
  content: string,
  config: Record<string, boolean> = DEFAULT_MARKDOWN_SYNTAX_CHECKER_CONFIG
): MarkdownSyntaxDiagnostic[] {
  if (!content) {
    return [];
  }

  try {
    const results = lint({
      strings: {
        content
      },
      config
    });

    const contentResults = results.content || [];
    return contentResults.map((result) => {
      const ruleName = result.ruleNames[0] ?? "MD000";
      const message = result.ruleDescription ?? "";
      const column =
        Array.isArray(result.errorRange) && typeof result.errorRange[0] === "number"
          ? result.errorRange[0]
          : undefined;

      return {
        line: result.lineNumber,
        column,
        ruleName,
        message
      };
    });
  } catch (error) {
    console.error("Failed to run Markdown syntax check:", error);
    return [];
  }
}

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { linter, lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { runMarkdownSyntaxCheck } from "./runMarkdownSyntaxCheck";

export interface MarkdownSyntaxCheckerOptions {
  /**
   * Returns whether the syntax checker is currently enabled globally by the user.
   */
  readonly getIsActive: () => boolean;
  /**
   * Returns whether the active surface is a Markdown document.
   */
  readonly getIsMarkdownDocument: () => boolean;
  /**
   * Lint debounce delay in ms. Defaults to 400ms.
   */
  readonly debounceMs?: number;
}

export const editorViewSyntaxCheckerOptionsMap = new WeakMap<
  EditorView,
  MarkdownSyntaxCheckerOptions
>();

export function registerEditorViewSyntaxCheckerOptions(
  view: EditorView,
  options: MarkdownSyntaxCheckerOptions
): void {
  editorViewSyntaxCheckerOptionsMap.set(view, options);
}

export function unregisterEditorViewSyntaxCheckerOptions(
  view: EditorView
): void {
  editorViewSyntaxCheckerOptionsMap.delete(view);
}

export const DIAGNOSTIC_SOURCE_SYNTAX_CHECKER = "markdownlint";

/**
 * Executes a syntax check pass for a given CodeMirror state / view.
 */
export function runMarkdownSyntaxCheckPass(
  view: {
    readonly state: {
      readonly doc: {
        readonly length: number;
        line(n: number): { from: number; to: number };
        toString(): string;
      };
    };
  },
  options: MarkdownSyntaxCheckerOptions
): Diagnostic[] {
  if (!options.getIsActive() || !options.getIsMarkdownDocument()) {
    return [];
  }

  const docText = view.state.doc.toString();
  if (!docText.trim()) {
    return [];
  }

  const rawDiagnostics = runMarkdownSyntaxCheck(docText);
  const docLength = view.state.doc.length;

  return rawDiagnostics.flatMap((diag) => {
    if (diag.line < 1) {
      return [];
    }

    try {
      const line = view.state.doc.line(diag.line);
      const colOffset =
        typeof diag.column === "number" && diag.column > 0 ? diag.column - 1 : 0;
      const from = Math.max(0, Math.min(line.from + colOffset, docLength));
      const to = Math.max(from, Math.min(line.to, docLength));

      return [
        {
          from,
          to,
          severity: "warning" as const,
          source: DIAGNOSTIC_SOURCE_SYNTAX_CHECKER,
          message: `${diag.ruleName}: ${diag.message}`
        }
      ];
    } catch {
      return [];
    }
  });
}

/**
 * Runs a syntax check pass immediately on `view` and dispatches the resulting
 * diagnostics (or empty array when inactive) directly to CodeMirror without
 * waiting for debounce timer or idle events.
 */
export function triggerMarkdownSyntaxCheckNow(
  view: EditorView,
  options: MarkdownSyntaxCheckerOptions
): void {
  const activeOptions =
    editorViewSyntaxCheckerOptionsMap.get(view) ?? options;
  const diagnostics = runMarkdownSyntaxCheckPass(view, activeOptions);
  view.dispatch(setDiagnostics(view.state, diagnostics));
}

export function createMarkdownSyntaxCheckerExtension(
  options: MarkdownSyntaxCheckerOptions
): Extension {
  const lintSource = (view: EditorView): Diagnostic[] => {
    const activeOptions =
      editorViewSyntaxCheckerOptionsMap.get(view) ?? options;
    return runMarkdownSyntaxCheckPass(view, activeOptions);
  };

  return [
    lintGutter(),
    linter(lintSource, { delay: options.debounceMs ?? 400 })
  ];
}

import {
  japaneseLintSourceForPath,
  type JapaneseLintSource
} from "../../shared/japaneseLint";
import type { CurrentEditor } from "../currentEditor";

/**
 * #687: a glossary Description is Markdown text edited in the same
 * CodeMirror surface, so it is linted as Markdown. Only the source metadata is
 * needed - the text always comes from the live editor document, so the current
 * (possibly unsaved) draft is what gets linted. Main / Worker never learn that
 * this text is a Description.
 */
export const glossaryDescriptionJapaneseLintSource: JapaneseLintSource =
  Object.freeze({ format: "markdown", ext: ".md" });

/**
 * The instant Japanese lint source of the active editor, or null when the
 * active surface is unsupported (a special tab, or a file type that is neither
 * Markdown nor plain text). This is the single source of truth for both the
 * lint driver and the command / toolbar enablement.
 */
export function resolveJapaneseLintEditorSource(
  input: {
    readonly isSpecialTabActive: boolean;
    readonly currentEditor: CurrentEditor | null;
  },
  isMarkdownPath: (path: string) => boolean
): JapaneseLintSource | null {
  const { currentEditor } = input;

  if (input.isSpecialTabActive || currentEditor === null) {
    return null;
  }

  if (currentEditor.kind === "glossaryDescription") {
    return glossaryDescriptionJapaneseLintSource;
  }

  // An image viewer tab has no text to lint.
  if (currentEditor.kind === "projectImage") {
    return null;
  }

  const document = currentEditor.document;

  if (document.kind === "untitled") {
    return { format: "markdown", ext: ".md" };
  }

  return japaneseLintSourceForPath(
    document.kind === "file" ? document.path : document.relativePath,
    isMarkdownPath
  );
}

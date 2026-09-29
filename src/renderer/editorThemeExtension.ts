import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * #621: CodeMirror editor surface colors, read from the application theme's
 * semantic `--pg-color-editor-*` CSS custom properties (defined per theme in
 * styles.css).
 *
 * The extension is static: it only references `var(...)`, so switching the
 * application theme (a class on <html>) restyles every live editor without
 * reconfiguring or re-creating any EditorState. That is why no Compartment is
 * needed — content, selection and undo history are untouched by a theme
 * change. Every CodeMirror surface (Markdown editor, Glossary Description
 * tab) is built from createMarkdownEditorBaseSetup, so all of them share this.
 *
 * Pergamum Light's token values equal CodeMirror's own light defaults, so
 * this changes nothing visually today.
 */
export function createEditorThemeExtension(): Extension {
  return EditorView.theme({
    "&": {
      backgroundColor: "var(--pg-color-editor-background)",
      color: "var(--pg-color-editor-foreground)"
    },
    ".cm-content": {
      caretColor: "var(--pg-color-editor-caret)"
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--pg-color-editor-caret)"
    },
    ".cm-activeLine": {
      backgroundColor: "var(--pg-color-editor-line-highlight)"
    },
    ".cm-selectionBackground": {
      background: "var(--pg-color-editor-selection-inactive)"
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
      {
        background: "var(--pg-color-editor-selection)"
      },
    ".cm-gutters": {
      backgroundColor: "var(--pg-color-editor-gutter-background)",
      color: "var(--pg-color-editor-gutter-foreground)",
      borderColor: "var(--pg-color-editor-gutter-border)"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--pg-color-editor-active-line-gutter-background)"
    }
  });
}

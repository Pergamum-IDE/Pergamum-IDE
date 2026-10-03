// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import {
  createEditorThemeExtension,
  createEditorThemeModeExtension,
  editorThemeModeCompartment
} from "../../src/renderer/editorThemeExtension";
import { createMarkdownEditorBaseSetup } from "../../src/renderer/markdownEditorCodeMirrorSetup";
import { builtInThemes, resolveColorTheme } from "../../src/shared/colorTheme";

describe("editor dark theme facet (#708)", () => {
  // -------------------------------------------------------------------------
  // A: theme kind mapping (source of truth)
  // -------------------------------------------------------------------------
  describe("theme kind mapping (A)", () => {
    it("derives light/dark from theme metadata without hardcoding theme IDs", () => {
      const darkThemes = builtInThemes.filter((t) => resolveColorTheme(t.id).kind === "dark");
      const lightThemes = builtInThemes.filter((t) => resolveColorTheme(t.id).kind === "light");

      // Verify known dark themes are correctly categorized
      const darkIds = new Set(darkThemes.map((t) => t.id));
      expect(darkIds.has("night-dark")).toBe(true);
      expect(darkIds.has("shine-moon")).toBe(true);
      expect(darkIds.has("ginza-night")).toBe(true);
      expect(darkThemes.length).toBe(3);

      // Verify known light themes are correctly categorized
      const lightIds = new Set(lightThemes.map((t) => t.id));
      expect(lightIds.has("pergamum-light")).toBe(true);
      expect(lightIds.has("resistance-blue")).toBe(true);
      expect(lightThemes.length).toBe(8);

      // Every built-in theme is accounted for
      expect(darkThemes.length + lightThemes.length).toBe(builtInThemes.length);
    });
  });

  // -------------------------------------------------------------------------
  // B: EditorView.darkTheme facet in EditorState / baseSetup
  // -------------------------------------------------------------------------
  describe("EditorView.darkTheme facet in base setup (B)", () => {
    it("sets darkTheme facet to false for light theme", () => {
      const state = EditorState.create({
        extensions: createMarkdownEditorBaseSetup({
          undoHistoryMinDepth: 100,
          isDarkTheme: false
        })
      });

      expect(state.facet(EditorView.darkTheme)).toBe(false);
    });

    it("sets darkTheme facet to true for dark theme", () => {
      const state = EditorState.create({
        extensions: createMarkdownEditorBaseSetup({
          undoHistoryMinDepth: 100,
          isDarkTheme: true
        })
      });

      expect(state.facet(EditorView.darkTheme)).toBe(true);
    });

    it("defaults to false when isDarkTheme is omitted", () => {
      const state = EditorState.create({
        extensions: createMarkdownEditorBaseSetup({
          undoHistoryMinDepth: 100
        })
      });

      expect(state.facet(EditorView.darkTheme)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // C: Runtime reconfigure via Compartment
  // -------------------------------------------------------------------------
  describe("runtime theme mode reconfigure (C)", () => {
    it("transitions darkTheme facet false -> true -> false via compartment reconfigure", () => {
      const state = EditorState.create({
        doc: "hello",
        extensions: [
          editorThemeModeCompartment.of(createEditorThemeModeExtension(false))
        ]
      });

      const view = new EditorView({ state });

      try {
        expect(view.state.facet(EditorView.darkTheme)).toBe(false);

        // Switch to dark
        view.dispatch({
          effects: editorThemeModeCompartment.reconfigure(
            createEditorThemeModeExtension(true)
          )
        });
        expect(view.state.facet(EditorView.darkTheme)).toBe(true);

        // Switch back to light
        view.dispatch({
          effects: editorThemeModeCompartment.reconfigure(
            createEditorThemeModeExtension(false)
          )
        });
        expect(view.state.facet(EditorView.darkTheme)).toBe(false);
      } finally {
        view.destroy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // D: State preservation across reconfigure
  // -------------------------------------------------------------------------
  describe("state preservation across reconfigure (D)", () => {
    it("preserves doc, selection, and undo history across theme mode reconfigure", () => {
      const initialText = "First line\nSecond line\nThird line";
      const state = EditorState.create({
        doc: initialText,
        extensions: createMarkdownEditorBaseSetup({
          undoHistoryMinDepth: 100,
          isDarkTheme: false
        })
      });

      const view = new EditorView({ state });

      try {
        // Set a non-trivial selection (e.g. "Second" on line 2)
        const from = initialText.indexOf("Second");
        const to = from + "Second".length;
        view.dispatch({
          selection: EditorSelection.single(from, to)
        });
        expect(view.state.selection.main.from).toBe(from);
        expect(view.state.selection.main.to).toBe(to);

        // Make an edit to establish undo history
        view.dispatch({
          changes: { from: 0, to: 5, insert: "Initial" } // "First" -> "Initial"
        });
        expect(view.state.doc.toString()).toBe("Initial line\nSecond line\nThird line");

        // Reconfigure to dark
        view.dispatch({
          effects: editorThemeModeCompartment.reconfigure(
            createEditorThemeModeExtension(true)
          )
        });
        expect(view.state.facet(EditorView.darkTheme)).toBe(true);

        // Verify doc and selection are preserved
        expect(view.state.doc.toString()).toBe("Initial line\nSecond line\nThird line");
        expect(view.state.selection.main.from).toBe(from + 2); // shifted by "Initial".length - "First".length = +2
        expect(view.state.selection.main.to).toBe(to + 2);

        // Verify undo still works across reconfigure
        const undoSuccess = undo(view);
        expect(undoSuccess).toBe(true);
        expect(view.state.doc.toString()).toBe(initialText);

        // Verify redo still works across reconfigure
        const redoSuccess = redo(view);
        expect(redoSuccess).toBe(true);
        expect(view.state.doc.toString()).toBe("Initial line\nSecond line\nThird line");

        // Reconfigure back to light
        view.dispatch({
          effects: editorThemeModeCompartment.reconfigure(
            createEditorThemeModeExtension(false)
          )
        });
        expect(view.state.facet(EditorView.darkTheme)).toBe(false);
        expect(view.state.doc.toString()).toBe("Initial line\nSecond line\nThird line");
      } finally {
        view.destroy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // E: foldPlaceholder styling override
  // -------------------------------------------------------------------------
  describe("foldPlaceholder styling (E)", () => {
    it("defines .cm-foldPlaceholder using Pergamum gutter semantic tokens", () => {
      const themeExt = createEditorThemeExtension() as unknown;
      const providers = Array.isArray(themeExt) ? themeExt : [themeExt];
      const styleModule = providers.find(
        (p) => p && typeof p === "object" && "value" in p && typeof (p as { value?: { getRules?: () => string } }).value?.getRules === "function"
      ) as { value: { getRules: () => string } } | undefined;
      const rules = styleModule?.value.getRules() ?? "";

      expect(rules).toContain(".cm-foldPlaceholder");
      expect(rules).toContain("var(--pg-color-editor-gutter-background)");
      expect(rules).toContain("var(--pg-color-editor-gutter-border)");
      expect(rules).toContain("var(--pg-color-editor-gutter-marker)");
    });
  });

  // -------------------------------------------------------------------------
  // F: Same-kind switch suppression
  // -------------------------------------------------------------------------
  describe("same-kind switch suppression (F)", () => {
    it("recognizes same-kind theme switches so reconfigure can be bypassed", () => {
      // Simulate switching between dark themes
      const darkThemeSequence = ["night-dark", "shine-moon", "ginza-night"] as const;
      const kinds = darkThemeSequence.map((id) => resolveColorTheme(id).kind);

      // All resolved kinds are "dark"
      expect(kinds.every((k) => k === "dark")).toBe(true);

      // A tracker tracking isDark change will find 0 changes across the sequence
      let reconfigureCount = 0;
      let currentIsDark = kinds[0] === "dark";

      for (let i = 1; i < kinds.length; i++) {
        const nextIsDark = kinds[i] === "dark";
        if (currentIsDark !== nextIsDark) {
          reconfigureCount++;
          currentIsDark = nextIsDark;
        }
      }

      expect(reconfigureCount).toBe(0);
    });
  });
});

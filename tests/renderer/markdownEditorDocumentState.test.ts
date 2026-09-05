import { Compartment } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createMarkdownEditorDocumentState } from "../../src/renderer/markdownEditorDocumentState";

function ref<T>(value: T): { current: T } {
  return { current: value };
}

function baseOptions(overrides: Partial<Parameters<typeof createMarkdownEditorDocumentState>[0]> = {}) {
  return {
    doc: "hello",
    initialLineEndingBreaks: [],
    newFileLineEndingFallbackRef: ref<"lf" | "crlf" | "cr">("lf"),
    readOnlyCompartment: new Compartment(),
    readOnlyRef: ref(false),
    visibilityCompartment: new Compartment(),
    markerGlyph: "⏎" as const,
    expectedLineEndingRef: ref<"lf" | "crlf" | "cr">("lf"),
    markerGlyphRef: ref("⏎" as const),
    whitespaceCompartment: new Compartment(),
    whitespaceSettingsRef: ref({
      renderIdeographicSpace: false,
      renderAsciiSpace: false,
      renderTab: false,
      renderOtherUnicodeSpace: false
    }),
    glossaryCompletionRef: ref(null),
    createUpdateListenerExtension: () => [],
    ...overrides
  };
}

describe("createMarkdownEditorDocumentState (#387)", () => {
  it("builds an EditorState whose document is exactly the given content", () => {
    const { state } = createMarkdownEditorDocumentState(baseOptions({ doc: "hello world" }));
    expect(state.doc.toString()).toBe("hello world");
  });

  it("bakes the current readOnlyRef value into the built state", () => {
    const readOnly = createMarkdownEditorDocumentState(
      baseOptions({ readOnlyRef: ref(true) })
    );
    expect(readOnly.state.readOnly).toBe(true);

    const editable = createMarkdownEditorDocumentState(
      baseOptions({ readOnlyRef: ref(false) })
    );
    expect(editable.state.readOnly).toBe(false);
  });

  it("gives each call its own fresh lineEndingField, seeded from initialLineEndingBreaks", () => {
    const a = createMarkdownEditorDocumentState(baseOptions({ doc: "a\nb" }));
    const b = createMarkdownEditorDocumentState(baseOptions({ doc: "c\nd" }));

    expect(a.lineEndingField).not.toBe(b.lineEndingField);
    // Each state can only be read through its OWN field instance.
    expect(a.state.field(a.lineEndingField)).toBeDefined();
    expect(b.state.field(b.lineEndingField)).toBeDefined();
  });

  it("passes its own lineEndingField through to createUpdateListenerExtension", () => {
    let received: unknown = null;
    createMarkdownEditorDocumentState(
      baseOptions({
        createUpdateListenerExtension: (lineEndingField) => {
          received = lineEndingField;
          return [];
        }
      })
    );
    expect(received).not.toBeNull();
  });
});

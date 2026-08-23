import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Transaction, type AnnotationType } from "@codemirror/state";
import { pergamumContextSurfaceAttribute } from "../../src/shared/editContextMenu";
import {
  MarkdownEditor,
  markdownEditorInputSoundEventFromTransactions
} from "../../src/renderer/MarkdownEditor";

interface FakeTransactionInput {
  docChanged?: boolean;
  userEvent?: string;
  insertedTexts: readonly string[];
}

function fakeTransaction(input: FakeTransactionInput) {
  return {
    docChanged: input.docChanged ?? true,
    annotation: <T,>(type: AnnotationType<T>) =>
      type === Transaction.userEvent ? (input.userEvent as T) : undefined,
    changes: {
      iterChanges: (
        callback: (
          fromA: number,
          toA: number,
          fromB: number,
          toB: number,
          inserted: { toString: () => string }
        ) => void
      ) => {
        for (const insertedText of input.insertedTexts) {
          callback(0, 0, 0, insertedText.length, {
            toString: () => insertedText
          });
        }
      }
    }
  };
}

describe("MarkdownEditor", () => {
  it("marks the editable host with the explicit context menu surface", () => {
    const markup = renderToStaticMarkup(
      React.createElement(MarkdownEditor, {
        value: "body",
        onChange: () => undefined,
        contextSurface: "markdownEditor"
      })
    );

    expect(markup).toContain(
      `${pergamumContextSurfaceAttribute}="markdownEditor"`
    );
  });

  it("marks read-only instances so project-owned editors can be non-editable", () => {
    const readOnlyMarkup = renderToStaticMarkup(
      React.createElement(MarkdownEditor, {
        value: "body",
        onChange: () => undefined,
        readOnly: true
      })
    );
    const readWriteMarkup = renderToStaticMarkup(
      React.createElement(MarkdownEditor, {
        value: "body",
        onChange: () => undefined
      })
    );

    expect(readOnlyMarkup).toContain("editorHost-readOnly");
    expect(readWriteMarkup).not.toContain("editorHost-readOnly");
  });
});

describe("MarkdownEditor sound input classification (#200)", () => {
  it("classifies CR, CRLF, and LF typed newline input as newline sound events", () => {
    for (const insertedText of ["\r", "\r\n", "\n"]) {
      expect(
        markdownEditorInputSoundEventFromTransactions([
          fakeTransaction({
            userEvent: "input.type",
            insertedTexts: [insertedText]
          })
        ])
      ).toBe("newline");
    }
  });

  it('classifies CodeMirror Enter command transactions with userEvent "input" as newline sound events', () => {
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input",
          insertedTexts: ["\n- "]
        })
      ])
    ).toBe("newline");
  });

  it("classifies ordinary user typed text as a keypress sound event", () => {
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input.type",
          insertedTexts: ["a"]
        })
      ])
    ).toBe("keypress");
  });

  it("classifies IME composition text as a keypress sound event on input confirmation", () => {
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input.type.compose",
          insertedTexts: ["あ"]
        })
      ])
    ).toBe("keypress");
  });

  it("prioritizes newline sound over keypress sound when the inserted text contains a line break", () => {
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input.type.compose",
          insertedTexts: ["あ\n"]
        })
      ])
    ).toBe("newline");
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input.type",
          insertedTexts: ["a"]
        }),
        fakeTransaction({
          userEvent: "input",
          insertedTexts: ["\n"]
        })
      ])
    ).toBe("newline");
  });

  it("does not classify paste, deletion-only, generic non-newline input, or programmatic changes as editor sound input", () => {
    for (const transaction of [
      fakeTransaction({ userEvent: "input.paste", insertedTexts: ["a\n"] }),
      fakeTransaction({ userEvent: "input.type", insertedTexts: [""] }),
      fakeTransaction({ userEvent: "input", insertedTexts: ["a"] }),
      fakeTransaction({
        docChanged: false,
        userEvent: "input.type",
        insertedTexts: ["a"]
      })
    ]) {
      expect(markdownEditorInputSoundEventFromTransactions([transaction])).toBe(
        null
      );
    }
  });
});

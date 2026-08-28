// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownEditor } from "../../../src/renderer/MarkdownEditor";
import { whitespaceLayerClassName } from "../../../src/renderer/whitespaceRendering/whitespaceMarkerLayer";
import type { ApplicationEditorWhitespaceSettings } from "../../../src/shared/settings";

/**
 * happy-dom has no layout, so no marker elements are produced (see
 * whitespaceMarkerLayer.dom.test.ts). This checks the React → CodeMirror
 * wiring at the level that IS observable: the whitespace `cm-layer`
 * wrapper appears / disappears as the four settings props change, on the
 * same mounted editor, without ever editing the document.
 */

const ALL_OFF: ApplicationEditorWhitespaceSettings = {
  renderIdeographicSpace: false,
  renderAsciiSpace: false,
  renderTab: false,
  renderOtherUnicodeSpace: false
};

const IDEOGRAPHIC = "　";
const DOC_A = `alpha${IDEOGRAPHIC}beta gamma`;
const DOC_B = `delta epsilon${IDEOGRAPHIC}zeta`;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

interface Props {
  value: string;
  documentKey: string;
  whitespaceSettings?: ApplicationEditorWhitespaceSettings;
  readOnly?: boolean;
}

let lastChangeCount = 0;

function render(props: Props): void {
  act(() => {
    root!.render(
      React.createElement(MarkdownEditor, {
        value: props.value,
        documentKey: props.documentKey,
        whitespaceSettings: props.whitespaceSettings,
        readOnly: props.readOnly,
        onChange: () => {
          lastChangeCount += 1;
        }
      })
    );
  });
}

function mount(props: Props): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  lastChangeCount = 0;
  render(props);
}

function hasWhitespaceLayer(): boolean {
  return (
    (container?.querySelectorAll(`.${whitespaceLayerClassName}`).length ?? 0) > 0
  );
}

function editorText(): string {
  return container?.querySelector(".cm-content")?.textContent ?? "";
}

describe("MarkdownEditor whitespace layer wiring (#256)", () => {
  it("installs no whitespace layer when whitespaceSettings is omitted", () => {
    mount({ value: DOC_A, documentKey: "a" });
    expect(hasWhitespaceLayer()).toBe(false);
  });

  it("installs no whitespace layer when every category is off", () => {
    mount({ value: DOC_A, documentKey: "a", whitespaceSettings: ALL_OFF });
    expect(hasWhitespaceLayer()).toBe(false);
  });

  it("adds / removes the layer when the setting prop changes, without editing the document", () => {
    mount({ value: DOC_A, documentKey: "a", whitespaceSettings: ALL_OFF });
    expect(hasWhitespaceLayer()).toBe(false);
    const changesAfterMount = lastChangeCount;

    // OFF -> ON
    render({
      value: DOC_A,
      documentKey: "a",
      whitespaceSettings: { ...ALL_OFF, renderIdeographicSpace: true }
    });
    expect(hasWhitespaceLayer()).toBe(true);

    // ON -> OFF, same editor instance
    render({ value: DOC_A, documentKey: "a", whitespaceSettings: ALL_OFF });
    expect(hasWhitespaceLayer()).toBe(false);

    // Document text never changed; onChange never fired for the reconfigures.
    expect(editorText()).toBe(DOC_A);
    expect(lastChangeCount).toBe(changesAfterMount);
  });

  it("keeps the layer installed across a document switch", () => {
    const ideographicOn = { ...ALL_OFF, renderIdeographicSpace: true };
    mount({ value: DOC_A, documentKey: "a", whitespaceSettings: ideographicOn });
    expect(hasWhitespaceLayer()).toBe(true);

    render({ value: DOC_B, documentKey: "b", whitespaceSettings: ideographicOn });

    expect(editorText()).toBe(DOC_B);
    expect(hasWhitespaceLayer()).toBe(true);
  });

  it("installs the layer in a read-only editor", () => {
    mount({
      value: DOC_A,
      documentKey: "a",
      readOnly: true,
      whitespaceSettings: { ...ALL_OFF, renderIdeographicSpace: true }
    });

    expect(hasWhitespaceLayer()).toBe(true);
  });
});

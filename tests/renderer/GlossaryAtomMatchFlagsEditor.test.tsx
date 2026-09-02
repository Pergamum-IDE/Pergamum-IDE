// @vitest-environment happy-dom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GlossaryAtomFlags,
  GlossaryBoundaryPolicy,
  getGlossaryAtomBoundaryEndPolicy,
  getGlossaryAtomBoundaryStartPolicy,
  hasGlossaryAtomFlag,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryAtomMatchFlagsEditor } from "../../src/renderer/GlossaryAtomMatchFlagsEditor";

const translate: Translate = (key) => key;

describe("GlossaryAtomMatchFlagsEditor (#375) — markup", () => {
  it("renders the single-character checkbox plus a start / end boundary policy select", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryAtomMatchFlagsEditor, {
        matchFlags: setGlossaryAtomBoundaryStartPolicy(
          GlossaryAtomFlags.AllowSingleCharacterMatch,
          GlossaryBoundaryPolicy.Auto
        ),
        translate,
        onChange: () => undefined
      })
    );

    expect(markup).toContain("glossaryEditor.atoms.matchFlags.singleCharacter");
    expect(markup).toContain(
      "glossaryEditor.atoms.matchFlags.boundaryStartPolicy"
    );
    expect(markup).toContain(
      "glossaryEditor.atoms.matchFlags.boundaryEndPolicy"
    );
    expect(markup.match(/type="checkbox"/g)).toHaveLength(1);
    expect(markup.match(/<select/g)).toHaveLength(2);
    // start policy Auto → its <option value="1"> is selected.
    expect(markup).toContain("glossaryEditor.atoms.matchFlags.boundaryPolicy.none");
    expect(markup).toContain("glossaryEditor.atoms.matchFlags.boundaryPolicy.auto");
    expect(markup).toContain(
      "glossaryEditor.atoms.matchFlags.boundaryPolicy.strict"
    );
  });

  it("disables every control in read-only mode", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryAtomMatchFlagsEditor, {
        matchFlags: 0,
        translate,
        readOnly: true,
        onChange: () => undefined
      })
    );

    expect(markup.match(/type="checkbox" disabled/g)).toHaveLength(1);
    expect(markup.match(/<select disabled/g)).toHaveLength(2);
  });
});

describe("GlossaryAtomMatchFlagsEditor (#375) — interaction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function setSelectValue(select: HTMLSelectElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )!.set!;
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  it("encodes the single-character bit and each boundary policy independently", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        React.createElement(GlossaryAtomMatchFlagsEditor, {
          matchFlags: 0,
          translate,
          onChange
        })
      );
    });

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    )!;
    const [startSelect, endSelect] = Array.from(
      container.querySelectorAll<HTMLSelectElement>("select")
    );

    act(() => checkbox.click());
    expect(
      hasGlossaryAtomFlag(
        onChange.mock.lastCall![0],
        GlossaryAtomFlags.AllowSingleCharacterMatch
      )
    ).toBe(true);

    act(() =>
      setSelectValue(startSelect, String(GlossaryBoundaryPolicy.Strict))
    );
    expect(
      getGlossaryAtomBoundaryStartPolicy(onChange.mock.lastCall![0])
    ).toBe(GlossaryBoundaryPolicy.Strict);
    // The single-character bit and end policy are untouched by that write.
    expect(
      getGlossaryAtomBoundaryEndPolicy(onChange.mock.lastCall![0])
    ).toBe(GlossaryBoundaryPolicy.None);

    act(() => setSelectValue(endSelect, String(GlossaryBoundaryPolicy.Auto)));
    expect(
      getGlossaryAtomBoundaryEndPolicy(onChange.mock.lastCall![0])
    ).toBe(GlossaryBoundaryPolicy.Auto);
  });
});

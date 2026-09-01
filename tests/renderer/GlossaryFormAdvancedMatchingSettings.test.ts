import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import {
  GlossaryFormAdvancedMatchingSettings,
  GlossaryFormAdvancedMatchingSettingsView
} from "../../src/renderer/GlossaryFormAdvancedMatchingSettings";

const translate: Translate = (key) => key;

type ElementProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

function collectElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<ElementProps>) => boolean
): React.ReactElement<ElementProps>[] {
  const elements: React.ReactElement<ElementProps>[] = [];

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<ElementProps>(child)) {
      return;
    }

    if (predicate(child)) {
      elements.push(child);
    }

    elements.push(...collectElements(child.props.children, predicate));
  });

  return elements;
}

describe("GlossaryFormAdvancedMatchingSettingsView", () => {
  it("shows the collapsed toggle and hides the boundary selectors by default", () => {
    const element = GlossaryFormAdvancedMatchingSettingsView({
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      translate,
      isExpanded: false,
      onToggleExpanded: () => undefined,
      onChangeMatchBoundaryStart: () => undefined,
      onChangeMatchBoundaryEnd: () => undefined
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("glossaryEditor.advancedMatchingSettings");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("▸");
    expect(markup).not.toContain("▾");
    expect(markup).not.toContain("glossaryEditor.matchBoundaryStart");
    expect(markup).not.toContain("glossaryEditor.matchBoundaryEnd");
    expect(markup).not.toContain("<select");
  });

  it("shows both boundary selectors with auto/strict/none option values once expanded", () => {
    const element = GlossaryFormAdvancedMatchingSettingsView({
      matchBoundaryStart: "none",
      matchBoundaryEnd: "strict",
      translate,
      isExpanded: true,
      onToggleExpanded: () => undefined,
      onChangeMatchBoundaryStart: () => undefined,
      onChangeMatchBoundaryEnd: () => undefined
    });

    const expandedMarkup = renderToStaticMarkup(element);

    expect(expandedMarkup).toContain('aria-expanded="true"');
    expect(expandedMarkup).toContain("▾");
    expect(expandedMarkup).not.toContain("▸");

    const selects = collectElements(
      element,
      (child) => child.type === "select"
    );

    expect(selects).toHaveLength(2);
    expect(selects[0].props["aria-label"]).toBe(
      "glossaryEditor.matchBoundaryStart"
    );
    expect(selects[0].props.value).toBe("none");
    expect(selects[1].props["aria-label"]).toBe(
      "glossaryEditor.matchBoundaryEnd"
    );
    expect(selects[1].props.value).toBe("strict");

    const optionValues = (
      select: React.ReactElement<ElementProps>
    ): string[] =>
      React.Children.map(
        select.props.children as React.ReactNode,
        (option) =>
          React.isValidElement<{ value: string }>(option)
            ? option.props.value
            : undefined
      )?.filter((value): value is string => value !== undefined) ?? [];

    expect(optionValues(selects[0])).toEqual(["auto", "strict", "none"]);
    expect(optionValues(selects[1])).toEqual(["auto", "strict", "none"]);
  });

  it("shows the description for the currently selected boundary under each selector", () => {
    const autoElement = GlossaryFormAdvancedMatchingSettingsView({
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "none",
      translate,
      isExpanded: true,
      onToggleExpanded: () => undefined,
      onChangeMatchBoundaryStart: () => undefined,
      onChangeMatchBoundaryEnd: () => undefined
    });
    const markup = renderToStaticMarkup(autoElement);

    expect(markup).toContain("glossaryEditor.matchBoundary.auto.description");
    expect(markup).toContain("glossaryEditor.matchBoundary.none.description");
    expect(markup).not.toContain(
      "glossaryEditor.matchBoundary.strict.description"
    );
  });

  it("reports boundary selector changes using the internal auto/strict/none values", () => {
    const onChangeMatchBoundaryStart = vi.fn();
    const onChangeMatchBoundaryEnd = vi.fn();
    const element = GlossaryFormAdvancedMatchingSettingsView({
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      translate,
      isExpanded: true,
      onToggleExpanded: () => undefined,
      onChangeMatchBoundaryStart,
      onChangeMatchBoundaryEnd
    });
    const selects = collectElements(
      element,
      (child) => child.type === "select"
    );

    (selects[0].props.onChange as (event: unknown) => void)({
      target: { value: "strict" }
    });
    (selects[1].props.onChange as (event: unknown) => void)({
      target: { value: "none" }
    });

    expect(onChangeMatchBoundaryStart).toHaveBeenCalledWith("strict");
    expect(onChangeMatchBoundaryEnd).toHaveBeenCalledWith("none");
  });

  it("disables boundary selectors and ignores selector changes in read-only mode", () => {
    const onChangeMatchBoundaryStart = vi.fn();
    const onChangeMatchBoundaryEnd = vi.fn();
    const element = GlossaryFormAdvancedMatchingSettingsView({
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      translate,
      isExpanded: true,
      readOnly: true,
      onToggleExpanded: () => undefined,
      onChangeMatchBoundaryStart,
      onChangeMatchBoundaryEnd
    });
    const selects = collectElements(
      element,
      (child) => child.type === "select"
    );

    expect(selects).toHaveLength(2);
    expect(selects[0].props.disabled).toBe(true);
    expect(selects[1].props.disabled).toBe(true);

    (selects[0].props.onChange as (event: unknown) => void)({
      target: { value: "strict" }
    });
    (selects[1].props.onChange as (event: unknown) => void)({
      target: { value: "none" }
    });

    expect(onChangeMatchBoundaryStart).not.toHaveBeenCalled();
    expect(onChangeMatchBoundaryEnd).not.toHaveBeenCalled();
  });

  it("renders the one-character opt-in checkbox reflecting its prop and reports changes (#365)", () => {
    const onChangeAllowSingleCharacterMatch = vi.fn();
    const element = GlossaryFormAdvancedMatchingSettingsView({
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      allowSingleCharacterMatch: true,
      translate,
      isExpanded: true,
      onToggleExpanded: () => undefined,
      onChangeMatchBoundaryStart: () => undefined,
      onChangeMatchBoundaryEnd: () => undefined,
      onChangeAllowSingleCharacterMatch
    });

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("glossaryEditor.allowSingleCharacterMatch.label");
    expect(markup).toContain(
      "glossaryEditor.allowSingleCharacterMatch.helper"
    );

    const checkboxes = collectElements(
      element,
      (child) =>
        child.type === "input" && child.props.type === "checkbox"
    );
    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0].props.checked).toBe(true);

    (checkboxes[0].props.onChange as (event: unknown) => void)({
      target: { checked: false }
    });
    expect(onChangeAllowSingleCharacterMatch).toHaveBeenCalledWith(false);
  });

  it("hides the one-character opt-in checkbox while collapsed and ignores it in read-only mode (#365)", () => {
    const collapsed = renderToStaticMarkup(
      GlossaryFormAdvancedMatchingSettingsView({
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        allowSingleCharacterMatch: false,
        translate,
        isExpanded: false,
        onToggleExpanded: () => undefined,
        onChangeMatchBoundaryStart: () => undefined,
        onChangeMatchBoundaryEnd: () => undefined,
        onChangeAllowSingleCharacterMatch: () => undefined
      })
    );
    expect(collapsed).not.toContain(
      "glossaryEditor.allowSingleCharacterMatch.label"
    );

    const onChangeAllowSingleCharacterMatch = vi.fn();
    const element = GlossaryFormAdvancedMatchingSettingsView({
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      allowSingleCharacterMatch: false,
      translate,
      isExpanded: true,
      readOnly: true,
      onToggleExpanded: () => undefined,
      onChangeMatchBoundaryStart: () => undefined,
      onChangeMatchBoundaryEnd: () => undefined,
      onChangeAllowSingleCharacterMatch
    });
    const checkbox = collectElements(
      element,
      (child) => child.type === "input" && child.props.type === "checkbox"
    )[0];
    expect(checkbox.props.disabled).toBe(true);
    (checkbox.props.onChange as (event: unknown) => void)({
      target: { checked: true }
    });
    expect(onChangeAllowSingleCharacterMatch).not.toHaveBeenCalled();
  });

  it("reports the toggle interaction through onToggleExpanded", () => {
    const onToggleExpanded = vi.fn();
    const element = GlossaryFormAdvancedMatchingSettingsView({
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      translate,
      isExpanded: false,
      onToggleExpanded,
      onChangeMatchBoundaryStart: () => undefined,
      onChangeMatchBoundaryEnd: () => undefined
    });
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );

    (buttons[0].props.onClick as () => void)();

    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });
});

describe("GlossaryFormAdvancedMatchingSettings", () => {
  it("starts collapsed as a matter of local, non-persisted state", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryFormAdvancedMatchingSettings, {
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        translate,
        onChangeMatchBoundaryStart: () => undefined,
        onChangeMatchBoundaryEnd: () => undefined
      })
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("▸");
    expect(markup).not.toContain("<select");
  });
});

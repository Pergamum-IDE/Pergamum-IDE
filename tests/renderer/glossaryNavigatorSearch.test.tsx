/// <reference path="../../src/renderer/pergamum.d.ts" />

import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GlossaryEntry, GlossaryForm } from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import {
  GlossarySidebarView,
  initialGlossaryCreateFormState
} from "../../src/renderer/GlossarySidebar";
import { createLoadedGlossarySidebarState } from "../../src/renderer/glossarySidebarState";

const translate: Translate = (key) => key;
const timestamp = "2026-08-14T00:00:00.000Z";

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

function canonicalForm(entryId: string, id: string, surface: string): GlossaryForm {
  return {
    id,
    entryId,
    surface,
    relation: null,
    warningPolicy: null,
    isCanonical: true,
    matchBoundaryStart: "auto",
    matchBoundaryEnd: "auto",
    allowSingleCharacterMatch: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function glossaryEntry(id: string, surface: string): GlossaryEntry {
  return {
    id,
    kind: "term",
    description: "",
    forms: [canonicalForm(id, `${id}-form`, surface)],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const entries = [
  glossaryEntry("entry-maid", "メイド"),
  glossaryEntry("entry-reactor", "魔導炉")
];

function renderView(
  overrides: Partial<Parameters<typeof GlossarySidebarView>[0]> = {}
): JSX.Element {
  return GlossarySidebarView({
    state: createLoadedGlossarySidebarState(entries, null),
    highlightedEntryId: null,
    translate,
    onSelectEntry: () => undefined,
    onActivateEntry: () => undefined,
    canCreateEntry: true,
    searchQuery: "",
    createForm: initialGlossaryCreateFormState,
    onChangeSearchQuery: () => undefined,
    onToggleCreateForm: () => undefined,
    onChangeCreateSurface: () => undefined,
    onChangeCreateKind: () => undefined,
    onSubmitCreateForm: () => undefined,
    ...overrides
  });
}

describe("Glossary Navigator search UI", () => {
  it("renders the search input with i18n aria-label and placeholder above the entry list", () => {
    const element = renderView();
    const inputs = collectElements(
      element,
      (child) => child.type === "input" && child.props.type === "search"
    );
    const markup = renderToStaticMarkup(element);

    expect(inputs).toHaveLength(1);
    expect(inputs[0].props["aria-label"]).toBe("glossaryNavigator.search");
    expect(inputs[0].props.placeholder).toBe(
      "glossaryNavigator.searchPlaceholder"
    );
    expect(markup.indexOf("type=\"search\"")).toBeLessThan(
      markup.indexOf("aria-label=\"glossary.entries\"")
    );
  });

  it("reports query changes synchronously without debounce state", () => {
    let observedQuery = "";
    const onChangeSearchQuery = vi.fn((query: string) => {
      observedQuery = query;
    });
    const element = renderView({ onChangeSearchQuery });
    const input = collectElements(
      element,
      (child) => child.type === "input" && child.props.type === "search"
    )[0];

    (input.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "メイド" }
    });

    expect(onChangeSearchQuery).toHaveBeenCalledWith("メイド");
    expect(observedQuery).toBe("メイド");
  });

  it("filters only the Navigator list display for a non-empty query", () => {
    const markup = renderToStaticMarkup(renderView({ searchQuery: "炉" }));

    expect(markup).toContain("魔導炉");
    expect(markup).not.toContain("メイド");
  });

  it("shows the existing glossary empty state for zero entries regardless of query", () => {
    const markup = renderToStaticMarkup(
      renderView({
        state: createLoadedGlossarySidebarState([], null),
        searchQuery: "missing"
      })
    );

    expect(markup).toContain("glossary.empty");
    expect(markup).not.toContain("glossaryNavigator.emptySearchResult");
  });

  it("shows the search empty state when entries exist but no entry matches", () => {
    const markup = renderToStaticMarkup(renderView({ searchQuery: "missing" }));

    expect(markup).toContain("glossaryNavigator.emptySearchResult");
    expect(markup).not.toContain("glossary.empty");
    expect(markup).not.toContain("workspaceSidebarList");
  });

  it("keeps Navigator search out of Preview and Hover Card matching sources", () => {
    const matchingSource = readFileSync(
      "src/renderer/useGlossaryEntriesForMatching.ts",
      "utf8"
    );
    const previewSource = readFileSync(
      "src/renderer/GlossaryPreviewDecorator.tsx",
      "utf8"
    );
    const hoverCardSource = readFileSync(
      "src/renderer/glossaryHoverCardContent.ts",
      "utf8"
    );

    for (const source of [matchingSource, previewSource, hoverCardSource]) {
      expect(source).not.toContain("filterGlossaryEntriesForNavigator");
      expect(source).not.toContain("matchesGlossaryNavigatorSearch");
      expect(source).not.toContain("searchQuery");
    }
  });

  it("does not introduce debounce or timer-based behavior", () => {
    const sidebarSource = readFileSync("src/renderer/GlossarySidebar.tsx", "utf8");
    const searchSource = readFileSync(
      "src/renderer/glossaryNavigatorSearch.ts",
      "utf8"
    );

    for (const source of [sidebarSource, searchSource]) {
      expect(source).not.toMatch(/debounce/i);
      expect(source).not.toContain("setTimeout");
      expect(source).not.toContain("setInterval");
    }
  });
});

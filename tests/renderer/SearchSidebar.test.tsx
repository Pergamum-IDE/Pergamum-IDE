// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDebugLogEvent } = vi.hoisted(() => ({
  mockDebugLogEvent: vi.fn()
}));
vi.mock("../../src/renderer/debugLog", () => ({
  logRendererDebugEvent: mockDebugLogEvent,
  rendererDebugErrorInfo: (error: unknown) =>
    error instanceof Error ? { name: error.name } : {}
}));
import type { Translate } from "../../src/shared/i18n";
import { SearchSidebar } from "../../src/renderer/SearchSidebar";
import type { ProjectTextSearchResult } from "../../src/renderer/projectTextSearch";
import type {
  GlossaryAtomSearchTerm,
  GlossarySearchMatch
} from "../../src/renderer/glossaryAtomSearch";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import type { TextSearchOptions } from "../../src/shared/textSearch";

const translate: Translate = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

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

function render(): void {
  act(() => {
    root.render(React.createElement(SearchSidebar, { translate }));
  });
}

type RunSearchFn = (
  query: string,
  options: TextSearchOptions,
  isCancelled: () => boolean
) => Promise<ProjectTextSearchResult>;

type RunGlossarySearchFn = (
  terms: readonly GlossaryAtomSearchTerm[],
  relationMode: "any" | "all" | "nearby",
  isCancelled: () => boolean
) => Promise<ProjectTextSearchResult>;

interface RenderOptions {
  readonly projectAvailable?: boolean;
  readonly runSearch?: RunSearchFn;
  readonly glossaryEntries?: readonly GlossaryEntry[];
  readonly runGlossarySearch?: RunGlossarySearchFn;
  readonly onOpenMatch?: (
    relativePath: string,
    startOffset: number,
    endOffset: number
  ) => void;
  readonly queryRequest?: { readonly token: number; readonly query: string } | null;
}

function renderWith(props: RenderOptions): void {
  act(() => {
    root.render(React.createElement(SearchSidebar, { translate, ...props }));
  });
}

const ATOM_TIMESTAMP = "2026-09-04T00:00:00.000Z";

function glossaryAtom(
  entryId: string,
  id: string,
  value: string
): GlossaryAtom {
  return {
    id,
    entryId,
    sortOrder: 0,
    value,
    matchFlags: 0,
    createdAt: ATOM_TIMESTAMP,
    updatedAt: ATOM_TIMESTAMP
  };
}

function glossaryEntry(id: string, atoms: GlossaryAtom[]): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atoms.map((atom, index) => ({ ...atom, sortOrder: index })),
    tags: [],
    createdAt: ATOM_TIMESTAMP,
    updatedAt: ATOM_TIMESTAMP
  };
}

const ATOM_ID_JANNE = "018f4b8c-7a2b-7c3d-8e4f-a00000000001";
const ATOM_ID_VALJEAN = "018f4b8c-7a2b-7c3d-8e4f-a00000000002";
const ATOM_ID_MAID = "018f4b8c-7a2b-7c3d-8e4f-a00000000003";

const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  glossaryEntry("e1", [
    glossaryAtom("e1", ATOM_ID_JANNE, "ジャンヌ"),
    glossaryAtom("e1", ATOM_ID_VALJEAN, "ヴァルジャン")
  ]),
  glossaryEntry("e2", [glossaryAtom("e2", ATOM_ID_MAID, "メイド")])
];

function optionToggle(index: number): HTMLButtonElement {
  return container.querySelectorAll<HTMLButtonElement>(".searchOptionToggle")[
    index
  ];
}

function typeQuery(text: string): void {
  const input = container.querySelector<HTMLInputElement>(".searchPaneInput")!;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function bodyText(): string {
  return container.querySelector(".searchPaneBody")?.textContent ?? "";
}

function makeResult(
  partial: Partial<ProjectTextSearchResult> = {}
): ProjectTextSearchResult {
  return {
    query: "q",
    files: [],
    totalMatches: 0,
    fileCount: 0,
    truncated: false,
    skippedFileCount: 0,
    documentCount: 0,
    searchedCharacterCount: 0,
    ...partial
  };
}

const ONE_MATCH_RESULT = makeResult({
  totalMatches: 1,
  fileCount: 1,
  files: [
    {
      relativePath: "chapters/01.md",
      name: "01.md",
      truncated: false,
      matches: [
        {
          startOffset: 10,
          endOffset: 13,
          line: 2,
          column: 4,
          previewText: "abc maid def",
          previewMatchStart: 4,
          previewMatchEnd: 8,
          matchedText: "maid"
        }
      ]
    }
  ]
});

function toggleButtons(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(".searchOptionToggle")
  );
}

describe("SearchSidebar (#384 Phase 1 — Search pane UI foundation)", () => {
  it("renders the header, query input and empty state", () => {
    render();

    expect(
      container.querySelector(".sidebarHeader")?.textContent
    ).toBe("search.sidebarTitle");

    const input = container.querySelector<HTMLInputElement>(".searchPaneInput");
    expect(input).not.toBeNull();
    expect(input!.getAttribute("type")).toBe("search");
    expect(input!.getAttribute("placeholder")).toBe("search.query.placeholder");
    expect(input!.getAttribute("aria-label")).toBe("search.query.label");

    expect(
      container.querySelector(".workspacePlaceholder")?.textContent
    ).toBe("search.emptyResults");
  });

  it("renders the four option toggles in Pergamum order: glossary, whole word, case, regex", () => {
    render();

    expect(toggleButtons().map((b) => b.getAttribute("aria-label"))).toEqual([
      "search.option.glossary",
      "search.option.wholeWord",
      "search.option.caseSensitive",
      "search.option.useRegex"
    ]);
  });

  it("gives every toggle an aria-label, a descriptive title and an inlined, themeable icon", () => {
    render();

    for (const button of toggleButtons()) {
      expect(button.getAttribute("aria-label")).toBeTruthy();
      // The title carries the slightly longer hint text.
      expect(button.getAttribute("title")).toMatch(/\.hint$/);
      expect(button.getAttribute("aria-pressed")).toBe("false");

      const svg = button.querySelector("svg");
      expect(svg).not.toBeNull();
      // Normalised for theme: no hard-coded black fill, no XML prolog.
      expect(button.innerHTML).not.toContain("#000000");
      expect(button.innerHTML).not.toContain("<?xml");
      expect(button.innerHTML).not.toContain("<!DOCTYPE");
      expect(button.innerHTML).toContain("currentColor");
    }
  });

  it("toggles a search option on and off, reflected in aria-pressed / data-pressed", () => {
    render();
    const [glossary] = toggleButtons();

    expect(glossary.getAttribute("aria-pressed")).toBe("false");
    expect(glossary.hasAttribute("data-pressed")).toBe(false);

    act(() => glossary.click());
    expect(glossary.getAttribute("aria-pressed")).toBe("true");
    expect(glossary.getAttribute("data-pressed")).toBe("true");

    act(() => glossary.click());
    expect(glossary.getAttribute("aria-pressed")).toBe("false");
    expect(glossary.hasAttribute("data-pressed")).toBe(false);
  });

  it("keeps the typed query in state (no search runs in Phase 1)", () => {
    render();
    const input = container.querySelector<HTMLInputElement>(".searchPaneInput")!;

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      setter.call(input, "第一章");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(input.value).toBe("第一章");
    // Focus and toggles are independent — a query change flips nothing.
    expect(
      toggleButtons().every((b) => b.getAttribute("aria-pressed") === "false")
    ).toBe(true);
  });

  it("wires the exact search icon assets required by #384", () => {
    const source = readFileSync("src/renderer/SearchSidebar.tsx", "utf8");

    expect(source).toContain(
      "assets/icons/svgrepo/search/vocabulary-svgrepo-com.svg?raw"
    );
    expect(source).toContain("assets/icons/Pergamum/search/word.svg?raw");
    expect(source).toContain(
      "assets/icons/svgrepo/search/case-sensitive-svgrepo-com.svg?raw"
    );
    expect(source).toContain(
      "assets/icons/svgrepo/search/regex-svgrepo-com.svg?raw"
    );
  });
});

describe("SearchSidebar (#384 Phase 2 — project-wide text search)", () => {
  it("does not run a search while no project is open", async () => {
    const runSearch = vi.fn(async () => makeResult());
    renderWith({ projectAvailable: false, runSearch });

    typeQuery("maid");
    await advance(400);

    expect(runSearch).not.toHaveBeenCalled();
    expect(bodyText()).toContain("search.emptyResults");
  });

  it("debounces, shows the searching state, then renders grouped results", async () => {
    let resolveSearch: (value: ProjectTextSearchResult) => void = () => {};
    const runSearch = vi.fn<RunSearchFn>(
      () =>
        new Promise<ProjectTextSearchResult>((resolve) => {
          resolveSearch = resolve;
        })
    );
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("maid");
    // Debounce not elapsed yet: still "searching", runSearch not called.
    expect(bodyText()).toContain("search.searching");
    expect(runSearch).not.toHaveBeenCalled();

    await advance(300);
    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(runSearch.mock.calls[0][0]).toBe("maid");
    expect(runSearch.mock.calls[0][1]).toEqual({
      caseSensitive: false,
      wholeWord: false,
      useRegex: false
    });

    await act(async () => {
      resolveSearch(ONE_MATCH_RESULT);
    });

    expect(bodyText()).toContain("search.summary");
    expect(
      container.querySelector(".searchResultGroupName")?.textContent
    ).toBe("01.md");
    expect(
      container.querySelector(".searchResultGroupPath")?.textContent
    ).toBe("chapters/01.md");
    expect(
      container.querySelector(".searchResultRowLocation")?.textContent
    ).toBe("2:4");
    expect(
      container.querySelector(".searchResultMatch")?.textContent
    ).toBe("maid");
  });

  it("shows the no-results state when the search returns nothing", async () => {
    const runSearch = vi.fn(async () => makeResult({ query: "zzz" }));
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("zzz");
    await advance(300);

    expect(bodyText()).toContain("search.noResults");
  });

  it("passes the match-case toggle through to the search options", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    const caseToggle = container.querySelectorAll<HTMLButtonElement>(
      ".searchOptionToggle"
    )[2];
    act(() => caseToggle.click());

    typeQuery("Maid");
    await advance(300);

    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(runSearch.mock.calls[0][1]).toEqual({
      caseSensitive: true,
      wholeWord: false,
      useRegex: false
    });
  });

  it("discards a stale result when a newer search has started", async () => {
    const deferreds: Array<(value: ProjectTextSearchResult) => void> = [];
    const runSearch = vi.fn(
      () =>
        new Promise<ProjectTextSearchResult>((resolve) => {
          deferreds.push(resolve);
        })
    );
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("aaa");
    await advance(300);
    typeQuery("bbb");
    await advance(300);
    expect(runSearch).toHaveBeenCalledTimes(2);

    const staleResult = makeResult({
      query: "aaa",
      totalMatches: 99,
      fileCount: 9
    });
    await act(async () => {
      deferreds[0](staleResult);
    });
    // The superseded result must not reach the pane.
    expect(bodyText()).not.toContain('"matchCount":99');
    expect(bodyText()).toContain("search.searching");

    await act(async () => {
      deferreds[1](ONE_MATCH_RESULT);
    });
    expect(bodyText()).toContain("search.summary");
  });

  it("reports truncation and skipped-file notices", async () => {
    const runSearch = vi.fn(async () =>
      makeResult({
        totalMatches: 1,
        fileCount: 1,
        truncated: true,
        skippedFileCount: 3,
        files: ONE_MATCH_RESULT.files
      })
    );
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("maid");
    await advance(300);

    expect(bodyText()).toContain("search.truncated");
    expect(bodyText()).toContain("search.skipped");
    expect(bodyText()).toContain('"count":3');
  });

  it("opens the file and selects the match range on a result click", async () => {
    const onOpenMatch = vi.fn();
    const runSearch = vi.fn(async () => ONE_MATCH_RESULT);
    renderWith({ projectAvailable: true, runSearch, onOpenMatch });

    typeQuery("maid");
    await advance(300);

    const row = container.querySelector<HTMLButtonElement>(".searchResultRow")!;
    act(() => row.click());

    expect(onOpenMatch).toHaveBeenCalledWith("chapters/01.md", 10, 13);
  });

  it("shows an error notice when the search rejects", async () => {
    const runSearch = vi.fn(async () => {
      throw new Error("boom");
    });
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("maid");
    await advance(300);

    expect(bodyText()).toContain("search.error");
  });

  it("does not run a text search while glossary mode is on", async () => {
    const runSearch = vi.fn(async () => makeResult());
    renderWith({
      projectAvailable: true,
      runSearch,
      glossaryEntries: GLOSSARY_ENTRIES
    });

    act(() => optionToggle(0).click());

    // The text query box is replaced by the atom picker.
    expect(container.querySelector(".searchPaneInput")).toBeNull();
    expect(container.querySelector(".glossaryAtomSelect")).not.toBeNull();

    await advance(400);
    expect(runSearch).not.toHaveBeenCalled();
    expect(bodyText()).toContain("search.glossary.emptySelection");
  });

  it("runs a regular expression search when the regex toggle is on", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => ONE_MATCH_RESULT);
    renderWith({ projectAvailable: true, runSearch });

    const regexToggle = container.querySelectorAll<HTMLButtonElement>(
      ".searchOptionToggle"
    )[3];
    act(() => regexToggle.click());

    typeQuery("メイド|ジャンヌ");
    await advance(300);

    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(runSearch.mock.calls[0][0]).toBe("メイド|ジャンヌ");
    expect(runSearch.mock.calls[0][1]).toEqual({
      caseSensitive: false,
      wholeWord: false,
      useRegex: true
    });
  });

  it("turning the regex toggle on forces whole-word off and disables it", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    const [, wholeWordToggle, , regexToggle] =
      container.querySelectorAll<HTMLButtonElement>(".searchOptionToggle");

    act(() => wholeWordToggle.click());
    expect(wholeWordToggle.getAttribute("aria-pressed")).toBe("true");
    expect(wholeWordToggle.disabled).toBe(false);

    act(() => regexToggle.click());
    expect(wholeWordToggle.getAttribute("aria-pressed")).toBe("false");
    expect(wholeWordToggle.disabled).toBe(true);
    expect(regexToggle.getAttribute("aria-pressed")).toBe("true");

    // Turning regex back off re-enables the toggle but does not restore it.
    act(() => regexToggle.click());
    expect(wholeWordToggle.disabled).toBe(false);
    expect(wholeWordToggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a validation message and runs nothing for an invalid regex", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    const regexToggle = container.querySelectorAll<HTMLButtonElement>(
      ".searchOptionToggle"
    )[3];
    act(() => regexToggle.click());

    typeQuery("(");
    await advance(400);

    expect(runSearch).not.toHaveBeenCalled();
    expect(bodyText()).toContain("search.invalidRegex");
  });

  it("does not surface a stale result once the pattern becomes invalid", async () => {
    let resolveSearch: (value: ProjectTextSearchResult) => void = () => {};
    const runSearch = vi.fn<RunSearchFn>(
      () =>
        new Promise<ProjectTextSearchResult>((resolve) => {
          resolveSearch = resolve;
        })
    );
    renderWith({ projectAvailable: true, runSearch });

    const regexToggle = container.querySelectorAll<HTMLButtonElement>(
      ".searchOptionToggle"
    )[3];
    act(() => regexToggle.click());

    typeQuery("メイ");
    await advance(300);
    expect(runSearch).toHaveBeenCalledTimes(1);

    // Type on into an invalid pattern before the first search resolves.
    typeQuery("メイ(");
    await advance(300);
    expect(bodyText()).toContain("search.invalidRegex");

    await act(async () => {
      resolveSearch(ONE_MATCH_RESULT);
    });
    // The superseded result must not replace the validation message.
    expect(bodyText()).toContain("search.invalidRegex");
    expect(bodyText()).not.toContain("search.summary");
  });
});

describe("SearchSidebar (#384 — Glossary Atom Search mode)", () => {
  function enterGlossaryMode(): void {
    act(() => optionToggle(0).click());
  }

  function openAtomPicker(): void {
    const trigger = container.querySelector<HTMLButtonElement>(
      ".glossaryAtomSelectTrigger"
    )!;
    act(() => trigger.click());
  }

  function pickAtom(value: string): void {
    const option = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".glossaryAtomSelectOption")
    ).find((button) => button.textContent?.includes(value))!;
    act(() => option.click());
  }

  function optionLabels(): (string | null)[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>(".searchOptionToggle")
    ).map((button) => button.getAttribute("aria-label"));
  }

  it("swaps the Ab / Aa / .* icons for the relation selector in glossary mode", () => {
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      runGlossarySearch: vi.fn<RunGlossarySearchFn>(async () => makeResult()),
      glossaryEntries: GLOSSARY_ENTRIES
    });

    // Text mode: the four option toggles, no relation selector.
    expect(optionLabels()).toEqual([
      "search.option.glossary",
      "search.option.wholeWord",
      "search.option.caseSensitive",
      "search.option.useRegex"
    ]);
    expect(container.querySelector(".glossaryRelationSelect")).toBeNull();

    // Turn on whole word, then enter glossary mode.
    act(() => optionToggle(1).click());
    enterGlossaryMode();

    // Only the glossary toggle remains; the relation selector appears.
    expect(optionLabels()).toEqual(["search.option.glossary"]);
    const relation = container.querySelector<HTMLSelectElement>(
      ".glossaryRelationSelect"
    );
    expect(relation).not.toBeNull();
    expect(relation!.value).toBe("any");

    // Leaving glossary mode brings the toggles back, unpressed.
    enterGlossaryMode();
    expect(optionLabels()).toEqual([
      "search.option.glossary",
      "search.option.wholeWord",
      "search.option.caseSensitive",
      "search.option.useRegex"
    ]);
    expect(optionToggle(1).getAttribute("aria-pressed")).toBe("false");
  });

  it("re-searches with the chosen relation mode", async () => {
    const runGlossarySearch = vi.fn<RunGlossarySearchFn>(async () =>
      makeResult()
    );
    renderWith({
      projectAvailable: true,
      runGlossarySearch,
      glossaryEntries: GLOSSARY_ENTRIES
    });

    enterGlossaryMode();
    openAtomPicker();
    pickAtom("ジャンヌ");
    pickAtom("メイド");
    await advance(300);

    expect(runGlossarySearch).toHaveBeenCalledTimes(1);
    expect(runGlossarySearch.mock.calls[0][1]).toBe("any");

    const relation = container.querySelector<HTMLSelectElement>(
      ".glossaryRelationSelect"
    )!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value"
      )!.set!;
      setter.call(relation, "all");
      relation.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await advance(300);

    expect(runGlossarySearch).toHaveBeenCalledTimes(2);
    expect(runGlossarySearch.mock.calls[1][1]).toBe("all");
  });

  it("emits search.started + search.completed to the debug log on a completed glossary search", async () => {
    mockDebugLogEvent.mockClear();
    const runGlossarySearch = vi.fn<RunGlossarySearchFn>(async () =>
      makeResult({
        totalMatches: 4,
        fileCount: 2,
        documentCount: 9,
        searchedCharacterCount: 123_456
      })
    );
    renderWith({
      projectAvailable: true,
      runGlossarySearch,
      glossaryEntries: GLOSSARY_ENTRIES
    });

    enterGlossaryMode();
    openAtomPicker();
    pickAtom("ジャンヌ");
    await advance(300);

    const events = mockDebugLogEvent.mock.calls.map(
      (args) => args[0] as { event: string; details: Record<string, unknown> }
    );
    const started = events.find((entry) => entry.event === "search.started");
    const completed = events.find((entry) => entry.event === "search.completed");
    expect(started).toBeDefined();
    expect(completed).toBeDefined();

    expect(started!.details).toMatchObject({
      searchMode: "glossary",
      searchRelationMode: "any",
      selectedAtomIds: [ATOM_ID_JANNE],
      selectedAtomCount: 1
    });
    expect(completed!.details).toMatchObject({
      searchMode: "glossary",
      searchRelationMode: "any",
      searchDocumentCount: 9,
      searchedCharacterCount: 123_456,
      searchResultCount: 4,
      searchAppliedToUi: true
    });
    expect(typeof completed!.details.durationMs).toBe("number");
    // One execution → shared searchRunId.
    expect(completed!.details.searchRunId).toBe(started!.details.searchRunId);

    // No query text, atom value, entry label or path anywhere in the records.
    const serialized = JSON.stringify(mockDebugLogEvent.mock.calls);
    for (const needle of ["ジャンヌ", "ヴァルジャン", "メイド", "chapters/"]) {
      expect(serialized).not.toContain(needle);
    }
  });

  it("shows the no-glossary state when the project has no atoms", () => {
    renderWith({
      projectAvailable: true,
      runGlossarySearch: vi.fn<RunGlossarySearchFn>(async () => makeResult()),
      glossaryEntries: []
    });

    enterGlossaryMode();
    expect(bodyText()).toContain("search.glossary.noGlossary");
  });

  it("OR-searches the picked atoms and shows results with an atom badge", async () => {
    const glossaryMatch: GlossarySearchMatch = {
      startOffset: 5,
      endOffset: 9,
      line: 1,
      column: 6,
      previewText: "その ジャンヌ は",
      previewMatchStart: 3,
      previewMatchEnd: 7,
      matchedText: "ジャンヌ",
      glossaryAtomId: "a-janne",
      glossaryAtomValue: "ジャンヌ",
      glossaryEntryId: "e1",
      glossaryEntryLabel: "ジャンヌ・ヴァルジャン"
    };
    const runGlossarySearch = vi.fn<RunGlossarySearchFn>(async () =>
      makeResult({
        totalMatches: 1,
        fileCount: 1,
        files: [
          {
            relativePath: "chapters/01.md",
            name: "01.md",
            truncated: false,
            matches: [glossaryMatch]
          }
        ]
      })
    );

    renderWith({
      projectAvailable: true,
      runGlossarySearch,
      glossaryEntries: GLOSSARY_ENTRIES
    });

    enterGlossaryMode();
    openAtomPicker();
    pickAtom("ジャンヌ");
    pickAtom("ヴァルジャン");

    await advance(300);

    expect(runGlossarySearch).toHaveBeenCalledTimes(1);
    expect(
      runGlossarySearch.mock.calls[0][0].map((term) => term.value)
    ).toEqual(["ジャンヌ", "ヴァルジャン"]);

    expect(bodyText()).toContain("search.summary");
    expect(
      container.querySelector(".searchResultRowAtom")?.textContent
    ).toBe("ジャンヌ");
    expect(container.querySelector(".searchResultMatch")?.textContent).toBe(
      "ジャンヌ"
    );
  });

  it("does not search until at least one atom is picked", async () => {
    const runGlossarySearch = vi.fn<RunGlossarySearchFn>(async () =>
      makeResult()
    );
    renderWith({
      projectAvailable: true,
      runGlossarySearch,
      glossaryEntries: GLOSSARY_ENTRIES
    });

    enterGlossaryMode();
    await advance(400);
    expect(runGlossarySearch).not.toHaveBeenCalled();
    expect(bodyText()).toContain("search.glossary.emptySelection");

    openAtomPicker();
    pickAtom("メイド");
    await advance(300);
    expect(runGlossarySearch).toHaveBeenCalledTimes(1);
  });

  it("removes a picked atom via its chip and re-searches", async () => {
    const runGlossarySearch = vi.fn<RunGlossarySearchFn>(async () =>
      makeResult()
    );
    renderWith({
      projectAvailable: true,
      runGlossarySearch,
      glossaryEntries: GLOSSARY_ENTRIES
    });

    enterGlossaryMode();
    openAtomPicker();
    pickAtom("ジャンヌ");
    await advance(300);
    expect(runGlossarySearch).toHaveBeenCalledTimes(1);

    const removeChip = container.querySelector<HTMLButtonElement>(
      ".glossaryAtomChipRemove"
    )!;
    act(() => removeChip.click());
    await advance(400);

    expect(bodyText()).toContain("search.glossary.emptySelection");
  });
});

describe("SearchSidebar (#384 — delayed loading skeleton)", () => {
  function skeleton(): Element | null {
    return container.querySelector(".searchLoadingSkeleton");
  }

  function deferredRunSearch(): {
    runSearch: ReturnType<typeof vi.fn<RunSearchFn>>;
    resolve: (value: ProjectTextSearchResult) => void;
  } {
    let inner: (value: ProjectTextSearchResult) => void = () => {};
    const runSearch = vi.fn<RunSearchFn>(
      () =>
        new Promise<ProjectTextSearchResult>((r) => {
          inner = r;
        })
    );
    // Stable wrapper so callers resolve the LATEST pending promise.
    return { runSearch, resolve: (value) => inner(value) };
  }

  it("does not show a skeleton for a fast search", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => ONE_MATCH_RESULT);
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("maid");
    // Past the debounce; the mock resolves on the next microtask, well before
    // the 200ms skeleton delay.
    await advance(300);

    expect(skeleton()).toBeNull();
    expect(bodyText()).toContain("search.summary");
  });

  it("shows a skeleton once a slow search runs past the delay, then clears it", async () => {
    const { runSearch, resolve } = deferredRunSearch();
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("maid");
    await advance(300); // debounce elapsed → search running, skeleton armed
    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(skeleton()).toBeNull();

    await advance(250); // past SEARCH_LOADING_SKELETON_DELAY_MS
    const shown = skeleton();
    expect(shown).not.toBeNull();
    expect(shown!.getAttribute("aria-busy")).toBe("true");
    expect(
      container.querySelectorAll(".searchLoadingSkeletonRow").length
    ).toBeGreaterThanOrEqual(3);

    await act(async () => {
      resolve(ONE_MATCH_RESULT);
    });

    expect(skeleton()).toBeNull();
    expect(bodyText()).toContain("search.summary");
  });

  it("does not leave a skeleton behind when a slow search goes stale", async () => {
    const { runSearch, resolve } = deferredRunSearch();
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("maid");
    await advance(300);
    await advance(250);
    expect(skeleton()).not.toBeNull();

    // A newer search supersedes the first; its own debounce has not fired yet.
    typeQuery("maiden");
    await advance(0);
    expect(skeleton()).toBeNull();

    // The stale first search finally resolves — must not resurrect a skeleton
    // or apply its result.
    await act(async () => {
      resolve(ONE_MATCH_RESULT);
    });
    expect(skeleton()).toBeNull();
    expect(bodyText()).toContain("search.searching");
  });

  it("does not show a skeleton during the debounce window", async () => {
    const { runSearch } = deferredRunSearch();
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("maid");
    // Debounce (250ms) not yet elapsed: search has not started, so even well
    // past the 200ms skeleton delay nothing appears.
    await advance(230);
    expect(runSearch).not.toHaveBeenCalled();
    expect(skeleton()).toBeNull();
    expect(bodyText()).toContain("search.searching");
  });
});

describe("SearchSidebar (#384 — Command Palette `%` query request)", () => {
  function searchInput(): HTMLInputElement | null {
    return container.querySelector<HTMLInputElement>(".searchPaneInput");
  }

  it("applies a non-empty request: sets the query, forces text mode, runs the search, focuses the input", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => ONE_MATCH_RESULT);
    renderWith({
      projectAvailable: true,
      runSearch,
      queryRequest: { token: 1, query: "メイド" }
    });

    await advance(0); // focus setTimeout
    expect(searchInput()?.value).toBe("メイド");
    expect(document.activeElement).toBe(searchInput());

    await advance(300); // debounce → search runs
    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(runSearch.mock.calls[0][0]).toBe("メイド");
    expect(runSearch.mock.calls[0][1]).toEqual({
      caseSensitive: false,
      wholeWord: false,
      useRegex: false
    });
  });

  it("switches back from glossary mode and clears its options on a non-empty request", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    const runGlossarySearch = vi.fn<RunGlossarySearchFn>(async () =>
      makeResult()
    );
    renderWith({
      projectAvailable: true,
      runSearch,
      runGlossarySearch,
      glossaryEntries: GLOSSARY_ENTRIES
    });

    // Enter glossary mode + pick a whole-word/regex toggle via the text UI is
    // not possible in glossary mode, so just confirm the mode flip + query.
    act(() => optionToggle(0).click());
    expect(container.querySelector(".glossaryAtomSelect")).not.toBeNull();

    act(() => {
      root.render(
        React.createElement(SearchSidebar, {
          translate,
          projectAvailable: true,
          runSearch,
          runGlossarySearch,
          glossaryEntries: GLOSSARY_ENTRIES,
          queryRequest: { token: 5, query: "ジャンヌ" }
        })
      );
    });
    await advance(0);

    expect(container.querySelector(".glossaryAtomSelect")).toBeNull();
    expect(searchInput()?.value).toBe("ジャンヌ");
  });

  it("an empty request only focuses the input — no query change, no search", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("existing");
    await advance(300);
    runSearch.mockClear();

    act(() => {
      root.render(
        React.createElement(SearchSidebar, {
          translate,
          projectAvailable: true,
          runSearch,
          queryRequest: { token: 2, query: "   " }
        })
      );
    });
    await advance(300);

    expect(searchInput()?.value).toBe("existing");
    expect(document.activeElement).toBe(searchInput());
    expect(runSearch).not.toHaveBeenCalled();
  });

  it("re-applies a request only on a new token", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({
      projectAvailable: true,
      runSearch,
      queryRequest: { token: 1, query: "first" }
    });
    await advance(300);
    expect(searchInput()?.value).toBe("first");

    // Same token, different query object identity — must NOT re-apply.
    act(() => {
      root.render(
        React.createElement(SearchSidebar, {
          translate,
          projectAvailable: true,
          runSearch,
          queryRequest: { token: 1, query: "ignored" }
        })
      );
    });
    typeQuery("edited");
    await advance(300);
    expect(searchInput()?.value).toBe("edited");

    // New token applies.
    act(() => {
      root.render(
        React.createElement(SearchSidebar, {
          translate,
          projectAvailable: true,
          runSearch,
          queryRequest: { token: 2, query: "second" }
        })
      );
    });
    await advance(0);
    expect(searchInput()?.value).toBe("second");
  });
});

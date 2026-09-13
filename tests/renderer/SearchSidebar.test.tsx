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
  readonly onReplaceInOpenDocuments?: (request: {
    findText: string;
    replaceText: string;
    searchOptions: {
      wholeWord: boolean;
      caseSensitive: boolean;
      useRegex: boolean;
    };
  }) => void;
  readonly onReplaceInProject?: () => void;
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
  const input =
    container.querySelector<HTMLTextAreaElement>(".searchPaneInput")!;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
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

    // #386: the header is a Search / Replace tablist, Search selected.
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );
    expect(tabs.map((t) => t.textContent)).toEqual([
      "search.tab.search",
      "search.tab.replace"
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    const input =
      container.querySelector<HTMLTextAreaElement>(".searchPaneInput");
    expect(input).not.toBeNull();
    expect(input!.tagName).toBe("TEXTAREA");
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
    const input =
      container.querySelector<HTMLTextAreaElement>(".searchPaneInput")!;

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
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
    // #424 Slice 2: the icon imports + inlining + <SearchOptionToggle> moved
    // to the shared `searchOptionToggle` module (used by both the Search pane
    // and the active-document Find panel). SearchSidebar consumes them.
    const shared = readFileSync(
      "src/renderer/searchOptionToggle.tsx",
      "utf8"
    );
    const source = readFileSync("src/renderer/SearchSidebar.tsx", "utf8");

    expect(shared).toContain(
      "assets/icons/svgrepo/search/vocabulary-svgrepo-com.svg?raw"
    );
    expect(shared).toContain("assets/icons/codicons/search/whole-word.svg?raw");
    expect(shared).toContain(
      "assets/icons/codicons/search/case-sensitive.svg?raw"
    );
    expect(shared).toContain(
      "assets/icons/codicons/search/regex.svg?raw"
    );
    expect(source).toContain('from "./searchOptionToggle"');
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
  function searchInput(): HTMLTextAreaElement | null {
    return container.querySelector<HTMLTextAreaElement>(".searchPaneInput");
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

describe("SearchSidebar (#386 — Search / Replace tabs)", () => {
  function tab(name: "search.tab.search" | "search.tab.replace"): HTMLButtonElement {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((t) => t.textContent === name)!;
  }
  function replaceInput(): HTMLTextAreaElement | null {
    return container.querySelector<HTMLTextAreaElement>(
      ".searchPaneReplaceInput"
    );
  }
  function replaceButtons(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>(".searchPaneReplaceButton")
    );
  }
  function glossaryToggle(): HTMLButtonElement | undefined {
    return toggleButtons().find(
      (b) => b.getAttribute("aria-label") === "search.option.glossary"
    );
  }
  function goReplace(): void {
    act(() => tab("search.tab.replace").click());
  }
  function goSearch(): void {
    act(() => tab("search.tab.search").click());
  }

  it("defaults to the Search tab and can switch to Replace and back", () => {
    renderWith({ projectAvailable: true, runSearch: vi.fn<RunSearchFn>(async () => makeResult()) });

    expect(tab("search.tab.search").getAttribute("aria-selected")).toBe("true");
    expect(replaceInput()).toBeNull();

    goReplace();
    expect(tab("search.tab.replace").getAttribute("aria-selected")).toBe("true");
    expect(replaceInput()).not.toBeNull();

    goSearch();
    expect(tab("search.tab.search").getAttribute("aria-selected")).toBe("true");
    expect(replaceInput()).toBeNull();
  });

  it("shares the search query across tabs", () => {
    renderWith({ projectAvailable: true, runSearch: vi.fn<RunSearchFn>(async () => makeResult()) });

    typeQuery("メイド");
    goReplace();
    expect(
      container.querySelector<HTMLTextAreaElement>(".searchPaneInput")!.value
    ).toBe("メイド");

    // Change it on the Replace tab.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )!.set!;
    act(() => {
      const el =
        container.querySelector<HTMLTextAreaElement>(".searchPaneInput")!;
      setter.call(el, "ジャンヌ");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    goSearch();
    expect(
      container.querySelector<HTMLTextAreaElement>(".searchPaneInput")!.value
    ).toBe("ジャンヌ");
  });

  it("hides the glossary toggle on the Replace tab and shows it again on Search", () => {
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      runGlossarySearch: vi.fn<RunGlossarySearchFn>(async () => makeResult()),
      glossaryEntries: GLOSSARY_ENTRIES
    });

    expect(glossaryToggle()).toBeDefined();
    goReplace();
    expect(glossaryToggle()).toBeUndefined();
    // Ab / Aa / .* still present.
    expect(
      toggleButtons().map((b) => b.getAttribute("aria-label"))
    ).toEqual([
      "search.option.wholeWord",
      "search.option.caseSensitive",
      "search.option.useRegex"
    ]);
    goSearch();
    expect(glossaryToggle()).toBeDefined();
  });

  it("drops out of glossary mode when the Replace tab is opened", () => {
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      runGlossarySearch: vi.fn<RunGlossarySearchFn>(async () => makeResult()),
      glossaryEntries: GLOSSARY_ENTRIES
    });

    act(() => glossaryToggle()!.click());
    expect(container.querySelector(".glossaryAtomSelect")).not.toBeNull();

    goReplace();
    expect(container.querySelector(".glossaryAtomSelect")).toBeNull();
    expect(container.querySelector(".searchPaneInput")).not.toBeNull();

    // Back on Search: plain text mode, glossary toggle available again.
    goSearch();
    expect(container.querySelector(".glossaryAtomSelect")).toBeNull();
    expect(glossaryToggle()).toBeDefined();
  });

  it("renders the replace-with input and both scope buttons only on the Replace tab", () => {
    renderWith({ projectAvailable: true, runSearch: vi.fn<RunSearchFn>(async () => makeResult()) });

    expect(replaceButtons()).toHaveLength(0);
    goReplace();
    expect(replaceInput()?.getAttribute("placeholder")).toBe(
      "search.replace.replaceWith"
    );
    expect(replaceButtons().map((b) => b.textContent)).toEqual([
      "search.replace.inOpenDocuments",
      "search.replace.inProject"
    ]);
  });

  it("calls onReplaceInOpenDocuments / onReplaceInProject on the button clicks", () => {
    const onReplaceInOpenDocuments = vi.fn();
    const onReplaceInProject = vi.fn();
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      onReplaceInOpenDocuments,
      onReplaceInProject
    });

    goReplace();
    typeQuery("メイド");
    act(() => replaceButtons()[0].click());
    act(() => replaceButtons()[1].click());

    expect(onReplaceInOpenDocuments).toHaveBeenCalledTimes(1);
    expect(onReplaceInProject).toHaveBeenCalledTimes(1);
  });

  it("blocks the replace buttons while the regex pattern is invalid", () => {
    const onReplaceInOpenDocuments = vi.fn();
    const onReplaceInProject = vi.fn();
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      onReplaceInOpenDocuments,
      onReplaceInProject
    });

    goReplace();
    // Turn Regex on (3rd toggle on the replace tab), then type an invalid pattern.
    act(() => toggleButtons()[2].click());
    typeQuery("(");

    for (const button of replaceButtons()) {
      expect(button.disabled).toBe(true);
      act(() => button.click());
    }
    expect(onReplaceInOpenDocuments).not.toHaveBeenCalled();
    expect(onReplaceInProject).not.toHaveBeenCalled();
    expect(
      container.querySelector(".searchPaneReplaceNotice")?.textContent
    ).toBe("search.replace.invalidRegex");
  });

  it("hands the current find text, replace text and options to onReplaceInOpenDocuments (candidates are generated by the host)", () => {
    const onReplaceInOpenDocuments = vi.fn();
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      onReplaceInOpenDocuments
    });

    goReplace();
    typeQuery("  メイド  ");
    const replaceInput = container.querySelector<HTMLTextAreaElement>(
      ".searchPaneReplaceInput"
    )!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )!.set!;
    act(() => {
      setter.call(replaceInput, "使用人");
      replaceInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => replaceButtons()[0].click());

    expect(onReplaceInOpenDocuments).toHaveBeenCalledTimes(1);
    const request = onReplaceInOpenDocuments.mock.calls[0][0] as {
      findText: string;
      replaceText: string;
      searchOptions: {
        wholeWord: boolean;
        caseSensitive: boolean;
        useRegex: boolean;
      };
    };
    // #455: findText is used verbatim - the surrounding spaces are NOT trimmed.
    expect(request.findText).toBe("  メイド  ");
    expect(request.replaceText).toBe("使用人");
    expect(request.searchOptions).toEqual({
      wholeWord: false,
      caseSensitive: false,
      useRegex: false
    });
    // No candidates in the request - the host generates them asynchronously.
    expect(request).not.toHaveProperty("candidates");
  });

  it("carries the active search options through to onReplaceInOpenDocuments", () => {
    const onReplaceInOpenDocuments = vi.fn();
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      onReplaceInOpenDocuments
    });

    goReplace();
    typeQuery("メイド");
    // Match Case is the 2nd toggle on the replace tab.
    act(() => toggleButtons()[1].click());
    act(() => replaceButtons()[0].click());

    const request = onReplaceInOpenDocuments.mock.calls[0][0] as {
      searchOptions: {
        wholeWord: boolean;
        caseSensitive: boolean;
        useRegex: boolean;
      };
    };
    expect(request.searchOptions).toEqual({
      wholeWord: false,
      caseSensitive: true,
      useRegex: false
    });
  });

  it("fires onReplaceInOpenDocuments synchronously and never disables the button (the host opens the dialog immediately)", () => {
    const onReplaceInOpenDocuments = vi.fn();
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      onReplaceInOpenDocuments
    });

    goReplace();
    typeQuery("メイド");

    expect(replaceButtons()[0].disabled).toBe(false);
    act(() => replaceButtons()[0].click());
    expect(onReplaceInOpenDocuments).toHaveBeenCalledTimes(1);
    expect(replaceButtons()[0].disabled).toBe(false);
  });
});

describe("SearchSidebar (#455 — multiline Project Search / Replace fields)", () => {
  function queryField(): HTMLTextAreaElement {
    return container.querySelector<HTMLTextAreaElement>(".searchPaneInput")!;
  }
  function replaceField(): HTMLTextAreaElement {
    return container.querySelector<HTMLTextAreaElement>(
      ".searchPaneReplaceInput"
    )!;
  }
  function goReplace(): void {
    act(() =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      )
        .find((t) => t.textContent === "search.tab.replace")!
        .click()
    );
  }

  it("renders the query field as a textarea, not an <input>", () => {
    renderWith({ projectAvailable: true, runSearch: vi.fn<RunSearchFn>(async () => makeResult()) });
    expect(queryField().tagName).toBe("TEXTAREA");
  });

  it("accepts and preserves a multiline query value", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("foo\nbar");
    expect(queryField().value).toBe("foo\nbar");

    await advance(300);
    expect(runSearch).toHaveBeenCalledTimes(1);
    // The RAW multiline query reaches runSearch untouched.
    expect(runSearch.mock.calls[0][0]).toBe("foo\nbar");
  });

  it("preserves leading/trailing spaces and newlines in the actual query used for search", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    typeQuery(" foo\nbar ");
    await advance(300);

    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(runSearch.mock.calls[0][0]).toBe(" foo\nbar ");
  });

  it("treats a newline/whitespace-only query as empty — runs nothing", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("\n\n");
    await advance(400);

    expect(runSearch).not.toHaveBeenCalled();
    expect(bodyText()).toContain("search.emptyResults");
  });

  it("treats a non-blank multiline query as valid — not empty", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    typeQuery("\nfoo\n");
    await advance(300);

    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(runSearch.mock.calls[0][0]).toBe("\nfoo\n");
  });

  it("hands multiline find text and multiline replacement text through verbatim, untrimmed", () => {
    const onReplaceInOpenDocuments = vi.fn();
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult()),
      onReplaceInOpenDocuments
    });

    goReplace();
    typeQuery("foo\nbar");

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )!.set!;
    act(() => {
      const field = replaceField();
      setter.call(field, " baz\nqux ");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".searchPaneReplaceButton")
    )[0];
    act(() => button.click());

    const request = onReplaceInOpenDocuments.mock.calls[0][0] as {
      findText: string;
      replaceText: string;
    };
    expect(request.findText).toBe("foo\nbar");
    // Leading/trailing spaces and newlines in the replacement are kept exactly.
    expect(request.replaceText).toBe(" baz\nqux ");
  });

  it("gives the query and replace-with fields a white background matching other search boxes", () => {
    // Styles are not loaded into happy-dom, so this is a source-inspection
    // check (matches the convention used elsewhere, e.g. lineEndMarkerColors).
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const start = styles.indexOf(".searchPaneInput {");
    expect(start).toBeGreaterThan(-1);
    const end = styles.indexOf("}", start);
    const rule = styles.slice(start, end + 1);

    expect(rule).toContain("background: #ffffff");
    expect(rule).toContain("color: #1f2733");
  });

  it("Shift+Enter (and plain Enter) insert a newline rather than submitting anything", () => {
    renderWith({ projectAvailable: true, runSearch: vi.fn<RunSearchFn>(async () => makeResult()) });
    const field = queryField();

    // No onKeyDown handler intercepts Enter — the browser's default textarea
    // behaviour (insert "\n" into the value) is left in place. This is the
    // smallest change that satisfies "a clear way to insert newlines": there
    // was no pre-existing Enter-triggers-search binding on this field to
    // preserve or conflict with.
    let prevented = false;
    field.addEventListener("keydown", (event) => {
      prevented = (event as KeyboardEvent).defaultPrevented;
    });
    act(() => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
          cancelable: true
        })
      );
    });
    expect(prevented).toBe(false);
  });
});

describe("SearchSidebar (#455 UI addendum — header row layout, tab styling, placeholder)", () => {
  function headerRow(): HTMLElement {
    return container.querySelector<HTMLElement>(".searchPaneHeaderRow")!;
  }
  function inputRow(): HTMLElement {
    return container.querySelector<HTMLElement>(".searchPaneInputRow")!;
  }
  function tabsContainer(): HTMLElement {
    return container.querySelector<HTMLElement>(".searchPaneTabs")!;
  }
  function optionsContainer(): HTMLElement {
    return container.querySelector<HTMLElement>(".searchPaneOptions")!;
  }
  function goReplace(): void {
    act(() =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      )
        .find((t) => t.textContent === "search.tab.replace")!
        .click()
    );
  }

  it("moves the option controls out of the input row and into the tab header row", () => {
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult())
    });

    // Options now live alongside the tabs in the header row...
    expect(headerRow().contains(tabsContainer())).toBe(true);
    expect(headerRow().contains(optionsContainer())).toBe(true);
    // ...and no longer share the input row with the query textarea.
    expect(inputRow().querySelector(".searchPaneOptions")).toBeNull();
  });

  it("gives the query textarea the full width of the input row (options no longer share it)", () => {
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult())
    });

    expect(inputRow().children).toHaveLength(1);
    expect(inputRow().firstElementChild!.className).toContain(
      "searchPaneInput"
    );
  });

  it("keeps every search option present and functional after the move", async () => {
    const runSearch = vi.fn<RunSearchFn>(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    expect(
      toggleButtons().map((b) => b.getAttribute("aria-label"))
    ).toEqual([
      "search.option.glossary",
      "search.option.wholeWord",
      "search.option.caseSensitive",
      "search.option.useRegex"
    ]);

    const [, wholeWordToggle, , regexToggle] = toggleButtons();
    act(() => wholeWordToggle.click());
    act(() => regexToggle.click());
    typeQuery("メイド");
    await advance(300);

    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(runSearch.mock.calls[0][1]).toEqual({
      caseSensitive: false,
      wholeWord: false, // forced off by regex, as before the move
      useRegex: true
    });
  });

  it("gives the Search / Replace tabs a folder-tab look with a clear active state", () => {
    // Styles are not loaded into happy-dom, so this is a source-inspection
    // check for the visual rule (matches the convention used elsewhere).
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const activeStart = styles.indexOf('.searchPaneTab[data-active="true"] {');
    expect(activeStart).toBeGreaterThan(-1);
    const activeEnd = styles.indexOf("}", activeStart);
    const activeRule = styles.slice(activeStart, activeEnd + 1);

    expect(activeRule).toContain("background: #ffffff");
    expect(activeRule).toContain("color: #1f2733");
  });

  it("marks the active/inactive tab clearly via aria-selected and data-active", () => {
    renderWith({
      projectAvailable: true,
      runSearch: vi.fn<RunSearchFn>(async () => makeResult())
    });
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );

    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].getAttribute("data-active")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].hasAttribute("data-active")).toBe(false);

    goReplace();
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("data-active")).toBe("true");
  });

  it("uses the 検索語句 i18n text for the Project Search placeholder (shared with Active Find's wording)", () => {
    const ja = readFileSync("src/shared/i18n/ja.ts", "utf8");
    expect(ja).toContain('"search.query.placeholder": "検索語句"');
    // Not hard-coded in the component — driven through translate().
    const source = readFileSync("src/renderer/SearchSidebar.tsx", "utf8");
    expect(source).not.toContain('"検索語句"');
    expect(source).toContain('translate("search.query.placeholder")');
  });

  it("keeps the Replace-with placeholder terminology consistent with Active Find (置換語句)", () => {
    const ja = readFileSync("src/shared/i18n/ja.ts", "utf8");
    expect(ja).toContain('"search.replace.replaceWith": "置換語句"');
  });
});

// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import { SearchSidebar } from "../../src/renderer/SearchSidebar";
import type { ProjectTextSearchResult } from "../../src/renderer/projectTextSearch";
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

interface RenderOptions {
  readonly projectAvailable?: boolean;
  readonly runSearch?: RunSearchFn;
  readonly onOpenMatch?: (
    relativePath: string,
    startOffset: number,
    endOffset: number
  ) => void;
}

function renderWith(props: RenderOptions): void {
  act(() => {
    root.render(React.createElement(SearchSidebar, { translate, ...props }));
  });
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
      wholeWord: false
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
      wholeWord: false
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

  it("does not run a text search while the glossary toggle is on", async () => {
    const runSearch = vi.fn(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    const glossaryToggle = container.querySelectorAll<HTMLButtonElement>(
      ".searchOptionToggle"
    )[0];
    act(() => glossaryToggle.click());

    typeQuery("maid");
    await advance(400);

    expect(runSearch).not.toHaveBeenCalled();
    expect(bodyText()).toContain("search.notImplemented.glossary");
  });

  it("does not run a text search while the regex toggle is on", async () => {
    const runSearch = vi.fn(async () => makeResult());
    renderWith({ projectAvailable: true, runSearch });

    const regexToggle = container.querySelectorAll<HTMLButtonElement>(
      ".searchOptionToggle"
    )[3];
    act(() => regexToggle.click());

    typeQuery("maid");
    await advance(400);

    expect(runSearch).not.toHaveBeenCalled();
    expect(bodyText()).toContain("search.notImplemented.regex");
  });
});

import { describe, expect, it } from "vitest";
import type { EditorId } from "../../src/shared/editorId";
import type { MarkdownHeadingSearchCandidate } from "../../src/renderer/markdownOutlineIndex";
import {
  DEFAULT_MAX_HEADING_JUMP_CANDIDATES,
  filterCommandPaletteHeadingJumpCandidates,
  resolveHeadingJumpFooterModel,
  resolveHeadingJumpSelection,
  type CommandPaletteHeadingJumpCandidate
} from "../../src/renderer/commandPaletteHeadingJump";

const editorId: EditorId = {
  kind: "projectDocument",
  relativePath: "chapter01.md",
  rootPath: "C:\\Novel"
} as unknown as EditorId;

function heading(
  overrides: Partial<MarkdownHeadingSearchCandidate> = {}
): MarkdownHeadingSearchCandidate {
  return {
    id: `k::${overrides.headingId ?? "0:h"}`,
    editorId,
    editorKey: "k",
    headingId: "0:h",
    level: 3,
    text: "見出し 3です",
    lineNumber: 0,
    from: 0,
    to: 10,
    documentTitle: "chapter01.md",
    documentPath: "manuscripts/chapter01.md",
    documentKind: "project",
    bodyPreview: null,
    ...overrides
  };
}

describe("filterCommandPaletteHeadingJumpCandidates (#141)", () => {
  it("prefix-matches heading text (marker excluded) and marks the matched range", () => {
    const [candidate] = filterCommandPaletteHeadingJumpCandidates({
      candidates: [heading()],
      query: "見出し"
    });

    expect(candidate.marker).toBe("###");
    expect(candidate.text).toBe("見出し 3です");
    expect(candidate.matchRanges).toEqual([{ start: 0, end: 3 }]);
  });

  it("does not match on the heading marker", () => {
    expect(
      filterCommandPaletteHeadingJumpCandidates({
        candidates: [heading()],
        query: "###"
      })
    ).toHaveLength(0);
  });

  it("is prefix-only — no substring / subsequence / fuzzy", () => {
    const candidates = [heading({ text: "第一章 序" })];

    expect(
      filterCommandPaletteHeadingJumpCandidates({ candidates, query: "序" })
    ).toHaveLength(0);
    expect(
      filterCommandPaletteHeadingJumpCandidates({ candidates, query: "第一" })
    ).toHaveLength(1);
  });

  it("lists every candidate (no ranges) for an empty query", () => {
    const result = filterCommandPaletteHeadingJumpCandidates({
      candidates: [heading({ headingId: "a" }), heading({ headingId: "b" })],
      query: ""
    });

    expect(result).toHaveLength(2);
    expect(result.every((c) => c.matchRanges.length === 0)).toBe(true);
  });

  it("caps the rendered list", () => {
    const many = Array.from({ length: 120 }, (_unused, index) =>
      heading({ headingId: `h${index}`, text: `Item ${index}` })
    );

    expect(
      filterCommandPaletteHeadingJumpCandidates({ candidates: many, query: "" })
    ).toHaveLength(DEFAULT_MAX_HEADING_JUMP_CANDIDATES);
    expect(
      filterCommandPaletteHeadingJumpCandidates({
        candidates: many,
        query: "",
        limit: 3
      })
    ).toHaveLength(3);
  });

  it("builds the row-2 label: `/`-prefixed project-relative path, or the external/untitled path normalized to `/`", () => {
    const project = filterCommandPaletteHeadingJumpCandidates({
      candidates: [
        heading({
          documentKind: "project",
          documentPath: "manuscripts\\part1\\chapter01.md"
        })
      ],
      query: ""
    })[0];
    const external = filterCommandPaletteHeadingJumpCandidates({
      candidates: [
        heading({
          documentKind: "external",
          documentPath: "C:\\Outside\\notes.md"
        })
      ],
      query: ""
    })[0];
    const untitled = filterCommandPaletteHeadingJumpCandidates({
      candidates: [
        heading({
          documentKind: "untitled",
          documentPath: null,
          documentTitle: "Untitled-1"
        })
      ],
      query: ""
    })[0];

    expect(project.documentPathLabel).toBe(
      "/manuscripts/part1/chapter01.md"
    );
    expect(external.documentPathLabel).toBe("C:/Outside/notes.md");
    expect(untitled.documentPathLabel).toBe("Untitled-1");
  });
});

describe("resolveHeadingJumpSelection (#141)", () => {
  const list = [
    { id: "a" },
    { id: "b" }
  ] as unknown as CommandPaletteHeadingJumpCandidate[];

  it("selects the first row for a fresh list, keeps a valid index, clamps a stale one", () => {
    expect(resolveHeadingJumpSelection(list)).toBe(0);
    expect(resolveHeadingJumpSelection(list, 1)).toBe(1);
    expect(resolveHeadingJumpSelection(list, 9)).toBe(0);
    expect(resolveHeadingJumpSelection([], 0)).toBeNull();
  });
});

describe("resolveHeadingJumpFooterModel (#141)", () => {
  function candidate(
    bodyPreview: string | null
  ): CommandPaletteHeadingJumpCandidate {
    return {
      id: "k::0:h",
      documentKey: "k",
      editorId,
      headingId: "0:h",
      level: 2,
      text: "節",
      lineNumber: 3,
      from: 20,
      marker: "##",
      documentPathLabel: "/a.md",
      matchRanges: [],
      bodyPreview
    };
  }

  it("rides the #370/#372 footer detail channel with a candidate-keyed reset key", () => {
    expect(
      resolveHeadingJumpFooterModel({
        activeCandidate: candidate("本文が始まる。"),
        detailEnabled: true
      })
    ).toEqual({
      statusKey: null,
      detailText: "本文が始まる。",
      detailResetKey: "headingJumpPreview:k::0:h",
      canRunSelected: true
    });
  });

  it("shows no detail when footer detail is disabled, there is no preview, or nothing is selected", () => {
    expect(
      resolveHeadingJumpFooterModel({
        activeCandidate: candidate("body"),
        detailEnabled: false
      })
    ).toEqual({ statusKey: null, canRunSelected: true });
    expect(
      resolveHeadingJumpFooterModel({
        activeCandidate: candidate(null),
        detailEnabled: true
      })
    ).toEqual({ statusKey: null, canRunSelected: true });
    expect(
      resolveHeadingJumpFooterModel({
        activeCandidate: null,
        detailEnabled: true
      })
    ).toEqual({ statusKey: null, canRunSelected: false });
  });
});

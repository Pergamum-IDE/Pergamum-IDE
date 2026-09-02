import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  GlossaryAtomFlags,
  GlossaryBoundaryPolicy,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import {
  createUntitledEditorId,
  type EditorId
} from "../../src/shared/editorId";
import {
  findGlossaryEntryOccurrences,
  planGlossaryOccurrenceNavigation,
  type GlossaryOccurrenceCursor
} from "../../src/renderer/glossaryOccurrenceNavigation";

const timestamp = "2026-08-14T00:00:00.000Z";
const maidEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";

const CHECK_BOTH = setGlossaryAtomBoundaryEndPolicy(
  setGlossaryAtomBoundaryStartPolicy(0, GlossaryBoundaryPolicy.Auto),
  GlossaryBoundaryPolicy.Auto
);

function glossaryEntry(
  id: string,
  atomSpecs: Array<string | [string, number]>
): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atomSpecs.map((spec, index) => {
      const [value, matchFlags] =
        typeof spec === "string" ? [spec, CHECK_BOTH] : spec;
      return {
        id: `${id}-atom-${index}`,
        entryId: id,
        sortOrder: index,
        value,
        matchFlags,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    }),
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const maidEntry = glossaryEntry(maidEntryId, ["メイド"]);

const documentEditorId: EditorId = createUntitledEditorId(1);
const otherDocumentEditorId: EditorId = createUntitledEditorId(2);

describe("findGlossaryEntryOccurrences", () => {
  it("selects only the surface, excluding surrounding Markdown syntax such as **", () => {
    const occurrences = findGlossaryEntryOccurrences(
      "**メイド**が控えている",
      maidEntry
    );

    expect(occurrences).toHaveLength(1);
    const [occurrence] = occurrences;

    expect(
      "**メイド**が控えている".slice(occurrence.start, occurrence.end)
    ).toBe("メイド");
  });

  it("does not merge Markdown syntax spanning across the surface", () => {
    const occurrences = findGlossaryEntryOccurrences(
      "*オーダ*ーメイドの品",
      glossaryEntry(maidEntryId, ["オーダ"])
    );

    expect(occurrences).toHaveLength(1);
    const [occurrence] = occurrences;

    expect(occurrence.start).toBe(1);
    expect(occurrence.end).toBe(4);
  });

  it("returns occurrences in document order", () => {
    const text = "メイドが来た。もう一人のメイドも来た。";
    const occurrences = findGlossaryEntryOccurrences(text, maidEntry);

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].start).toBeLessThan(occurrences[1].start);
    expect(text.slice(occurrences[0].start, occurrences[0].end)).toBe(
      "メイド"
    );
    expect(text.slice(occurrences[1].start, occurrences[1].end)).toBe(
      "メイド"
    );
  });

  it("finds occurrences from every atom value of the same saved entry", () => {
    const entry = glossaryEntry(maidEntryId, ["メイド", "女中", "メイドさん"]);

    const occurrences = findGlossaryEntryOccurrences(
      "女中が控えている。メイドさんが呼んでいる。",
      entry
    );

    expect(occurrences).toHaveLength(2);
  });

  it("reuses the real boundary resolver, rejecting a Katakana-continuation match", () => {
    const occurrences = findGlossaryEntryOccurrences(
      "オーダーメイドの品を受け取った。",
      maidEntry
    );

    expect(occurrences).toHaveLength(0);
  });

  it("reuses the real boundary resolver, accepting the same surface after a Hiragana particle", () => {
    const text = "メイドさんはオーダーメイドの品を受け取った。";
    const occurrences = findGlossaryEntryOccurrences(text, maidEntry);

    expect(occurrences).toHaveLength(1);
    expect(text.slice(occurrences[0].start, occurrences[0].end)).toBe(
      "メイド"
    );
  });

  it("returns an empty array when there are no occurrences", () => {
    expect(findGlossaryEntryOccurrences("誰もいない部屋。", maidEntry)).toEqual(
      []
    );
  });

  it("finds an opted-in one-character kanji form, but not inside a compound (#365)", () => {
    const eclipseEntryId = "018f4b8c-7a2b-7c3d-8e4f-1000000000c1";
    const text = "蝕の時が来た。腐蝕した銅板。";

    const defaultEntry = glossaryEntry(eclipseEntryId, ["蝕"]);
    expect(findGlossaryEntryOccurrences(text, defaultEntry)).toEqual([]);

    const optedInEntry = glossaryEntry(eclipseEntryId, [
      ["蝕", GlossaryAtomFlags.AllowSingleCharacterMatch]
    ]);
    const occurrences = findGlossaryEntryOccurrences(text, optedInEntry);
    expect(
      occurrences.map((range) => text.slice(range.start, range.end))
    ).toEqual(["蝕"]);
    // the sole match is the standalone 蝕 before の, not the one in 腐蝕
    expect(occurrences[0].start).toBe(0);
  });
});

describe("planGlossaryOccurrenceNavigation", () => {
  it("does not compute occurrences and reports noTargetDocument when there is no target document", () => {
    const outcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument: null,
      direction: "next",
      currentCursor: null
    });

    expect(outcome).toEqual({ kind: "noTargetDocument" });
  });

  it("reports noOccurrences when the target document has no matches", () => {
    const outcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument: {
        editorId: documentEditorId,
        content: "誰もいない部屋。"
      },
      direction: "next",
      currentCursor: null
    });

    expect(outcome).toEqual({ kind: "noOccurrences" });
  });

  it("without an anchor, next resolves to the first occurrence and previous resolves to the last", () => {
    const text = "メイドが来た。もう一人のメイドも来た。もう一人来た、メイドだ。";
    const targetDocument = { editorId: documentEditorId, content: text };

    const nextOutcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "next",
      currentCursor: null
    });
    const previousOutcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "previous",
      currentCursor: null
    });

    expect(nextOutcome.kind).toBe("navigated");
    expect(previousOutcome.kind).toBe("navigated");
    if (nextOutcome.kind !== "navigated" || previousOutcome.kind !== "navigated") {
      throw new Error("expected navigated outcomes");
    }

    expect(nextOutcome.cursor.index).toBe(0);
    expect(previousOutcome.cursor.index).toBe(2);
  });

  it("wraps from the last occurrence to the first when moving next", () => {
    const text = "メイドが来た。もう一人のメイドも来た。";
    const targetDocument = { editorId: documentEditorId, content: text };
    const cursorAtLast: GlossaryOccurrenceCursor = {
      entryId: maidEntryId,
      documentEditorId,
      index: 1
    };

    const outcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "next",
      currentCursor: cursorAtLast
    });

    expect(outcome.kind).toBe("navigated");
    if (outcome.kind !== "navigated") {
      throw new Error("expected navigated outcome");
    }
    expect(outcome.cursor.index).toBe(0);
  });

  it("wraps from the first occurrence to the last when moving previous", () => {
    const text = "メイドが来た。もう一人のメイドも来た。";
    const targetDocument = { editorId: documentEditorId, content: text };
    const cursorAtFirst: GlossaryOccurrenceCursor = {
      entryId: maidEntryId,
      documentEditorId,
      index: 0
    };

    const outcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "previous",
      currentCursor: cursorAtFirst
    });

    expect(outcome.kind).toBe("navigated");
    if (outcome.kind !== "navigated") {
      throw new Error("expected navigated outcome");
    }
    expect(outcome.cursor.index).toBe(1);
  });

  it("keeps a single occurrence selected for both next and previous", () => {
    const text = "メイドが来た。";
    const targetDocument = { editorId: documentEditorId, content: text };
    const cursorAtOnly: GlossaryOccurrenceCursor = {
      entryId: maidEntryId,
      documentEditorId,
      index: 0
    };

    const nextOutcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "next",
      currentCursor: cursorAtOnly
    });
    const previousOutcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "previous",
      currentCursor: cursorAtOnly
    });

    expect(nextOutcome).toEqual(previousOutcome);
    if (nextOutcome.kind !== "navigated") {
      throw new Error("expected navigated outcome");
    }
    expect(nextOutcome.cursor.index).toBe(0);
  });

  it("ignores a cursor from a different entry, treating it as a fresh start", () => {
    const text = "メイドが来た。もう一人のメイドも来た。";
    const targetDocument = { editorId: documentEditorId, content: text };
    const cursorFromAnotherEntry: GlossaryOccurrenceCursor = {
      entryId: "018f4b8c-7a2b-7c3d-8e4f-999999999999",
      documentEditorId,
      index: 1
    };

    const outcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "next",
      currentCursor: cursorFromAnotherEntry
    });

    expect(outcome.kind).toBe("navigated");
    if (outcome.kind !== "navigated") {
      throw new Error("expected navigated outcome");
    }
    expect(outcome.cursor.index).toBe(0);
  });

  it("ignores a cursor from a different target document, treating it as a fresh start", () => {
    const text = "メイドが来た。もう一人のメイドも来た。";
    const targetDocument = { editorId: documentEditorId, content: text };
    const cursorFromAnotherDocument: GlossaryOccurrenceCursor = {
      entryId: maidEntryId,
      documentEditorId: otherDocumentEditorId,
      index: 1
    };

    const outcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "previous",
      currentCursor: cursorFromAnotherDocument
    });

    expect(outcome.kind).toBe("navigated");
    if (outcome.kind !== "navigated") {
      throw new Error("expected navigated outcome");
    }
    expect(outcome.cursor.index).toBe(1);
  });

  it("ignores a stale out-of-range cursor index, treating it as a fresh start", () => {
    const text = "メイドが来た。";
    const targetDocument = { editorId: documentEditorId, content: text };
    const staleCursor: GlossaryOccurrenceCursor = {
      entryId: maidEntryId,
      documentEditorId,
      index: 5
    };

    const outcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument,
      direction: "next",
      currentCursor: staleCursor
    });

    expect(outcome.kind).toBe("navigated");
    if (outcome.kind !== "navigated") {
      throw new Error("expected navigated outcome");
    }
    expect(outcome.cursor.index).toBe(0);
  });

  it("never sets a status field or otherwise signals success/wrapped notices on the navigated outcome", () => {
    const outcome = planGlossaryOccurrenceNavigation({
      entry: maidEntry,
      targetDocument: {
        editorId: documentEditorId,
        content: "メイドが来た。"
      },
      direction: "next",
      currentCursor: null
    });

    expect(Object.keys(outcome).sort()).toEqual(["cursor", "kind", "range"]);
  });
});

describe("glossary occurrence navigation naming", () => {
  it("uses previous/next terminology internally, not left/right", () => {
    const source = readFileSync(
      "src/renderer/glossaryOccurrenceNavigation.ts",
      "utf8"
    );

    expect(source.toLowerCase()).not.toMatch(/\bleft\b/);
    expect(source.toLowerCase()).not.toMatch(/\bright\b/);
    expect(source).not.toContain("goLeft");
    expect(source).not.toContain("goRight");
  });
});

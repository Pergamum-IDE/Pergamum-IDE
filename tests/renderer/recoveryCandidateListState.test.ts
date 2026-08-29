import { describe, expect, it } from "vitest";
import type { RecoveryCandidate } from "../../src/shared/recoveryCandidate";
import {
  nextRecoverySortState,
  pruneRecoverySelection,
  RECOVERY_INITIAL_SORT,
  recoveryHeaderCheckboxState,
  recoverySortIndicator,
  sortRecoveryCandidates,
  toggleRecoveryHeaderCheckbox,
  toggleRecoveryRowSelection
} from "../../src/renderer/recovery/recoveryCandidateListState";

function candidate(
  overrides: Partial<RecoveryCandidate> = {}
): RecoveryCandidate {
  return {
    recoveryId: "id-a",
    documentType: "markdown.file",
    displayName: "b.md",
    documentEncoding: "utf-8",
    documentLineend: "lf",
    updatedAt: "2026-08-29T12:00:00.000Z",
    characterCount: 100,
    previewSnippet: "hello",
    hasFilePath: true,
    hasProjectFilePath: false,
    ...overrides
  };
}

const rows: RecoveryCandidate[] = [
  candidate({ recoveryId: "id-1", displayName: "chapter-02.md", updatedAt: "2026-08-29T12:39:00.000Z", characterCount: 500, documentType: "markdown.file" }),
  candidate({ recoveryId: "id-2", displayName: "Untitled.md", updatedAt: "2026-08-29T12:41:00.000Z", characterCount: 80, documentType: "markdown.untitled" }),
  candidate({ recoveryId: "id-3", displayName: "chapter-01.md", updatedAt: "2026-08-29T12:40:00.000Z", characterCount: 500, documentType: "markdown.file" })
];

describe("recovery sort state", () => {
  it("initial sort is updatedAt descending", () => {
    expect(RECOVERY_INITIAL_SORT).toEqual({ key: "updatedAt", direction: "desc" });
  });

  it("re-clicking the active header toggles direction; another header switches key ascending", () => {
    let s = RECOVERY_INITIAL_SORT;
    s = nextRecoverySortState(s, "updatedAt");
    expect(s).toEqual({ key: "updatedAt", direction: "asc" });
    s = nextRecoverySortState(s, "displayName");
    expect(s).toEqual({ key: "displayName", direction: "asc" });
    s = nextRecoverySortState(s, "displayName");
    expect(s).toEqual({ key: "displayName", direction: "desc" });
  });

  it("shows ▲ / ▼ only on the active header", () => {
    const s = { key: "displayName", direction: "asc" } as const;
    expect(recoverySortIndicator(s, "displayName")).toBe("▲");
    expect(recoverySortIndicator(s, "updatedAt")).toBeNull();
    expect(
      recoverySortIndicator({ key: "updatedAt", direction: "desc" }, "updatedAt")
    ).toBe("▼");
  });
});

describe("sortRecoveryCandidates", () => {
  it("sorts by updatedAt desc (initial) — newest first", () => {
    expect(
      sortRecoveryCandidates(rows, RECOVERY_INITIAL_SORT).map((r) => r.recoveryId)
    ).toEqual(["id-2", "id-3", "id-1"]);
  });

  it("sorts by displayName asc/desc (locale-aware, case-insensitive)", () => {
    expect(
      sortRecoveryCandidates(rows, { key: "displayName", direction: "asc" }).map(
        (r) => r.displayName
      )
    ).toEqual(["chapter-01.md", "chapter-02.md", "Untitled.md"]);
    expect(
      sortRecoveryCandidates(rows, {
        key: "displayName",
        direction: "desc"
      }).map((r) => r.displayName)
    ).toEqual(["Untitled.md", "chapter-02.md", "chapter-01.md"]);
  });

  it("breaks ties by recoveryId for a stable order", () => {
    // id-1 and id-3 both have characterCount 500.
    expect(
      sortRecoveryCandidates(rows, {
        key: "characterCount",
        direction: "asc"
      }).map((r) => r.recoveryId)
    ).toEqual(["id-2", "id-1", "id-3"]);
  });

  it("does not mutate the input", () => {
    const copy = [...rows];
    sortRecoveryCandidates(rows, { key: "documentType", direction: "asc" });
    expect(rows).toEqual(copy);
  });
});

describe("header checkbox", () => {
  const listed = ["id-1", "id-2", "id-3"];

  it("is unchecked / indeterminate / checked by selection coverage", () => {
    expect(recoveryHeaderCheckboxState(new Set(), listed)).toBe("unchecked");
    expect(recoveryHeaderCheckboxState(new Set(["id-2"]), listed)).toBe(
      "indeterminate"
    );
    expect(recoveryHeaderCheckboxState(new Set(listed), listed)).toBe("checked");
    expect(recoveryHeaderCheckboxState(new Set(), [])).toBe("unchecked");
  });

  it("selects all listed rows from unchecked or indeterminate, clears from checked", () => {
    expect([
      ...toggleRecoveryHeaderCheckbox(new Set(), listed)
    ].sort()).toEqual(listed);
    expect([
      ...toggleRecoveryHeaderCheckbox(new Set(["id-1"]), listed)
    ].sort()).toEqual(listed);
    expect(
      toggleRecoveryHeaderCheckbox(new Set(listed), listed).size
    ).toBe(0);
  });
});

describe("selection helpers keyed by recoveryId", () => {
  it("toggles a row in / out of the selection", () => {
    let sel: ReadonlySet<string> = new Set();
    sel = toggleRecoveryRowSelection(sel, "id-2");
    expect([...sel]).toEqual(["id-2"]);
    sel = toggleRecoveryRowSelection(sel, "id-2");
    expect([...sel]).toEqual([]);
  });

  it("survives a sort (selection is by id, not visible index)", () => {
    const selected = new Set(["id-1", "id-3"]);
    const asc = sortRecoveryCandidates(rows, {
      key: "displayName",
      direction: "asc"
    });
    const desc = sortRecoveryCandidates(rows, {
      key: "displayName",
      direction: "desc"
    });
    // The selected set is untouched regardless of order.
    expect(asc.filter((r) => selected.has(r.recoveryId)).map((r) => r.recoveryId).sort()).toEqual(
      ["id-1", "id-3"]
    );
    expect(desc.filter((r) => selected.has(r.recoveryId)).map((r) => r.recoveryId).sort()).toEqual(
      ["id-1", "id-3"]
    );
  });

  it("prunes ids that left the list", () => {
    expect([
      ...pruneRecoverySelection(new Set(["id-1", "id-2", "gone"]), ["id-1", "id-3"])
    ]).toEqual(["id-1"]);
  });
});

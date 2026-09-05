import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGlossaryEntry,
  createGlossaryTag,
  deleteGlossaryEntry,
  deleteGlossaryTag,
  getGlossaryEntryById,
  GlossaryStoreError,
  listGlossaryEntries,
  listGlossaryTags,
  reorderGlossaryEntries,
  reorderGlossaryTags,
  updateGlossaryEntry,
  updateGlossaryTag
} from "../../src/main/glossaryStore";
import {
  openProjectDatabase,
  type ProjectDatabase
} from "../../src/main/projectDatabase";
import type { DebugLogger } from "../../src/main/debugLogger";
import {
  GlossaryBoundaryPolicy,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import {
  GlossaryValidationError,
  type GlossaryTag
} from "../../src/shared/glossary";

const BOUNDARY_START_AUTO = setGlossaryAtomBoundaryStartPolicy(
  0,
  GlossaryBoundaryPolicy.Auto
);
const BOUNDARY_END_AUTO = setGlossaryAtomBoundaryEndPolicy(
  0,
  GlossaryBoundaryPolicy.Auto
);

const missingEntryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abc";
const missingTagId = "018f4b8c-7a2b-7c3d-8e4f-123456789abd";

function debugLoggerMock(): { log: ReturnType<typeof vi.fn<DebugLogger["log"]>> } {
  return { log: vi.fn<DebugLogger["log"]>() };
}

function dbLogEvents(logger: {
  log: ReturnType<typeof vi.fn<DebugLogger["log"]>>;
}) {
  return logger.log.mock.calls.map((call) => call[0]);
}

describe("glossary store (#375)", () => {
  let projectRootPath: string;
  let database: ProjectDatabase;

  beforeEach(async () => {
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-glossary-")
    );
    database = await openProjectDatabase(projectRootPath);
  });

  afterEach(async () => {
    await database.close();
    await fs.rm(projectRootPath, { recursive: true, force: true });
  });

  async function makeTag(
    label: string,
    background = "#123456"
  ): Promise<GlossaryTag> {
    return createGlossaryTag(database, {
      label,
      description: null,
      backgroundRgb: background,
      foregroundRgb: "#ffffff"
    });
  }

  // -----------------------------------------------------------------------
  // Entries + atoms
  // -----------------------------------------------------------------------

  it("lists an empty glossary from a new project database", async () => {
    await expect(listGlossaryEntries(database)).resolves.toEqual([]);
  });

  it("creates an entry with multiple atoms packed to sortOrder 0..n-1 and no tags", async () => {
    const entry = await createGlossaryEntry(database, {
      description: "戦国大名",
      atoms: [
        { value: "織田信長", matchFlags: 0 },
        {
          value: "第六天魔王",
          matchFlags: BOUNDARY_START_AUTO
        }
      ],
      tagIds: []
    });

    expect(entry.atoms.map((a) => [a.sortOrder, a.value])).toEqual([
      [0, "織田信長"],
      [1, "第六天魔王"]
    ]);
    expect(entry.atoms[1].matchFlags).toBe(BOUNDARY_START_AUTO);
    expect(entry.tags).toEqual([]);
    expect("kind" in entry).toBe(false);

    const listed = await listGlossaryEntries(database);
    expect(listed).toHaveLength(1);
    expect(listed[0].atoms[0].value).toBe("織田信長");
  });

  it("#375: attaches 0..n tags in ENTRY ASSIGNMENT order (tagIds order), not the tag's project sortOrder", async () => {
    // Project sortOrder: 武将 = 0, 地名 = 1.
    const first = await makeTag("武将");
    const second = await makeTag("地名");

    const entry = await createGlossaryEntry(database, {
      description: "",
      atoms: [{ value: "桜田門", matchFlags: 0 }],
      // Assigned 地名 first, 武将 second → 地名 is the primary tag.
      tagIds: [second.id, first.id]
    });

    expect(entry.tags.map((t) => t.label)).toEqual(["地名", "武将"]);
    // entry.tags[0] is the primary tag.
    expect(entry.tags[0].id).toBe(second.id);

    // A fresh get / list preserves that assignment order.
    const listed = (await listGlossaryEntries(database))[0];
    expect(listed.tags.map((t) => t.label)).toEqual(["地名", "武将"]);
  });

  it("#375: entry update re-packs tag assignment sort_order to the new tagIds order", async () => {
    const a = await makeTag("A");
    const b = await makeTag("B");
    const c = await makeTag("C");

    const created = await createGlossaryEntry(database, {
      description: "",
      atoms: [{ value: "x", matchFlags: 0 }],
      tagIds: [a.id, b.id, c.id]
    });
    expect(created.tags.map((t) => t.label)).toEqual(["A", "B", "C"]);

    const updated = await updateGlossaryEntry(database, {
      id: created.id,
      description: "",
      atoms: [{ value: "x", matchFlags: 0 }],
      tagIds: [c.id, a.id]
    });
    expect(updated.tags.map((t) => t.label)).toEqual(["C", "A"]);
    expect((await listGlossaryEntries(database))[0].tags.map((t) => t.id)).toEqual(
      [c.id, a.id]
    );
  });

  it("rejects an entry that references a non-existent tag id", async () => {
    await expect(
      createGlossaryEntry(database, {
        description: "",
        atoms: [{ value: "x", matchFlags: 0 }],
        tagIds: [missingTagId]
      })
    ).rejects.toMatchObject({ code: "GLOSSARY_TAG_NOT_FOUND" });

    expect(await listGlossaryEntries(database)).toEqual([]);
  });

  it("updates an entry: replaces atoms (re-packing sortOrder) and tag links, keeping supplied atom ids", async () => {
    const tag = await makeTag("武将");
    const created = await createGlossaryEntry(database, {
      description: "d1",
      atoms: [
        { value: "keep", matchFlags: 0 },
        { value: "drop", matchFlags: 0 }
      ],
      tagIds: []
    });
    const keepId = created.atoms[0].id;

    const updated = await updateGlossaryEntry(database, {
      id: created.id,
      description: "d2",
      atoms: [
        { value: "prepended", matchFlags: 0 },
        { id: keepId, value: "keep", matchFlags: BOUNDARY_END_AUTO }
      ],
      tagIds: [tag.id]
    });

    expect(updated.description).toBe("d2");
    expect(updated.atoms.map((a) => [a.sortOrder, a.value])).toEqual([
      [0, "prepended"],
      [1, "keep"]
    ]);
    expect(updated.atoms[1].id).toBe(keepId);
    expect(updated.atoms[1].matchFlags).toBe(BOUNDARY_END_AUTO);
    expect(updated.tags.map((t) => t.label)).toEqual(["武将"]);
  });

  it("skips an update for a missing entry (not found)", async () => {
    await expect(
      updateGlossaryEntry(database, {
        id: missingEntryId,
        description: "",
        atoms: [{ value: "x", matchFlags: 0 }],
        tagIds: []
      })
    ).rejects.toMatchObject({ code: "GLOSSARY_ENTRY_NOT_FOUND" });
  });

  it("deletes an entry and cascades to its atoms and tag links", async () => {
    const tag = await makeTag("武将");
    const entry = await createGlossaryEntry(database, {
      description: "",
      atoms: [{ value: "織田信長", matchFlags: 0 }],
      tagIds: [tag.id]
    });

    await deleteGlossaryEntry(database, entry.id);

    expect(await getGlossaryEntryById(database, entry.id)).toBeNull();
    expect(
      await database.all("SELECT * FROM glossary_atoms WHERE entry_id = ?", [
        entry.id
      ])
    ).toEqual([]);
    expect(
      await database.all(
        "SELECT * FROM glossary_entry_tags WHERE entry_id = ?",
        [entry.id]
      )
    ).toEqual([]);
    // The tag itself is untouched.
    expect((await listGlossaryTags(database)).map((t) => t.id)).toEqual([
      tag.id
    ]);
  });

  it("throws when deleting a missing entry", async () => {
    await expect(
      deleteGlossaryEntry(database, missingEntryId)
    ).rejects.toBeInstanceOf(GlossaryStoreError);
  });

  it("rejects an invalid create input and logs it as skipped/validation_failed", async () => {
    const logger = debugLoggerMock();

    await expect(
      createGlossaryEntry(
        database,
        { description: "", atoms: [], tagIds: [] },
        logger
      )
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    expect(
      dbLogEvents(logger).some(
        (event) =>
          event.event === "db.operation.skipped" &&
          event.details?.reason === "validation_failed"
      )
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Entry reorder (#375)
  // -----------------------------------------------------------------------

  async function makeEntry(value: string): Promise<string> {
    const entry = await createGlossaryEntry(database, {
      description: "",
      atoms: [{ value, matchFlags: 0 }],
      tagIds: []
    });
    return entry.id;
  }

  it("assigns an appended sort_order on create and lists entries in that order", async () => {
    const a = await makeEntry("あ");
    const b = await makeEntry("い");
    const c = await makeEntry("う");

    // Insertion order == sort_order order (0, 1, 2).
    expect((await listGlossaryEntries(database)).map((e) => e.id)).toEqual([
      a,
      b,
      c
    ]);
  });

  it("uses sort_order 0 for the first entry in an empty project", async () => {
    const only = await makeEntry("単独");
    const row = await database.get<{ sort_order: number }>(
      "SELECT sort_order FROM glossary_entries WHERE id = ?",
      [only]
    );
    expect(row?.sort_order).toBe(0);
  });

  it("reorders entries: re-packs sort_order 0..n-1 and returns the new order", async () => {
    const a = await makeEntry("あ");
    const b = await makeEntry("い");
    const c = await makeEntry("う");

    const reordered = await reorderGlossaryEntries(database, [c, a, b]);
    expect(reordered.map((e) => e.id)).toEqual([c, a, b]);

    const rows = await database.all<{ id: string; sort_order: number }>(
      "SELECT id, sort_order FROM glossary_entries ORDER BY sort_order"
    );
    expect(rows).toEqual([
      { id: c, sort_order: 0 },
      { id: a, sort_order: 1 },
      { id: b, sort_order: 2 }
    ]);

    // A fresh list re-read sees the same order.
    expect((await listGlossaryEntries(database)).map((e) => e.id)).toEqual([
      c,
      a,
      b
    ]);
  });

  it("reorder leaves atoms / tags / description untouched", async () => {
    const tag = await makeTag("武将");
    const first = await createGlossaryEntry(database, {
      description: "説明1",
      atoms: [
        { value: "織田信長", matchFlags: 0 },
        { value: "第六天魔王", matchFlags: 0 }
      ],
      tagIds: [tag.id]
    });
    const second = await makeEntry("徳川家康");

    await reorderGlossaryEntries(database, [second, first.id]);

    const reloaded = (await listGlossaryEntries(database)).find(
      (e) => e.id === first.id
    );
    expect(reloaded?.description).toBe("説明1");
    expect(reloaded?.atoms.map((a) => a.value)).toEqual([
      "織田信長",
      "第六天魔王"
    ]);
    expect(reloaded?.tags.map((t) => t.id)).toEqual([tag.id]);
  });

  it("rejects a reorder with a duplicate entry id (validation error)", async () => {
    const a = await makeEntry("あ");
    const b = await makeEntry("い");

    await expect(
      reorderGlossaryEntries(database, [a, b, a])
    ).rejects.toBeInstanceOf(GlossaryValidationError);
  });

  it("rejects a reorder that references an unknown entry, omits one, or lists too many", async () => {
    const a = await makeEntry("あ");
    const b = await makeEntry("い");

    await expect(
      reorderGlossaryEntries(database, [a, missingEntryId])
    ).rejects.toMatchObject({ code: "GLOSSARY_ENTRY_REORDER_MISMATCH" });
    await expect(
      reorderGlossaryEntries(database, [a])
    ).rejects.toMatchObject({ code: "GLOSSARY_ENTRY_REORDER_MISMATCH" });
    await expect(
      reorderGlossaryEntries(database, [a, b, missingEntryId])
    ).rejects.toMatchObject({ code: "GLOSSARY_ENTRY_REORDER_MISMATCH" });

    // The order is unchanged after a rejected reorder.
    expect((await listGlossaryEntries(database)).map((e) => e.id)).toEqual([
      a,
      b
    ]);
  });

  it("keeps a monotone list order after an entry is deleted (gaps are tolerated)", async () => {
    const a = await makeEntry("あ");
    const b = await makeEntry("い");
    const c = await makeEntry("う");

    await deleteGlossaryEntry(database, b);

    // sort_order is now 0, 2 — still a valid ascending order.
    expect((await listGlossaryEntries(database)).map((e) => e.id)).toEqual([
      a,
      c
    ]);

    // A reorder re-packs the survivors back to 0..n-1.
    await reorderGlossaryEntries(database, [c, a]);
    const rows = await database.all<{ id: string; sort_order: number }>(
      "SELECT id, sort_order FROM glossary_entries ORDER BY sort_order"
    );
    expect(rows).toEqual([
      { id: c, sort_order: 0 },
      { id: a, sort_order: 1 }
    ]);
  });

  it("appends a new entry after a reorder", async () => {
    const a = await makeEntry("あ");
    const b = await makeEntry("い");
    await reorderGlossaryEntries(database, [b, a]);

    const c = await makeEntry("う");
    // New entry's sort_order = max(1) + 1 = 2 → last in the list.
    expect((await listGlossaryEntries(database)).map((e) => e.id)).toEqual([
      b,
      a,
      c
    ]);
  });

  // -----------------------------------------------------------------------
  // Tags
  // -----------------------------------------------------------------------

  it("creates tags with normalized colors and increasing sortOrder", async () => {
    const a = await createGlossaryTag(database, {
      label: "  武将 ",
      description: "  ",
      backgroundRgb: "#AABBCC",
      foregroundRgb: "#000"
    });
    const b = await makeTag("地名");

    expect(a).toMatchObject({
      label: "武将",
      description: null,
      backgroundRgb: "#aabbcc",
      foregroundRgb: "#000000",
      sortOrder: 0
    });
    expect(b.sortOrder).toBe(1);
    expect((await listGlossaryTags(database)).map((t) => t.label)).toEqual([
      "武将",
      "地名"
    ]);
  });

  it("renames a tag", async () => {
    const tag = await makeTag("武将");
    const renamed = await updateGlossaryTag(database, {
      id: tag.id,
      label: "軍人",
      description: "説明",
      backgroundRgb: "#654321",
      foregroundRgb: "#ffffff"
    });

    expect(renamed).toMatchObject({
      id: tag.id,
      label: "軍人",
      description: "説明",
      backgroundRgb: "#654321"
    });
  });

  it("skips renaming a missing tag", async () => {
    await expect(
      updateGlossaryTag(database, {
        id: missingTagId,
        label: "x",
        description: null,
        backgroundRgb: "#000000",
        foregroundRgb: "#ffffff"
      })
    ).rejects.toMatchObject({ code: "GLOSSARY_TAG_NOT_FOUND" });
  });

  it("#375: rejects a tag label over 32 characters on create and update", async () => {
    const len33 = "あ".repeat(33);

    await expect(
      createGlossaryTag(database, {
        label: len33,
        description: null,
        backgroundRgb: "#123456",
        foregroundRgb: "#ffffff"
      })
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    const tag = await makeTag("武将");
    await expect(
      updateGlossaryTag(database, {
        id: tag.id,
        label: len33,
        description: null,
        backgroundRgb: "#123456",
        foregroundRgb: "#ffffff"
      })
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    // A 32-char label is accepted (a long atom value on an entry still is too).
    const ok = await createGlossaryTag(database, {
      label: "あ".repeat(32),
      description: null,
      backgroundRgb: "#123456",
      foregroundRgb: "#ffffff"
    });
    expect([...ok.label].length).toBe(32);
  });

  it("hard-deletes a tag: removes entry_tags links but keeps the entry and its atoms", async () => {
    const tag = await makeTag("武将");
    const entry = await createGlossaryEntry(database, {
      description: "",
      atoms: [
        { value: "織田信長", matchFlags: 0 },
        { value: "第六天魔王", matchFlags: 0 }
      ],
      tagIds: [tag.id]
    });

    await deleteGlossaryTag(database, { id: tag.id });

    expect(await listGlossaryTags(database)).toEqual([]);
    const stillThere = await getGlossaryEntryById(database, entry.id);
    expect(stillThere).not.toBeNull();
    expect(stillThere!.atoms.map((a) => a.value)).toEqual([
      "織田信長",
      "第六天魔王"
    ]);
    expect(stillThere!.tags).toEqual([]);
  });

  it("throws when deleting a missing tag", async () => {
    await expect(
      deleteGlossaryTag(database, { id: missingTagId })
    ).rejects.toBeInstanceOf(GlossaryStoreError);
  });

  it("rejects a create whose label (trimmed) collides with an existing tag", async () => {
    await makeTag("人物");

    await expect(
      createGlossaryTag(database, {
        label: "  人物  ",
        description: null,
        backgroundRgb: "#123456",
        foregroundRgb: "#ffffff"
      })
    ).rejects.toMatchObject({ code: "GLOSSARY_TAG_LABEL_CONFLICT" });

    // Case-sensitive: "hero" and "Hero" are different labels.
    await makeTag("Hero");
    await expect(makeTag("hero")).resolves.toMatchObject({ label: "hero" });

    expect((await listGlossaryTags(database)).map((t) => t.label)).toEqual([
      "人物",
      "Hero",
      "hero"
    ]);
  });

  it("rejects a rename onto another tag's label but allows a tag to keep its own", async () => {
    const people = await makeTag("人物");
    const place = await makeTag("地名");

    await expect(
      updateGlossaryTag(database, {
        id: place.id,
        label: " 人物 ",
        description: null,
        backgroundRgb: "#123456",
        foregroundRgb: "#ffffff"
      })
    ).rejects.toMatchObject({ code: "GLOSSARY_TAG_LABEL_CONFLICT" });

    // Renaming a tag to (a trimmed form of) its own current label is fine.
    await expect(
      updateGlossaryTag(database, {
        id: people.id,
        label: " 人物 ",
        description: "same",
        backgroundRgb: "#123456",
        foregroundRgb: "#ffffff"
      })
    ).resolves.toMatchObject({ id: people.id, label: "人物" });
  });

  // -----------------------------------------------------------------------
  // Tag reorder (#375)
  // -----------------------------------------------------------------------

  it("reorders tags: re-packs sort_order 0..n-1 and returns the new order", async () => {
    const a = await makeTag("A");
    const b = await makeTag("B");
    const c = await makeTag("C");

    const reordered = await reorderGlossaryTags(database, [c.id, a.id, b.id]);

    expect(reordered.map((t) => [t.label, t.sortOrder])).toEqual([
      ["C", 0],
      ["A", 1],
      ["B", 2]
    ]);
    // A fresh list re-read by (sort_order, id) sees the same order.
    expect((await listGlossaryTags(database)).map((t) => t.id)).toEqual([
      c.id,
      a.id,
      b.id
    ]);
  });

  it("reorder leaves label / description / color and entry links untouched", async () => {
    const a = await createGlossaryTag(database, {
      label: "武将",
      description: "説明",
      backgroundRgb: "#abcdef",
      foregroundRgb: "#000000"
    });
    const b = await makeTag("地名");
    const entry = await createGlossaryEntry(database, {
      description: "",
      atoms: [{ value: "織田信長", matchFlags: 0 }],
      tagIds: [a.id]
    });

    await reorderGlossaryTags(database, [b.id, a.id]);

    const moved = (await listGlossaryTags(database)).find((t) => t.id === a.id);
    expect(moved).toMatchObject({
      label: "武将",
      description: "説明",
      backgroundRgb: "#abcdef",
      foregroundRgb: "#000000"
    });
    const stillTagged = await getGlossaryEntryById(database, entry.id);
    expect(stillTagged!.tags.map((t) => t.id)).toEqual([a.id]);
  });

  it("rejects a reorder with a duplicate id", async () => {
    const a = await makeTag("A");
    const b = await makeTag("B");

    await expect(
      reorderGlossaryTags(database, [a.id, b.id, a.id])
    ).rejects.toBeInstanceOf(GlossaryValidationError);
  });

  it("rejects a reorder that references an unknown tag", async () => {
    const a = await makeTag("A");
    const b = await makeTag("B");

    await expect(
      reorderGlossaryTags(database, [a.id, missingTagId])
    ).rejects.toMatchObject({ code: "GLOSSARY_TAG_REORDER_MISMATCH" });
    // The order is unchanged.
    expect((await listGlossaryTags(database)).map((t) => t.id)).toEqual([
      a.id,
      b.id
    ]);
  });

  it("rejects a reorder that omits a tag (too few ids)", async () => {
    const a = await makeTag("A");
    await makeTag("B");

    await expect(
      reorderGlossaryTags(database, [a.id])
    ).rejects.toMatchObject({ code: "GLOSSARY_TAG_REORDER_MISMATCH" });
  });

  it("rejects a reorder with more ids than there are tags", async () => {
    const a = await makeTag("A");
    const b = await makeTag("B");

    await expect(
      reorderGlossaryTags(database, [a.id, b.id, missingTagId])
    ).rejects.toMatchObject({ code: "GLOSSARY_TAG_REORDER_MISMATCH" });
  });

  // -----------------------------------------------------------------------
  // Atom value uniqueness (per entry, trimmed, case-sensitive)
  // -----------------------------------------------------------------------

  it("rejects a create with two atom values equal after trimming", async () => {
    await expect(
      createGlossaryEntry(database, {
        description: "",
        atoms: [
          { value: "信長", matchFlags: 0 },
          { value: "  信長  ", matchFlags: 0 }
        ],
        tagIds: []
      })
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    expect(await listGlossaryEntries(database)).toEqual([]);
  });

  it("treats atom values as case-sensitive within an entry", async () => {
    const entry = await createGlossaryEntry(database, {
      description: "",
      atoms: [
        { value: "Nobunaga", matchFlags: 0 },
        { value: "nobunaga", matchFlags: 0 }
      ],
      tagIds: []
    });

    expect(entry.atoms.map((a) => a.value)).toEqual([
      "Nobunaga",
      "nobunaga"
    ]);
  });

  it("rejects an update that would give one entry two equal atom values", async () => {
    const created = await createGlossaryEntry(database, {
      description: "",
      atoms: [{ value: "信長", matchFlags: 0 }],
      tagIds: []
    });

    await expect(
      updateGlossaryEntry(database, {
        id: created.id,
        description: "",
        atoms: [
          { value: "信長", matchFlags: 0 },
          { value: " 信長 ", matchFlags: 0 }
        ],
        tagIds: []
      })
    ).rejects.toBeInstanceOf(GlossaryValidationError);
  });
});

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
  reorderGlossaryTags,
  updateGlossaryEntry,
  updateGlossaryTag
} from "../../src/main/glossaryStore";
import {
  openProjectDatabase,
  type ProjectDatabase
} from "../../src/main/projectDatabase";
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

function debugLoggerMock(): { log: ReturnType<typeof vi.fn> } {
  return { log: vi.fn() };
}

function dbLogEvents(logger: { log: ReturnType<typeof vi.fn> }) {
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

  it("attaches 0..n tags and orders them by the tag's own sortOrder", async () => {
    const first = await makeTag("武将");
    const second = await makeTag("地名");

    const entry = await createGlossaryEntry(database, {
      description: "",
      atoms: [{ value: "桜田門", matchFlags: 0 }],
      tagIds: [second.id, first.id]
    });

    expect(entry.tags.map((t) => t.label)).toEqual(["武将", "地名"]);
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

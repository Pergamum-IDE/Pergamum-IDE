// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import type {
  CreateGlossaryEntryInput,
  GlossaryEntry,
  GlossaryTag
} from "../../src/shared/glossary";
import {
  GlossaryEntryEditorSession,
  type GlossaryEntryEditorSessionHandle
} from "../../src/renderer/GlossaryEntryEditorSession";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("ja", key, values);

const timestamp = "2026-01-01T00:00:00.000Z";

const tagWarrior: GlossaryTag = {
  id: "018f-tag-warrior",
  label: "武将",
  description: null,
  backgroundRgb: "#334155",
  foregroundRgb: "#ffffff",
  sortOrder: 0,
  createdAt: timestamp,
  updatedAt: timestamp
};

/** #412 Blocker 1: the global editor settings GlossaryEditor requires. */
const editorSettingsProps = {
  markerGlyph: "↓" as const,
  expectedLineEnding: "lf" as const,
  newFileLineEndingFallback: "lf" as const,
  whitespaceSettings: {
    renderIdeographicSpace: false,
    renderAsciiSpace: false,
    renderTab: false,
    renderOtherUnicodeSpace: false
  },
  undoHistoryMinDepth: 100
};

function makeEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "entry-1",
    description: "征夷大将軍",
    atoms: [
      {
        id: "atom-representative",
        entryId: "entry-1",
        sortOrder: 0,
        value: "徳川家康",
        matchFlags: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "atom-alternate",
        entryId: "entry-1",
        sortOrder: 1,
        value: "家康",
        matchFlags: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    tags: [tagWarrior],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

describe("GlossaryEntryEditorSession (#436 Slice 9: one session, both create and edit)", () => {
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

  function renderEdit(options: {
    entryId?: string;
    onLoadEntry: (entryId: string) => Promise<GlossaryEntry | null>;
    onCreateEntry?: (input: CreateGlossaryEntryInput) => Promise<GlossaryEntry>;
    onSaveEntry?: (input: unknown) => Promise<GlossaryEntry>;
    onDeleteEntry?: (draft: unknown) => Promise<boolean>;
    onClose?: () => void;
    readOnly?: boolean;
    availableTags?: readonly GlossaryTag[];
    handleRef?: React.RefObject<GlossaryEntryEditorSessionHandle>;
  }): void {
    act(() => {
      root.render(
        <GlossaryEntryEditorSession
          ref={options.handleRef}
          mode="edit"
          entryId={options.entryId ?? "entry-1"}
          availableTags={options.availableTags ?? [tagWarrior]}
          translate={translate}
          readOnly={options.readOnly ?? false}
          {...editorSettingsProps}
          onLoadEntry={options.onLoadEntry}
          onCreateEntry={
            (options.onCreateEntry as never) ??
            (() => Promise.reject(new Error("not used in this test")))
          }
          onSaveEntry={
            (options.onSaveEntry as never) ??
            ((input: unknown) =>
              Promise.resolve({
                ...makeEntry(),
                ...(input as object)
              } as GlossaryEntry))
          }
          onDeleteEntry={
            (options.onDeleteEntry as never) ?? (() => Promise.resolve(true))
          }
          onOpenTagManager={() => undefined}
          onClose={options.onClose ?? (() => undefined)}
        />
      );
    });
  }

  function renderCreate(options: {
    presetRepresentative?: string;
    onLoadEntry?: (entryId: string) => Promise<GlossaryEntry | null>;
    onCreateEntry?: (input: CreateGlossaryEntryInput) => Promise<GlossaryEntry>;
    onSaveEntry?: (input: unknown) => Promise<GlossaryEntry>;
    onDeleteEntry?: (draft: unknown) => Promise<boolean>;
    onClose?: () => void;
    readOnly?: boolean;
    availableTags?: readonly GlossaryTag[];
    handleRef?: React.RefObject<GlossaryEntryEditorSessionHandle>;
  }): void {
    act(() => {
      root.render(
        <GlossaryEntryEditorSession
          ref={options.handleRef}
          mode="create"
          presetRepresentative={options.presetRepresentative ?? "新しい語彙"}
          availableTags={options.availableTags ?? [tagWarrior]}
          translate={translate}
          readOnly={options.readOnly ?? false}
          {...editorSettingsProps}
          onLoadEntry={
            options.onLoadEntry ??
            (() => Promise.reject(new Error("onLoadEntry unused in create mode")))
          }
          onCreateEntry={
            (options.onCreateEntry as never) ??
            (() => Promise.resolve(makeEntry()))
          }
          onSaveEntry={
            (options.onSaveEntry as never) ??
            (() => Promise.reject(new Error("not used in this test")))
          }
          onDeleteEntry={
            (options.onDeleteEntry as never) ?? (() => Promise.resolve(true))
          }
          onOpenTagManager={() => undefined}
          onClose={options.onClose ?? (() => undefined)}
        />
      );
    });
  }

  function saveButton(): HTMLButtonElement | null {
    return container.querySelector<HTMLButtonElement>(
      ".glossaryEntryEditorPaneSaveButton"
    );
  }

  function atomValueInput(index = 0): HTMLInputElement {
    const inputs = container.querySelectorAll<HTMLInputElement>(
      ".glossaryEditorAtomValue"
    );
    return inputs[index];
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  describe("edit mode", () => {
    it("shows a loading status while the entry is being fetched", () => {
      renderEdit({ onLoadEntry: () => new Promise(() => undefined) });

      expect(container.querySelector('[role="status"]')?.textContent).toBe(
        "語彙を読み込んでいます…"
      );
      expect(container.querySelector(".glossaryEditor")).toBeNull();
    });

    it("shows a load-failed alert when the entry is not found (null) or the load rejects", async () => {
      for (const onLoadEntry of [
        () => Promise.resolve(null),
        () => Promise.reject(new Error("boom"))
      ]) {
        renderEdit({ onLoadEntry });
        await act(async () => {
          await Promise.resolve();
        });
        expect(container.querySelector('[role="alert"]')?.textContent).toBe(
          "語彙を読み込めませんでした。"
        );
      }
    });

    it("renders the EXISTING GlossaryEditor in mode='edit', seeded from the loaded entry, once ready", async () => {
      renderEdit({ onLoadEntry: () => Promise.resolve(makeEntry()) });
      await act(async () => {
        await Promise.resolve();
      });

      expect(container.querySelector(".glossaryEditor")).not.toBeNull();
      expect(atomValueInput(0).value).toBe("徳川家康");
      expect(atomValueInput(1).value).toBe("家康");
      expect(container.querySelector(".glossaryEditorDeleteButton")).not.toBeNull();
      // The Save action bar sits above the relocated GlossaryEditor.
      expect(saveButton()).not.toBeNull();
      expect(saveButton()?.textContent).toBe("保存");
      expect(saveButton()?.disabled).toBe(true); // nothing edited yet
    });

    it("only reflects the latest entryId's load result when entryId changes before the first resolves", async () => {
      let resolveFirst: (entry: GlossaryEntry) => void = () => undefined;
      let resolveSecond: (entry: GlossaryEntry) => void = () => undefined;
      const onLoadEntry = vi
        .fn<(entryId: string) => Promise<GlossaryEntry | null>>()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirst = resolve;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSecond = resolve;
            })
        );

      const commonProps = {
        availableTags: [] as GlossaryTag[],
        translate,
        readOnly: false,
        ...editorSettingsProps,
        onLoadEntry,
        onCreateEntry: () =>
          Promise.reject(new Error("not used in this test")),
        onSaveEntry: () => Promise.resolve(makeEntry()),
        onDeleteEntry: () => Promise.resolve(true),
        onOpenTagManager: () => undefined,
        onClose: () => undefined
      };

      act(() => {
        root.render(
          <GlossaryEntryEditorSession
            mode="edit"
            entryId="entry-1"
            {...commonProps}
          />
        );
      });
      act(() => {
        root.render(
          <GlossaryEntryEditorSession
            mode="edit"
            entryId="entry-2"
            {...commonProps}
          />
        );
      });

      // entry-2's load resolves first (with distinct atom data)...
      await act(async () => {
        resolveSecond(
          makeEntry({
            id: "entry-2",
            atoms: [
              {
                id: "atom-2",
                entryId: "entry-2",
                sortOrder: 0,
                value: "二人目",
                matchFlags: 0,
                createdAt: timestamp,
                updatedAt: timestamp
              }
            ]
          })
        );
        await Promise.resolve();
      });
      expect(atomValueInput(0)?.value).toBe("二人目");

      // ...and the stale entry-1 request resolving afterward must not clobber it.
      await act(async () => {
        resolveFirst(makeEntry({ id: "entry-1" }));
        await Promise.resolve();
      });
      expect(atomValueInput(0)?.value).toBe("二人目");
    });

    it("enables Save once the draft is dirty and valid, saves through onSaveEntry, and does not close the pane", async () => {
      const onSaveEntry = vi.fn((input: unknown) =>
        Promise.resolve({ ...makeEntry(), ...(input as object) } as GlossaryEntry)
      );
      const onClose = vi.fn();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        onSaveEntry: onSaveEntry as never,
        onClose
      });
      await act(async () => {
        await Promise.resolve();
      });

      setInputValue(atomValueInput(0), "内府");
      expect(saveButton()?.disabled).toBe(false);

      act(() => saveButton()?.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onSaveEntry).toHaveBeenCalledWith({
        id: "entry-1",
        description: "征夷大将軍",
        atoms: [
          { id: "atom-representative", value: "内府", matchFlags: 0 },
          { id: "atom-alternate", value: "家康", matchFlags: 1 }
        ],
        tagIds: [tagWarrior.id]
      });
      expect(onClose).not.toHaveBeenCalled();
      // Saved successfully → clean again → Save disabled once more.
      expect(saveButton()?.disabled).toBe(true);
    });

    it("shows a save-failed indicator and keeps the pane open when the save rejects", async () => {
      const onClose = vi.fn();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        onSaveEntry: (() => Promise.reject(new Error("boom"))) as never,
        onClose
      });
      await act(async () => {
        await Promise.resolve();
      });

      setInputValue(atomValueInput(0), "内府");
      act(() => saveButton()?.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(
        container.querySelector(".glossaryEntryEditorPaneSaveFailed")
          ?.textContent
      ).toBe("語彙を保存できませんでした。");
    });

    it("#439: shows the specific duplicate-atom-value message when the save rejects with a GLOSSARY_ATOM_VALUE_CONFLICT-style message", async () => {
      const onClose = vi.fn();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        onSaveEntry: (() =>
          Promise.reject(
            new Error(
              'A glossary atom with the value "王都アルセリア" already exists.'
            )
          )) as never,
        onClose
      });
      await act(async () => {
        await Promise.resolve();
      });

      setInputValue(atomValueInput(0), "内府");
      act(() => saveButton()?.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(
        container.querySelector(".glossaryEntryEditorPaneSaveFailed")
          ?.textContent
      ).toBe("同じ表記の語彙Atom「王都アルセリア」がすでに存在します。");
    });

    it("closes the pane only when onDeleteEntry resolves true", async () => {
      const onDeleteEntry = vi.fn(() => Promise.resolve(false));
      const onClose = vi.fn();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        onDeleteEntry: onDeleteEntry as never,
        onClose
      });
      await act(async () => {
        await Promise.resolve();
      });

      const deleteButton = container.querySelector<HTMLButtonElement>(
        ".glossaryEditorDeleteButton"
      )!;
      act(() => deleteButton.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onDeleteEntry).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();

      onDeleteEntry.mockResolvedValueOnce(true);
      act(() => deleteButton.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("disables Save while read-only, even with a dirty draft in hand", async () => {
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        readOnly: true
      });
      await act(async () => {
        await Promise.resolve();
      });

      // read-only GlossaryEditor makes its own inputs readOnly, but Save must
      // stay disabled regardless of draft state.
      expect(saveButton()?.disabled).toBe(true);
    });

    it("does not reload when the host re-renders with a new onLoadEntry identity for the same entryId", async () => {
      const onLoadEntry = vi.fn(() => Promise.resolve(makeEntry()));
      renderEdit({ onLoadEntry });
      await act(async () => {
        await Promise.resolve();
      });
      expect(onLoadEntry).toHaveBeenCalledTimes(1);

      // Re-render with the SAME entryId but a brand-new (non-memoized)
      // onLoadEntry function identity — mirrors the App-level host callback,
      // which is a plain function re-created every App render.
      renderEdit({ onLoadEntry: () => Promise.resolve(makeEntry()) });

      expect(onLoadEntry).toHaveBeenCalledTimes(1);
    });
  });

  describe("create mode", () => {
    it("seeds a fresh draft from presetRepresentative synchronously — no onLoadEntry call, no delete button, Save labeled 作成", () => {
      const onLoadEntry = vi.fn(() =>
        Promise.reject(new Error("onLoadEntry must not be called in create mode"))
      );
      renderCreate({ presetRepresentative: "シズク", onLoadEntry });

      expect(onLoadEntry).not.toHaveBeenCalled();
      expect(container.querySelector(".glossaryEditor")).not.toBeNull();
      expect(atomValueInput(0).value).toBe("シズク");
      expect(container.querySelector(".glossaryEditorDeleteButton")).toBeNull();
      expect(saveButton()?.textContent).toBe("作成");
    });

    it("does not call onCreateEntry unless Save is clicked — closing beforehand leaves no empty entry in the DB", () => {
      const onCreateEntry = vi.fn(() => Promise.resolve(makeEntry()));
      const onClose = vi.fn();
      renderCreate({
        presetRepresentative: "シズク",
        onCreateEntry,
        onClose
      });

      // Simulate the host closing the pane (Close button / Esc) without the
      // user ever pressing Save — the session itself has no autosave path.
      onClose();

      expect(onCreateEntry).not.toHaveBeenCalled();
    });

    it("creates on Save with the trimmed representative and empty tagIds/description", async () => {
      const onCreateEntry = vi.fn(() =>
        Promise.resolve(
          makeEntry({
            id: "entry-77",
            description: "",
            atoms: [
              {
                id: "atom-77",
                entryId: "entry-77",
                sortOrder: 0,
                value: "シズク",
                matchFlags: 0,
                createdAt: timestamp,
                updatedAt: timestamp
              }
            ],
            tags: []
          })
        )
      );
      const onClose = vi.fn();
      renderCreate({
        presetRepresentative: "  シズク  ",
        onCreateEntry,
        onClose,
        availableTags: []
      });

      act(() => saveButton()?.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onCreateEntry).toHaveBeenCalledWith({
        description: "",
        atoms: [{ value: "シズク", matchFlags: 0 }],
        tagIds: []
      });
      // #436 Slice 9: create does NOT close the pane.
      expect(onClose).not.toHaveBeenCalled();
    });

    it("flips to an edit-like session after the first successful save — every later Save calls onSaveEntry, not onCreateEntry again", async () => {
      const onCreateEntry = vi.fn(() =>
        Promise.resolve(
          makeEntry({
            id: "entry-77",
            atoms: [
              {
                id: "atom-77",
                entryId: "entry-77",
                sortOrder: 0,
                value: "シズク",
                matchFlags: 0,
                createdAt: timestamp,
                updatedAt: timestamp
              }
            ]
          })
        )
      );
      const onSaveEntry = vi.fn((input: unknown) =>
        Promise.resolve({
          ...makeEntry({ id: "entry-77" }),
          ...(input as object)
        } as GlossaryEntry)
      );
      renderCreate({
        presetRepresentative: "シズク",
        onCreateEntry,
        onSaveEntry: onSaveEntry as never
      });

      act(() => saveButton()?.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onCreateEntry).toHaveBeenCalledTimes(1);
      expect(onSaveEntry).not.toHaveBeenCalled();
      expect(saveButton()?.textContent).toBe("保存");
      expect(container.querySelector(".glossaryEditorDeleteButton")).not.toBeNull();

      // Edit again after the create-turned-edit session is live.
      setInputValue(atomValueInput(0), "内府");
      act(() => saveButton()?.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onSaveEntry).toHaveBeenCalledTimes(1);
      expect(onCreateEntry).toHaveBeenCalledTimes(1); // still just the once
    });

    it("shows create.failed and stays in create mode when onCreateEntry rejects", async () => {
      const onCreateEntry = vi.fn(() => Promise.reject(new Error("boom")));
      const onClose = vi.fn();
      renderCreate({
        presetRepresentative: "五右衛門",
        onCreateEntry,
        onClose
      });

      act(() => saveButton()?.click());
      await act(async () => {
        await Promise.resolve();
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(
        container.querySelector(".glossaryEntryEditorPaneSaveFailed")
          ?.textContent
      ).toBe("語彙を作成できませんでした。");
      expect(saveButton()?.textContent).toBe("作成");
      expect(container.querySelector(".glossaryEditorDeleteButton")).toBeNull();
    });

    it("disables Save while read-only, even with a preset representative in hand", () => {
      renderCreate({ presetRepresentative: "シズク", readOnly: true });
      expect(saveButton()?.disabled).toBe(true);
    });
  });

  describe("imperative handle (#436 Slice 11: isDirty/save for the dirty-confirm)", () => {
    it("edit mode: isDirty() is false while loading, false once clean, true once edited", async () => {
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        handleRef
      });

      expect(handleRef.current?.isDirty()).toBe(false); // still loading

      await act(async () => {
        await Promise.resolve();
      });

      expect(handleRef.current?.isDirty()).toBe(false); // loaded, clean

      setInputValue(atomValueInput(0), "内府");

      expect(handleRef.current?.isDirty()).toBe(true);
    });

    it("edit mode: save() persists a dirty draft through onSaveEntry, resolves true, and isDirty() flips back to false", async () => {
      const onSaveEntry = vi.fn((input: unknown) =>
        Promise.resolve({ ...makeEntry(), ...(input as object) } as GlossaryEntry)
      );
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        onSaveEntry: onSaveEntry as never,
        handleRef
      });
      await act(async () => {
        await Promise.resolve();
      });

      setInputValue(atomValueInput(0), "内府");

      let result: boolean | undefined;
      await act(async () => {
        result = await handleRef.current?.save();
      });

      expect(result).toBe(true);
      expect(onSaveEntry).toHaveBeenCalledTimes(1);
      expect(handleRef.current?.isDirty()).toBe(false);
    });

    it("edit mode: save() no-ops (resolves true) when the draft is already clean", async () => {
      const onSaveEntry = vi.fn(() => Promise.resolve(makeEntry()));
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        onSaveEntry: onSaveEntry as never,
        handleRef
      });
      await act(async () => {
        await Promise.resolve();
      });

      let result: boolean | undefined;
      await act(async () => {
        result = await handleRef.current?.save();
      });

      expect(result).toBe(true);
      expect(onSaveEntry).not.toHaveBeenCalled();
    });

    it("edit mode: save() resolves false and leaves the draft dirty when onSaveEntry rejects", async () => {
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        onSaveEntry: (() => Promise.reject(new Error("boom"))) as never,
        handleRef
      });
      await act(async () => {
        await Promise.resolve();
      });

      setInputValue(atomValueInput(0), "内府");

      let result: boolean | undefined;
      await act(async () => {
        result = await handleRef.current?.save();
      });

      expect(result).toBe(false);
      expect(handleRef.current?.isDirty()).toBe(true); // still unsaved
      expect(
        container.querySelector(".glossaryEntryEditorPaneSaveFailed")
      ).not.toBeNull();
    });

    it("edit mode: save() resolves false for an invalid draft (every atom blanked out) — never silently discards", async () => {
      const onSaveEntry = vi.fn(() => Promise.resolve(makeEntry()));
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderEdit({
        onLoadEntry: () =>
          Promise.resolve(
            makeEntry({
              atoms: [
                {
                  id: "atom-representative",
                  entryId: "entry-1",
                  sortOrder: 0,
                  value: "徳川家康",
                  matchFlags: 0,
                  createdAt: timestamp,
                  updatedAt: timestamp
                }
              ]
            })
          ),
        onSaveEntry: onSaveEntry as never,
        handleRef
      });
      await act(async () => {
        await Promise.resolve();
      });

      setInputValue(atomValueInput(0), "   ");

      let result: boolean | undefined;
      await act(async () => {
        result = await handleRef.current?.save();
      });

      expect(result).toBe(false);
      expect(onSaveEntry).not.toHaveBeenCalled();
    });

    it("edit mode read-only: isDirty() is false and save() trivially resolves true (nothing editable)", async () => {
      const onSaveEntry = vi.fn(() => Promise.resolve(makeEntry()));
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderEdit({
        onLoadEntry: () => Promise.resolve(makeEntry()),
        onSaveEntry: onSaveEntry as never,
        readOnly: true,
        handleRef
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(handleRef.current?.isDirty()).toBe(false);

      let result: boolean | undefined;
      await act(async () => {
        result = await handleRef.current?.save();
      });

      expect(result).toBe(true);
      expect(onSaveEntry).not.toHaveBeenCalled();
    });

    it("create mode: isDirty() is true immediately (unsaved from the start)", () => {
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderCreate({ presetRepresentative: "シズク", handleRef });

      expect(handleRef.current?.isDirty()).toBe(true);
    });

    it("create mode: save() persists through onCreateEntry, resolves true, and isDirty() flips back to false", async () => {
      // #436 Slice 9: `applyGlossaryEntryDraftSaveResult` rebases only
      // `entry`/`tagIds`/atom ids, never `description` — the saved entry
      // must therefore match the (untouched) create draft's own
      // description ("") and tags ([]) for the draft to read back as clean.
      const onCreateEntry = vi.fn(() =>
        Promise.resolve(
          makeEntry({
            id: "entry-77",
            description: "",
            tags: [],
            atoms: [
              {
                id: "atom-77",
                entryId: "entry-77",
                sortOrder: 0,
                value: "シズク",
                matchFlags: 0,
                createdAt: timestamp,
                updatedAt: timestamp
              }
            ]
          })
        )
      );
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderCreate({
        presetRepresentative: "シズク",
        onCreateEntry,
        handleRef
      });

      let result: boolean | undefined;
      await act(async () => {
        result = await handleRef.current?.save();
      });

      expect(result).toBe(true);
      expect(onCreateEntry).toHaveBeenCalledTimes(1);
      expect(handleRef.current?.isDirty()).toBe(false);
    });

    it("create mode: save() resolves false when onCreateEntry rejects — the draft stays dirty", async () => {
      const handleRef = React.createRef<GlossaryEntryEditorSessionHandle>();
      renderCreate({
        presetRepresentative: "シズク",
        onCreateEntry: () => Promise.reject(new Error("boom")),
        handleRef
      });

      let result: boolean | undefined;
      await act(async () => {
        result = await handleRef.current?.save();
      });

      expect(result).toBe(false);
      expect(handleRef.current?.isDirty()).toBe(true);
    });
  });
});

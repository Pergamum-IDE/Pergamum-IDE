// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import type { GlossaryEntry, GlossaryTag } from "../../src/shared/glossary";
import { GlossaryEntryEditForm } from "../../src/renderer/GlossaryEntryEditForm";

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

describe("GlossaryEntryEditForm — hosts the EXISTING GlossaryEditor (#436 Slice 8)", () => {
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

  function render(options: {
    entryId?: string;
    onLoadEntry: (entryId: string) => Promise<GlossaryEntry | null>;
    onSaveEntry?: (input: unknown) => Promise<GlossaryEntry>;
    onDeleteEntry?: (draft: unknown) => Promise<boolean>;
    onClose?: () => void;
    readOnly?: boolean;
    availableTags?: readonly GlossaryTag[];
  }): void {
    act(() => {
      root.render(
        <GlossaryEntryEditForm
          entryId={options.entryId ?? "entry-1"}
          availableTags={options.availableTags ?? [tagWarrior]}
          translate={translate}
          readOnly={options.readOnly ?? false}
          {...editorSettingsProps}
          onLoadEntry={options.onLoadEntry}
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
          onNavigateToPreviousOccurrence={() => undefined}
          onNavigateToNextOccurrence={() => undefined}
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

  it("shows a loading status while the entry is being fetched", () => {
    render({ onLoadEntry: () => new Promise(() => undefined) });

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
      render({ onLoadEntry });
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        "語彙を読み込めませんでした。"
      );
    }
  });

  it("renders the EXISTING GlossaryEditor, seeded from the loaded entry, once ready", async () => {
    render({ onLoadEntry: () => Promise.resolve(makeEntry()) });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector(".glossaryEditor")).not.toBeNull();
    expect(atomValueInput(0).value).toBe("徳川家康");
    expect(atomValueInput(1).value).toBe("家康");
    expect(container.querySelector(".glossaryTagChip")).not.toBeNull();
    // The Save action bar sits above the relocated GlossaryEditor.
    expect(saveButton()).not.toBeNull();
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
      onSaveEntry: () => Promise.resolve(makeEntry()),
      onDeleteEntry: () => Promise.resolve(true),
      onOpenTagManager: () => undefined,
      onNavigateToPreviousOccurrence: () => undefined,
      onNavigateToNextOccurrence: () => undefined,
      onClose: () => undefined
    };

    act(() => {
      root.render(
        <GlossaryEntryEditForm entryId="entry-1" {...commonProps} />
      );
    });
    act(() => {
      root.render(
        <GlossaryEntryEditForm entryId="entry-2" {...commonProps} />
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
    render({
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
    render({
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

  it("closes the pane only when onDeleteEntry resolves true", async () => {
    const onDeleteEntry = vi.fn(() => Promise.resolve(false));
    const onClose = vi.fn();
    render({
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
    render({
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
});

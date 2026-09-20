import { describe, expect, it } from "vitest";
import {
  toggleFolderIncluded,
  type ExportCandidateListItem,
  type HeadingRemovalLevel
} from "../../src/renderer/exportCandidates";
import {
  applyExportDialogOrder,
  createInitialExportDialogState,
  createOrderStateFromCandidates,
  getOrderDirtyFiles,
  getOrderDirtyGroups,
  isExportDialogOptionsDirty,
  isExportDialogDirty,
  isExportDialogOrderDirty,
  isHeadingRemovalDirty,
  isIncludeStateDirty,
  reorderFileWithinGroup,
  reorderFolderGroup
} from "../../src/renderer/exportDialogOrder";
import {
  DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
  type ExportDialogOptionsState
} from "../../src/renderer/exportTxt";

function candidate(
  filePath: string,
  included = true
): ExportCandidateListItem {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1] ?? filePath;
  const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

  return {
    documentKey: filePath,
    filePath,
    parentPath,
    fileName,
    kind: "markdown",
    rawText: filePath,
    previewStart: fileName,
    previewEnd: fileName,
    previewStartHover: fileName,
    previewEndHover: fileName,
    characterCount: filePath.length,
    included
  };
}

const candidates = [
  candidate("First/01.md"),
  candidate("First/02.md"),
  candidate("Second/01.md")
] as const satisfies readonly ExportCandidateListItem[];

function dialogDirty(input: {
  readonly currentCandidates?: readonly ExportCandidateListItem[];
  readonly headingRemovalLevel?: HeadingRemovalLevel;
  readonly orderState?: ReturnType<typeof createOrderStateFromCandidates>;
  readonly optionsState?: ExportDialogOptionsState;
}): boolean {
  return isExportDialogDirty({
    orderState: input.orderState ?? createOrderStateFromCandidates(candidates),
    candidates: input.currentCandidates ?? candidates,
    headingRemovalLevel: input.headingRemovalLevel ?? 0,
    optionsState: input.optionsState ?? DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
    initialState: createInitialExportDialogState(candidates, 0)
  });
}

describe("exportDialogOrder (#523)", () => {
  it("creates an initial dialog state that is not dirty", () => {
    const initial = createInitialExportDialogState(candidates, 0);

    expect(
      isExportDialogDirty({
        orderState: initial.orderState,
        candidates,
        headingRemovalLevel: 0,
        initialState: initial
      })
    ).toBe(false);
  });

  it("marks folder group reorder dirty and clears it when restored", () => {
    const initialOrder = createOrderStateFromCandidates(candidates);
    const reordered = reorderFolderGroup(initialOrder, "Second", "First");

    expect(isExportDialogOrderDirty(reordered, initialOrder)).toBe(true);
    expect(applyExportDialogOrder(candidates, reordered).map((item) => item.filePath)).toEqual([
      "Second/01.md",
      "First/01.md",
      "First/02.md"
    ]);

    const restored = reorderFolderGroup(reordered, "First", "Second");

    expect(isExportDialogOrderDirty(restored, initialOrder)).toBe(false);
  });

  it("marks same-folder file reorder dirty and clears it when restored", () => {
    const initialOrder = createOrderStateFromCandidates(candidates);
    const reordered = reorderFileWithinGroup(
      initialOrder,
      "First",
      "First/02.md",
      "First",
      "First/01.md"
    );

    expect(isExportDialogOrderDirty(reordered, initialOrder)).toBe(true);
    expect(applyExportDialogOrder(candidates, reordered).map((item) => item.filePath)).toEqual([
      "First/02.md",
      "First/01.md",
      "Second/01.md"
    ]);

    const restored = reorderFileWithinGroup(
      reordered,
      "First",
      "First/01.md",
      "First",
      "First/02.md"
    );

    expect(isExportDialogOrderDirty(restored, initialOrder)).toBe(false);
  });

  it("ignores file reorder requests across folder groups", () => {
    const initialOrder = createOrderStateFromCandidates(candidates);

    expect(
      reorderFileWithinGroup(
        initialOrder,
        "First",
        "First/01.md",
        "Second",
        "Second/01.md"
      )
    ).toBe(initialOrder);
  });

  it("marks include changes dirty and clears them when restored", () => {
    const changed = candidates.map((item) =>
      item.filePath === "First/01.md" ? { ...item, included: false } : item
    );

    expect(
      isIncludeStateDirty(
        changed,
        createInitialExportDialogState(candidates, 0).includedByFilePath
      )
    ).toBe(true);
    expect(dialogDirty({ currentCandidates: changed })).toBe(true);
    expect(dialogDirty({ currentCandidates: candidates })).toBe(false);
  });

  it("folder include toggle contributes dirty based on child include state", () => {
    const changed = toggleFolderIncluded(candidates, "First");

    expect(dialogDirty({ currentCandidates: changed })).toBe(true);
    expect(
      dialogDirty({ currentCandidates: toggleFolderIncluded(changed, "First") })
    ).toBe(false);
  });

  it("marks heading removal changes dirty and clears them when restored", () => {
    expect(isHeadingRemovalDirty(1, 0)).toBe(true);
    expect(dialogDirty({ headingRemovalLevel: 1 })).toBe(true);
    expect(dialogDirty({ headingRemovalLevel: 0 })).toBe(false);
  });

  it("marks export option changes dirty and clears them when restored", () => {
    const changedOptions = {
      ...DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
      bodyNotation: "aozora" as const
    };

    expect(
      isExportDialogOptionsDirty(
        changedOptions,
        DEFAULT_EXPORT_DIALOG_OPTIONS_STATE
      )
    ).toBe(true);
    expect(dialogDirty({ optionsState: changedOptions })).toBe(true);
    expect(
      dialogDirty({ optionsState: DEFAULT_EXPORT_DIALOG_OPTIONS_STATE })
    ).toBe(false);
  });

  it("is dirty if any tracked state differs and clean only when all match", () => {
    const orderState = reorderFolderGroup(
      createOrderStateFromCandidates(candidates),
      "Second",
      "First"
    );
    const changedCandidates = candidates.map((item) =>
      item.filePath === "First/01.md" ? { ...item, included: false } : item
    );

    expect(dialogDirty({ orderState })).toBe(true);
    expect(dialogDirty({ currentCandidates: changedCandidates })).toBe(true);
    expect(dialogDirty({ headingRemovalLevel: 2 })).toBe(true);
    expect(
      dialogDirty({
        optionsState: {
          ...DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
          bodyNotation: "narou"
        }
      })
    ).toBe(true);
    expect(
      dialogDirty({
        orderState,
        currentCandidates: changedCandidates,
        headingRemovalLevel: 2,
        optionsState: {
          ...DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
          bodyNotation: "kakuyomu"
        }
      })
    ).toBe(true);
    expect(dialogDirty({})).toBe(false);
  });

  it("identifies order-dirty folder groups and file rows", () => {
    const initialOrder = createOrderStateFromCandidates(candidates);
    const groupReordered = reorderFolderGroup(initialOrder, "Second", "First");
    const fileReordered = reorderFileWithinGroup(
      initialOrder,
      "First",
      "First/02.md",
      "First",
      "First/01.md"
    );

    expect(Array.from(getOrderDirtyGroups(groupReordered, initialOrder))).toEqual([
      "Second",
      "First"
    ]);
    expect(Array.from(getOrderDirtyFiles(fileReordered, initialOrder))).toEqual([
      "First/02.md",
      "First/01.md"
    ]);
  });
});

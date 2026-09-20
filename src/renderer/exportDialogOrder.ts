import type {
  ExportCandidateListItem,
  HeadingRemovalLevel
} from "./exportCandidates";

export interface ExportDialogOrderState {
  readonly groupOrder: readonly string[];
  readonly fileOrderByGroup: Readonly<Record<string, readonly string[]>>;
}

export interface ExportDialogInitialState {
  readonly orderState: ExportDialogOrderState;
  readonly includedByFilePath: Readonly<Record<string, boolean>>;
  readonly headingRemovalLevel: HeadingRemovalLevel;
}

export function createOrderStateFromCandidates(
  candidates: readonly ExportCandidateListItem[]
): ExportDialogOrderState {
  const groupOrder: string[] = [];
  const fileOrderByGroup: Record<string, string[]> = {};

  for (const candidate of candidates) {
    if (!fileOrderByGroup[candidate.parentPath]) {
      groupOrder.push(candidate.parentPath);
      fileOrderByGroup[candidate.parentPath] = [];
    }
    fileOrderByGroup[candidate.parentPath].push(candidate.filePath);
  }

  return { groupOrder, fileOrderByGroup };
}

export function includedStateFromCandidates(
  candidates: readonly ExportCandidateListItem[]
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(
    candidates.map((candidate) => [candidate.filePath, candidate.included])
  );
}

export function createInitialExportDialogState(
  candidates: readonly ExportCandidateListItem[],
  headingRemovalLevel: HeadingRemovalLevel
): ExportDialogInitialState {
  return {
    orderState: createOrderStateFromCandidates(candidates),
    includedByFilePath: includedStateFromCandidates(candidates),
    headingRemovalLevel
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

export function applyExportDialogOrder(
  candidates: readonly ExportCandidateListItem[],
  orderState: ExportDialogOrderState
): readonly ExportCandidateListItem[] {
  const candidatesByFilePath = new Map(
    candidates.map((candidate) => [candidate.filePath, candidate])
  );
  const actualGroupOrder = uniqueStrings(
    candidates.map((candidate) => candidate.parentPath)
  );
  const groupOrder = [
    ...orderState.groupOrder,
    ...actualGroupOrder.filter(
      (parentPath) => !orderState.groupOrder.includes(parentPath)
    )
  ];
  const emitted = new Set<string>();
  const ordered: ExportCandidateListItem[] = [];

  for (const parentPath of groupOrder) {
    const groupCandidates = candidates.filter(
      (candidate) => candidate.parentPath === parentPath
    );
    const fallbackOrder = groupCandidates.map((candidate) => candidate.filePath);
    const fileOrder = [
      ...(orderState.fileOrderByGroup[parentPath] ?? []),
      ...fallbackOrder.filter(
        (filePath) =>
          !(orderState.fileOrderByGroup[parentPath] ?? []).includes(filePath)
      )
    ];

    for (const filePath of fileOrder) {
      const candidate = candidatesByFilePath.get(filePath);
      if (
        candidate &&
        candidate.parentPath === parentPath &&
        !emitted.has(filePath)
      ) {
        ordered.push(candidate);
        emitted.add(filePath);
      }
    }
  }

  return ordered.concat(
    candidates.filter((candidate) => !emitted.has(candidate.filePath))
  );
}

function reorderStringArray(
  values: readonly string[],
  draggedValue: string,
  targetValue: string
): readonly string[] {
  if (draggedValue === targetValue) {
    return values;
  }

  const fromIndex = values.indexOf(draggedValue);
  const toIndex = values.indexOf(targetValue);
  if (fromIndex === -1 || toIndex === -1) {
    return values;
  }

  const next = [...values];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderFolderGroup(
  orderState: ExportDialogOrderState,
  draggedParentPath: string,
  targetParentPath: string
): ExportDialogOrderState {
  return {
    ...orderState,
    groupOrder: reorderStringArray(
      orderState.groupOrder,
      draggedParentPath,
      targetParentPath
    )
  };
}

export function reorderFileWithinGroup(
  orderState: ExportDialogOrderState,
  draggedParentPath: string,
  draggedFilePath: string,
  targetParentPath: string,
  targetFilePath: string
): ExportDialogOrderState {
  if (draggedParentPath !== targetParentPath) {
    return orderState;
  }

  const currentOrder = orderState.fileOrderByGroup[draggedParentPath] ?? [];
  return {
    ...orderState,
    fileOrderByGroup: {
      ...orderState.fileOrderByGroup,
      [draggedParentPath]: reorderStringArray(
        currentOrder,
        draggedFilePath,
        targetFilePath
      )
    }
  };
}

export function isSameArrayOrder(
  first: readonly string[],
  second: readonly string[]
): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

export function isExportDialogOrderDirty(
  current: ExportDialogOrderState,
  initial: ExportDialogOrderState
): boolean {
  if (!isSameArrayOrder(current.groupOrder, initial.groupOrder)) {
    return true;
  }

  const parentPaths = uniqueStrings([
    ...current.groupOrder,
    ...initial.groupOrder,
    ...Object.keys(current.fileOrderByGroup),
    ...Object.keys(initial.fileOrderByGroup)
  ]);

  return parentPaths.some(
    (parentPath) =>
      !isSameArrayOrder(
        current.fileOrderByGroup[parentPath] ?? [],
        initial.fileOrderByGroup[parentPath] ?? []
      )
  );
}

export function isIncludeStateDirty(
  candidates: readonly ExportCandidateListItem[],
  initialIncludedByFilePath: Readonly<Record<string, boolean>>
): boolean {
  const current = includedStateFromCandidates(candidates);
  const filePaths = uniqueStrings([
    ...Object.keys(current),
    ...Object.keys(initialIncludedByFilePath)
  ]);

  return filePaths.some(
    (filePath) => current[filePath] !== initialIncludedByFilePath[filePath]
  );
}

export function isHeadingRemovalDirty(
  current: HeadingRemovalLevel,
  initial: HeadingRemovalLevel
): boolean {
  return current !== initial;
}

export function isExportDialogDirty(input: {
  readonly orderState: ExportDialogOrderState;
  readonly candidates: readonly ExportCandidateListItem[];
  readonly headingRemovalLevel: HeadingRemovalLevel;
  readonly initialState: ExportDialogInitialState;
}): boolean {
  return (
    isExportDialogOrderDirty(input.orderState, input.initialState.orderState) ||
    isIncludeStateDirty(
      input.candidates,
      input.initialState.includedByFilePath
    ) ||
    isHeadingRemovalDirty(
      input.headingRemovalLevel,
      input.initialState.headingRemovalLevel
    )
  );
}

export function getOrderDirtyGroups(
  current: ExportDialogOrderState,
  initial: ExportDialogOrderState
): ReadonlySet<string> {
  const dirty = new Set<string>();
  current.groupOrder.forEach((parentPath, index) => {
    if (initial.groupOrder.indexOf(parentPath) !== index) {
      dirty.add(parentPath);
    }
  });
  return dirty;
}

export function getOrderDirtyFiles(
  current: ExportDialogOrderState,
  initial: ExportDialogOrderState
): ReadonlySet<string> {
  const dirty = new Set<string>();

  for (const [parentPath, fileOrder] of Object.entries(
    current.fileOrderByGroup
  )) {
    const initialOrder = initial.fileOrderByGroup[parentPath] ?? [];
    fileOrder.forEach((filePath, index) => {
      if (initialOrder.indexOf(filePath) !== index) {
        dirty.add(filePath);
      }
    });
  }

  return dirty;
}

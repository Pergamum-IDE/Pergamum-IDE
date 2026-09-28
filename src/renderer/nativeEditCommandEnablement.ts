import { editorCommandIds, type EditCommandId } from "../shared/commandIds";

export interface ElementLike {
  readonly tagName?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly isContentEditable?: boolean;
  closest?(selector: string): ElementLike | null;
}

export function isNormalUiTextInput(element: ElementLike | null): boolean {
  if (!element || typeof element !== "object") {
    return false;
  }

  const tagName = element.tagName ? element.tagName.toLowerCase() : "";
  const isInputOrTextarea = tagName === "input" || tagName === "textarea";
  const isContentEditable = Boolean(element.isContentEditable);

  if (!isInputOrTextarea && !isContentEditable) {
    return false;
  }

  if (element.disabled || element.readOnly) {
    return false;
  }

  if (typeof element.closest === "function") {
    if (
      element.closest(".cm-editor") ||
      element.closest("[data-pergamum-context-surface]")
    ) {
      return false;
    }

    if (
      element.closest(".commandPaletteInput") ||
      element.closest(".commandPaletteModal") ||
      element.closest("[data-command-palette]")
    ) {
      return false;
    }
  }

  return true;
}

export function canDelegateNativeEditCommand(input: {
  commandId: string;
  isReadOnlyProjectOwnedEditor: boolean;
  activeElement?: ElementLike | null;
}): boolean {
  const { commandId, isReadOnlyProjectOwnedEditor } = input;

  if (
    commandId === editorCommandIds.copySelection ||
    commandId === editorCommandIds.selectAllSelection
  ) {
    return true;
  }

  const activeElement =
    input.activeElement !== undefined
      ? input.activeElement
      : typeof document !== "undefined"
        ? document.activeElement
        : null;

  if (isNormalUiTextInput(activeElement)) {
    return true;
  }

  if (isReadOnlyProjectOwnedEditor) {
    return false;
  }

  return true;
}

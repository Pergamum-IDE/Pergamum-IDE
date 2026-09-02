import type { EditCommandId } from "./commandIds";
import { editCommandIds, isEditCommandId } from "./commandIds";
import type { TranslationKey } from "./i18n";

export const pergamumContextSurfaceAttribute =
  "data-pergamum-context-surface" as const;

export const editableContextSurfaces = [
  "markdownEditor",
  "glossaryDescription",
  "glossaryAtomValue"
] as const;

export const contextMenuSurfaces = [
  ...editableContextSurfaces,
  "unknownEditable"
] as const;

export type EditableContextSurface = (typeof editableContextSurfaces)[number];
export type ContextMenuSurface = (typeof contextMenuSurfaces)[number];

export interface EditContextMenuItemDefinition {
  readonly commandId: EditCommandId;
  readonly labelKey: TranslationKey;
}

export interface EditContextMenuItemState {
  readonly commandId: EditCommandId;
  readonly enabled: boolean;
}

export interface EditContextMenuPopupRequest {
  readonly interactionId: string;
  readonly requestedSurface: EditableContextSurface;
  readonly items: readonly EditContextMenuItemState[];
}

export interface EditContextMenuCommandSelection {
  readonly interactionId: string;
  readonly commandId: EditCommandId;
  readonly requestedSurface: EditableContextSurface;
}

export interface NativeEditDelegationRequest {
  readonly interactionId: string;
  readonly commandId: EditCommandId;
  readonly requestedSurface: EditableContextSurface;
  readonly delegatedSurface: ContextMenuSurface;
  readonly editorIdKind?: string;
  readonly hasSelection?: boolean;
}

export const editContextMenuItems: readonly EditContextMenuItemDefinition[] = [
  {
    commandId: editCommandIds[0],
    labelKey: "menu.cut"
  },
  {
    commandId: editCommandIds[1],
    labelKey: "menu.copy"
  },
  {
    commandId: editCommandIds[2],
    labelKey: "menu.paste"
  },
  {
    commandId: editCommandIds[3],
    labelKey: "menu.selectAll"
  }
] as const;

function includesValue<TValue extends string>(
  values: readonly TValue[],
  value: unknown
): value is TValue {
  return typeof value === "string" && values.includes(value as TValue);
}

export function isEditableContextSurface(
  value: unknown
): value is EditableContextSurface {
  return includesValue(editableContextSurfaces, value);
}

export function isContextMenuSurface(
  value: unknown
): value is ContextMenuSurface {
  return includesValue(contextMenuSurfaces, value);
}

export function isEditContextMenuCommandId(
  value: unknown
): value is EditCommandId {
  return typeof value === "string" && isEditCommandId(value);
}

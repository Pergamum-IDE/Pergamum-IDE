import type { EditCommandId } from "../shared/commandIds";
import {
  CommandDisabledError,
  type CommandArgumentList,
  type CommandId,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { DebugLogEditorIdKind, DebugLogLevel } from "../shared/debugLog";
import {
  editContextMenuItems,
  isEditableContextSurface,
  pergamumContextSurfaceAttribute,
  type ContextMenuSurface,
  type EditContextMenuCommandSelection,
  type EditContextMenuPopupRequest,
  type EditableContextSurface,
  type NativeEditDelegationRequest
} from "../shared/editContextMenu";

export interface ContextMenuEventLike {
  readonly target: unknown;
  readonly clientX: number;
  readonly clientY: number;
  preventDefault(): void;
}

/**
 * Everything captured at right-click time for the renderer-drawn edit menu.
 * The menu itself takes focus while open, so `focusTarget` is what lets the
 * owner hand focus back to the intended editable element before a command runs.
 */
export interface EditContextMenuOpenRequest {
  readonly request: EditContextMenuPopupRequest;
  readonly x: number;
  readonly y: number;
  readonly editorIdKind: DebugLogEditorIdKind;
  readonly hasSelection: boolean;
  readonly focusTarget: FocusableLike | null;
}

export interface FocusableLike {
  readonly isConnected?: boolean;
  focus(options?: FocusOptions): void;
}

export interface RendererEditContextMenuLogInput {
  readonly level: DebugLogLevel;
  readonly event:
    | "contextMenu.requested"
    | "contextMenu.opened"
    | "contextMenu.command.selected"
    | "contextMenu.suppressed"
    | "edit.command.requested"
    | "edit.command.ignored"
    | "edit.command.failed";
  readonly details: Record<string, unknown>;
}

export type RendererEditContextMenuLogger = (
  input: RendererEditContextMenuLogInput
) => void;

export interface NativeEditCommandContext
  extends NativeEditDelegationRequest {}

interface ElementLike {
  readonly parentElement: ElementLike | null;
  getAttribute(name: string): string | null;
}

function isElementLike(value: unknown): value is ElementLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "getAttribute" in value &&
    typeof (value as { getAttribute?: unknown }).getAttribute === "function"
  );
}

function elementFromTarget(target: unknown): ElementLike | null {
  if (isElementLike(target)) {
    return target;
  }

  if (
    typeof target === "object" &&
    target !== null &&
    "parentElement" in target &&
    isElementLike((target as { parentElement?: unknown }).parentElement)
  ) {
    return (target as { parentElement: ElementLike }).parentElement;
  }

  return null;
}

export function editableContextSurfaceFromTarget(
  target: unknown
): EditableContextSurface | null {
  let current = elementFromTarget(target);

  while (current) {
    const surface = current.getAttribute(pergamumContextSurfaceAttribute);

    if (surface !== null) {
      return isEditableContextSurface(surface) ? surface : null;
    }

    current = current.parentElement;
  }

  return null;
}

export function delegatedContextSurfaceFromTarget(
  target: unknown
): ContextMenuSurface {
  return editableContextSurfaceFromTarget(target) ?? "unknownEditable";
}

/**
 * Observes the focus target at element granularity (`document.activeElement`)
 * immediately before native edit delegation.
 *
 * The renderer-drawn edit menu (#685) takes focus while open, so the owner
 * restores focus to the right-click target before running a command. This is
 * the safety check that the restore worked: if the focus is somewhere else, it
 * returns `unknownEditable`, diverges from `requestedSurface`, and the command
 * is not delegated (`webContents.cut()` etc. act on whatever has focus).
 *
 * Element granularity is required. Do not replace this with a window- or
 * frame-level focus check (a window-granularity `isFocused()` variant was tried
 * against the old native menu and could never be false).
 *
 * ネイティブ編集委譲の直前に、要素粒度（`document.activeElement`）でフォーカス
 * 対象を観測する。
 *
 * renderer 描画の編集メニュー（#685）は開いている間フォーカスを持つため、
 * 呼び出し側はコマンド実行前にフォーカスを右クリック対象へ戻す。ここはその復元が
 * 成功したかの安全確認で、別の要素にフォーカスがあれば `unknownEditable` を返して
 * `requestedSurface` と乖離し、コマンドは委譲されない
 * （`webContents.cut()` 等はフォーカス中の要素に作用するため）。
 *
 * 要素粒度であることが要件。ウィンドウ／フレーム粒度のフォーカス判定に
 * 置き換えないこと。
 */
export function delegatedContextSurfaceFromDocument(
  documentLike?: Pick<Document, "activeElement">
): ContextMenuSurface {
  const activeElement =
    documentLike?.activeElement ??
    (typeof document === "undefined" ? null : document.activeElement);

  return delegatedContextSurfaceFromTarget(activeElement);
}

function isTextSelectionControl(
  value: unknown
): value is { selectionStart: number | null; selectionEnd: number | null } {
  return (
    typeof value === "object" &&
    value !== null &&
    "selectionStart" in value &&
    "selectionEnd" in value
  );
}

export function hasSelectionInDocument(
  documentLike?: Pick<Document, "activeElement">,
  getSelection?: () => Selection | null
): boolean {
  const activeElement =
    documentLike?.activeElement ??
    (typeof document === "undefined" ? null : document.activeElement);

  if (isTextSelectionControl(activeElement)) {
    return (
      activeElement.selectionStart !== null &&
      activeElement.selectionEnd !== null &&
      activeElement.selectionStart !== activeElement.selectionEnd
    );
  }

  const selectionProvider =
    getSelection ??
    (typeof window === "undefined"
      ? undefined
      : () => window.getSelection());
  const selection = selectionProvider?.();

  return selection ? !selection.isCollapsed : false;
}

export function createContextMenuInteractionIdFactory(): () => string {
  let nextInteractionIndex = 0;

  return () => {
    nextInteractionIndex += 1;
    return `contextMenu.${nextInteractionIndex}`;
  };
}

export function editContextMenuPopupRequest(input: {
  commandRegistry: CommandRegistry;
  interactionId: string;
  requestedSurface: EditableContextSurface;
}): EditContextMenuPopupRequest {
  return {
    interactionId: input.interactionId,
    requestedSurface: input.requestedSurface,
    items: editContextMenuItems.map((item) => ({
      commandId: item.commandId,
      enabled: input.commandRegistry.isEnabled(item.commandId)
    }))
  };
}

// Right-clicking during IME composition force-commits the pending text as-is —
// unconverted kana, not the selected candidate.
//
// This is a Chromium constraint, not a deliberate choice here. Verified 2026-08-16
// on Windows by temporarily removing the `event.preventDefault()` call below: the
// behavior is unchanged, so composition ends before the contextmenu event reaches
// this handler. VSCode (also Electron) behaves identically; Hidemaru (native Win32)
// preserves the composition, so this is a limitation of the runtime rather than of
// the platform.
//
// Avoiding it would require intervening in Chromium's composition handling, which
// is out of proportion to the cost: the text is committed early, not corrupted, and
// right-clicking mid-conversion is not part of a normal writing flow.
//
// IME 変換中の右クリックは、未確定文字列を未変換のまま強制確定させる。
// 選択中の変換候補ではなく、ひらがなのまま確定される。
//
// これは Chromium の制約であり、ここでの意図的な選択ではない。2026-08-16 Windows 実測、
// 下記の `event.preventDefault()` を一時的に外して検証済み。挙動は変わらないため、
// contextmenu イベントがこのハンドラに届く前にコンポジションが終了している。
// 同じく Electron 製の VSCode も同挙動。ネイティブ Win32 の秀丸は変換中文字列を
// 保護するため、プラットフォームではなくランタイムの制約である。
//
// 回避には Chromium のコンポジション処理への介入が必要で、費用に見合わない。
// 文字列は破壊されず確定が早まるだけであり、変換中の右クリックは通常の執筆
// フローに含まれない。
export function handleEditContextMenuEvent(
  event: ContextMenuEventLike,
  input: {
    commandRegistry: CommandRegistry;
    nextInteractionId: () => string;
    editorIdKind: DebugLogEditorIdKind;
    hasSelection: () => boolean;
    log: RendererEditContextMenuLogger;
    openEditMenu: (menu: EditContextMenuOpenRequest) => void;
    documentLike?: Pick<Document, "activeElement">;
  }
): boolean {
  event.preventDefault();

  const interactionId = input.nextInteractionId();
  const requestedSurface = editableContextSurfaceFromTarget(event.target);

  if (!requestedSurface) {
    input.log({
      level: "debug",
      event: "contextMenu.suppressed",
      details: {
        interactionId,
        requestedSurface: "unknownEditable",
        editorIdKind: input.editorIdKind,
        result: "ignored",
        reason: "unsupported_surface"
      }
    });
    return false;
  }

  const request = editContextMenuPopupRequest({
    commandRegistry: input.commandRegistry,
    interactionId,
    requestedSurface
  });

  const hasSelection = input.hasSelection();

  input.log({
    level: "debug",
    event: "contextMenu.requested",
    details: {
      interactionId,
      requestedSurface,
      editorIdKind: input.editorIdKind,
      hasSelection
    }
  });

  input.openEditMenu({
    request,
    x: event.clientX,
    y: event.clientY,
    editorIdKind: input.editorIdKind,
    hasSelection,
    focusTarget: focusTargetForSurface(input.documentLike)
  });
  input.log({
    level: "debug",
    event: "contextMenu.opened",
    details: { interactionId, requestedSurface }
  });
  return true;
}

/**
 * The element that holds focus when the menu is requested, provided it is
 * inside a supported editable surface. Right-clicking focuses the editable
 * element first, so this is the element commands must act on.
 */
function focusTargetForSurface(
  documentLike?: Pick<Document, "activeElement">
): FocusableLike | null {
  const activeElement =
    documentLike?.activeElement ??
    (typeof document === "undefined" ? null : document.activeElement);

  return editableContextSurfaceFromTarget(activeElement) !== null &&
    activeElement !== null &&
    typeof (activeElement as { focus?: unknown }).focus === "function"
    ? (activeElement as unknown as FocusableLike)
    : null;
}

/**
 * Hands focus back to the right-click target (the menu item that was clicked
 * holds focus until now). Returns whether the target could be refocused.
 */
export function restoreContextMenuFocus(
  focusTarget: FocusableLike | null
): boolean {
  if (!focusTarget || focusTarget.isConnected === false) {
    return false;
  }

  focusTarget.focus({ preventScroll: true });
  return true;
}

export async function executeContextMenuEditCommand<TCommandId extends EditCommandId>(
  selection: EditContextMenuCommandSelection & { commandId: TCommandId },
  input: {
    commandRegistry: CommandRegistry;
    editorIdKind: DebugLogEditorIdKind;
    delegatedSurface: ContextMenuSurface;
    hasSelection: boolean;
    log: RendererEditContextMenuLogger;
    setNativeEditCommandContext: (
      context: NativeEditCommandContext | null
    ) => void;
    clearNativeEditCommandContext: (context: NativeEditCommandContext) => void;
  }
): Promise<boolean> {
  const context: NativeEditCommandContext = {
    interactionId: selection.interactionId,
    commandId: selection.commandId,
    requestedSurface: selection.requestedSurface,
    delegatedSurface: input.delegatedSurface,
    editorIdKind: input.editorIdKind,
    hasSelection: input.hasSelection
  };

  input.log({
    level: "debug",
    event: "edit.command.requested",
    details: { ...context }
  });

  if (!input.commandRegistry.isEnabled(selection.commandId)) {
    input.log({
      level: "debug",
      event: "edit.command.ignored",
      details: {
        ...context,
        result: "ignored",
        reason: "disabled_command"
      }
    });
    return false;
  }

  // Native delegation acts on whatever has focus. If focus did not return to
  // the surface the menu was opened on, do not delegate to the wrong element.
  if (input.delegatedSurface !== selection.requestedSurface) {
    input.log({
      level: "debug",
      event: "edit.command.ignored",
      details: {
        ...context,
        result: "ignored",
        reason: "active_editor_changed"
      }
    });
    return false;
  }

  input.setNativeEditCommandContext(context);

  try {
    await input.commandRegistry.execute(
      selection.commandId as CommandId<readonly [], void>,
      { source: "contextMenu" },
      ...([] as CommandArgumentList<readonly []>)
    );
  } catch (error) {
    if (error instanceof CommandDisabledError) {
      input.log({
        level: "debug",
        event: "edit.command.ignored",
        details: {
          ...context,
          result: "ignored",
          reason: error.reason
        }
      });
      return false;
    }

    input.log({
      level: "error",
      event: "edit.command.failed",
      details: {
        ...context,
        result: "failed"
      }
    });
    throw error;
  } finally {
    input.clearNativeEditCommandContext(context);
  }

  return true;
}

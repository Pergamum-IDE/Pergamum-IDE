import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { EDIT_CHANNELS } from "../shared/api";
import { editorCommandIds, type EditCommandId } from "../shared/commandIds";
import {
  isContextMenuSurface,
  isEditContextMenuCommandId,
  isEditableContextSurface,
  type NativeEditDelegationRequest
} from "../shared/editContextMenu";
import type { DebugLogger } from "./debugLogger";

type NativeEditWebContents = Pick<
  Electron.WebContents,
  "isDestroyed" | "cut" | "copy" | "paste" | "selectAll"
>;

const safeInteractionIdPattern = /^[A-Za-z0-9_.-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeInteractionId(value: unknown): string | null {
  return typeof value === "string" && safeInteractionIdPattern.test(value)
    ? value
    : null;
}

function partialInteractionIdDetails(
  rawRequest: unknown
): { readonly interactionId?: string } {
  if (!isRecord(rawRequest)) {
    return {};
  }

  const interactionId = sanitizeInteractionId(rawRequest.interactionId);

  return interactionId ? { interactionId } : {};
}

function nativeEditRequestFromRaw(
  rawRequest: unknown
): NativeEditDelegationRequest | null {
  if (!isRecord(rawRequest)) {
    return null;
  }

  const interactionId = sanitizeInteractionId(rawRequest.interactionId);
  const commandId = rawRequest.commandId;
  const requestedSurface = rawRequest.requestedSurface;
  const delegatedSurface = rawRequest.delegatedSurface;

  if (
    !interactionId ||
    !isEditContextMenuCommandId(commandId) ||
    !isEditableContextSurface(requestedSurface) ||
    !isContextMenuSurface(delegatedSurface)
  ) {
    return null;
  }

  return {
    interactionId,
    commandId,
    requestedSurface,
    delegatedSurface,
    ...(typeof rawRequest.editorIdKind === "string"
      ? { editorIdKind: rawRequest.editorIdKind }
      : {}),
    ...(typeof rawRequest.hasSelection === "boolean"
      ? { hasSelection: rawRequest.hasSelection }
      : {})
  };
}

function nativeEditOperation(
  webContents: NativeEditWebContents,
  commandId: EditCommandId
): void {
  switch (commandId) {
    case editorCommandIds.cutSelection:
      webContents.cut();
      return;
    case editorCommandIds.copySelection:
      webContents.copy();
      return;
    case editorCommandIds.pasteSelection:
      webContents.paste();
      return;
    case editorCommandIds.selectAllSelection:
      webContents.selectAll();
      return;
  }
}

function logNativeEditFailed(
  debugLogger: Pick<DebugLogger, "log"> | undefined,
  request: NativeEditDelegationRequest,
  reason: "web_contents_destroyed" | "native_delegation_unavailable"
): void {
  debugLogger?.log({
    level: "error",
    event: "edit.command.failed",
    details: {
      interactionId: request.interactionId,
      commandId: request.commandId,
      requestedSurface: request.requestedSurface,
      delegatedSurface: request.delegatedSurface,
      result: "failed",
      reason,
      ...(request.editorIdKind ? { editorIdKind: request.editorIdKind } : {}),
      ...(request.hasSelection !== undefined
        ? { hasSelection: request.hasSelection }
        : {})
    }
  });
}

function logMalformedNativeEditRequest(
  debugLogger: Pick<DebugLogger, "log"> | undefined,
  rawRequest: unknown
): void {
  debugLogger?.log({
    level: "error",
    event: "edit.command.failed",
    details: {
      ...partialInteractionIdDetails(rawRequest),
      result: "failed",
      reason: "invalid_command"
    }
  });
}

export function delegateNativeEditCommand(input: {
  request: NativeEditDelegationRequest;
  webContents: NativeEditWebContents;
  debugLogger?: Pick<DebugLogger, "log">;
}): boolean {
  const { request, webContents, debugLogger } = input;

  if (webContents.isDestroyed()) {
    logNativeEditFailed(debugLogger, request, "web_contents_destroyed");
    return false;
  }

  try {
    nativeEditOperation(webContents, request.commandId);
  } catch {
    logNativeEditFailed(
      debugLogger,
      request,
      "native_delegation_unavailable"
    );
    return false;
  }

  debugLogger?.log({
    level: "debug",
    event: "edit.command.delegated",
    details: {
      interactionId: request.interactionId,
      commandId: request.commandId,
      requestedSurface: request.requestedSurface,
      delegatedSurface: request.delegatedSurface,
      ...(request.editorIdKind ? { editorIdKind: request.editorIdKind } : {}),
      ...(request.hasSelection !== undefined
        ? { hasSelection: request.hasSelection }
        : {})
    }
  });

  return true;
}

function handleNativeEditDelegation(
  event: IpcMainInvokeEvent,
  rawRequest: unknown,
  debugLogger?: Pick<DebugLogger, "log">
): boolean {
  const request = nativeEditRequestFromRaw(rawRequest);

  if (!request) {
    logMalformedNativeEditRequest(debugLogger, rawRequest);
    return false;
  }

  return delegateNativeEditCommand({
    request,
    webContents: event.sender,
    debugLogger
  });
}

export function registerContextMenuIpc(
  debugLogger?: Pick<DebugLogger, "log">
): void {
  ipcMain.handle(EDIT_CHANNELS.delegateNativeEdit, (event, rawRequest) =>
    handleNativeEditDelegation(event, rawRequest, debugLogger)
  );
}

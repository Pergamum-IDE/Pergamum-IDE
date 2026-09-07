/**
 * #407 B2: IPC handler for saving clipboard image attachments.
 *
 * Channel: `imageAttachment:save`.
 *
 * The renderer passes `{ saveDirectory, bytes, reportedMimeType }`.
 * The project root path is NEVER accepted from the renderer — it is resolved
 * authoritatively from the main process's current project state
 * (`currentProjectRootPath()`). If no project is open, it returns
 * `{ ok: false, reason: "projectNotOpen" }`.
 */

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  IMAGE_ATTACHMENT_CHANNELS,
  type SaveImageAttachmentPayload,
  type SaveImageAttachmentResult
} from "../shared/api";
import type { SaveImageAttachmentStorageResult } from "../shared/imageAttachmentSaveResult";
import { currentProjectRootPath as defaultCurrentProjectRootPath } from "./projectIpc";
import {
  saveImageAttachment as defaultSaveImageAttachment,
  type SaveImageAttachmentRequest,
  type SaveImageAttachmentDeps
} from "./imageAttachmentSave";

export interface ImageAttachmentIpcDeps {
  readonly currentProjectRootPath?: () => string | null;
  readonly saveImageAttachment?: (
    request: SaveImageAttachmentRequest,
    deps?: SaveImageAttachmentDeps
  ) => Promise<SaveImageAttachmentStorageResult>;
  readonly ipcMain?: {
    handle: (
      channel: string,
      listener: (
        event: IpcMainInvokeEvent,
        payload: unknown
      ) => Promise<SaveImageAttachmentResult>
    ) => void;
  };
}

export function registerImageAttachmentIpc(
  deps: ImageAttachmentIpcDeps = {}
): void {
  const ipc = deps.ipcMain ?? ipcMain;
  const getProjectRootPath =
    deps.currentProjectRootPath ?? defaultCurrentProjectRootPath;
  const save = deps.saveImageAttachment ?? defaultSaveImageAttachment;

  ipc.handle(
    IMAGE_ATTACHMENT_CHANNELS.save,
    async (_event, payload: unknown): Promise<SaveImageAttachmentResult> => {
      const projectRootPath = getProjectRootPath();
      if (!projectRootPath) {
        return { ok: false, reason: "projectNotOpen" };
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        typeof (payload as Partial<SaveImageAttachmentPayload>).saveDirectory !==
          "string" ||
        !((payload as Partial<SaveImageAttachmentPayload>).bytes instanceof
          Uint8Array) ||
        typeof (payload as Partial<SaveImageAttachmentPayload>)
          .reportedMimeType !== "string"
      ) {
        return { ok: false, reason: "invalidPath" };
      }

      const { saveDirectory, bytes, reportedMimeType } =
        payload as SaveImageAttachmentPayload;

      return save({
        projectRootPath,
        saveDirectory,
        bytes,
        reportedMimeType
      });
    }
  );
}

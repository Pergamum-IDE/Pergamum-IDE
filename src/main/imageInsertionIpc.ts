/**
 * #535: IPC handlers for the "Insert image" toolbar command — OS file
 * picker, asset-folder creation, dry-run copy plan, and the actual copy.
 *
 * The project root path is NEVER accepted from the renderer, matching
 * `imageAttachmentIpc.ts` — it is resolved authoritatively from the main
 * process's current project state. Every handler returns
 * `{ ok: false, reason: "projectNotOpen" }` (or an empty pick result) when
 * no project is open.
 */

import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { promises as nodeFs } from "node:fs";
import {
  IMAGE_INSERTION_CHANNELS,
  type CopyImageInsertionFilesRequest,
  type CopyImageInsertionFilesResult,
  type EnsureImageInsertionFolderResult,
  type PickImageInsertionFilesResult,
  type PlanImageInsertionCopyRequest,
  type PlanImageInsertionCopyResult
} from "../shared/api";
import type { AppPlatform } from "../shared/platform";
import { IMAGE_INSERTION_FILE_DIALOG_EXTENSIONS } from "../shared/imageInsertion";
import { currentProjectRootPath as defaultCurrentProjectRootPath } from "./projectIpc";
import {
  resolveAndPrepareImageAttachmentDestination,
  type ImageAttachmentDestinationFileSystem
} from "./imageAttachmentDestination";
import {
  copyImageInsertionFiles as defaultCopyImageInsertionFiles,
  planImageInsertionCopy as defaultPlanImageInsertionCopy
} from "./imageInsertionCopy";

function nodePlatformToAppPlatform(platform: NodeJS.Platform): AppPlatform {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "other";
  }
}

export interface ImageInsertionIpcDeps {
  readonly currentProjectRootPath?: () => string | null;
  readonly planImageInsertionCopy?: typeof defaultPlanImageInsertionCopy;
  readonly copyImageInsertionFiles?: typeof defaultCopyImageInsertionFiles;
  readonly ipcMain?: Pick<typeof ipcMain, "handle">;
}

function parentWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function registerImageInsertionIpc(deps: ImageInsertionIpcDeps = {}): void {
  const ipc = deps.ipcMain ?? ipcMain;
  const getProjectRootPath =
    deps.currentProjectRootPath ?? defaultCurrentProjectRootPath;
  const planCopy = deps.planImageInsertionCopy ?? defaultPlanImageInsertionCopy;
  const copyFiles = deps.copyImageInsertionFiles ?? defaultCopyImageInsertionFiles;

  ipc.handle(
    IMAGE_INSERTION_CHANNELS.pickFiles,
    async (event): Promise<PickImageInsertionFilesResult> => {
      const owner = parentWindow(event);
      const options: Electron.OpenDialogOptions = {
        title: "Select images to insert",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Images",
            extensions: [...IMAGE_INSERTION_FILE_DIALOG_EXTENSIONS]
          }
        ]
      };

      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled) {
        return { paths: [] };
      }

      // Paths only — reads/validation happen in the dry-run / copy round
      // trips, same division of labor as #420's pickTextImportSources.
      return { paths: result.filePaths };
    }
  );

  ipc.handle(
    IMAGE_INSERTION_CHANNELS.ensureFolder,
    async (_event, rawSaveDirectory: unknown): Promise<EnsureImageInsertionFolderResult> => {
      const projectRootPath = getProjectRootPath();
      if (!projectRootPath) {
        return { ok: false, reason: "projectNotOpen" };
      }
      if (typeof rawSaveDirectory !== "string") {
        return { ok: false, reason: "invalidPath" };
      }

      const result = await resolveAndPrepareImageAttachmentDestination(
        {
          projectRootPath,
          saveDirectory: rawSaveDirectory,
          platform: nodePlatformToAppPlatform(process.platform)
        },
        nodeFs as unknown as ImageAttachmentDestinationFileSystem
      );

      return result.ok ? { ok: true } : { ok: false, reason: result.reason };
    }
  );

  ipc.handle(
    IMAGE_INSERTION_CHANNELS.planCopy,
    async (_event, payload: unknown): Promise<PlanImageInsertionCopyResult> => {
      const projectRootPath = getProjectRootPath();
      if (!projectRootPath) {
        return { ok: false, reason: "projectNotOpen" };
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        typeof (payload as Partial<PlanImageInsertionCopyRequest>).saveDirectory !==
          "string" ||
        !isStringArray(
          (payload as Partial<PlanImageInsertionCopyRequest>).sourcePaths
        )
      ) {
        return { ok: false, reason: "invalidPath" };
      }

      const { saveDirectory, sourcePaths } =
        payload as PlanImageInsertionCopyRequest;

      return planCopy({ saveDirectory, sourcePaths }, projectRootPath);
    }
  );

  ipc.handle(
    IMAGE_INSERTION_CHANNELS.copyFiles,
    async (_event, payload: unknown): Promise<CopyImageInsertionFilesResult> => {
      const projectRootPath = getProjectRootPath();
      if (!projectRootPath) {
        return { ok: false, reason: "projectNotOpen" };
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        typeof (payload as Partial<CopyImageInsertionFilesRequest>).saveDirectory !==
          "string" ||
        !isStringArray(
          (payload as Partial<CopyImageInsertionFilesRequest>).sourcePaths
        ) ||
        typeof (payload as Partial<CopyImageInsertionFilesRequest>).allowOverwrite !==
          "boolean"
      ) {
        return { ok: false, reason: "invalidPath" };
      }

      const { saveDirectory, sourcePaths, allowOverwrite } =
        payload as CopyImageInsertionFilesRequest;

      return copyFiles(
        { saveDirectory, sourcePaths, allowOverwrite },
        projectRootPath
      );
    }
  );
}

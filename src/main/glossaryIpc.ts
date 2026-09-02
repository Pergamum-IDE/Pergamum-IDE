import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type MessageBoxOptions
} from "electron";
import {
  GLOSSARY_CHANNELS,
  type DeleteGlossaryEntryRequest,
  type DeleteGlossaryEntryResult,
  type DeleteGlossaryTagRequest,
  type DeleteGlossaryTagResult,
  type GlossaryEntryIdRequest
} from "../shared/api";
import {
  validateCreateGlossaryEntryInput,
  validateCreateGlossaryTagInput,
  validateGlossaryEntryId,
  validateGlossaryTagId,
  validateUpdateGlossaryEntryInput,
  validateUpdateGlossaryTagInput,
  type GlossaryEntry,
  type GlossaryTag,
  type UpdateGlossaryEntryInput
} from "../shared/glossary";
import {
  createGlossaryEntry,
  createGlossaryTag,
  deleteGlossaryEntry,
  deleteGlossaryTag,
  getGlossaryEntryById,
  GlossaryStoreError,
  listGlossaryEntries,
  listGlossaryTags,
  updateGlossaryEntry,
  updateGlossaryTag
} from "./glossaryStore";
import {
  openProjectDatabase,
  type ProjectDatabase
} from "./projectDatabase";
import { requireCurrentActiveProjectFilePath } from "./projectIpc";
import { getDebugLogger, type DebugLogger } from "./debugLogger";

export type CurrentActiveProjectFilePathProvider = () => string;

// index 0 ("OK") confirms the deletion; index 1 ("Cancel") is both the
// default and cancel action, matching every dismiss path to a single safe
// "do not delete".
const DELETE_CONFIRM_BUTTON_INDEX = {
  ok: 0,
  cancel: 1
} as const;

export type ConfirmGlossaryDeletion = (
  event: IpcMainInvokeEvent | undefined,
  confirmMessage: string
) => Promise<boolean>;

export interface GlossaryIpcHandlers {
  create(rawRequest: unknown): Promise<GlossaryEntry>;
  getById(rawRequest: unknown): Promise<GlossaryEntry | null>;
  list(): Promise<GlossaryEntry[]>;
  update(rawRequest: unknown): Promise<GlossaryEntry>;
  delete(
    rawRequest: unknown,
    event?: IpcMainInvokeEvent
  ): Promise<DeleteGlossaryEntryResult>;
  listTags(): Promise<GlossaryTag[]>;
  createTag(rawRequest: unknown): Promise<GlossaryTag>;
  updateTag(rawRequest: unknown): Promise<GlossaryTag>;
  deleteTag(
    rawRequest: unknown,
    event?: IpcMainInvokeEvent
  ): Promise<DeleteGlossaryTagResult>;
}

function isRequestObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function durationSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function parseGlossaryEntryIdRequest(value: unknown): GlossaryEntryIdRequest {
  if (!isRequestObject(value)) {
    throw new Error("Invalid glossary entry ID request.");
  }

  return { id: validateGlossaryEntryId(value.id) };
}

function parseDeleteRequest(
  value: unknown,
  validateId: (id: unknown) => string
): { id: string; confirmMessage: string } {
  if (!isRequestObject(value)) {
    throw new Error("Invalid glossary delete request.");
  }

  if (
    typeof value.confirmMessage !== "string" ||
    value.confirmMessage.length === 0
  ) {
    throw new Error("Invalid glossary delete confirmation message.");
  }

  return {
    id: validateId(value.id),
    confirmMessage: value.confirmMessage
  };
}

function parseDeleteGlossaryEntryRequest(
  value: unknown
): DeleteGlossaryEntryRequest {
  return parseDeleteRequest(value, (id) => validateGlossaryEntryId(id));
}

function parseDeleteGlossaryTagRequest(
  value: unknown
): DeleteGlossaryTagRequest {
  return parseDeleteRequest(value, (id) => validateGlossaryTagId(id));
}

function parentWindow(
  event: IpcMainInvokeEvent | undefined
): BrowserWindow | undefined {
  return event
    ? BrowserWindow.fromWebContents(event.sender) ?? undefined
    : undefined;
}

async function confirmDeletionWithDialog(
  event: IpcMainInvokeEvent | undefined,
  confirmMessage: string
): Promise<boolean> {
  const owner = parentWindow(event);
  const options: MessageBoxOptions = {
    type: "warning",
    message: confirmMessage,
    buttons: ["OK", "Cancel"],
    defaultId: DELETE_CONFIRM_BUTTON_INDEX.cancel,
    cancelId: DELETE_CONFIRM_BUTTON_INDEX.cancel
  };
  const result = owner
    ? await dialog.showMessageBox(owner, options)
    : await dialog.showMessageBox(options);

  return result?.response === DELETE_CONFIRM_BUTTON_INDEX.ok;
}

function isMissingGlossaryStoreError(error: unknown): boolean {
  return (
    error instanceof GlossaryStoreError &&
    (error.code === "GLOSSARY_ENTRY_NOT_FOUND" ||
      error.code === "GLOSSARY_TAG_NOT_FOUND")
  );
}

async function withCurrentProjectDatabase<T>(
  getCurrentActiveProjectFilePath: CurrentActiveProjectFilePathProvider,
  logger: DebugLogger,
  operation: (database: ProjectDatabase) => Promise<T>
): Promise<T> {
  const activeProjectFilePath = getCurrentActiveProjectFilePath();
  const database = await openProjectDatabase(activeProjectFilePath, logger);

  try {
    return await operation(database);
  } finally {
    await database.close();
  }
}

export function createGlossaryIpcHandlers(
  getCurrentActiveProjectFilePath: CurrentActiveProjectFilePathProvider =
    requireCurrentActiveProjectFilePath,
  confirmDeletion: ConfirmGlossaryDeletion = confirmDeletionWithDialog,
  logger: DebugLogger = getDebugLogger()
): GlossaryIpcHandlers {
  const withDatabase = <T>(
    operation: (database: ProjectDatabase) => Promise<T>
  ): Promise<T> =>
    withCurrentProjectDatabase(
      getCurrentActiveProjectFilePath,
      logger,
      operation
    );

  return {
    async create(rawRequest) {
      const input = validateCreateGlossaryEntryInput(rawRequest);

      return withDatabase((database) =>
        createGlossaryEntry(database, input, logger)
      );
    },
    async getById(rawRequest) {
      const request = parseGlossaryEntryIdRequest(rawRequest);

      return withDatabase((database) =>
        getGlossaryEntryById(database, request.id, logger)
      );
    },
    async list() {
      return withDatabase((database) => listGlossaryEntries(database, logger));
    },
    async update(rawRequest) {
      const startedAt = Date.now();
      let input: UpdateGlossaryEntryInput | null = null;

      try {
        input = validateUpdateGlossaryEntryInput(rawRequest);
        const validatedInput = input;

        return await withDatabase((database) =>
          updateGlossaryEntry(database, validatedInput, logger)
        );
      } catch (error) {
        const documentRef = input
          ? logger.documentRefForKey(`glossary:${input.id}`)
          : undefined;

        logger.log({
          level: "error",
          event: "document.save.failed",
          details: {
            ...(documentRef ? { documentRef } : {}),
            editorIdKind: "glossaryEntry",
            operation: "save",
            result: "failed",
            durationMs: durationSince(startedAt),
            error
          }
        });

        throw error;
      }
    },
    async delete(rawRequest, event) {
      const request = parseDeleteGlossaryEntryRequest(rawRequest);
      const confirmed = await confirmDeletion(event, request.confirmMessage);

      if (!confirmed) {
        return { deleted: false };
      }

      return withDatabase(async (database) => {
        try {
          await deleteGlossaryEntry(database, request.id, logger);
        } catch (error) {
          if (!isMissingGlossaryStoreError(error)) {
            throw error;
          }
        }

        return { deleted: true };
      });
    },
    async listTags() {
      return withDatabase((database) => listGlossaryTags(database, logger));
    },
    async createTag(rawRequest) {
      const input = validateCreateGlossaryTagInput(rawRequest);

      return withDatabase((database) =>
        createGlossaryTag(database, input, logger)
      );
    },
    async updateTag(rawRequest) {
      const input = validateUpdateGlossaryTagInput(rawRequest);

      return withDatabase((database) =>
        updateGlossaryTag(database, input, logger)
      );
    },
    async deleteTag(rawRequest, event) {
      const request = parseDeleteGlossaryTagRequest(rawRequest);
      const confirmed = await confirmDeletion(event, request.confirmMessage);

      if (!confirmed) {
        return { deleted: false };
      }

      return withDatabase(async (database) => {
        try {
          await deleteGlossaryTag(database, { id: request.id }, logger);
        } catch (error) {
          if (!isMissingGlossaryStoreError(error)) {
            throw error;
          }
        }

        return { deleted: true };
      });
    }
  };
}

export function registerGlossaryIpc(
  logger: DebugLogger = getDebugLogger()
): void {
  const handlers = createGlossaryIpcHandlers(
    requireCurrentActiveProjectFilePath,
    confirmDeletionWithDialog,
    logger
  );

  ipcMain.handle(GLOSSARY_CHANNELS.create, (_event, rawRequest: unknown) =>
    handlers.create(rawRequest)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.getById, (_event, rawRequest: unknown) =>
    handlers.getById(rawRequest)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.list, () => handlers.list());
  ipcMain.handle(GLOSSARY_CHANNELS.update, (_event, rawRequest: unknown) =>
    handlers.update(rawRequest)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.delete, (event, rawRequest: unknown) =>
    handlers.delete(rawRequest, event)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.listTags, () => handlers.listTags());
  ipcMain.handle(GLOSSARY_CHANNELS.createTag, (_event, rawRequest: unknown) =>
    handlers.createTag(rawRequest)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.updateTag, (_event, rawRequest: unknown) =>
    handlers.updateTag(rawRequest)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.deleteTag, (event, rawRequest: unknown) =>
    handlers.deleteTag(rawRequest, event)
  );
}

import { ipcMain } from "electron";
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
  validateReorderGlossaryEntryIds,
  validateReorderGlossaryTagIds,
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
  reorderGlossaryEntries,
  reorderGlossaryTags,
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

export interface GlossaryIpcHandlers {
  create(rawRequest: unknown): Promise<GlossaryEntry>;
  getById(rawRequest: unknown): Promise<GlossaryEntry | null>;
  list(): Promise<GlossaryEntry[]>;
  update(rawRequest: unknown): Promise<GlossaryEntry>;
  delete(rawRequest: unknown): Promise<DeleteGlossaryEntryResult>;
  reorderEntries(rawRequest: unknown): Promise<GlossaryEntry[]>;
  listTags(): Promise<GlossaryTag[]>;
  createTag(rawRequest: unknown): Promise<GlossaryTag>;
  updateTag(rawRequest: unknown): Promise<GlossaryTag>;
  deleteTag(rawRequest: unknown): Promise<DeleteGlossaryTagResult>;
  reorderTags(rawRequest: unknown): Promise<GlossaryTag[]>;
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
): { id: string } {
  if (!isRequestObject(value)) {
    throw new Error("Invalid glossary delete request.");
  }

  return { id: validateId(value.id) };
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

function parseReorderGlossaryTagsRequest(value: unknown): {
  tagIdsInOrder: string[];
} {
  if (!isRequestObject(value)) {
    throw new Error("Invalid glossary tag reorder request.");
  }

  return {
    tagIdsInOrder: validateReorderGlossaryTagIds(value.tagIdsInOrder)
  };
}

function parseReorderGlossaryEntriesRequest(value: unknown): {
  entryIdsInOrder: string[];
} {
  if (!isRequestObject(value)) {
    throw new Error("Invalid glossary entry reorder request.");
  }

  return {
    entryIdsInOrder: validateReorderGlossaryEntryIds(value.entryIdsInOrder)
  };
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
    async delete(rawRequest) {
      const request = parseDeleteGlossaryEntryRequest(rawRequest);

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
    async reorderEntries(rawRequest) {
      const request = parseReorderGlossaryEntriesRequest(rawRequest);

      return withDatabase((database) =>
        reorderGlossaryEntries(database, request.entryIdsInOrder, logger)
      );
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
    async deleteTag(rawRequest) {
      const request = parseDeleteGlossaryTagRequest(rawRequest);

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
    },
    async reorderTags(rawRequest) {
      const request = parseReorderGlossaryTagsRequest(rawRequest);

      return withDatabase((database) =>
        reorderGlossaryTags(database, request.tagIdsInOrder, logger)
      );
    }
  };
}

export function registerGlossaryIpc(
  logger: DebugLogger = getDebugLogger()
): void {
  const handlers = createGlossaryIpcHandlers(
    requireCurrentActiveProjectFilePath,
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
  ipcMain.handle(GLOSSARY_CHANNELS.delete, (_event, rawRequest: unknown) =>
    handlers.delete(rawRequest)
  );
  ipcMain.handle(
    GLOSSARY_CHANNELS.reorderEntries,
    (_event, rawRequest: unknown) => handlers.reorderEntries(rawRequest)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.listTags, () => handlers.listTags());
  ipcMain.handle(GLOSSARY_CHANNELS.createTag, (_event, rawRequest: unknown) =>
    handlers.createTag(rawRequest)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.updateTag, (_event, rawRequest: unknown) =>
    handlers.updateTag(rawRequest)
  );
  ipcMain.handle(GLOSSARY_CHANNELS.deleteTag, (_event, rawRequest: unknown) =>
    handlers.deleteTag(rawRequest)
  );
  ipcMain.handle(
    GLOSSARY_CHANNELS.reorderTags,
    (_event, rawRequest: unknown) => handlers.reorderTags(rawRequest)
  );
}

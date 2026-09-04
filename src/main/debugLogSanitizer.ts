import path from "node:path";
import {
  debugLogArchitectures,
  debugLogDocumentKinds,
  debugLogEditorIdKinds,
  debugLogEditorKinds,
  debugLogEncodingAssumptions,
  debugLogExtensions,
  debugLogApplicationMenuTriggers,
  debugLogCommandExecutionSources,
  debugLogDbEntityKinds,
  debugLogDbOperations,
  debugLogLineEndingKinds,
  debugLogOperations,
  debugLogPathKinds,
  debugLogPlatforms,
  debugLogReasons,
  debugLogGlossarySearchRelationModes,
  debugLogRecoveryJournalModes,
  debugLogRecoverySynchronousLevels,
  debugLogResults,
  debugLogSaveTargetKinds,
  debugLogSearchModes,
  debugLogSizeBuckets,
  debugLogViewportChangeSources,
  isDebugLogContextMenuSurface,
  type DebugLogApplicationMenuTrigger,
  type DebugLogCommandExecutionSource,
  knownDebugLogCommandIds,
  knownDebugLogStatusKeys,
  type DebugLogArch,
  type DebugLogDbEntityKind,
  type DebugLogDbOperation,
  type DebugLogDetails,
  type DebugLogDocumentKind,
  type DebugLogEditorIdKind,
  type DebugLogEditorKind,
  type DebugLogEncodingAssumption,
  type DebugLogErrorCategory,
  type DebugLogExtension,
  type DebugLogLineEndingKind,
  type DebugLogOperation,
  type DebugLogPathKind,
  type DebugLogPlatform,
  type DebugLogReason,
  type DebugLogGlossarySearchRelationMode,
  type DebugLogRecoveryJournalMode,
  type DebugLogRecoverySynchronousLevel,
  type DebugLogResult,
  type DebugLogSaveTargetKind,
  type DebugLogSearchMode,
  type DebugLogSizeBucket,
  type DebugLogViewportChangeSource,
  type SanitizedErrorInfo
} from "../shared/debugLog";

export interface DebugLogRuntimeDetails {
  appVersion: string;
  platform: DebugLogPlatform;
  arch: DebugLogArch;
  locale: string;
  electronVersion: string;
  nodeVersion: string;
  debugMode: boolean;
}

export interface DebugLogSanitizationContext {
  runtime: DebugLogRuntimeDetails;
  isKnownProjectRef(projectRef: string): boolean;
  isKnownDocumentRef(documentRef: string): boolean;
}

type MutableDebugLogDetails = {
  -readonly [TKey in keyof DebugLogDetails]: DebugLogDetails[TKey];
};

const safeIdentifierPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const safeCodePattern = /^[A-Za-z0-9_.-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function includesValue<TValue extends string>(
  catalog: readonly TValue[],
  value: unknown
): value is TValue {
  return typeof value === "string" && catalog.includes(value as TValue);
}

function sanitizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return value.length <= maxLength ? value : undefined;
}

function sanitizeSafeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && safeIdentifierPattern.test(value)
    ? value
    : undefined;
}

function sanitizeSafeCode(value: unknown): string | undefined {
  return typeof value === "string" && safeCodePattern.test(value)
    ? value
    : undefined;
}

function sanitizeNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    Number.isSafeInteger(value)
    ? value
    : undefined;
}

function sanitizeNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function sanitizePositiveInteger(value: unknown): number | undefined {
  const integer = sanitizeNonNegativeInteger(value);

  return integer !== undefined && integer > 0 ? integer : undefined;
}

/**
 * #293: echo an ISO-8601 timestamp verbatim when it is short and parses,
 * otherwise drop it. Never derived from a path or manuscript text.
 */
function sanitizeIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) {
    return undefined;
  }

  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function sanitizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * #384: echo an array of already-opaque identifiers (GlossaryAtom UUIDs),
 * keeping only entries that match the safe-code shape and capping the count so
 * a pathological selection cannot bloat the log. Never derived from text.
 */
function sanitizeSafeCodeArray(
  value: unknown,
  maxCount: number
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const codes: string[] = [];
  for (const entry of value) {
    if (codes.length >= maxCount) {
      break;
    }
    const code = sanitizeSafeCode(entry);
    if (code) {
      codes.push(code);
    }
  }

  return codes;
}

function enumOrUnknown<TValue extends string>(
  catalog: readonly TValue[],
  value: unknown
): TValue {
  return includesValue(catalog, value)
    ? value
    : (catalog[catalog.length - 1] as TValue);
}

function sanitizeCommandId(value: unknown): string {
  return includesValue(knownDebugLogCommandIds, value) ? value : "unknown";
}

function sanitizeStatusKey(value: unknown): string {
  return includesValue(knownDebugLogStatusKeys, value) ? value : "unknown";
}

function errorCodeFromValue(value: unknown): string | undefined {
  if (isRecord(value) && "code" in value) {
    return sanitizeSafeCode(value.code);
  }

  return undefined;
}

function errorNameFromValue(value: unknown): string | undefined {
  if (value instanceof Error) {
    return sanitizeSafeIdentifier(value.name);
  }

  if (isRecord(value) && "name" in value) {
    return sanitizeSafeIdentifier(value.name);
  }

  return undefined;
}

function categoryFromSanitizedInfo(value: unknown): DebugLogErrorCategory | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value.category) {
    case "notFound":
    case "permissionDenied":
    case "io":
    case "database":
    case "validation":
    case "unknown":
      return value.category;
    default:
      return null;
  }
}

function categoryFromCodeOrName(
  code: string | undefined,
  name: string | undefined
): DebugLogErrorCategory {
  if (
    code === "ENOENT" ||
    code === "MODULE_NOT_FOUND" ||
    code?.endsWith("_NOT_FOUND")
  ) {
    return "notFound";
  }

  if (code === "EACCES" || code === "EPERM") {
    return "permissionDenied";
  }

  if (
    code?.startsWith("SQLITE") ||
    code?.startsWith("PROJECT_DATABASE") ||
    name === "ProjectDatabaseError"
  ) {
    return "database";
  }

  if (
    code === "EINVAL" ||
    code?.includes("VALIDATION") ||
    name === "TypeError" ||
    name === "RangeError" ||
    name === "SyntaxError" ||
    name?.startsWith("Invalid")
  ) {
    return "validation";
  }

  if (
    code === "EIO" ||
    code === "EBUSY" ||
    code === "EMFILE" ||
    code === "ENFILE" ||
    code === "ENOSPC" ||
    code === "EISDIR" ||
    code === "ENOTDIR"
  ) {
    return "io";
  }

  return "unknown";
}

export function sanitizeErrorForDebugLog(error: unknown): SanitizedErrorInfo {
  const name = errorNameFromValue(error);
  const code = errorCodeFromValue(error);
  const explicitCategory = categoryFromSanitizedInfo(error);
  const sanitized: SanitizedErrorInfo = {
    category: explicitCategory ?? categoryFromCodeOrName(code, name)
  };

  if (name) {
    sanitized.name = name;
  }

  if (code) {
    sanitized.code = code;
  }

  return sanitized;
}

export function sanitizeDebugLogDetails(
  details: unknown,
  context: DebugLogSanitizationContext
): DebugLogDetails | undefined {
  if (!isRecord(details)) {
    return undefined;
  }

  const sanitized: MutableDebugLogDetails = {};
  let droppedKeyCount = 0;

  for (const [key, value] of Object.entries(details)) {
    switch (key) {
      case "appVersion":
        sanitized.appVersion = context.runtime.appVersion;
        break;
      case "platform":
        sanitized.platform = context.runtime.platform;
        break;
      case "arch":
        sanitized.arch = context.runtime.arch;
        break;
      case "locale":
        sanitized.locale = context.runtime.locale;
        break;
      case "electronVersion":
        sanitized.electronVersion = context.runtime.electronVersion;
        break;
      case "nodeVersion":
        sanitized.nodeVersion = context.runtime.nodeVersion;
        break;
      case "debugMode":
        sanitized.debugMode = context.runtime.debugMode;
        break;
      case "commandId":
        sanitized.commandId = sanitizeCommandId(value);
        break;
      case "editorIdKind":
        sanitized.editorIdKind = enumOrUnknown<DebugLogEditorIdKind>(
          debugLogEditorIdKinds,
          value
        );
        break;
      case "interactionId":
        {
          const interactionId = sanitizeSafeCode(value);

          if (interactionId) {
            sanitized.interactionId = interactionId;
          }
        }
        break;
      case "documentOpenId":
        {
          const documentOpenId = sanitizeSafeCode(value);

          if (documentOpenId) {
            sanitized.documentOpenId = documentOpenId;
          }
        }
        break;
      case "requestedSurface":
        sanitized.requestedSurface = isDebugLogContextMenuSurface(value)
          ? value
          : "unknownEditable";
        break;
      case "delegatedSurface":
        sanitized.delegatedSurface = isDebugLogContextMenuSurface(value)
          ? value
          : "unknownEditable";
        break;
      case "hasSelection": {
        const hasSelection = sanitizeBoolean(value);

        if (hasSelection !== undefined) {
          sanitized.hasSelection = hasSelection;
        }
        break;
      }
      case "operation":
        sanitized.operation = enumOrUnknown<DebugLogOperation>(
          debugLogOperations,
          value
        );
        break;
      case "dbOperationId":
        {
          const dbOperationId = sanitizeSafeCode(value);

          if (dbOperationId) {
            sanitized.dbOperationId = dbOperationId;
          }
        }
        break;
      case "dbOperation":
        if (includesValue(debugLogDbOperations, value)) {
          sanitized.dbOperation = value as DebugLogDbOperation;
        } else {
          droppedKeyCount += 1;
        }
        break;
      case "dbEntityKind":
        sanitized.dbEntityKind = enumOrUnknown<DebugLogDbEntityKind>(
          debugLogDbEntityKinds,
          value
        );
        break;
      case "result":
        sanitized.result = enumOrUnknown<DebugLogResult>(
          debugLogResults,
          value
        );
        break;
      case "reason":
        sanitized.reason = enumOrUnknown<DebugLogReason>(
          debugLogReasons,
          value
        );
        break;
      case "trigger":
        sanitized.trigger = enumOrUnknown<DebugLogApplicationMenuTrigger>(
          debugLogApplicationMenuTriggers,
          value
        );
        break;
      case "source":
        sanitized.source = enumOrUnknown<DebugLogCommandExecutionSource>(
          debugLogCommandExecutionSources,
          value
        );
        break;
      case "statusKey":
        sanitized.statusKey = sanitizeStatusKey(value);
        break;
      case "hasPendingSave": {
        const hasPendingSave = sanitizeBoolean(value);

        if (hasPendingSave !== undefined) {
          sanitized.hasPendingSave = hasPendingSave;
        }
        break;
      }
      case "hasScheduledSave": {
        const hasScheduledSave = sanitizeBoolean(value);

        if (hasScheduledSave !== undefined) {
          sanitized.hasScheduledSave = hasScheduledSave;
        }
        break;
      }
      case "isComposing": {
        const isComposing = sanitizeBoolean(value);

        if (isComposing !== undefined) {
          sanitized.isComposing = isComposing;
        }
        break;
      }
      case "isDirty": {
        const isDirty = sanitizeBoolean(value);

        if (isDirty !== undefined) {
          sanitized.isDirty = isDirty;
        }
        break;
      }
      case "canSave": {
        const canSave = sanitizeBoolean(value);

        if (canSave !== undefined) {
          sanitized.canSave = canSave;
        }
        break;
      }
      case "hasRelatedTarget": {
        const hasRelatedTarget = sanitizeBoolean(value);

        if (hasRelatedTarget !== undefined) {
          sanitized.hasRelatedTarget = hasRelatedTarget;
        }
        break;
      }
      case "nextTargetInsideAppShell": {
        const nextTargetInsideAppShell = sanitizeBoolean(value);

        if (nextTargetInsideAppShell !== undefined) {
          sanitized.nextTargetInsideAppShell = nextTargetInsideAppShell;
        }
        break;
      }
      case "documentHasFocus": {
        const documentHasFocus = sanitizeBoolean(value);

        if (documentHasFocus !== undefined) {
          sanitized.documentHasFocus = documentHasFocus;
        }
        break;
      }
      case "willClearPendingSave": {
        const willClearPendingSave = sanitizeBoolean(value);

        if (willClearPendingSave !== undefined) {
          sanitized.willClearPendingSave = willClearPendingSave;
        }
        break;
      }
      case "saveTargetKind":
        sanitized.saveTargetKind = enumOrUnknown<DebugLogSaveTargetKind>(
          debugLogSaveTargetKinds,
          value
        );
        break;
      case "projectRef":
        if (typeof value === "string" && context.isKnownProjectRef(value)) {
          sanitized.projectRef = value;
        } else {
          droppedKeyCount += 1;
        }
        break;
      case "documentRef":
        if (typeof value === "string" && context.isKnownDocumentRef(value)) {
          sanitized.documentRef = value;
        } else {
          droppedKeyCount += 1;
        }
        break;
      case "pathKind":
        sanitized.pathKind = enumOrUnknown<DebugLogPathKind>(
          debugLogPathKinds,
          value
        );
        break;
      case "extension":
        sanitized.extension = enumOrUnknown<DebugLogExtension>(
          debugLogExtensions,
          value
        );
        break;
      case "pathDepth": {
        const pathDepth = sanitizeNonNegativeInteger(value);

        if (pathDepth !== undefined) {
          sanitized.pathDepth = pathDepth;
        }
        break;
      }
      case "sizeBucket":
        sanitized.sizeBucket = enumOrUnknown<DebugLogSizeBucket>(
          debugLogSizeBuckets,
          value
        );
        break;
      case "lineCount": {
        const lineCount = sanitizeNonNegativeInteger(value);

        if (lineCount !== undefined) {
          sanitized.lineCount = lineCount;
        }
        break;
      }
      case "fileSizeBytes": {
        const fileSizeBytes = sanitizeNonNegativeInteger(value);

        if (fileSizeBytes !== undefined) {
          sanitized.fileSizeBytes = fileSizeBytes;
        }
        break;
      }
      case "byteLength": {
        const byteLength = sanitizeNonNegativeInteger(value);

        if (byteLength !== undefined) {
          sanitized.byteLength = byteLength;
        }
        break;
      }
      case "characterLength": {
        const characterLength = sanitizeNonNegativeInteger(value);

        if (characterLength !== undefined) {
          sanitized.characterLength = characterLength;
        }
        break;
      }
      case "hadBom": {
        const hadBom = sanitizeBoolean(value);

        if (hadBom !== undefined) {
          sanitized.hadBom = hadBom;
        }
        break;
      }
      case "documentKind":
        sanitized.documentKind = enumOrUnknown<DebugLogDocumentKind>(
          debugLogDocumentKinds,
          value
        );
        break;
      case "editorKind":
        sanitized.editorKind = enumOrUnknown<DebugLogEditorKind>(
          debugLogEditorKinds,
          value
        );
        break;
      case "lineEndingKind":
        sanitized.lineEndingKind = enumOrUnknown<DebugLogLineEndingKind>(
          debugLogLineEndingKinds,
          value
        );
        break;
      case "encodingAssumption":
        sanitized.encodingAssumption =
          enumOrUnknown<DebugLogEncodingAssumption>(
            debugLogEncodingAssumptions,
            value
          );
        break;
      case "durationMs": {
        const durationMs = sanitizeNonNegativeNumber(value);

        if (durationMs !== undefined) {
          sanitized.durationMs = durationMs;
        }
        break;
      }
      case "count": {
        const count = sanitizeNonNegativeInteger(value);

        if (count !== undefined) {
          sanitized.count = count;
        }
        break;
      }
      case "previewNodeCount": {
        const previewNodeCount = sanitizeNonNegativeInteger(value);

        if (previewNodeCount !== undefined) {
          sanitized.previewNodeCount = previewNodeCount;
        }
        break;
      }
      case "visitedTextNodeCount": {
        const visitedTextNodeCount = sanitizeNonNegativeInteger(value);

        if (visitedTextNodeCount !== undefined) {
          sanitized.visitedTextNodeCount = visitedTextNodeCount;
        }
        break;
      }
      case "decoratedNodeCount": {
        const decoratedNodeCount = sanitizeNonNegativeInteger(value);

        if (decoratedNodeCount !== undefined) {
          sanitized.decoratedNodeCount = decoratedNodeCount;
        }
        break;
      }
      case "matchCount": {
        const matchCount = sanitizeNonNegativeInteger(value);

        if (matchCount !== undefined) {
          sanitized.matchCount = matchCount;
        }
        break;
      }
      case "preSinkQueuedEventCount": {
        const preSinkQueuedEventCount = sanitizeNonNegativeInteger(value);

        if (preSinkQueuedEventCount !== undefined) {
          sanitized.preSinkQueuedEventCount = preSinkQueuedEventCount;
        }
        break;
      }
      case "droppedEventCount": {
        const droppedEventCount = sanitizeNonNegativeInteger(value);

        if (droppedEventCount !== undefined) {
          sanitized.droppedEventCount = droppedEventCount;
        }
        break;
      }
      case "droppedKeyCount":
        break;
      case "rotated":
        if (typeof value === "boolean") {
          sanitized.rotated = value;
        }
        break;
      case "documentCharCount": {
        const documentCharCount = sanitizeNonNegativeInteger(value);

        if (documentCharCount !== undefined) {
          sanitized.documentCharCount = documentCharCount;
        }
        break;
      }
      case "documentLineCount": {
        const documentLineCount = sanitizeNonNegativeInteger(value);

        if (documentLineCount !== undefined) {
          sanitized.documentLineCount = documentLineCount;
        }
        break;
      }
      case "documentMaxLineLength": {
        const documentMaxLineLength = sanitizeNonNegativeInteger(value);

        if (documentMaxLineLength !== undefined) {
          sanitized.documentMaxLineLength = documentMaxLineLength;
        }
        break;
      }
      case "appWindowWidth": {
        const appWindowWidth = sanitizeNonNegativeInteger(value);

        if (appWindowWidth !== undefined) {
          sanitized.appWindowWidth = appWindowWidth;
        }
        break;
      }
      case "appWindowHeight": {
        const appWindowHeight = sanitizeNonNegativeInteger(value);

        if (appWindowHeight !== undefined) {
          sanitized.appWindowHeight = appWindowHeight;
        }
        break;
      }
      case "editorPaneWidth": {
        const editorPaneWidth = sanitizeNonNegativeInteger(value);

        if (editorPaneWidth !== undefined) {
          sanitized.editorPaneWidth = editorPaneWidth;
        }
        break;
      }
      case "editorPaneHeight": {
        const editorPaneHeight = sanitizeNonNegativeInteger(value);

        if (editorPaneHeight !== undefined) {
          sanitized.editorPaneHeight = editorPaneHeight;
        }
        break;
      }
      case "previewPaneWidth": {
        const previewPaneWidth = sanitizeNonNegativeInteger(value);

        if (previewPaneWidth !== undefined) {
          sanitized.previewPaneWidth = previewPaneWidth;
        }
        break;
      }
      case "previewPaneHeight": {
        const previewPaneHeight = sanitizeNonNegativeInteger(value);

        if (previewPaneHeight !== undefined) {
          sanitized.previewPaneHeight = previewPaneHeight;
        }
        break;
      }
      case "viewportChangeSource":
        sanitized.viewportChangeSource =
          enumOrUnknown<DebugLogViewportChangeSource>(
            debugLogViewportChangeSources,
            value
          );
        break;
      case "instanceRunId": {
        const instanceRunId = sanitizeSafeCode(value);

        if (instanceRunId) {
          sanitized.instanceRunId = instanceRunId;
        }
        break;
      }
      case "schemaVersion": {
        const schemaVersion = sanitizeNonNegativeInteger(value);

        if (schemaVersion !== undefined) {
          sanitized.schemaVersion = schemaVersion;
        }
        break;
      }
      case "ownerPid": {
        const ownerPid = sanitizePositiveInteger(value);

        if (ownerPid !== undefined) {
          sanitized.ownerPid = ownerPid;
        }
        break;
      }
      case "ownerAppVersion": {
        const ownerAppVersion = sanitizeSafeCode(value);

        if (ownerAppVersion) {
          sanitized.ownerAppVersion = ownerAppVersion;
        }
        break;
      }
      case "ownerCreatedAt": {
        const ownerCreatedAt = sanitizeIsoTimestamp(value);

        if (ownerCreatedAt) {
          sanitized.ownerCreatedAt = ownerCreatedAt;
        }
        break;
      }
      case "journalMode":
        sanitized.journalMode = enumOrUnknown<DebugLogRecoveryJournalMode>(
          debugLogRecoveryJournalModes,
          value
        );
        break;
      case "synchronous":
        sanitized.synchronous =
          enumOrUnknown<DebugLogRecoverySynchronousLevel>(
            debugLogRecoverySynchronousLevels,
            value
          );
        break;
      case "searchRunId": {
        const searchRunId = sanitizeSafeCode(value);

        if (searchRunId) {
          sanitized.searchRunId = searchRunId;
        }
        break;
      }
      case "searchMode":
        sanitized.searchMode = enumOrUnknown<DebugLogSearchMode>(
          debugLogSearchModes,
          value
        );
        break;
      case "searchRelationMode":
        sanitized.searchRelationMode =
          enumOrUnknown<DebugLogGlossarySearchRelationMode>(
            debugLogGlossarySearchRelationModes,
            value
          );
        break;
      case "searchWholeWord": {
        const searchWholeWord = sanitizeBoolean(value);

        if (searchWholeWord !== undefined) {
          sanitized.searchWholeWord = searchWholeWord;
        }
        break;
      }
      case "searchCaseSensitive": {
        const searchCaseSensitive = sanitizeBoolean(value);

        if (searchCaseSensitive !== undefined) {
          sanitized.searchCaseSensitive = searchCaseSensitive;
        }
        break;
      }
      case "searchRegex": {
        const searchRegex = sanitizeBoolean(value);

        if (searchRegex !== undefined) {
          sanitized.searchRegex = searchRegex;
        }
        break;
      }
      case "searchAppliedToUi": {
        const searchAppliedToUi = sanitizeBoolean(value);

        if (searchAppliedToUi !== undefined) {
          sanitized.searchAppliedToUi = searchAppliedToUi;
        }
        break;
      }
      case "selectedAtomIds": {
        const selectedAtomIds = sanitizeSafeCodeArray(value, 200);

        if (selectedAtomIds !== undefined) {
          sanitized.selectedAtomIds = selectedAtomIds;
        }
        break;
      }
      case "selectedAtomCount": {
        const selectedAtomCount = sanitizeNonNegativeInteger(value);

        if (selectedAtomCount !== undefined) {
          sanitized.selectedAtomCount = selectedAtomCount;
        }
        break;
      }
      case "searchDocumentCount": {
        const searchDocumentCount = sanitizeNonNegativeInteger(value);

        if (searchDocumentCount !== undefined) {
          sanitized.searchDocumentCount = searchDocumentCount;
        }
        break;
      }
      case "searchedCharacterCount": {
        const searchedCharacterCount = sanitizeNonNegativeInteger(value);

        if (searchedCharacterCount !== undefined) {
          sanitized.searchedCharacterCount = searchedCharacterCount;
        }
        break;
      }
      case "searchResultCount": {
        const searchResultCount = sanitizeNonNegativeInteger(value);

        if (searchResultCount !== undefined) {
          sanitized.searchResultCount = searchResultCount;
        }
        break;
      }
      case "searchStartedAt": {
        const searchStartedAt = sanitizeIsoTimestamp(value);

        if (searchStartedAt) {
          sanitized.searchStartedAt = searchStartedAt;
        }
        break;
      }
      case "error":
        sanitized.error = sanitizeErrorForDebugLog(value);
        break;
      default:
        droppedKeyCount += 1;
        break;
    }
  }

  if (droppedKeyCount > 0) {
    sanitized.droppedKeyCount = droppedKeyCount;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function debugLogExtensionForPath(filePath: string): DebugLogExtension {
  const extension = path.extname(filePath).toLowerCase();

  if (!extension) {
    return "none";
  }

  return includesValue(debugLogExtensions, extension) ? extension : "unknown";
}

export function debugLogPathDepth(filePath: string): number {
  return filePath
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0).length;
}

export function debugLogLineEndingKind(
  content: string
): DebugLogDetails["lineEndingKind"] {
  const hasCrLf = /\r\n/.test(content);
  const withoutCrLf = content.replace(/\r\n/g, "");
  const hasLf = /\n/.test(withoutCrLf);
  const hasCr = /\r/.test(withoutCrLf);

  if ((hasCrLf && (hasLf || hasCr)) || (hasLf && hasCr)) {
    return "mixed";
  }

  if (hasCrLf) {
    return "crlf";
  }

  if (hasLf) {
    return "lf";
  }

  if (hasCr) {
    return "cr";
  }

  return "none";
}

export function debugLogLineCount(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  return content.split(/\r\n|\r|\n/).length;
}

export function debugLogSizeBucket(byteLength: number): DebugLogSizeBucket {
  if (byteLength === 0) {
    return "empty";
  }

  if (byteLength < 32 * 1024) {
    return "small";
  }

  if (byteLength < 512 * 1024) {
    return "medium";
  }

  if (byteLength < 5 * 1024 * 1024) {
    return "large";
  }

  return "huge";
}

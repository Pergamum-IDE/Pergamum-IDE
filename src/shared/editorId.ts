import {
  validateGlossaryEntryId,
  type GlossaryEntryId
} from "./glossary";

declare const editorIdBrand: unique symbol;
declare const serializedEditorIdBrand: unique symbol;

type EditorIdBrand = {
  readonly [editorIdBrand]: "EditorId";
};

type FileEditorId = {
  readonly kind: "file";
  readonly path: string;
} & EditorIdBrand;

type ProjectDocumentEditorId = {
  readonly kind: "projectDocument";
  readonly relativePath: string;
} & EditorIdBrand;

type UntitledEditorId = {
  readonly kind: "untitled";
  readonly sessionId: number;
} & EditorIdBrand;

type GlossaryEntryEditorId = {
  readonly kind: "glossaryEntry";
  readonly entryId: GlossaryEntryId;
} & EditorIdBrand;

type UnbrandedEditorId =
  | {
      readonly kind: "file";
      readonly path: string;
    }
  | {
      readonly kind: "projectDocument";
      readonly relativePath: string;
    }
  | {
      readonly kind: "untitled";
      readonly sessionId: number;
    }
  | {
      readonly kind: "glossaryEntry";
      readonly entryId: GlossaryEntryId;
    };

export type EditorId =
  | FileEditorId
  | ProjectDocumentEditorId
  | UntitledEditorId
  | GlossaryEntryEditorId;

export type SerializedEditorId = string & {
  readonly [serializedEditorIdBrand]: "SerializedEditorId";
};

export interface ActiveProjectContext {
  readonly rootPath: string;
}

function createEditorId(editorId: UnbrandedEditorId): EditorId {
  return Object.freeze(editorId) as unknown as EditorId;
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function isUnsupportedWindowsSpecialPath(value: string): boolean {
  const normalized = normalizeSeparators(value);

  return (
    value.startsWith("\\\\?\\") ||
    value.startsWith("\\\\.\\") ||
    normalized.startsWith("//?/") ||
    normalized.startsWith("//./")
  );
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value);
}

function isUncPath(value: string): boolean {
  return value.startsWith("//");
}

function isCaseInsensitiveProjectRootPath(value: string): boolean {
  return isWindowsDrivePath(value) || isUncPath(value);
}

function isWindowsDriveLikePath(value: string): boolean {
  return /^[A-Za-z]:/.test(value);
}

function splitAbsolutePath(
  value: string
): { root: string; rest: string } | null {
  if (isUnsupportedWindowsSpecialPath(value)) {
    throw new Error("Windows special paths are not supported.");
  }

  const normalized = normalizeSeparators(value);

  if (isWindowsDrivePath(normalized)) {
    return {
      root: `${normalized[0].toUpperCase()}:/`,
      rest: normalized.slice(3)
    };
  }

  if (normalized.startsWith("//")) {
    const parts = normalized.slice(2).split("/");
    const server = parts[0];
    const share = parts[1];

    if (!server || !share) {
      return null;
    }

    return {
      root: `//${server}/${share}/`,
      rest: parts.slice(2).join("/")
    };
  }

  if (normalized.startsWith("/")) {
    return {
      root: "/",
      rest: normalized.slice(1)
    };
  }

  return null;
}

function normalizeSegments(segments: string[], allowAboveRoot: boolean): string[] {
  const normalizedSegments: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (normalizedSegments.length === 0) {
        if (allowAboveRoot) {
          normalizedSegments.push(segment);
          continue;
        }

        throw new Error("Path escapes its root.");
      }

      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  return normalizedSegments;
}

function canonicalizeAbsolutePath(value: string, label: string): string {
  if (value.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  const absolutePath = splitAbsolutePath(value);

  if (!absolutePath) {
    throw new Error(`${label} must be absolute.`);
  }

  const segments = normalizeSegments(absolutePath.rest.split("/"), false);

  return `${absolutePath.root}${segments.join("/")}`;
}

function canonicalizeRelativePath(value: string): string {
  if (value.length === 0) {
    throw new Error("Project document path must not be empty.");
  }

  const normalized = normalizeSeparators(value);

  if (splitAbsolutePath(normalized) || isWindowsDriveLikePath(normalized)) {
    throw new Error("Project document path must be relative.");
  }

  const segments = normalizeSegments(normalized.split("/"), false);

  if (segments.length === 0) {
    throw new Error("Project document path must not be empty.");
  }

  return segments.join("/");
}

function canonicalizeProjectDocumentIdentityRelativePath(
  relativePath: string,
  projectRootPath: string
): string {
  const canonicalRelativePath = canonicalizeRelativePath(relativePath);

  return isCaseInsensitiveProjectRootPath(projectRootPath)
    ? canonicalRelativePath.toLowerCase()
    : canonicalRelativePath;
}

function requireProjectContext(
  activeProjectContext: ActiveProjectContext | null
): ActiveProjectContext {
  if (!activeProjectContext) {
    throw new Error("Active Project Context is required.");
  }

  return activeProjectContext;
}

function canonicalProjectRootPath(
  activeProjectContext: ActiveProjectContext
): string {
  return canonicalizeAbsolutePath(
    activeProjectContext.rootPath,
    "Project root path"
  );
}

function projectPathPrefix(projectRootPath: string): string {
  return projectRootPath.endsWith("/")
    ? projectRootPath
    : `${projectRootPath}/`;
}

function relativePathWithinProject(
  absolutePath: string,
  projectRootPath: string
): string | null {
  const prefix = projectPathPrefix(projectRootPath);
  const isCaseInsensitiveProject =
    isCaseInsensitiveProjectRootPath(projectRootPath);
  const doesStartWithProjectPrefix = isCaseInsensitiveProject
    ? absolutePath.toLowerCase().startsWith(prefix.toLowerCase())
    : absolutePath.startsWith(prefix);

  if (!doesStartWithProjectPrefix) {
    return null;
  }

  return canonicalizeProjectDocumentIdentityRelativePath(
    absolutePath.slice(prefix.length),
    projectRootPath
  );
}

function createFileEditorIdFromCanonicalPath(path: string): EditorId {
  return createEditorId({
    kind: "file",
    path
  });
}

function createProjectDocumentEditorIdFromCanonicalPath(
  relativePath: string
): EditorId {
  return createEditorId({
    kind: "projectDocument",
    relativePath
  });
}

function createGlossaryEntryEditorIdFromCanonicalEntryId(
  entryId: GlossaryEntryId
): EditorId {
  return createEditorId({
    kind: "glossaryEntry",
    entryId
  });
}

export function createEditorIdForPath(
  path: string,
  activeProjectContext: ActiveProjectContext | null
): EditorId {
  const canonicalPath = canonicalizeAbsolutePath(path, "Editor path");

  if (activeProjectContext) {
    const relativePath = relativePathWithinProject(
      canonicalPath,
      canonicalProjectRootPath(activeProjectContext)
    );

    if (relativePath) {
      return createProjectDocumentEditorIdFromCanonicalPath(relativePath);
    }
  }

  return createFileEditorIdFromCanonicalPath(canonicalPath);
}

export function createFileEditorIdForPath(path: string): EditorId {
  return createFileEditorIdFromCanonicalPath(
    canonicalizeAbsolutePath(path, "File editor path")
  );
}

export function createProjectDocumentEditorId(
  relativePath: string,
  activeProjectContext: ActiveProjectContext | null
): EditorId {
  const projectContext = requireProjectContext(activeProjectContext);
  const projectRootPath = canonicalProjectRootPath(projectContext);

  return createProjectDocumentEditorIdFromCanonicalPath(
    canonicalizeProjectDocumentIdentityRelativePath(
      relativePath,
      projectRootPath
    )
  );
}

export function createGlossaryEntryEditorId(
  entryId: string,
  activeProjectContext: ActiveProjectContext | null
): EditorId {
  requireProjectContext(activeProjectContext);

  return createGlossaryEntryEditorIdFromCanonicalEntryId(
    validateGlossaryEntryId(entryId)
  );
}

export function createUntitledEditorId(sessionId: number): EditorId {
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    throw new Error("Untitled EditorId session ID must be a positive integer.");
  }

  return createEditorId({
    kind: "untitled",
    sessionId
  });
}

export function serializeEditorId(editorId: EditorId): SerializedEditorId {
  switch (editorId.kind) {
    case "file":
      return JSON.stringify({
        kind: "file",
        path: editorId.path
      }) as SerializedEditorId;
    case "projectDocument":
      return JSON.stringify({
        kind: "projectDocument",
        relativePath: editorId.relativePath
      }) as SerializedEditorId;
    case "untitled":
      return JSON.stringify({
        kind: "untitled",
        sessionId: editorId.sessionId
      }) as SerializedEditorId;
    case "glossaryEntry":
      return JSON.stringify({
        kind: "glossaryEntry",
        entryId: editorId.entryId
      }) as SerializedEditorId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonCanonicalSerializedEditorId(): never {
  throw new Error("Serialized EditorId must use canonical representation.");
}

function assertSerializedEditorIdKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  const actualKeys = Object.keys(value);

  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key, index) => key !== keys[index])
  ) {
    nonCanonicalSerializedEditorId();
  }
}

function deserializeCanonicalEditorId(
  value: unknown,
  activeProjectContext: ActiveProjectContext | null
): EditorId {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new Error("Serialized EditorId must be an object with a kind.");
  }

  switch (value.kind) {
    case "file":
      assertSerializedEditorIdKeys(value, ["kind", "path"]);

      if (typeof value.path !== "string") {
        throw new Error("Serialized file EditorId must include a path.");
      }

      {
        const canonicalPath = canonicalizeAbsolutePath(
          value.path,
          "Serialized file path"
        );

        if (value.path !== canonicalPath) {
          nonCanonicalSerializedEditorId();
        }

        return createFileEditorIdFromCanonicalPath(canonicalPath);
      }
    case "projectDocument":
      assertSerializedEditorIdKeys(value, ["kind", "relativePath"]);

      if (typeof value.relativePath !== "string") {
        throw new Error(
          "Serialized projectDocument EditorId must include a relativePath."
        );
      }

      if (value.relativePath !== canonicalizeRelativePath(value.relativePath)) {
        nonCanonicalSerializedEditorId();
      }

      return createProjectDocumentEditorId(
        value.relativePath,
        activeProjectContext
      );
    case "untitled":
      assertSerializedEditorIdKeys(value, ["kind", "sessionId"]);

      if (typeof value.sessionId !== "number") {
        throw new Error("Serialized untitled EditorId must include a sessionId.");
      }

      return createUntitledEditorId(value.sessionId);
    case "glossaryEntry":
      assertSerializedEditorIdKeys(value, ["kind", "entryId"]);

      if (typeof value.entryId !== "string") {
        throw new Error(
          "Serialized glossaryEntry EditorId must include an entryId."
        );
      }

      return createGlossaryEntryEditorId(value.entryId, activeProjectContext);
    default:
      throw new Error("Serialized EditorId kind is not supported.");
  }
}

export function deserializeEditorId(
  serialized: string,
  activeProjectContext: ActiveProjectContext | null
): EditorId {
  let value: unknown;

  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("Serialized EditorId must be valid JSON.");
  }

  if (JSON.stringify(value) !== serialized) {
    nonCanonicalSerializedEditorId();
  }

  return deserializeCanonicalEditorId(value, activeProjectContext);
}

export function editorIdEquals(left: EditorId, right: EditorId): boolean {
  switch (left.kind) {
    case "file":
      return right.kind === "file" && left.path === right.path;
    case "projectDocument":
      return (
        right.kind === "projectDocument" &&
        left.relativePath === right.relativePath
      );
    case "untitled":
      return right.kind === "untitled" && left.sessionId === right.sessionId;
    case "glossaryEntry":
      return (
        right.kind === "glossaryEntry" && left.entryId === right.entryId
      );
  }
}

export function isProjectScopedEditorId(editorId: EditorId): boolean {
  return (
    editorId.kind === "projectDocument" || editorId.kind === "glossaryEntry"
  );
}

import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { pathHasReservedFileExplorerSegment } from "../shared/fileExplorerCreate";
import { isProtectedPergamumDataFilePath } from "../shared/saveTargetPolicy";
import {
  type DryRunTextImportRequest,
  type ExecuteTextImportRequest,
  type ExecuteTextImportResult,
  type PreviewTextImportFilePreviewResult,
  type PreviewTextImportFileRequest,
  type PreviewTextImportFileResult,
  type PreviewTextImportFilesRequest,
  type PreviewTextImportFilesResult,
  type TextImportDryRunFile,
  type TextImportDryRunFolder,
  type TextImportDryRunResult,
  type TextImportEncoding,
  type TextImportLineEnding,
  type TextImportSkipReason
} from "../shared/textImport";
import {
  decodeTextImportBytes,
  defaultTextImportEncodingForBom,
  detectTextImportBom,
  previewDecodedText,
  TextImportDecodeError
} from "./textImportDecode";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const WINDOWS_INVALID_CHAR_PATTERN = /[<>:"|?*]/;
const RESERVED_DEVICE_NAME_PATTERN =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

type ProjectRelativePathValidation =
  | {
      readonly ok: true;
      readonly normalized: string;
      readonly segments: readonly string[];
    }
  | { readonly ok: false };

interface TextImportProjectContext {
  readonly currentProjectId: string;
  readonly projectRootPath: string;
}

interface TextImportDryRunInput extends TextImportProjectContext {
  readonly request: DryRunTextImportRequest;
}

interface ExecuteTextImportInput extends TextImportProjectContext {
  readonly request: ExecuteTextImportRequest;
}

interface MutableFolderRow {
  readonly sourcePath: string;
  readonly targetProjectRelativePath: string;
  hasSkippedDescendant: boolean;
}

interface SourcePreview {
  readonly ok: true;
  readonly selectedEncoding: TextImportEncoding;
  readonly bomKind: TextImportDryRunFile["bomKind"];
  readonly previewHead: string;
  readonly previewTail: string;
}

type SourcePreviewResult =
  | SourcePreview
  | {
      readonly ok: false;
      readonly reason: Extract<
        TextImportSkipReason,
        "sourceMissing" | "sourceUnreadable" | "decodeFailed"
      >;
    };

type TargetPlan =
  | {
      readonly ok: true;
      readonly targetProjectRelativePath: string;
      readonly originalTargetProjectRelativePath: string;
      readonly renamed: boolean;
    }
  | {
      readonly ok: false;
      readonly targetProjectRelativePath: string;
      readonly originalTargetProjectRelativePath: string;
      readonly reason: Extract<
        TextImportSkipReason,
        "invalidProjectPath" | "targetExists"
      >;
    };

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

function isAbsolutePathLike(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value)
  );
}

function isReservedDeviceSegment(segment: string): boolean {
  return RESERVED_DEVICE_NAME_PATTERN.test(segment);
}

function validateProjectRelativePath(
  raw: string,
  options: {
    readonly allowRoot: boolean;
    readonly requireMarkdownFile: boolean;
  }
): ProjectRelativePathValidation {
  if (raw.length === 0) {
    return options.allowRoot
      ? { ok: true, normalized: "", segments: [] }
      : { ok: false };
  }

  if (CONTROL_CHAR_PATTERN.test(raw) || isAbsolutePathLike(raw)) {
    return { ok: false };
  }

  const normalized = raw.replace(/\\/g, "/");
  const segments = normalized.split("/");

  for (const segment of segments) {
    if (
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      WINDOWS_INVALID_CHAR_PATTERN.test(segment) ||
      /[. ]$/.test(segment) ||
      isReservedDeviceSegment(segment)
    ) {
      return { ok: false };
    }
  }

  const canonical = segments.join("/");

  if (
    pathHasReservedFileExplorerSegment(canonical) ||
    segments.some((segment) => isProtectedPergamumDataFilePath(segment))
  ) {
    return { ok: false };
  }

  if (
    options.requireMarkdownFile &&
    path.posix.extname(canonical).toLowerCase() !== ".md"
  ) {
    return { ok: false };
  }

  return { ok: true, normalized: canonical, segments };
}

function resolveProjectPath(
  projectRootPath: string,
  projectRelativePath: string
): string | null {
  const resolved = path.resolve(projectRootPath, projectRelativePath);
  const relativeFromRoot = path.relative(projectRootPath, resolved);

  if (
    relativeFromRoot.startsWith("..") ||
    path.isAbsolute(relativeFromRoot)
  ) {
    return null;
  }

  return resolved;
}

function joinProjectRelativeSegments(
  segments: readonly string[]
): string {
  return segments.join("/");
}

function appendProjectRelativeSegments(
  baseSegments: readonly string[],
  appendedSegments: readonly string[]
): string {
  return joinProjectRelativeSegments([...baseSegments, ...appendedSegments]);
}

function isTxtFileName(name: string): boolean {
  return path.extname(name).toLowerCase() === ".txt";
}

function txtProjectRelativePathToMarkdown(
  projectRelativePath: string
): string {
  return projectRelativePath.replace(/\.txt$/i, ".md");
}

function importedConflictProjectRelativePath(
  markdownProjectRelativePath: string
): string {
  return markdownProjectRelativePath.replace(/\.md$/i, ".imported.md");
}

function targetSetKey(projectRelativePath: string): string {
  return process.platform === "win32" || process.platform === "darwin"
    ? projectRelativePath.toLowerCase()
    : projectRelativePath;
}

function isProjectRelativePathInsideDirectory(
  targetProjectRelativePath: string,
  directoryProjectRelativePath: string
): boolean {
  if (directoryProjectRelativePath.length === 0) {
    return true;
  }

  return targetProjectRelativePath.startsWith(
    `${directoryProjectRelativePath}/`
  );
}

async function pathExists(
  absolutePath: string
): Promise<"exists" | "missing" | "unverifiable"> {
  try {
    await fs.lstat(absolutePath);
    return "exists";
  } catch (error) {
    return nodeErrorCode(error) === "ENOENT" ? "missing" : "unverifiable";
  }
}

async function existingAncestorTraversalIsSafe(
  projectRootPath: string,
  directoryProjectRelativePath: string,
  options: { readonly missingAllowed: boolean }
): Promise<boolean> {
  const validation = validateProjectRelativePath(directoryProjectRelativePath, {
    allowRoot: true,
    requireMarkdownFile: false
  });

  if (!validation.ok) {
    return false;
  }

  let currentPath = projectRootPath;

  for (const segment of validation.segments) {
    currentPath = path.join(currentPath, segment);

    try {
      const stats = await fs.lstat(currentPath);

      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        return false;
      }
    } catch (error) {
      if (nodeErrorCode(error) === "ENOENT" && options.missingAllowed) {
        return true;
      }

      return false;
    }
  }

  return true;
}

async function resolveDestinationFolder(
  projectRootPath: string,
  rawDestinationProjectRelativePath: string
): Promise<
  | {
      readonly ok: true;
      readonly normalized: string;
      readonly segments: readonly string[];
      readonly absolutePath: string;
    }
  | { readonly ok: false }
> {
  const validation = validateProjectRelativePath(
    rawDestinationProjectRelativePath,
    {
      allowRoot: true,
      requireMarkdownFile: false
    }
  );

  if (!validation.ok) {
    return { ok: false };
  }

  const absolutePath = resolveProjectPath(
    projectRootPath,
    validation.normalized
  );

  if (!absolutePath) {
    return { ok: false };
  }

  if (
    !(await existingAncestorTraversalIsSafe(
      projectRootPath,
      validation.normalized,
      { missingAllowed: false }
    ))
  ) {
    return { ok: false };
  }

  try {
    const stats = await fs.lstat(absolutePath);

    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }

  return {
    ok: true,
    normalized: validation.normalized,
    segments: validation.segments,
    absolutePath
  };
}

async function resolveTargetPlan(
  projectRootPath: string,
  destinationFolderProjectRelativePath: string,
  originalTargetProjectRelativePath: string,
  plannedTargets: Set<string>
): Promise<TargetPlan> {
  const targetValidation = validateProjectRelativePath(
    originalTargetProjectRelativePath,
    {
      allowRoot: false,
      requireMarkdownFile: true
    }
  );

  if (
    !targetValidation.ok ||
    !isProjectRelativePathInsideDirectory(
      targetValidation.normalized,
      destinationFolderProjectRelativePath
    )
  ) {
    return {
      ok: false,
      targetProjectRelativePath: originalTargetProjectRelativePath,
      originalTargetProjectRelativePath,
      reason: "invalidProjectPath"
    };
  }

  const originalParent = path.posix.dirname(targetValidation.normalized);
  const normalizedOriginalParent = originalParent === "." ? "" : originalParent;

  if (
    !(await existingAncestorTraversalIsSafe(
      projectRootPath,
      normalizedOriginalParent,
      { missingAllowed: true }
    ))
  ) {
    return {
      ok: false,
      targetProjectRelativePath: targetValidation.normalized,
      originalTargetProjectRelativePath: targetValidation.normalized,
      reason: "invalidProjectPath"
    };
  }

  const originalPath = resolveProjectPath(
    projectRootPath,
    targetValidation.normalized
  );

  if (!originalPath) {
    return {
      ok: false,
      targetProjectRelativePath: targetValidation.normalized,
      originalTargetProjectRelativePath: targetValidation.normalized,
      reason: "invalidProjectPath"
    };
  }

  const originalKey = targetSetKey(targetValidation.normalized);
  const originalAvailability = plannedTargets.has(originalKey)
    ? "exists"
    : await pathExists(originalPath);

  if (originalAvailability === "missing") {
    return {
      ok: true,
      targetProjectRelativePath: targetValidation.normalized,
      originalTargetProjectRelativePath: targetValidation.normalized,
      renamed: false
    };
  }

  const importedTarget = importedConflictProjectRelativePath(
    targetValidation.normalized
  );
  const importedValidation = validateProjectRelativePath(importedTarget, {
    allowRoot: false,
    requireMarkdownFile: true
  });

  if (!importedValidation.ok) {
    return {
      ok: false,
      targetProjectRelativePath: targetValidation.normalized,
      originalTargetProjectRelativePath: targetValidation.normalized,
      reason: "invalidProjectPath"
    };
  }

  const importedPath = resolveProjectPath(
    projectRootPath,
    importedValidation.normalized
  );

  if (!importedPath) {
    return {
      ok: false,
      targetProjectRelativePath: importedValidation.normalized,
      originalTargetProjectRelativePath: targetValidation.normalized,
      reason: "invalidProjectPath"
    };
  }

  const importedKey = targetSetKey(importedValidation.normalized);
  const importedAvailability = plannedTargets.has(importedKey)
    ? "exists"
    : await pathExists(importedPath);

  if (importedAvailability !== "missing") {
    return {
      ok: false,
      targetProjectRelativePath: importedValidation.normalized,
      originalTargetProjectRelativePath: targetValidation.normalized,
      reason: "targetExists"
    };
  }

  return {
    ok: true,
    targetProjectRelativePath: importedValidation.normalized,
    originalTargetProjectRelativePath: targetValidation.normalized,
    renamed: true
  };
}

async function readSourceFileBytes(
  sourcePath: string
): Promise<
  | { readonly ok: true; readonly bytes: Uint8Array }
  | {
      readonly ok: false;
      readonly reason: Extract<
        TextImportSkipReason,
        "sourceMissing" | "sourceUnreadable" | "unsupportedSource"
      >;
    }
> {
  if (sourcePath.length === 0 || !isAbsolutePathLike(sourcePath)) {
    return { ok: false, reason: "unsupportedSource" };
  }

  try {
    const stats = await fs.lstat(sourcePath);

    if (stats.isSymbolicLink() || !stats.isFile()) {
      return { ok: false, reason: "unsupportedSource" };
    }
  } catch (error) {
    return {
      ok: false,
      reason:
        nodeErrorCode(error) === "ENOENT"
          ? "sourceMissing"
          : "sourceUnreadable"
    };
  }

  try {
    return { ok: true, bytes: await fs.readFile(sourcePath) };
  } catch (error) {
    return {
      ok: false,
      reason:
        nodeErrorCode(error) === "ENOENT"
          ? "sourceMissing"
          : "sourceUnreadable"
    };
  }
}

async function previewSourceFileWithDefaultEncoding(
  sourcePath: string
): Promise<SourcePreviewResult> {
  const read = await readSourceFileBytes(sourcePath);

  if (!read.ok) {
    return {
      ok: false,
      reason:
        read.reason === "sourceMissing" ? "sourceMissing" : "sourceUnreadable"
    };
  }

  const bomKind = detectTextImportBom(read.bytes);
  // Deterministic only: BOM selects a default, otherwise UTF-8. No chardet /
  // plausibility scoring is used in Step 1.
  const selectedEncoding = defaultTextImportEncodingForBom(bomKind);

  try {
    const decoded = decodeTextImportBytes(read.bytes, selectedEncoding);
    const preview = previewDecodedText(decoded);

    return {
      ok: true,
      selectedEncoding,
      bomKind,
      previewHead: preview.head,
      previewTail: preview.tail
    };
  } catch (error) {
    if (error instanceof TextImportDecodeError) {
      return { ok: false, reason: "decodeFailed" };
    }

    return { ok: false, reason: "sourceUnreadable" };
  }
}

function normalizeLineEndings(
  text: string,
  targetLineEnding: TextImportLineEnding
): string {
  const replacement = targetLineEnding === "crlf" ? "\r\n" : "\n";

  return text.replace(/\r\n|\r|\n/g, replacement);
}

function addDryRunFile(
  files: TextImportDryRunFile[],
  input: Omit<TextImportDryRunFile, "id">
): void {
  files.push({
    id: `text-import-${files.length + 1}`,
    ...input
  });
}

function markSkippedDescendant(
  folders: MutableFolderRow[],
  ancestorFolderIndexes: readonly number[]
): void {
  for (const index of ancestorFolderIndexes) {
    folders[index].hasSkippedDescendant = true;
  }
}

async function processDryRunSourceFile(
  options: {
    readonly sourcePath: string;
    readonly sourceDisplayPath: string;
    readonly targetProjectRelativePath: string;
    readonly destinationFolderProjectRelativePath: string;
    readonly projectRootPath: string;
    readonly plannedTargets: Set<string>;
    readonly files: TextImportDryRunFile[];
    readonly folders: MutableFolderRow[];
    readonly ancestorFolderIndexes: readonly number[];
  }
): Promise<void> {
  const defaultEncoding: TextImportEncoding = "utf8";
  const notSkippedDefaults = {
    selectedEncoding: defaultEncoding,
    bomKind: "none" as const,
    previewHead: "",
    previewTail: ""
  };

  if (!isTxtFileName(path.basename(options.sourcePath))) {
    markSkippedDescendant(options.folders, options.ancestorFolderIndexes);
    addDryRunFile(options.files, {
      sourcePath: options.sourcePath,
      sourceDisplayPath: options.sourceDisplayPath,
      targetProjectRelativePath: "",
      originalTargetProjectRelativePath: "",
      renamed: false,
      skipped: true,
      skipReason: "notTextFile",
      ...notSkippedDefaults
    });
    return;
  }

  const originalTargetProjectRelativePath = txtProjectRelativePathToMarkdown(
    options.targetProjectRelativePath
  );
  const target = await resolveTargetPlan(
    options.projectRootPath,
    options.destinationFolderProjectRelativePath,
    originalTargetProjectRelativePath,
    options.plannedTargets
  );
  const preview = await previewSourceFileWithDefaultEncoding(options.sourcePath);

  if (!preview.ok) {
    markSkippedDescendant(options.folders, options.ancestorFolderIndexes);
    addDryRunFile(options.files, {
      sourcePath: options.sourcePath,
      sourceDisplayPath: options.sourceDisplayPath,
      targetProjectRelativePath: target.targetProjectRelativePath,
      originalTargetProjectRelativePath: target.originalTargetProjectRelativePath,
      renamed: false,
      skipped: true,
      skipReason: preview.reason,
      ...notSkippedDefaults
    });
    return;
  }

  if (!target.ok) {
    markSkippedDescendant(options.folders, options.ancestorFolderIndexes);
    addDryRunFile(options.files, {
      sourcePath: options.sourcePath,
      sourceDisplayPath: options.sourceDisplayPath,
      targetProjectRelativePath: target.targetProjectRelativePath,
      originalTargetProjectRelativePath: target.originalTargetProjectRelativePath,
      selectedEncoding: preview.selectedEncoding,
      bomKind: preview.bomKind,
      renamed: false,
      skipped: true,
      skipReason: target.reason,
      previewHead: preview.previewHead,
      previewTail: preview.previewTail
    });
    return;
  }

  options.plannedTargets.add(targetSetKey(target.targetProjectRelativePath));
  addDryRunFile(options.files, {
    sourcePath: options.sourcePath,
    sourceDisplayPath: options.sourceDisplayPath,
    targetProjectRelativePath: target.targetProjectRelativePath,
    originalTargetProjectRelativePath: target.originalTargetProjectRelativePath,
    selectedEncoding: preview.selectedEncoding,
    bomKind: preview.bomKind,
    renamed: target.renamed,
    skipped: false,
    previewHead: preview.previewHead,
    previewTail: preview.previewTail
  });
}

async function processDryRunSourceDirectory(
  options: {
    readonly sourcePath: string;
    readonly sourceDisplayPath: string;
    readonly targetSegments: readonly string[];
    readonly destinationFolderProjectRelativePath: string;
    readonly projectRootPath: string;
    readonly plannedTargets: Set<string>;
    readonly files: TextImportDryRunFile[];
    readonly folders: MutableFolderRow[];
    readonly ancestorFolderIndexes: readonly number[];
  }
): Promise<void> {
  const targetProjectRelativePath = appendProjectRelativeSegments(
    [],
    options.targetSegments
  );
  const folderIndex = options.folders.length;
  const nextAncestorFolderIndexes = [
    ...options.ancestorFolderIndexes,
    folderIndex
  ];

  options.folders.push({
    sourcePath: options.sourcePath,
    targetProjectRelativePath,
    hasSkippedDescendant: false
  });

  let entries: Dirent<string>[];

  try {
    entries = await fs.readdir(options.sourcePath, {
      withFileTypes: true,
      encoding: "utf8"
    });
  } catch {
    markSkippedDescendant(options.folders, nextAncestorFolderIndexes);
    addDryRunFile(options.files, {
      sourcePath: options.sourcePath,
      sourceDisplayPath: options.sourceDisplayPath,
      targetProjectRelativePath,
      originalTargetProjectRelativePath: targetProjectRelativePath,
      selectedEncoding: "utf8",
      bomKind: "none",
      renamed: false,
      skipped: true,
      skipReason: "sourceUnreadable",
      previewHead: "",
      previewTail: ""
    });
    return;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const childSourcePath = path.join(options.sourcePath, entry.name);
    const childDisplayPath = path.join(options.sourceDisplayPath, entry.name);
    const childTargetSegments = [...options.targetSegments, entry.name];
    const childTargetProjectRelativePath = appendProjectRelativeSegments(
      [],
      childTargetSegments
    );

    if (entry.isSymbolicLink()) {
      markSkippedDescendant(options.folders, nextAncestorFolderIndexes);
      addDryRunFile(options.files, {
        sourcePath: childSourcePath,
        sourceDisplayPath: childDisplayPath,
        targetProjectRelativePath: isTxtFileName(entry.name)
          ? txtProjectRelativePathToMarkdown(childTargetProjectRelativePath)
          : "",
        originalTargetProjectRelativePath: isTxtFileName(entry.name)
          ? txtProjectRelativePathToMarkdown(childTargetProjectRelativePath)
          : "",
        selectedEncoding: "utf8",
        bomKind: "none",
        renamed: false,
        skipped: true,
        skipReason: "unsupportedSource",
        previewHead: "",
        previewTail: ""
      });
      continue;
    }

    if (entry.isDirectory()) {
      await processDryRunSourceDirectory({
        ...options,
        sourcePath: childSourcePath,
        sourceDisplayPath: childDisplayPath,
        targetSegments: childTargetSegments,
        ancestorFolderIndexes: nextAncestorFolderIndexes
      });
      continue;
    }

    if (entry.isFile()) {
      await processDryRunSourceFile({
        sourcePath: childSourcePath,
        sourceDisplayPath: childDisplayPath,
        targetProjectRelativePath: childTargetProjectRelativePath,
        destinationFolderProjectRelativePath:
          options.destinationFolderProjectRelativePath,
        projectRootPath: options.projectRootPath,
        plannedTargets: options.plannedTargets,
        files: options.files,
        folders: options.folders,
        ancestorFolderIndexes: nextAncestorFolderIndexes
      });
      continue;
    }

    markSkippedDescendant(options.folders, nextAncestorFolderIndexes);
    addDryRunFile(options.files, {
      sourcePath: childSourcePath,
      sourceDisplayPath: childDisplayPath,
      targetProjectRelativePath: "",
      originalTargetProjectRelativePath: "",
      selectedEncoding: "utf8",
      bomKind: "none",
      renamed: false,
      skipped: true,
      skipReason: "unsupportedSource",
      previewHead: "",
      previewTail: ""
    });
  }
}

export async function dryRunTextImport(
  input: TextImportDryRunInput
): Promise<TextImportDryRunResult> {
  if (input.request.projectId !== input.currentProjectId) {
    return { ok: false, reason: "projectMismatch" };
  }

  const destination = await resolveDestinationFolder(
    input.projectRootPath,
    input.request.destinationFolderProjectRelativePath
  );

  if (!destination.ok) {
    return { ok: false, reason: "invalidProjectPath" };
  }

  const files: TextImportDryRunFile[] = [];
  const folders: MutableFolderRow[] = [];
  const plannedTargets = new Set<string>();

  for (const sourcePath of input.request.sourcePaths) {
    if (sourcePath.length === 0 || !isAbsolutePathLike(sourcePath)) {
      addDryRunFile(files, {
        sourcePath,
        sourceDisplayPath: sourcePath,
        targetProjectRelativePath: "",
        originalTargetProjectRelativePath: "",
        selectedEncoding: "utf8",
        bomKind: "none",
        renamed: false,
        skipped: true,
        skipReason: "unsupportedSource",
        previewHead: "",
        previewTail: ""
      });
      continue;
    }

    let stats: Awaited<ReturnType<typeof fs.lstat>>;

    try {
      stats = await fs.lstat(sourcePath);
    } catch (error) {
      addDryRunFile(files, {
        sourcePath,
        sourceDisplayPath: sourcePath,
        targetProjectRelativePath: "",
        originalTargetProjectRelativePath: "",
        selectedEncoding: "utf8",
        bomKind: "none",
        renamed: false,
        skipped: true,
        skipReason:
          nodeErrorCode(error) === "ENOENT"
            ? "sourceMissing"
            : "sourceUnreadable",
        previewHead: "",
        previewTail: ""
      });
      continue;
    }

    if (stats.isSymbolicLink()) {
      addDryRunFile(files, {
        sourcePath,
        sourceDisplayPath: path.basename(sourcePath),
        targetProjectRelativePath: "",
        originalTargetProjectRelativePath: "",
        selectedEncoding: "utf8",
        bomKind: "none",
        renamed: false,
        skipped: true,
        skipReason: "unsupportedSource",
        previewHead: "",
        previewTail: ""
      });
      continue;
    }

    if (stats.isFile()) {
      await processDryRunSourceFile({
        sourcePath,
        sourceDisplayPath: path.basename(sourcePath),
        targetProjectRelativePath: appendProjectRelativeSegments(
          destination.segments,
          [path.basename(sourcePath)]
        ),
        destinationFolderProjectRelativePath: destination.normalized,
        projectRootPath: input.projectRootPath,
        plannedTargets,
        files,
        folders,
        ancestorFolderIndexes: []
      });
      continue;
    }

    if (stats.isDirectory()) {
      await processDryRunSourceDirectory({
        sourcePath,
        sourceDisplayPath: path.basename(sourcePath),
        targetSegments: [...destination.segments, path.basename(sourcePath)],
        destinationFolderProjectRelativePath: destination.normalized,
        projectRootPath: input.projectRootPath,
        plannedTargets,
        files,
        folders,
        ancestorFolderIndexes: []
      });
      continue;
    }

    addDryRunFile(files, {
      sourcePath,
      sourceDisplayPath: path.basename(sourcePath),
      targetProjectRelativePath: "",
      originalTargetProjectRelativePath: "",
      selectedEncoding: "utf8",
      bomKind: "none",
      renamed: false,
      skipped: true,
      skipReason: "unsupportedSource",
      previewHead: "",
      previewTail: ""
    });
  }

  return {
    ok: true,
    files,
    folders: folders.map(
      (folder): TextImportDryRunFolder => ({
        sourcePath: folder.sourcePath,
        targetProjectRelativePath: folder.targetProjectRelativePath,
        hasSkippedDescendant: folder.hasSkippedDescendant
      })
    )
  };
}

async function previewOneTextImportFile(
  request: PreviewTextImportFilesRequest["files"][number]
): Promise<PreviewTextImportFilePreviewResult> {
  const read = await readSourceFileBytes(request.sourcePath);

  if (!read.ok) {
    return {
      ok: false,
      id: request.id,
      sourcePath: request.sourcePath,
      encoding: request.encoding,
      reason:
        read.reason === "unsupportedSource" ? "sourceUnreadable" : read.reason
    };
  }

  try {
    const bomKind = detectTextImportBom(read.bytes);
    const decoded = decodeTextImportBytes(read.bytes, request.encoding);
    const preview = previewDecodedText(decoded);

    return {
      ok: true,
      id: request.id,
      sourcePath: request.sourcePath,
      encoding: request.encoding,
      previewHead: preview.head,
      previewTail: preview.tail,
      bomKind
    };
  } catch (error) {
    if (error instanceof TextImportDecodeError) {
      return {
        ok: false,
        id: request.id,
        sourcePath: request.sourcePath,
        encoding: request.encoding,
        reason: "decodeFailed"
      };
    }

    return {
      ok: false,
      id: request.id,
      sourcePath: request.sourcePath,
      encoding: request.encoding,
      reason: "sourceUnreadable"
    };
  }
}

export async function previewTextImportFiles(
  request: PreviewTextImportFilesRequest
): Promise<PreviewTextImportFilesResult> {
  const files: PreviewTextImportFilePreviewResult[] = [];

  for (const file of request.files) {
    files.push(await previewOneTextImportFile(file));
  }

  return { ok: true, files };
}

export async function previewTextImportFile(
  request: PreviewTextImportFileRequest
): Promise<PreviewTextImportFileResult> {
  const result = await previewTextImportFiles({
    files: [{ id: "__single__", ...request }]
  });

  if (!result.ok) {
    return { ok: false, reason: "sourceUnreadable" };
  }

  const [file] = result.files;

  if (!file) {
    return { ok: false, reason: "sourceUnreadable" };
  }

  if (!file.ok) {
    return {
      ok: false,
      reason: file.reason,
      ...(file.message ? { message: file.message } : {})
    };
  }

  return {
    ok: true,
    previewHead: file.previewHead,
    previewTail: file.previewTail,
    bomKind: file.bomKind
  };
}

async function executeOneTextImportFile(
  projectRootPath: string,
  destinationFolderProjectRelativePath: string,
  request: ExecuteTextImportRequest["files"][number],
  options: {
    readonly normalizeLineEndings: boolean;
    readonly targetLineEnding: TextImportLineEnding;
    readonly writtenTargets: Set<string>;
  }
): Promise<
  | {
      readonly kind: "imported";
      readonly sourcePath: string;
      readonly targetProjectRelativePath: string;
    }
  | {
      readonly kind: "skipped";
      readonly sourcePath: string;
      readonly targetProjectRelativePath?: string;
      readonly reason: TextImportSkipReason;
    }
  | {
      readonly kind: "failed";
      readonly sourcePath: string;
      readonly targetProjectRelativePath?: string;
      readonly reason: TextImportSkipReason;
      readonly message?: string;
    }
> {
  if (request.skipped) {
    return {
      kind: "skipped",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: request.targetProjectRelativePath,
      reason: request.skipReason ?? "unsupportedSource"
    };
  }

  if (!isTxtFileName(path.basename(request.sourcePath))) {
    return {
      kind: "failed",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: request.targetProjectRelativePath,
      reason: "notTextFile"
    };
  }

  const targetValidation = validateProjectRelativePath(
    request.targetProjectRelativePath,
    {
      allowRoot: false,
      requireMarkdownFile: true
    }
  );

  if (
    !targetValidation.ok ||
    !isProjectRelativePathInsideDirectory(
      targetValidation.normalized,
      destinationFolderProjectRelativePath
    )
  ) {
    return {
      kind: "failed",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: request.targetProjectRelativePath,
      reason: "invalidProjectPath"
    };
  }

  const targetKey = targetSetKey(targetValidation.normalized);

  if (options.writtenTargets.has(targetKey)) {
    return {
      kind: "failed",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: targetValidation.normalized,
      reason: "targetExists"
    };
  }

  const parentProjectRelativePath = path.posix.dirname(
    targetValidation.normalized
  );
  const normalizedParentProjectRelativePath =
    parentProjectRelativePath === "." ? "" : parentProjectRelativePath;

  if (
    !(await existingAncestorTraversalIsSafe(
      projectRootPath,
      normalizedParentProjectRelativePath,
      { missingAllowed: true }
    ))
  ) {
    return {
      kind: "failed",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: targetValidation.normalized,
      reason: "invalidProjectPath"
    };
  }

  const targetPath = resolveProjectPath(
    projectRootPath,
    targetValidation.normalized
  );

  if (!targetPath) {
    return {
      kind: "failed",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: targetValidation.normalized,
      reason: "invalidProjectPath"
    };
  }

  const source = await readSourceFileBytes(request.sourcePath);

  if (!source.ok) {
    return {
      kind: "failed",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: targetValidation.normalized,
      reason: source.reason
    };
  }

  let content: string;

  try {
    content = decodeTextImportBytes(source.bytes, request.encoding);
  } catch (error) {
    return {
      kind: "failed",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: targetValidation.normalized,
      reason:
        error instanceof TextImportDecodeError
          ? "decodeFailed"
          : "sourceUnreadable"
    };
  }

  const contentToWrite = options.normalizeLineEndings
    ? normalizeLineEndings(content, options.targetLineEnding)
    : content;

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (
      !(await existingAncestorTraversalIsSafe(
        projectRootPath,
        normalizedParentProjectRelativePath,
        { missingAllowed: false }
      ))
    ) {
      return {
        kind: "failed",
        sourcePath: request.sourcePath,
        targetProjectRelativePath: targetValidation.normalized,
        reason: "invalidProjectPath"
      };
    }

    await fs.writeFile(targetPath, contentToWrite, {
      encoding: "utf8",
      flag: "wx"
    });
    options.writtenTargets.add(targetKey);
  } catch (error) {
    return {
      kind: "failed",
      sourcePath: request.sourcePath,
      targetProjectRelativePath: targetValidation.normalized,
      reason:
        nodeErrorCode(error) === "EEXIST" ? "targetExists" : "sourceUnreadable"
    };
  }

  return {
    kind: "imported",
    sourcePath: request.sourcePath,
    targetProjectRelativePath: targetValidation.normalized
  };
}

export async function executeTextImport(
  input: ExecuteTextImportInput
): Promise<ExecuteTextImportResult> {
  if (input.request.projectId !== input.currentProjectId) {
    return { ok: false, reason: "projectMismatch" };
  }

  const destination = await resolveDestinationFolder(
    input.projectRootPath,
    input.request.destinationFolderProjectRelativePath
  );

  if (!destination.ok) {
    return { ok: false, reason: "invalidProjectPath" };
  }

  const imported: {
    sourcePath: string;
    targetProjectRelativePath: string;
  }[] = [];
  const skipped: {
    sourcePath: string;
    targetProjectRelativePath?: string;
    reason: TextImportSkipReason;
  }[] = [];
  const failed: {
    sourcePath: string;
    targetProjectRelativePath?: string;
    reason: TextImportSkipReason;
    message?: string;
  }[] = [];
  const writtenTargets = new Set<string>();

  for (const file of input.request.files) {
    const result = await executeOneTextImportFile(
      input.projectRootPath,
      destination.normalized,
      file,
      {
        normalizeLineEndings: input.request.normalizeLineEndings,
        targetLineEnding: input.request.targetLineEnding,
        writtenTargets
      }
    );

    if (result.kind === "imported") {
      imported.push({
        sourcePath: result.sourcePath,
        targetProjectRelativePath: result.targetProjectRelativePath
      });
    } else if (result.kind === "skipped") {
      skipped.push({
        sourcePath: result.sourcePath,
        targetProjectRelativePath: result.targetProjectRelativePath,
        reason: result.reason
      });
    } else {
      failed.push({
        sourcePath: result.sourcePath,
        targetProjectRelativePath: result.targetProjectRelativePath,
        reason: result.reason,
        ...(result.message ? { message: result.message } : {})
      });
    }
  }

  return { ok: true, imported, skipped, failed };
}

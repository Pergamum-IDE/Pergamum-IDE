import path from "node:path";
import type { ProjectLockOwnerInfo } from "../shared/api";

export const projectLockOwnerMetadataSchemaVersion = 1;
export const projectLockOwnerMetadataFileName = "meta.json";
export const projectLockOwnerHandleFileName = "owner.handle";
export const projectLockOwnerHandleContent =
  "Pergamum writable lock handle\n";

const maxDisplayHostnameLength = 80;

export interface ProjectLockOwnerMetadata {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly sessionId: string;
  readonly pid: number;
  readonly hostname: string;
  readonly appVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateProjectLockOwnerMetadataInput {
  readonly projectId: string;
  readonly sessionId: string;
  readonly pid: number;
  readonly hostname: string;
  readonly appVersion: string;
  readonly now: Date;
}

export interface ProjectLockOwnerMetadataReader {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizeProjectLockOwnerHostname(
  value: unknown
): string | null {
  const hostname = nonEmptyString(value);

  if (!hostname) {
    return null;
  }

  const sanitized = hostname.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();

  if (sanitized.length === 0) {
    return null;
  }

  return sanitized.slice(0, maxDisplayHostnameLength);
}

function validIsoDateString(value: unknown): string | null {
  const dateText = nonEmptyString(value);

  if (!dateText) {
    return null;
  }

  const date = new Date(dateText);

  return Number.isNaN(date.getTime()) ? null : dateText;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatProjectLockOpenedAt(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(
    date.getSeconds()
  )}`;
}

export function createProjectLockOwnerMetadata({
  projectId,
  sessionId,
  pid,
  hostname,
  appVersion,
  now
}: CreateProjectLockOwnerMetadataInput): ProjectLockOwnerMetadata {
  const timestamp = now.toISOString();

  return {
    schemaVersion: projectLockOwnerMetadataSchemaVersion,
    projectId,
    sessionId,
    pid,
    hostname: sanitizeProjectLockOwnerHostname(hostname) ?? "unknown",
    appVersion: appVersion.trim() || "unknown",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function projectLockOwnerMetadataPath(
  lockDirectoryPath: string
): string {
  return path.join(lockDirectoryPath, projectLockOwnerMetadataFileName);
}

export function projectLockOwnerHandlePath(lockDirectoryPath: string): string {
  return path.join(lockDirectoryPath, projectLockOwnerHandleFileName);
}

export function parseProjectLockOwnerInfo(
  value: unknown
): ProjectLockOwnerInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.schemaVersion !== projectLockOwnerMetadataSchemaVersion) {
    return null;
  }

  const createdAt = validIsoDateString(value.createdAt);
  const updatedAt = validIsoDateString(value.updatedAt);

  if (
    !nonEmptyString(value.projectId) ||
    !nonEmptyString(value.sessionId) ||
    !nonEmptyString(value.appVersion) ||
    typeof value.pid !== "number" ||
    !Number.isInteger(value.pid) ||
    value.pid <= 0 ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const hostname = sanitizeProjectLockOwnerHostname(value.hostname);
  const openedAt = formatProjectLockOpenedAt(createdAt);

  if (!hostname || !openedAt) {
    return null;
  }

  return {
    hostname,
    openedAt
  };
}

export async function readProjectLockOwnerInfo(
  fileSystem: ProjectLockOwnerMetadataReader,
  lockDirectoryPath: string
): Promise<ProjectLockOwnerInfo | null> {
  try {
    const raw = await fileSystem.readFile(
      projectLockOwnerMetadataPath(lockDirectoryPath),
      "utf8"
    );

    return parseProjectLockOwnerInfo(JSON.parse(raw));
  } catch {
    return null;
  }
}

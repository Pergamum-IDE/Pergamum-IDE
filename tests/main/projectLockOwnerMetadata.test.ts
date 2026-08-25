import { describe, expect, it } from "vitest";
import {
  createProjectLockOwnerMetadata,
  formatProjectLockOpenedAt,
  parseProjectLockOwnerInfo,
  sanitizeProjectLockOwnerHostname
} from "../../src/main/projectLockOwnerMetadata";

describe("project lock owner metadata (#238)", () => {
  it("formats opened time as local yyyy-MM-dd HH:mm:ss text", () => {
    const date = new Date(2026, 7, 25, 8, 21, 0);

    expect(formatProjectLockOpenedAt(date.toISOString())).toBe(
      "2026-08-25 08:21:00"
    );
  });

  it("sanitizes control characters and truncates long hostnames", () => {
    const longHostname = `${"a".repeat(90)}\n`;
    const sanitized = sanitizeProjectLockOwnerHostname(longHostname);

    expect(sanitizeProjectLockOwnerHostname("writer\nhost")).toBe("writerhost");
    expect(sanitized).toHaveLength(80);
    expect(sanitized).toBe("a".repeat(80));
  });

  it("falls back when hostname or createdAt is invalid", () => {
    const metadata = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-000000000238",
      sessionId: "session-test",
      pid: 238,
      hostname: "writer-host",
      appVersion: "9.8.7-test",
      now: new Date(2026, 7, 25, 8, 21, 0)
    });

    expect(parseProjectLockOwnerInfo({ ...metadata, hostname: 123 })).toBeNull();
    expect(
      parseProjectLockOwnerInfo({ ...metadata, createdAt: "not-a-date" })
    ).toBeNull();
  });

  it("returns only UI-safe owner info from valid metadata", () => {
    const metadata = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-000000000238",
      sessionId: "session-test",
      pid: 238,
      hostname: "writer-host",
      appVersion: "9.8.7-test",
      now: new Date(2026, 7, 25, 8, 21, 0)
    });

    expect(parseProjectLockOwnerInfo(metadata)).toEqual({
      hostname: "writer-host",
      openedAt: "2026-08-25 08:21:00"
    });
    expect(JSON.stringify(parseProjectLockOwnerInfo(metadata))).not.toContain(
      metadata.sessionId
    );
  });
});

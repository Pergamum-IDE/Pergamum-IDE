import { describe, expect, it } from "vitest";
import {
  formatSessionPersistenceTechnicalInfo,
  isSessionStorageFailure,
  parseSessionLockFailureDetails,
  SESSION_STORAGE_FAILURE_CODE,
  SessionStorageFailureError,
  sessionStorageFailureReason,
  sessionStorageFailureReasonFromError,
  toSessionStorageFailureError
} from "../../src/shared/sessionPersistenceFailure";

function nodeError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe("session persistence storage-failure taxonomy (#272 PO decision)", () => {
  it("maps raw filesystem error codes to reasons", () => {
    expect(sessionStorageFailureReasonFromError(nodeError("ENOSPC"))).toBe(
      "diskFull"
    );
    expect(sessionStorageFailureReasonFromError(nodeError("EIO"))).toBe(
      "ioError"
    );
    expect(sessionStorageFailureReasonFromError(nodeError("EACCES"))).toBe(
      "permissionDenied"
    );
    expect(sessionStorageFailureReasonFromError(nodeError("EPERM"))).toBe(
      "permissionDenied"
    );
    expect(sessionStorageFailureReasonFromError(nodeError("EROFS"))).toBe(
      "permissionDenied"
    );
    expect(sessionStorageFailureReasonFromError(nodeError("EWHATEVER"))).toBe(
      "writeFailed"
    );
  });

  it("maps the manifest lock / mutation errors by name", () => {
    const lockErr = Object.assign(new Error("x"), {
      name: "SessionManifestLockUnavailableError"
    });
    const mutErr = Object.assign(new Error("x"), {
      name: "SessionManifestNotMutableError"
    });
    expect(sessionStorageFailureReasonFromError(lockErr)).toBe(
      "lockUnavailable"
    );
    expect(sessionStorageFailureReasonFromError(mutErr)).toBe(
      "manifestNotMutable"
    );
  });

  it("SessionStorageFailureError carries the code + reason in its message", () => {
    const err = new SessionStorageFailureError("diskFull", "ENOSPC: no space");
    expect(err.code).toBe(SESSION_STORAGE_FAILURE_CODE);
    expect(err.reason).toBe("diskFull");
    expect(err.message).toContain(SESSION_STORAGE_FAILURE_CODE);
    expect(err.message).toContain("diskFull");
  });

  it("isSessionStorageFailure recognizes the class AND the IPC-flattened message", () => {
    expect(isSessionStorageFailure(new SessionStorageFailureError("ioError"))).toBe(
      true
    );
    // What the renderer sees after ipcRenderer.invoke re-wraps the error:
    const flattened = new Error(
      `Error invoking remote method 'session:persistSession': Error: ${SESSION_STORAGE_FAILURE_CODE}:diskFull: ENOSPC`
    );
    expect(isSessionStorageFailure(flattened)).toBe(true);

    expect(isSessionStorageFailure(new Error("some unrelated failure"))).toBe(
      false
    );
    expect(
      isSessionStorageFailure(
        Object.assign(new Error("Session not persisted: unresolved Project identity."), {
          name: "UnresolvedProjectIdentityError"
        })
      )
    ).toBe(false);
  });

  it("recovers the reason from a flattened message", () => {
    const flattened = new Error(
      `remote: ${SESSION_STORAGE_FAILURE_CODE}:permissionDenied: EROFS`
    );
    expect(sessionStorageFailureReason(flattened)).toBe("permissionDenied");
    expect(sessionStorageFailureReason(new Error("no marker"))).toBe(
      "writeFailed"
    );
  });

  it("toSessionStorageFailureError wraps a raw error, keeps an existing one", () => {
    const wrapped = toSessionStorageFailureError(nodeError("ENOSPC"));
    expect(wrapped).toBeInstanceOf(SessionStorageFailureError);
    expect(wrapped.reason).toBe("diskFull");

    const already = new SessionStorageFailureError("lockUnavailable");
    expect(toSessionStorageFailureError(already)).toBe(already);
  });

  it("parses lock failure details from IPC error message while excluding hostname and file path", () => {
    const errorWithDetails = new Error(
      `PERGAMUM_SESSION_STORAGE_FAILURE:lockUnavailable: Could not acquire lock (${JSON.stringify({
        lockDirPath: "C:\\secret\\sessions\\manifest.lock",
        dirMtimeMs: 1726710900000,
        markerCount: 1,
        markers: [
          {
            token: "secret-token",
            pid: 22600,
            hostname: "secret-pc",
            acquiredAt: 1726710900000
          }
        ]
      })})`
    );

    const parsed = parseSessionLockFailureDetails(errorWithDetails);
    expect(parsed).toEqual({
      dirMtimeMs: 1726710900000,
      markerCount: 1,
      markers: [
        {
          pid: 22600,
          acquiredAt: 1726710900000
        }
      ]
    });
  });

  it("formats comprehensive technical info for clipboard without exposing hostname or file paths", () => {
    const formatted = formatSessionPersistenceTechnicalInfo({
      timestamp: "2026-09-19T10:12:26.123Z",
      appVersion: "0.80.0",
      reason: "lockUnavailable",
      consecutiveFailures: 3,
      lockDetails: {
        dirMtimeMs: 1726710900000,
        markerCount: 1,
        markers: [
          {
            pid: 22600,
            acquiredAt: 1726710900000
          }
        ]
      }
    });

    expect(formatted).toContain("Pergamum Session Persistence Failure");
    expect(formatted).toContain("Timestamp: 2026-09-19T10:12:26.123Z");
    expect(formatted).toContain("App Version: 0.80.0");
    expect(formatted).toContain("Reason: lockUnavailable");
    expect(formatted).toContain("Consecutive Failures: 3");
    expect(formatted).toContain("Lock Dir mtime: 2024-09-19T01:55:00.000Z (1726710900000)");
    expect(formatted).toContain("Marker Count: 1");
    expect(formatted).toContain("Marker #1: pid=22600, acquiredAt=2024-09-19T01:55:00.000Z (1726710900000)");
    expect(formatted).not.toContain("secret");
    expect(formatted).not.toContain("hostname");
    expect(formatted).not.toContain("path");
  });
});

import { describe, expect, it } from "vitest";
import {
  isSessionStorageFailure,
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
});

import { describe, expect, it } from "vitest";
import {
  sanitizedFileIoErrorMessage,
  sanitizedFileIoErrorReasonFromMessage
} from "../../src/shared/sanitizedFileIoErrorMessage";

describe("sanitizedFileIoErrorMessage (#501 slice 6 remediation)", () => {
  it("round-trips every reason through message formatting and parsing", () => {
    const reasons = [
      "permissionDenied",
      "notFound",
      "invalidPath",
      "invalidEncoding",
      "unencodableCharacters",
      "locked",
      "unknown"
    ] as const;

    for (const reason of reasons) {
      const message = sanitizedFileIoErrorMessage(reason);
      expect(message).toBe(`File I/O failed: ${reason}`);
      expect(sanitizedFileIoErrorReasonFromMessage(message)).toBe(reason);
    }
  });

  it("returns null for a message that is not in the sanitized format", () => {
    expect(
      sanitizedFileIoErrorReasonFromMessage("ENOENT: no such file or directory")
    ).toBeNull();
    expect(sanitizedFileIoErrorReasonFromMessage("")).toBeNull();
  });
});

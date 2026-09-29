import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  JAPANESE_LINT_REJECTION_GRACE_MS,
  isJapaneseLintRejectionWindow,
  resetJapaneseLintRejectionGuard,
  withJapaneseLintRejectionGuard
} from "../../src/main/japaneseLintRejectionGuard";

describe("japaneseLintRejectionGuard (#625 crash blocker)", () => {
  beforeEach(() => {
    resetJapaneseLintRejectionGuard();
  });

  it("is closed until a lint runs", () => {
    expect(isJapaneseLintRejectionWindow()).toBe(false);
  });

  it("is open while a lint task runs", async () => {
    let openDuringTask = false;

    await withJapaneseLintRejectionGuard(async () => {
      openDuringTask = isJapaneseLintRejectionWindow();
    });

    expect(openDuringTask).toBe(true);
  });

  it("stays open for a grace period after the task settles, then closes", async () => {
    let clock = 1_000;

    await withJapaneseLintRejectionGuard(async () => undefined, () => clock);

    expect(isJapaneseLintRejectionWindow(clock + 1)).toBe(true);
    expect(
      isJapaneseLintRejectionWindow(clock + JAPANESE_LINT_REJECTION_GRACE_MS - 1)
    ).toBe(true);
    expect(
      isJapaneseLintRejectionWindow(clock + JAPANESE_LINT_REJECTION_GRACE_MS + 1)
    ).toBe(false);
    clock += 1;
  });

  it("also opens the grace period when the task rejects, and rethrows", async () => {
    await expect(
      withJapaneseLintRejectionGuard(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(isJapaneseLintRejectionWindow()).toBe(true);
  });

  it("main.ts skips process.exit only inside the window, keeping other rejections fatal", () => {
    const main = readFileSync("src/main/main.ts", "utf8");
    const start = main.indexOf('process.on("unhandledRejection"');
    const handler = main.slice(start, main.indexOf("\n  });", start));

    expect(handler).toContain("isJapaneseLintRejectionWindow()");
    // The guard returns before the fatal exit; the exit itself is unchanged.
    expect(handler.indexOf("isJapaneseLintRejectionWindow()")).toBeLessThan(
      handler.indexOf("process.exit(1)")
    );
    expect(handler).toContain("process.exit(1)");
    // The uncaughtException policy is untouched.
    expect(main).toMatch(/process\.on\("uncaughtException"[\s\S]*process\.exit\(1\)/);
  });
});

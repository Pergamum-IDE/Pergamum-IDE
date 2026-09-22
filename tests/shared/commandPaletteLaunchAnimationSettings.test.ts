import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMMAND_PALETTE_LAUNCH_ANIMATION_DURATION_MS,
  normalizeCommandPaletteLaunchAnimationDurationMs
} from "../../src/shared/commandPaletteLaunchAnimationSettings";

describe("commandPaletteLaunchAnimationSettings", () => {
  it("normalizes launch animation durations to the supported 100ms range", () => {
    expect(normalizeCommandPaletteLaunchAnimationDurationMs("slow")).toBe(
      DEFAULT_COMMAND_PALETTE_LAUNCH_ANIMATION_DURATION_MS
    );
    expect(normalizeCommandPaletteLaunchAnimationDurationMs(-50)).toBe(0);
    expect(normalizeCommandPaletteLaunchAnimationDurationMs(150)).toBe(200);
    expect(normalizeCommandPaletteLaunchAnimationDurationMs(550)).toBe(600);
    expect(normalizeCommandPaletteLaunchAnimationDurationMs(1500)).toBe(1000);
  });
});

import { describe, expect, it } from "vitest";
import {
  formatKeySpec,
  getEnabledWelcomeTips,
  getNextTipIndex,
  getPreviousTipIndex,
  resolveWelcomeTipTextTokens
} from "../../src/shared/welcomeTips";

describe("welcomeTips", () => {
  describe("formatKeySpec", () => {
    it("formats Mod+P on Windows/Linux to Ctrl+P", () => {
      expect(formatKeySpec("Mod+P", "windows")).toBe("Ctrl+P");
      expect(formatKeySpec("Mod+P", "linux")).toBe("Ctrl+P");
    });

    it("formats Mod+P on macOS to ⌘P", () => {
      expect(formatKeySpec("Mod+P", "macos")).toBe("⌘P");
    });

    it("formats Mod+Alt+S on Windows to Ctrl+Alt+S and macOS to ⌘OptionS", () => {
      expect(formatKeySpec("Mod+Alt+S", "windows")).toBe("Ctrl+Alt+S");
      expect(formatKeySpec("Mod+Alt+S", "macos")).toBe("⌘OptionS");
    });

    it("formats Mod+Shift+O on Windows to Ctrl+Shift+O and macOS to ⌘ShiftO", () => {
      expect(formatKeySpec("Mod+Shift+O", "windows")).toBe("Ctrl+Shift+O");
      expect(formatKeySpec("Mod+Shift+O", "macos")).toBe("⌘ShiftO");
    });
  });

  describe("resolveWelcomeTipTextTokens", () => {
    it("resolves {key:...} tokens in text", () => {
      const input = "Use {key:Mod+Shift+O} to open.";
      expect(resolveWelcomeTipTextTokens(input, "windows")).toBe(
        "Use Ctrl+Shift+O to open."
      );
      expect(resolveWelcomeTipTextTokens(input, "macos")).toBe(
        "Use ⌘ShiftO to open."
      );
    });

    it("resolves {kb:...} tokens in text", () => {
      const input = "Save using {kb:editor.document.save}.";
      expect(resolveWelcomeTipTextTokens(input, "windows")).toBe(
        "Save using Ctrl+S."
      );
      expect(resolveWelcomeTipTextTokens(input, "macos")).toBe(
        "Save using ⌘S."
      );
    });

    it("handles fallback for unknown {kb:...} token", () => {
      const input = "Run {kb:unknown.command.id}.";
      expect(resolveWelcomeTipTextTokens(input, "windows")).toBe(
        "Run unknown.command.id."
      );
    });
  });

  describe("ring navigation", () => {
    it("advances index with wrap-around", () => {
      expect(getNextTipIndex(0, 3)).toBe(1);
      expect(getNextTipIndex(1, 3)).toBe(2);
      expect(getNextTipIndex(2, 3)).toBe(0);
    });

    it("reverses index with wrap-around", () => {
      expect(getPreviousTipIndex(0, 3)).toBe(2);
      expect(getPreviousTipIndex(2, 3)).toBe(1);
      expect(getPreviousTipIndex(1, 3)).toBe(0);
    });
  });

  describe("getEnabledWelcomeTips", () => {
    it("returns enabled tips from welcomeTipsData", () => {
      const enabledTips = getEnabledWelcomeTips();
      expect(enabledTips.length).toBeGreaterThan(0);
      expect(enabledTips.every((tip) => tip.enabled)).toBe(true);
    });
  });
});

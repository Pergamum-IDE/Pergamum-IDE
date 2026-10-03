import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getEnabledWelcomeTips,
  getNextTipIndex,
  getPreviousTipIndex,
  getWelcomeTipText
} from "../../src/shared/welcomeTips";
import * as welcomeTipsModule from "../../src/shared/welcomeTips";

describe("welcomeTips", () => {
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

  describe("getWelcomeTipText", () => {
    it("returns Japanese text when language is ja", () => {
      const [firstTip] = getEnabledWelcomeTips();
      const text = getWelcomeTipText(firstTip, "ja");
      expect(text.title).toBe(firstTip.text.ja.title);
      expect(text.body).toBe(firstTip.text.ja.body);
    });

    it("returns English text when language is en", () => {
      const [firstTip] = getEnabledWelcomeTips();
      const text = getWelcomeTipText(firstTip, "en");
      expect(text.title).toBe(firstTip.text.en.title);
      expect(text.body).toBe(firstTip.text.en.body);
    });
  });

  describe("keybinding elimination contract (#718 Slice 1)", () => {
    it("ensures no {kb:...} or {key:...} tokens remain in any tip title or body (ja / en)", () => {
      const allTips = getEnabledWelcomeTips();
      for (const tip of allTips) {
        for (const lang of ["ja", "en"] as const) {
          const text = getWelcomeTipText(tip, lang);
          expect(text.title, `${tip.id} [${lang}] title contains {kb:`).not.toContain("{kb:");
          expect(text.title, `${tip.id} [${lang}] title contains {key:`).not.toContain("{key:");
          expect(text.body, `${tip.id} [${lang}] body contains {kb:`).not.toContain("{kb:");
          expect(text.body, `${tip.id} [${lang}] body contains {key:`).not.toContain("{key:");
        }
      }
    });

    it("does not export TIPS-only keybinding machinery from welcomeTips", () => {
      expect("KNOWN_COMMAND_KEYBINDINGS" in welcomeTipsModule).toBe(false);
      expect("formatKeySpec" in welcomeTipsModule).toBe(false);
      expect("resolveWelcomeTipTextTokens" in welcomeTipsModule).toBe(false);
    });

    it("does not contain KNOWN_COMMAND_KEYBINDINGS or resolveWelcomeTipTextTokens in welcomeTips.ts source", () => {
      const source = readFileSync("src/shared/welcomeTips.ts", "utf8");
      expect(source).not.toContain("KNOWN_COMMAND_KEYBINDINGS");
      expect(source).not.toContain("formatKeySpec");
      expect(source).not.toContain("resolveWelcomeTipTextTokens");
      expect(source).not.toContain("AppPlatform");
    });
  });
});

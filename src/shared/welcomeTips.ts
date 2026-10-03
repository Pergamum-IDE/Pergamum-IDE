import {
  welcomeTipsData,
  type WelcomeTip,
  type WelcomeTipTextContent
} from "./welcomeTips.generated";
import type { Language } from "./i18n";

export type { WelcomeTip, WelcomeTipTextContent, WelcomeTipLinkContent } from "./welcomeTips.generated";

export function getEnabledWelcomeTips(): readonly WelcomeTip[] {
  return welcomeTipsData.tips.filter((tip) => tip.enabled);
}

export function getWelcomeTipText(
  tip: WelcomeTip,
  language: Language
): WelcomeTipTextContent {
  return language === "ja" ? tip.text.ja : tip.text.en ?? tip.text.ja;
}

export function getNextTipIndex(currentIndex: number, length: number): number {
  if (length <= 0) return 0;
  return (currentIndex + 1) % length;
}

export function getPreviousTipIndex(currentIndex: number, length: number): number {
  if (length <= 0) return 0;
  return (currentIndex - 1 + length) % length;
}

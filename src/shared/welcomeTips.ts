import type { AppPlatform } from "./platform";
import {
  welcomeTipsData,
  type WelcomeTip,
  type WelcomeTipTextContent
} from "./welcomeTips.generated";
import type { Language } from "./i18n";

export type { WelcomeTip, WelcomeTipTextContent, WelcomeTipLinkContent } from "./welcomeTips.generated";

export const KNOWN_COMMAND_KEYBINDINGS: Record<string, string> = {
  "workbench.commandPalette.open": "Mod+P",
  "editor.document.save": "Mod+S",
  "editor.file.new": "Mod+N",
  "workspace.project.open": "Mod+Shift+O",
  "workspace.project.create": "Mod+Alt+N",
  "editor.markdown.bold": "Mod+B",
  "editor.markdown.italic": "Mod+I",
  "editor.markdown.strikethrough": "Mod+Shift+X",
  "editor.markdown.heading": "Mod+H",
  "editor.markdown.insertCodeBlock": "Mod+K",
  "editor.markdown.link": "Mod+L",
  "editor.indent": "Mod+]",
  "editor.outdent": "Mod+[",
  "editor.preview.toggle": "Mod+Shift+P",
  "glossary.openFromEditorSelection": "Mod+G",
  "workspace.files.toggle": "Mod+Shift+E",
  "workspace.glossary.focus": "Mod+Shift+G",
  "workspace.documentMetrics.focus": "Mod+Shift+M",
  "workspace.documentMap.focus": "Mod+Shift+T",
  "workspace.applicationSettings.open": "Mod+,",
  "app.zoom.in": "Mod+=",
  "app.zoom.out": "Mod+-",
  "app.zoom.reset": "Mod+0",
  "editor.saveAll": "Mod+Alt+S",
  "editor.saveAs": "Mod+Shift+S",
  "editor.markdown.insertRuby": "Mod+R",
  "editor.markdown.insertEmphasisMark": "Mod+.",
  "editor.image.insert": "Mod+Shift+I",
  "editor.markdown.insertTable": "Mod+Shift+K",
  "editor.markdown.insertHorizontalRule": "Mod+Shift+-",
  "editor.markdown.insertBlockquote": "Mod+Shift+Q",
  "editor.markdown.toggleSyntaxChecker": "Mod+Shift+J"
};

/**
  Format a key spec like "Mod+Shift+O" or "Mod+Alt+S" according to OS.
 */
export function formatKeySpec(keySpec: string, platform: AppPlatform): string {
  const parts = keySpec.split("+");
  const isMac = platform === "macos";

  const formattedParts = parts.map((part) => {
    const trimmed = part.trim();
    if (trimmed === "Mod") {
      return isMac ? "⌘" : "Ctrl";
    }
    if (trimmed === "Alt") {
      return isMac ? "Option" : "Alt";
    }
    return trimmed;
  });

  return formattedParts.join(isMac ? "" : "+");
}

/**
 * Resolves both {kb:commandId} and {key:shortcut} tokens in tip text.
 */
export function resolveWelcomeTipTextTokens(
  text: string,
  platform: AppPlatform
): string {
  // First, resolve {kb:commandId} into formatted shortcut or fallback
  const resolvedKb = text.replace(/\{kb:([^}]+)\}/g, (_match, commandId: string) => {
    const keySpec = KNOWN_COMMAND_KEYBINDINGS[commandId.trim()];
    if (keySpec) {
      return formatKeySpec(keySpec, platform);
    }
    return commandId.trim();
  });

  // Second, resolve {key:Mod+P} etc.
  const resolvedKey = resolvedKb.replace(/\{key:([^}]+)\}/g, (_match, keySpec: string) => {
    return formatKeySpec(keySpec.trim(), platform);
  });

  return resolvedKey;
}

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

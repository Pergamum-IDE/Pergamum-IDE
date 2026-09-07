/**
 * #411: localized hover text for a broken project-local image-link diagnostic.
 * Kept out of the CodeMirror extension so the extension stays i18n-agnostic
 * (it receives a pre-bound formatter).
 */

import type { Translate, TranslationKey } from "../shared/i18n";
import type { MarkdownImageLinkDiagnosticReason } from "../shared/api";

const MESSAGE_KEY: Record<MarkdownImageLinkDiagnosticReason, TranslationKey> = {
  missing: "markdownImageLinkDiagnostics.missing",
  directory: "markdownImageLinkDiagnostics.directory",
  outsideProject: "markdownImageLinkDiagnostics.outsideProject",
  protectedLocation: "markdownImageLinkDiagnostics.protectedLocation",
  unsupportedFormat: "markdownImageLinkDiagnostics.unsupportedFormat",
  formatMismatch: "markdownImageLinkDiagnostics.formatMismatch",
  invalidPath: "markdownImageLinkDiagnostics.invalidPath",
  tooLarge: "markdownImageLinkDiagnostics.tooLarge"
};

export function formatMarkdownImageLinkDiagnosticMessage(
  translate: Translate,
  reason: MarkdownImageLinkDiagnosticReason,
  src: string
): string {
  return translate(MESSAGE_KEY[reason], { src });
}

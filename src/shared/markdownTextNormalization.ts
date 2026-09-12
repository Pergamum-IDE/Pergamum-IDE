export interface MarkdownTextStorageNormalizationOptions {
  readonly normalizeUnicodeToNfc: boolean;
}

export function normalizeMarkdownTextForStorage(
  value: string,
  options: MarkdownTextStorageNormalizationOptions
): string {
  return options.normalizeUnicodeToNfc ? value.normalize("NFC") : value;
}

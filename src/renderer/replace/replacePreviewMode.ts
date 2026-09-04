import type { Translate } from "../../shared/i18n";
import type { ReplacePreviewSearchOptions } from "./replacePreviewTypes";

/**
 * #386 - the "モード:" line of the Replace Preview Dialog summary.
 *
 * Order follows the issue's display examples: regex, then whole-word, then
 * match-case. Regex and whole-word are mutually exclusive in the Search pane,
 * but if both ever arrive `true` the labels simply both show - nothing breaks.
 * When no option is active the mode is the plain full-text search label.
 *
 * This is UI text only: nothing here is logged. The find / replace strings and
 * regex pattern never reach debug logs or telemetry.
 */
export function buildReplacePreviewModeLabel(
  translate: Translate,
  options: ReplacePreviewSearchOptions
): string {
  const labels: string[] = [];

  if (options.useRegex) {
    labels.push(translate("search.replace.preview.mode.regex"));
  }
  if (options.wholeWord) {
    labels.push(translate("search.replace.preview.mode.wholeWord"));
  }
  if (options.caseSensitive) {
    labels.push(translate("search.replace.preview.mode.caseSensitive"));
  }

  if (labels.length === 0) {
    return translate("search.replace.preview.mode.plain");
  }

  return labels.join(" / ");
}

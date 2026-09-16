import type {
  FontFamilySetting,
  FontSlot
} from "../shared/fontSettings";
import { FONT_SLOT_GENERIC_FALLBACKS } from "../shared/fontSettings";
import type { Language, Translate } from "../shared/i18n";
import { FontCacheControl } from "./FontCacheControl";

export interface FontFamilyListSettingControlProps {
  readonly id: string;
  readonly slot: FontSlot;
  readonly value?: readonly FontFamilySetting[];
  readonly disabled?: boolean;
  readonly translate: Translate;
  /** #496: threaded through to `FontCacheControl` so a scan resolves
   * localized display names for the app's current UI language. */
  readonly uiLanguage?: Language;
  readonly onOpenDialog: (slot: FontSlot, opener?: Element | null) => void;
}

export function FontFamilyListSettingControl({
  id,
  slot,
  value,
  disabled = false,
  translate,
  uiLanguage,
  onOpenDialog
}: FontFamilyListSettingControlProps): JSX.Element {
  const genericFallback = FONT_SLOT_GENERIC_FALLBACKS[slot];

  const summaryText =
    value && value.length > 0
      ? value.map((f) => f.displayName || f.family).join(", ")
      : `(${translate("fontPicker.emptySelection")}: ${genericFallback})`;

  return (
    <div id={id} className="fontFamilyListControlGroup">
      <div className="fontFamilyListSummaryRow">
        <span className="fontFamilyListSummaryText" title={summaryText}>
          {summaryText}
        </span>
        <button
          type="button"
          className="settingsButton fontFamilyListChooseButton"
          disabled={disabled}
          onClick={(e) => onOpenDialog(slot, e.currentTarget)}
        >
          {translate("fontPicker.button.choose")}
        </button>
      </div>
      <FontCacheControl
        id={`${id}-cache`}
        disabled={disabled}
        translate={translate}
        uiLanguage={uiLanguage}
      />
    </div>
  );
}

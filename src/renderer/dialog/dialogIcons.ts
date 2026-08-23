import infoIconRaw from "../../../assets/icons/feather/dialog/info.svg?raw";
import warningIconRaw from "../../../assets/icons/feather/dialog/alert-circle.svg?raw";
import errorIconRaw from "../../../assets/icons/feather/dialog/x-circle.svg?raw";
import questionIconRaw from "../../../assets/icons/feather/dialog/help-circle.svg?raw";
import clipboardIconRaw from "../../../assets/icons/feather/dialog/clipboard.svg?raw";
import alertTriangleIconRaw from "../../../assets/icons/feather/global/alert-triangle.svg?raw";
import type {
  AppDialogChoiceIconKind,
  AppDialogIconKind
} from "./appDialogTypes";

/**
 * Feather Icons (MIT, see assets/icons/feather/LICENSE.txt), mapped per #182 D-6.
 * These are dialog-owned assets under `assets/icons/feather/dialog/`, distinct from
 * the shared icons in `assets/icons/feather/global/`.
 * `error` uses `x-circle.svg`, not `error-octagon.svg` — the latter is a
 * pre-existing `x-octagon` asset unrelated to this mapping.
 * `warning` uses the circular `alert-circle.svg`, not `alert-triangle.svg` —
 * dialog title icons are circle-based per PO decision. Choice buttons may
 * opt in to their own supplemental icons through `dialogChoiceIconSvgByKind`.
 */
export const dialogIconSvgByKind: Record<AppDialogIconKind, string> = {
  info: infoIconRaw,
  warning: warningIconRaw,
  error: errorIconRaw,
  question: questionIconRaw
};

export const dialogChoiceIconSvgByKind: Record<
  AppDialogChoiceIconKind,
  string
> = {
  alertTriangle: alertTriangleIconRaw
};

export const dialogCopyButtonIconSvg = clipboardIconRaw;

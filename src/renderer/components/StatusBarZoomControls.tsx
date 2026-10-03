import type { FC } from "react";
import type { Translate } from "../../shared/i18n";
import { formatZoomFactorPercent } from "../../shared/zoom";
import { applicationCommandIds } from "../../shared/commandIds";
import {
  formatCommandTooltip,
  useCommandShortcutResolver
} from "../commandShortcuts";
import zoomOutIconRaw from "../../../assets/icons/codicons/general/zoom-out.svg?raw";
import zoomInIconRaw from "../../../assets/icons/codicons/general/zoom-in.svg?raw";

export interface StatusBarZoomControlsProps {
  readonly zoomFactor: number;
  readonly zoomControlScale?: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onResetZoom: () => void;
  readonly translate: Translate;
}

export const StatusBarZoomControls: FC<StatusBarZoomControlsProps> = ({
  zoomFactor,
  zoomControlScale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  translate
}) => {
  const resolveShortcut = useCommandShortcutResolver();
  const formattedPercent = formatZoomFactorPercent(zoomFactor);
  const scale = zoomControlScale ?? (zoomFactor > 0 ? 1 / zoomFactor : 1);

  return (
    <div
      className="statusBarZoomControls"
      style={{ transform: `scale(${scale})` }}
    >
      <button
        type="button"
        className="statusBarZoomButton"
        title={formatCommandTooltip(
          translate("statusBar.zoomOut"),
          resolveShortcut(applicationCommandIds.zoomOut)
        )}
        aria-label={translate("statusBar.zoomOut")}
        onClick={onZoomOut}
      >
        <span
          className="statusBarZoomIcon"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: zoomOutIconRaw }}
        />
      </button>
      <button
        type="button"
        className="statusBarZoomResetButton"
        title={formatCommandTooltip(
          translate("statusBar.zoomReset"),
          resolveShortcut(applicationCommandIds.resetZoom)
        )}
        aria-label={translate("statusBar.zoomReset")}
        onClick={onResetZoom}
      >
        {formattedPercent}
      </button>
      <button
        type="button"
        className="statusBarZoomButton"
        title={formatCommandTooltip(
          translate("statusBar.zoomIn"),
          resolveShortcut(applicationCommandIds.zoomIn)
        )}
        aria-label={translate("statusBar.zoomIn")}
        onClick={onZoomIn}
      >
        <span
          className="statusBarZoomIcon"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: zoomInIconRaw }}
        />
      </button>
    </div>
  );
};

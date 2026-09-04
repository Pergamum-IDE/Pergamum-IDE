import type { Translate } from "../shared/i18n";
import type { SidebarMode } from "./sidebarMode";
import fileIcon from "../../assets/icons/feather/activity-bar/file.svg?raw";
import glossaryIcon from "../../assets/icons/feather/activity-bar/glossary.svg?raw";
import searchIcon from "../../assets/icons/feather/activity-bar/search.svg?raw";
import settingsIcon from "../../assets/icons/feather/activity-bar/settings.svg?raw";
import textMapIcon from "../../assets/icons/ionicons/activity-bar/map-outline.svg?raw";
import documentMetricsIcon from "../../assets/icons/ionicons/activity-bar/bar-chart-outline.svg?raw";
import bugIcon from "../../assets/icons/ionicons/activity-bar/bug-outline.svg?raw";

interface ActivityBarProps {
  activeMode: SidebarMode | null;
  isApplicationSettingsActive: boolean;
  // #377: the Debug Log entry point exists only while `--pergamum-debug`
  // mode is active. Normal startup never renders the bug icon, so these
  // default to the "no debug entry point" state when omitted.
  isDebugModeEnabled?: boolean;
  isDebugLogActive?: boolean;
  translate: Translate;
  onSelectMode: (mode: SidebarMode) => void;
  onOpenApplicationSettings: () => void;
  onOpenDebugLog?: () => void;
}

interface ActivityBarIconProps {
  label: string;
  svg: string;
}

function ActivityBarIcon({
  label,
  svg
}: ActivityBarIconProps): JSX.Element {
  return (
    <span
      className="activityBarIcon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
      title={label}
    />
  );
}

export function ActivityBar({
  activeMode,
  isApplicationSettingsActive,
  isDebugModeEnabled = false,
  isDebugLogActive = false,
  translate,
  onSelectMode,
  onOpenApplicationSettings,
  onOpenDebugLog
}: ActivityBarProps): JSX.Element {
  const filesLabel = translate("activity.files");
  const searchLabel = translate("activity.searchReplace");
  const glossaryLabel = translate("activity.glossary");
  const textMapLabel = translate("activity.textMap");
  const documentMetricsLabel = translate("activity.documentMetrics");
  const applicationSettingsLabel = translate("activity.applicationSettings");
  const debugLogLabel = translate("activity.debugLog");

  return (
    <nav className="activityBar" aria-label={translate("activity.label")}>
      <div className="activityBarPrimary">
        <button
          type="button"
          className={
            activeMode === "files"
              ? "activityBarItem isActive"
              : "activityBarItem"
          }
          aria-label={filesLabel}
          aria-pressed={activeMode === "files"}
          title={filesLabel}
          onClick={() => onSelectMode("files")}
        >
          <ActivityBarIcon label={filesLabel} svg={fileIcon} />
        </button>
        <button
          type="button"
          className={
            activeMode === "search"
              ? "activityBarItem isActive"
              : "activityBarItem"
          }
          aria-label={searchLabel}
          aria-pressed={activeMode === "search"}
          title={searchLabel}
          onClick={() => onSelectMode("search")}
        >
          <ActivityBarIcon label={searchLabel} svg={searchIcon} />
        </button>
        <button
          type="button"
          className={
            activeMode === "glossary"
              ? "activityBarItem isActive"
              : "activityBarItem"
          }
          aria-label={glossaryLabel}
          aria-pressed={activeMode === "glossary"}
          title={glossaryLabel}
          onClick={() => onSelectMode("glossary")}
        >
          <ActivityBarIcon label={glossaryLabel} svg={glossaryIcon} />
        </button>
        <button
          type="button"
          className={
            activeMode === "textMap"
              ? "activityBarItem isActive"
              : "activityBarItem"
          }
          aria-label={textMapLabel}
          aria-pressed={activeMode === "textMap"}
          title={textMapLabel}
          onClick={() => onSelectMode("textMap")}
        >
          <ActivityBarIcon label={textMapLabel} svg={textMapIcon} />
        </button>
        <button
          type="button"
          className={
            activeMode === "documentMetrics"
              ? "activityBarItem isActive"
              : "activityBarItem"
          }
          aria-label={documentMetricsLabel}
          aria-pressed={activeMode === "documentMetrics"}
          title={documentMetricsLabel}
          onClick={() => onSelectMode("documentMetrics")}
        >
          <ActivityBarIcon
            label={documentMetricsLabel}
            svg={documentMetricsIcon}
          />
        </button>
      </div>

      <div className="activityBarSecondary">
        {isDebugModeEnabled ? (
          <button
            type="button"
            className={
              isDebugLogActive
                ? "activityBarItem isActive"
                : "activityBarItem"
            }
            aria-label={debugLogLabel}
            aria-pressed={isDebugLogActive}
            title={debugLogLabel}
            onClick={() => onOpenDebugLog?.()}
          >
            <ActivityBarIcon label={debugLogLabel} svg={bugIcon} />
          </button>
        ) : null}
        <button
          type="button"
          className={
            isApplicationSettingsActive
              ? "activityBarItem isActive"
              : "activityBarItem"
          }
          aria-label={applicationSettingsLabel}
          aria-pressed={isApplicationSettingsActive}
          title={applicationSettingsLabel}
          onClick={onOpenApplicationSettings}
        >
          <ActivityBarIcon
            label={applicationSettingsLabel}
            svg={settingsIcon}
          />
        </button>
      </div>
    </nav>
  );
}

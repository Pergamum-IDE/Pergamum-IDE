import type { Translate } from "../shared/i18n";
import type { SidebarMode } from "./sidebarMode";
import fileIcon from "../../assets/icons/feather/activity-bar/file.svg?raw";
import glossaryIcon from "../../assets/icons/feather/activity-bar/glossary.svg?raw";
import searchIcon from "../../assets/icons/feather/activity-bar/search.svg?raw";
import settingsIcon from "../../assets/icons/feather/activity-bar/settings.svg?raw";
import textMapIcon from "../../assets/icons/ionicons/map/map-outline.svg?raw";

interface ActivityBarProps {
  activeMode: SidebarMode | null;
  isApplicationSettingsActive: boolean;
  translate: Translate;
  onSelectMode: (mode: SidebarMode) => void;
  onOpenApplicationSettings: () => void;
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
  translate,
  onSelectMode,
  onOpenApplicationSettings
}: ActivityBarProps): JSX.Element {
  const filesLabel = translate("activity.files");
  const searchLabel = translate("activity.searchReplace");
  const glossaryLabel = translate("activity.glossary");
  const textMapLabel = translate("activity.textMap");
  const applicationSettingsLabel = translate("activity.applicationSettings");

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
      </div>

      <div className="activityBarSecondary">
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

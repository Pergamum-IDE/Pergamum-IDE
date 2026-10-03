import type { Translate } from "../shared/i18n";
import type { SidebarMode } from "./sidebarMode";
import { USAGE_TOUR_TARGETS } from "./usageTour/usageTourTypes";
import {
  formatCommandTooltip,
  useCommandShortcutResolver
} from "./commandShortcuts";
import {
  workspaceCommandIds,
  projectSettingsCommandIds,
  searchSelectionShortcutCommandIds
} from "../shared/commandIds";
import { rendererShortcutCommandIds } from "./keybindings/rendererShortcuts";
import { debugLogCommandIds } from "./debugLogCommands";
import fileIcon from "../../assets/icons/feather/activity-bar/file.svg?raw";
import glossaryIcon from "../../assets/icons/feather/activity-bar/glossary.svg?raw";
import searchIcon from "../../assets/icons/feather/activity-bar/search.svg?raw";
import settingsIcon from "../../assets/icons/feather/activity-bar/settings.svg?raw";
import projectSettingsIcon from "../../assets/icons/svgrepo/activity-bar/scroll-svgrepo-com.svg?raw";
import documentMapIcon from "../../assets/icons/ionicons/activity-bar/map-outline.svg?raw";
import documentMetricsIcon from "../../assets/icons/ionicons/activity-bar/bar-chart-outline.svg?raw";
import bugIcon from "../../assets/icons/ionicons/activity-bar/bug-outline.svg?raw";

interface ActivityBarProps {
  activeMode: SidebarMode | null;
  isApplicationSettingsActive: boolean;
  isProjectOpen?: boolean;
  isProjectSettingsActive?: boolean;
  // #377: the Debug Log entry point exists only while `--pergamum-debug`
  // mode is active. Normal startup never renders the bug icon, so these
  // default to the "no debug entry point" state when omitted.
  isDebugModeEnabled?: boolean;
  isDebugLogActive?: boolean;
  translate: Translate;
  onSelectMode: (mode: SidebarMode) => void;
  onOpenProjectSettings?: () => void;
  onOpenApplicationSettings: () => void;
  onOpenDebugLog?: () => void;
}

interface ActivityBarIconProps {
  svg: string;
}

function ActivityBarIcon({
  svg
}: ActivityBarIconProps): JSX.Element {
  return (
    <span
      className="activityBarIcon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function ActivityBar({
  activeMode,
  isApplicationSettingsActive,
  isProjectOpen = false,
  isProjectSettingsActive = false,
  isDebugModeEnabled = false,
  isDebugLogActive = false,
  translate,
  onSelectMode,
  onOpenProjectSettings,
  onOpenApplicationSettings,
  onOpenDebugLog
}: ActivityBarProps): JSX.Element {
  const resolveShortcut = useCommandShortcutResolver();

  const filesLabel = translate("activity.files");
  const searchLabel = translate("activity.search");
  const glossaryLabel = translate("activity.glossary");
  const documentMapLabel = translate("activity.documentMap");
  const documentMetricsLabel = translate("activity.documentMetrics");
  const projectSettingsLabel = translate("activity.projectSettings");
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
          title={formatCommandTooltip(
            filesLabel,
            resolveShortcut(rendererShortcutCommandIds.toggleFiles)
          )}
          onClick={() => onSelectMode("files")}
          data-usage-tour-target={USAGE_TOUR_TARGETS.activityFiles}
        >
          <ActivityBarIcon svg={fileIcon} />
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
          title={formatCommandTooltip(
            searchLabel,
            resolveShortcut(
              searchSelectionShortcutCommandIds.openProjectSearchFromSelection
            )
          )}
          onClick={() => onSelectMode("search")}
          data-usage-tour-target={USAGE_TOUR_TARGETS.activitySearch}
        >
          <ActivityBarIcon svg={searchIcon} />
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
          title={formatCommandTooltip(
            glossaryLabel,
            resolveShortcut(rendererShortcutCommandIds.toggleGlossary)
          )}
          onClick={() => onSelectMode("glossary")}
          data-usage-tour-target={USAGE_TOUR_TARGETS.activityGlossary}
        >
          <ActivityBarIcon svg={glossaryIcon} />
        </button>
        <button
          type="button"
          className={
            activeMode === "documentMap"
              ? "activityBarItem isActive"
              : "activityBarItem"
          }
          aria-label={documentMapLabel}
          aria-pressed={activeMode === "documentMap"}
          title={formatCommandTooltip(
            documentMapLabel,
            resolveShortcut(rendererShortcutCommandIds.toggleDocumentMap)
          )}
          onClick={() => onSelectMode("documentMap")}
          data-usage-tour-target={USAGE_TOUR_TARGETS.activityDocumentMap}
        >
          <ActivityBarIcon svg={documentMapIcon} />
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
          title={formatCommandTooltip(
            documentMetricsLabel,
            resolveShortcut(rendererShortcutCommandIds.toggleDocumentMetrics)
          )}
          onClick={() => onSelectMode("documentMetrics")}
          data-usage-tour-target={USAGE_TOUR_TARGETS.activityDocumentMetrics}
        >
          <ActivityBarIcon svg={documentMetricsIcon} />
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
            title={formatCommandTooltip(
              debugLogLabel,
              resolveShortcut(debugLogCommandIds.open)
            )}
            onClick={() => onOpenDebugLog?.()}
          >
            <ActivityBarIcon svg={bugIcon} />
          </button>
        ) : null}
        {isProjectOpen ? (
          <button
            type="button"
            className={
              isProjectSettingsActive
                ? "activityBarItem isActive"
                : "activityBarItem"
            }
            aria-label={projectSettingsLabel}
            aria-pressed={isProjectSettingsActive}
            title={formatCommandTooltip(
              projectSettingsLabel,
              resolveShortcut(projectSettingsCommandIds.open)
            )}
            onClick={() => onOpenProjectSettings?.()}
          >
            <ActivityBarIcon svg={projectSettingsIcon} />
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
          title={formatCommandTooltip(
            applicationSettingsLabel,
            resolveShortcut(workspaceCommandIds.openApplicationSettings)
          )}
          onClick={onOpenApplicationSettings}
        >
          <ActivityBarIcon svg={settingsIcon} />
        </button>
      </div>
    </nav>
  );
}

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ProjectAccessMode } from "../shared/api";
import type { Translate } from "../shared/i18n";
import {
  editorIdEquals,
  type EditorId
} from "../shared/editorId";
import type { DocumentTab } from "./openDocuments";
import {
  documentTabTrailingSlotKind,
  handleDocumentTabCloseButtonClick,
  handleDocumentTabMiddleClick
} from "./documentTabHandlers";
import { DocumentTabDirtyIndicator } from "./DocumentTabDirtyIndicator";
import {
  documentWorkspaceTabId,
  specialWorkspaceTabId,
  workspaceTabIdEquals,
  workspaceTabKey,
  workspaceTabs,
  type SpecialTabId,
  type SpecialWorkspaceTab,
  type WorkspaceTab,
  type WorkspaceTabId
} from "./workspaceTabs";
import alertTriangleIcon from "../../assets/icons/feather/global/alert-triangle.svg?raw";
import closeXIcon from "../../assets/icons/feather/global/close-x.svg?raw";
import shieldIcon from "../../assets/icons/feather/global/shield.svg?raw";

interface DocumentTabBarProps {
  tabs: DocumentTab[];
  /**
   * The active document tab, or `null` in the #262 zero-tab state (only a
   * special tab such as Application Settings is open). Always passed by the
   * caller; used solely to derive `activeWorkspaceTabId` when it is not passed
   * explicitly.
   */
  activeDocumentId: EditorId | null;
  projectAccessMode?: ProjectAccessMode | null;
  activeWorkspaceTabId?: WorkspaceTabId;
  specialTabs?: SpecialWorkspaceTab[];
  translate: Translate;
  onSelectDocument: (documentId: EditorId) => void;
  onCloseDocument: (documentId: EditorId) => void;
  onSelectSpecialTab?: (tabId: SpecialTabId) => void;
  onCloseSpecialTab?: (tabId: SpecialTabId) => void;
  isUtilityWindowOpen: boolean;
  onToggleUtilityWindow: () => void;
}

export function DocumentTabBar({
  tabs,
  activeDocumentId,
  projectAccessMode = null,
  activeWorkspaceTabId = activeDocumentId
    ? documentWorkspaceTabId(activeDocumentId)
    : undefined,
  specialTabs = [],
  translate,
  onSelectDocument,
  onCloseDocument,
  onSelectSpecialTab = () => undefined,
  onCloseSpecialTab = () => undefined,
  isUtilityWindowOpen,
  onToggleUtilityWindow
}: DocumentTabBarProps): JSX.Element {
  function isWorkspaceTabActive(tabId: WorkspaceTabId): boolean {
    return (
      activeWorkspaceTabId !== undefined &&
      workspaceTabIdEquals(activeWorkspaceTabId, tabId)
    );
  }

  const utilityWindowLabel = translate("utilityWindow.label");
  const closeTabLabel = translate("tabs.closeTab");
  const unsavedLabel = translate("tabs.unsaved");
  const readOnlyTooltip = translate("projectAccess.readOnly.tooltip");
  const [hoveredDocumentId, setHoveredDocumentId] = useState<EditorId | null>(
    null
  );

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
    documentId: EditorId
  ): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectDocument(documentId);
  }

  function handleSpecialTabKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
    tabId: SpecialTabId
  ): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectSpecialTab(tabId);
  }

  function handleSpecialTabMiddleClick(
    event: {
      button: number;
      preventDefault: () => void;
      stopPropagation: () => void;
    },
    tabId: SpecialTabId
  ): boolean {
    if (event.button !== 1) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    onCloseSpecialTab(tabId);
    return true;
  }

  function handleSpecialTabCloseButtonClick(
    event: { preventDefault: () => void; stopPropagation: () => void },
    tabId: SpecialTabId
  ): void {
    event.preventDefault();
    event.stopPropagation();
    onCloseSpecialTab(tabId);
  }

  function renderDocumentTab(tab: DocumentTab): JSX.Element {
    const tabId = documentWorkspaceTabId(tab.id);
    const isActive = isWorkspaceTabActive(tabId);
    const isHovered =
      hoveredDocumentId !== null &&
      editorIdEquals(tab.id, hoveredDocumentId);
    const trailingSlotKind = documentTabTrailingSlotKind(
      isActive,
      tab.isDirty,
      isHovered
    );
    const externalWarning = tab.isExternalMarkdownFile
      ? translate("tabs.externalMarkdownFile")
      : null;
    // Nested-element tooltip behavior varies by browser, so the
    // external warning is exposed both on the icon itself and on the
    // tab's own title/accessible name — not only on the icon. The
    // dirty indicator's own tooltip is unreliable to hover to (the
    // close button replaces it on hover — #184 follow-up), so the
    // unsaved state is folded into this same title/accessible name
    // instead, after the external warning when both apply.
    const tabTitleParts = [tab.title];

    if (externalWarning) {
      tabTitleParts.push(externalWarning);
    }

    if (tab.isDirty) {
      tabTitleParts.push(unsavedLabel);
    }

    const tabTitle = tabTitleParts.join(" — ");

    return (
      <div
        key={workspaceTabKey(tabId)}
        className={isActive ? "documentTab isActive" : "documentTab"}
        role="tab"
        tabIndex={0}
        aria-selected={isActive}
        title={tabTitle}
        onClick={() => onSelectDocument(tab.id)}
        onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
        onMouseDown={(event) => {
          handleDocumentTabMiddleClick(event, tab.id, onCloseDocument);
        }}
        onMouseEnter={() => setHoveredDocumentId(tab.id)}
        onMouseLeave={() =>
          setHoveredDocumentId((current) =>
            current && editorIdEquals(current, tab.id) ? null : current
          )
        }
      >
        {externalWarning ? (
          <span
            className="documentTabExternalIcon"
            role="img"
            aria-label={externalWarning}
            title={externalWarning}
            dangerouslySetInnerHTML={{ __html: alertTriangleIcon }}
          />
        ) : null}
        <span className="documentTabTitle">{tab.title}</span>
        <span className="documentTabTrailing">
          {trailingSlotKind === "close" ? (
            <button
              type="button"
              className="documentTabCloseButton"
              aria-label={closeTabLabel}
              title={closeTabLabel}
              onClick={(event) =>
                handleDocumentTabCloseButtonClick(
                  event,
                  tab.id,
                  onCloseDocument
                )
              }
              dangerouslySetInnerHTML={{ __html: closeXIcon }}
            />
          ) : trailingSlotKind === "dirty" ? (
            <DocumentTabDirtyIndicator tooltip={unsavedLabel} />
          ) : null}
        </span>
      </div>
    );
  }

  function renderSpecialTab(tab: SpecialWorkspaceTab): JSX.Element {
    const tabId = specialWorkspaceTabId(tab.id);
    const isActive = isWorkspaceTabActive(tabId);

    return (
      <div
        key={workspaceTabKey(tabId)}
        className={isActive ? "documentTab isActive" : "documentTab"}
        role="tab"
        tabIndex={0}
        aria-selected={isActive}
        title={tab.title}
        onClick={() => onSelectSpecialTab(tab.id)}
        onKeyDown={(event) => handleSpecialTabKeyDown(event, tab.id)}
        onMouseDown={(event) => {
          handleSpecialTabMiddleClick(event, tab.id);
        }}
      >
        <span className="documentTabTitle">{tab.title}</span>
        <span className="documentTabTrailing">
          <button
            type="button"
            className="documentTabCloseButton"
            aria-label={closeTabLabel}
            title={closeTabLabel}
            onClick={(event) =>
              handleSpecialTabCloseButtonClick(event, tab.id)
            }
            dangerouslySetInnerHTML={{ __html: closeXIcon }}
          />
        </span>
      </div>
    );
  }

  function renderWorkspaceTab(tab: WorkspaceTab): JSX.Element {
    return tab.kind === "document"
      ? renderDocumentTab(tab)
      : renderSpecialTab(tab);
  }

  return (
    <div className="documentTabBar">
      {projectAccessMode?.kind === "readOnly" ? (
        <span
          className="projectAccessModeIndicator projectAccessModeIndicator-readOnly"
          role="img"
          aria-label={readOnlyTooltip}
          title={readOnlyTooltip}
          dangerouslySetInnerHTML={{ __html: shieldIcon }}
        />
      ) : null}
      <nav
        className="documentTabBarTabs"
        aria-label={translate("tabs.openDocuments")}
        role="tablist"
      >
        {workspaceTabs(tabs, specialTabs).map(renderWorkspaceTab)}
      </nav>

      <button
        type="button"
        className={
          isUtilityWindowOpen
            ? "documentTabBarUtilityToggle isActive"
            : "documentTabBarUtilityToggle"
        }
        aria-pressed={isUtilityWindowOpen}
        aria-label={utilityWindowLabel}
        title={utilityWindowLabel}
        onClick={onToggleUtilityWindow}
      >
        {utilityWindowLabel}
      </button>
    </div>
  );
}

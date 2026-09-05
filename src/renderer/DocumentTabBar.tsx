import {
  Fragment,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { ProjectAccessMode } from "../shared/api";
import type { Translate } from "../shared/i18n";
import { editorIdEquals, type EditorId } from "../shared/editorId";
import type { DocumentTab } from "./openDocuments";
import {
  resolveTabReorderTargetIndex,
  type TabContextMenuAction,
  type TabContextMenuDescriptor
} from "./documentTabContextMenu";
import {
  documentTabTrailingSlotKind,
  handleDocumentTabCloseButtonClick,
  handleDocumentTabMiddleClick
} from "./documentTabHandlers";
import {
  documentWorkspaceTabId,
  orderedWorkspaceTabs,
  specialWorkspaceTabId,
  workspaceTabIdEquals,
  workspaceTabKey,
  type SpecialTabId,
  type SpecialWorkspaceTab,
  type WorkspaceTab,
  type WorkspaceTabId
} from "./workspaceTabs";
import alertTriangleIcon from "../../assets/icons/feather/global/alert-triangle.svg?raw";
import closeXIcon from "../../assets/icons/feather/global/close-x.svg?raw";
import shieldIcon from "../../assets/icons/feather/global/shield.svg?raw";

/**
 * #354: the editor tab context menu opens on a right-click of a DOCUMENT tab
 * (never a special tab). Every command is dispatched via `onTabAction`
 * against the right-clicked tab. The menu contents / enablement come from the
 * host through `describeTabContextMenu` (pure, in `documentTabContextMenu.ts`).
 */
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
  /**
   * #398: the full mixed document/special workspace tab order, freely
   * interleaved. Omit (or pass `[]`) for the plain "every document tab,
   * then every special tab" order `workspaceTabs()` produces.
   */
  order?: readonly WorkspaceTabId[];
  translate: Translate;
  onSelectDocument: (documentId: EditorId) => void;
  onCloseDocument: (documentId: EditorId) => void;
  onSelectSpecialTab?: (tabId: SpecialTabId) => void;
  onCloseSpecialTab?: (tabId: SpecialTabId) => void;
  /**
   * #354: run a tab context-menu command against the right-clicked tab. When
   * omitted (together with `describeTabContextMenu`) no context menu opens.
   */
  onTabAction?: (action: TabContextMenuAction, tab: DocumentTab) => void;
  /** #354: the menu contents / enablement for the right-clicked tab. */
  describeTabContextMenu?: (tab: DocumentTab) => TabContextMenuDescriptor;
  /**
   * #398: a horizontal drag-and-drop reorder finished — move the workspace
   * tab `movedTabId` (document OR special) to `targetIndex` in the
   * currently-rendered tab sequence. Generalizes #354's document-only
   * `onReorderDocuments`: every tab kind shares this one reorder path, never
   * a separate one per special tab kind. When omitted, tabs are not
   * draggable.
   */
  onReorderWorkspaceTabs?: (
    movedTabId: WorkspaceTabId,
    targetIndex: number
  ) => void;
  isUtilityWindowOpen: boolean;
  onToggleUtilityWindow: () => void;
}

/** #354: dedicated MIME marker so a tab reorder drag is never confused with a
 *  File Explorer Move drag (which uses its own marker). */
export const TAB_REORDER_DND_MIME = "application/x-pergamum-tab-reorder";

const CONTEXT_COMMAND_ATTR: Record<TabContextMenuAction, string> = {
  close: "close",
  closeOthers: "close-others",
  closeToLeft: "close-left",
  closeToRight: "close-right",
  selectInFileExplorer: "select-in-file-explorer",
  renameFile: "rename-file",
  saveAs: "save-as",
  copyAbsolutePath: "copy-absolute-path",
  copyRelativePath: "copy-relative-path",
  copyFileName: "copy-file-name"
};

function dataTransferHasTabReorderPayload(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes(TAB_REORDER_DND_MIME);
}

interface TabDragState {
  readonly movedTabId: WorkspaceTabId;
  readonly movedIndex: number;
  /** insertion index the drop indicator is drawn at, or `null`. */
  readonly overIndex: number | null;
}

export function DocumentTabBar({
  tabs,
  activeDocumentId,
  projectAccessMode = null,
  activeWorkspaceTabId = activeDocumentId
    ? documentWorkspaceTabId(activeDocumentId)
    : undefined,
  specialTabs = [],
  order = [],
  translate,
  onSelectDocument,
  onCloseDocument,
  onSelectSpecialTab = () => undefined,
  onCloseSpecialTab = () => undefined,
  onTabAction,
  describeTabContextMenu,
  onReorderWorkspaceTabs,
  isUtilityWindowOpen,
  onToggleUtilityWindow
}: DocumentTabBarProps): JSX.Element {
  const contextMenuEnabled = Boolean(onTabAction && describeTabContextMenu);
  const reorderEnabled = Boolean(onReorderWorkspaceTabs);
  // #398: the single rendered tab sequence — document and special tabs
  // freely interleaved per `order` (falls back to `workspaceTabs()`'s plain
  // "documents, then specials" order when `order` is empty/omitted).
  const orderedTabs = orderedWorkspaceTabs(tabs, specialTabs, order);

  const [tabContextMenu, setTabContextMenu] = useState<{
    tab: DocumentTab;
    x: number;
    y: number;
  } | null>(null);
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  const tabsNavRef = useRef<HTMLElement | null>(null);
  const [tabDrag, setTabDrag] = useState<TabDragState | null>(null);

  const [hoveredDocumentId, setHoveredDocumentId] = useState<EditorId | null>(
    null
  );

  function closeTabContextMenu(): void {
    setTabContextMenu(null);
    const opener = menuOpenerRef.current;
    menuOpenerRef.current = null;
    if (
      opener &&
      typeof document !== "undefined" &&
      document.contains(opener) &&
      typeof opener.focus === "function"
    ) {
      opener.focus();
    }
  }

  function handleDocumentTabContextMenu(
    event: ReactMouseEvent<HTMLDivElement>,
    tab: DocumentTab
  ): void {
    if (!contextMenuEnabled) {
      return;
    }
    event.preventDefault();
    menuOpenerRef.current = event.currentTarget;
    setTabContextMenu({ tab, x: event.clientX, y: event.clientY });
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeTabContextMenu();
    }
  }

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

  // --- #398 horizontal drag-and-drop reorder (generalized from #354's
  // document-only reorder to every workspace tab, document or special) -----

  function workspaceTabRects(): { left: number; right: number }[] {
    const nav = tabsNavRef.current;
    if (!nav) {
      return [];
    }
    return Array.from(
      nav.querySelectorAll<HTMLElement>('[data-workspace-tab="true"]')
    ).map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
  }

  function handleTabDragStart(
    event: ReactDragEvent<HTMLDivElement>,
    tabId: WorkspaceTabId,
    index: number
  ): void {
    if (!reorderEnabled) {
      return;
    }
    // The close button is not a drag handle — shared by document and
    // special tabs alike.
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(".documentTabCloseButton")
    ) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(TAB_REORDER_DND_MIME, workspaceTabKey(tabId));
    event.dataTransfer.effectAllowed = "move";
    setTabDrag({ movedTabId: tabId, movedIndex: index, overIndex: index });
  }

  function handleTabDragOver(event: ReactDragEvent<HTMLDivElement>): void {
    if (!tabDrag || !dataTransferHasTabReorderPayload(event.dataTransfer)) {
      // Not a tab reorder (e.g. a File Explorer Move drag) — ignore it, so the
      // two drag systems never interfere.
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const overIndex = resolveTabReorderTargetIndex(
      event.clientX,
      workspaceTabRects(),
      tabDrag.movedIndex
    );
    if (overIndex !== tabDrag.overIndex) {
      setTabDrag({ ...tabDrag, overIndex });
    }
  }

  function handleTabDrop(event: ReactDragEvent<HTMLDivElement>): void {
    if (!tabDrag || !dataTransferHasTabReorderPayload(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    // A drop on a tab must not also bubble to the <nav> handler below.
    event.stopPropagation();

    const targetIndex = resolveTabReorderTargetIndex(
      event.clientX,
      workspaceTabRects(),
      tabDrag.movedIndex
    );
    const movedTabId = tabDrag.movedTabId;
    const movedIndex = tabDrag.movedIndex;
    setTabDrag(null);

    if (targetIndex !== movedIndex) {
      onReorderWorkspaceTabs?.(movedTabId, targetIndex);
    }
  }

  function handleTabDragEnd(): void {
    // Fires on every drag end, including a drop outside a valid target —
    // clears the transient state without reordering (drop-outside = cancel).
    setTabDrag(null);
  }

  function dropIndicatorFor(
    index: number,
    tabCount: number
  ): "before" | "after" | undefined {
    if (tabDrag?.overIndex == null) {
      return undefined;
    }
    if (tabDrag.overIndex === index) {
      return "before";
    }
    if (index === tabCount - 1 && tabDrag.overIndex >= tabCount) {
      return "after";
    }
    return undefined;
  }

  function dropIndicatorForTab(
    index: number
  ): "before" | "after" | undefined {
    return dropIndicatorFor(index, orderedTabs.length);
  }

  function renderDocumentTab(tab: DocumentTab, index: number): JSX.Element {
    const tabId = documentWorkspaceTabId(tab.id);
    const isActive = isWorkspaceTabActive(tabId);
    const isHovered =
      hoveredDocumentId !== null && editorIdEquals(tab.id, hoveredDocumentId);
    const trailingSlotKind = documentTabTrailingSlotKind(isActive, isHovered);
    const externalWarning = tab.isExternalMarkdownFile
      ? translate("tabs.externalMarkdownFile")
      : null;
    const isDragging =
      tabDrag !== null && workspaceTabIdEquals(tabDrag.movedTabId, tabId);
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
        data-document-tab="true"
        data-workspace-tab="true"
        data-tab-index={index}
        data-tab-dragging={isDragging ? "true" : undefined}
        data-tab-drop-indicator={dropIndicatorForTab(index)}
        draggable={reorderEnabled || undefined}
        onClick={() => onSelectDocument(tab.id)}
        onContextMenu={(event) => handleDocumentTabContextMenu(event, tab)}
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
        onDragStart={(event) => handleTabDragStart(event, tabId, index)}
        onDragOver={handleTabDragOver}
        onDrop={handleTabDrop}
        onDragEnd={handleTabDragEnd}
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
              draggable={false}
              onClick={(event) =>
                handleDocumentTabCloseButtonClick(
                  event,
                  tab.id,
                  onCloseDocument
                )
              }
              dangerouslySetInnerHTML={{ __html: closeXIcon }}
            />
          ) : null}
        </span>
      </div>
    );
  }

  function renderSpecialTab(tab: SpecialWorkspaceTab, index: number): JSX.Element {
    const tabId = specialWorkspaceTabId(tab.id);
    const isActive = isWorkspaceTabActive(tabId);
    const isDragging =
      tabDrag !== null && workspaceTabIdEquals(tabDrag.movedTabId, tabId);

    return (
      <div
        key={workspaceTabKey(tabId)}
        className={isActive ? "documentTab isActive" : "documentTab"}
        role="tab"
        tabIndex={0}
        aria-selected={isActive}
        title={tab.title}
        data-workspace-tab="true"
        data-tab-index={index}
        data-tab-dragging={isDragging ? "true" : undefined}
        data-tab-drop-indicator={dropIndicatorForTab(index)}
        draggable={reorderEnabled || undefined}
        onClick={() => onSelectSpecialTab(tab.id)}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => handleSpecialTabKeyDown(event, tab.id)}
        onMouseDown={(event) => {
          handleSpecialTabMiddleClick(event, tab.id);
        }}
        onDragStart={(event) => handleTabDragStart(event, tabId, index)}
        onDragOver={handleTabDragOver}
        onDrop={handleTabDrop}
        onDragEnd={handleTabDragEnd}
      >
        <span className="documentTabTitle">{tab.title}</span>
        <span className="documentTabTrailing">
          <button
            type="button"
            className="documentTabCloseButton"
            aria-label={closeTabLabel}
            title={closeTabLabel}
            draggable={false}
            onClick={(event) =>
              handleSpecialTabCloseButtonClick(event, tab.id)
            }
            dangerouslySetInnerHTML={{ __html: closeXIcon }}
          />
        </span>
      </div>
    );
  }

  // #398: resolves a rendered "document" workspace tab back to the exact
  // `DocumentTab` object from the `tabs` prop (by stable EditorId, not by
  // position) — `orderedWorkspaceTabs()` returns `{ ...tab, kind: "document" }`
  // shallow copies, and `onTabAction` / `describeTabContextMenu` are
  // documented to receive exactly the caller's own object.
  function resolveDocumentTab(tab: DocumentTab): DocumentTab {
    return tabs.find((candidate) => editorIdEquals(candidate.id, tab.id)) ?? tab;
  }

  function renderWorkspaceTab(tab: WorkspaceTab, index: number): JSX.Element {
    if (tab.kind === "document") {
      return renderDocumentTab(resolveDocumentTab(tab), index);
    }
    return renderSpecialTab(tab, index);
  }

  const menuDescriptor: TabContextMenuDescriptor | null =
    tabContextMenu !== null && describeTabContextMenu
      ? describeTabContextMenu(tabContextMenu.tab)
      : null;

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
        ref={tabsNavRef}
        className="documentTabBarTabs"
        aria-label={translate("tabs.openDocuments")}
        role="tablist"
        onDragOver={reorderEnabled ? handleTabDragOver : undefined}
        onDrop={reorderEnabled ? handleTabDrop : undefined}
      >
        {orderedTabs.map(renderWorkspaceTab)}
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

      {tabContextMenu !== null && menuDescriptor !== null ? (
        <div
          className="documentTabContextMenuBackdrop"
          onClick={closeTabContextMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeTabContextMenu();
          }}
        >
          <div
            className="documentTabContextMenu"
            role="menu"
            aria-label={translate("tabs.contextMenu.label")}
            style={
              {
                "--document-tab-context-menu-x": `${tabContextMenu.x}px`,
                "--document-tab-context-menu-y": `${tabContextMenu.y}px`
              } as CSSProperties
            }
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
          >
            {menuDescriptor.items.map((item, itemIndex) => {
              const menuTab = tabContextMenu.tab;
              return (
                <Fragment key={item.id}>
                  {item.separatorBefore ? (
                    <div
                      role="separator"
                      className="documentTabContextMenuSeparator"
                    />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="documentTabContextMenuItem"
                    data-document-tab-context-command={
                      CONTEXT_COMMAND_ATTR[item.id]
                    }
                    disabled={!item.enabled}
                    aria-disabled={!item.enabled}
                    autoFocus={itemIndex === 0}
                    title={
                      item.enabled || !item.disabledReasonKey
                        ? undefined
                        : translate(item.disabledReasonKey)
                    }
                    onClick={() => {
                      closeTabContextMenu();
                      if (item.enabled) {
                        onTabAction?.(item.id, menuTab);
                      }
                    }}
                  >
                    {translate(item.labelKey)}
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

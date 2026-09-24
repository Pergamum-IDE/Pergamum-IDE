import { useCallback, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import chevronsDownIcon from "../../assets/icons/feather/glossary/chevrons-down.svg?raw";
import chevronsRightIcon from "../../assets/icons/feather/glossary/chevrons-right.svg?raw";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import {
  GlossaryEntryMetadataFields,
  glossaryEntryMetadataDraftHandlers
} from "./GlossaryEntryMetadataFields";
import {
  glossaryEntryDraftValidity,
  representativeGlossaryAtomDraft,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";
import { useVerticalDrag } from "./useVerticalDrag";

interface GlossaryDescriptionMetadataPanelProps {
  draft: GlossaryEntryDraft;
  /** Every tag defined in the project, for the attach/detach picker. */
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  readOnly: boolean;
  expanded: boolean;
  expandedHeight?: number | null;
  onToggleExpanded: () => void;
  onExpandedHeightChange?: (height: number) => void;
  /** Apply one draft mutation to the tab's OWN `GlossaryEntryDraft`. */
  onUpdateDraft: (
    update: (draft: GlossaryEntryDraft) => GlossaryEntryDraft
  ) => void;
  onOpenTagManager: () => void;
}

const MIN_PANEL_HEIGHT = 80;
const MIN_EDITOR_RESERVE_HEIGHT = 120;

/**
 * #573 Slice 5 / #574: the glossary Description tab's collapsible metadata area
 * (表記 / 検索設定 / タグ), shown above the Description editor + preview.
 * It edits the tab's own draft, so dirty / Ctrl+S / close confirm apply to
 * metadata edits. When expanded, its height can be adjusted via pointer drag
 * or keyboard without marking the draft dirty.
 */
export function GlossaryDescriptionMetadataPanel({
  draft,
  availableTags,
  translate,
  readOnly,
  expanded,
  expandedHeight = null,
  onToggleExpanded,
  onExpandedHeightChange,
  onUpdateDraft,
  onOpenTagManager
}: GlossaryDescriptionMetadataPanelProps): JSX.Element {
  const bodyId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const startHeightRef = useRef<number>(0);
  const validity = glossaryEntryDraftValidity(draft);
  const representative = representativeGlossaryAtomDraft(draft)?.value.trim();
  const tagLabels = draft.tagIds
    .map((tagId) => availableTags.find((tag) => tag.id === tagId)?.label)
    .filter((label): label is string => label !== undefined);

  const getClampedHeight = useCallback(
    (targetHeight: number): number => {
      const containerHeight =
        panelRef.current?.parentElement?.getBoundingClientRect().height ||
        window.innerHeight ||
        800;
      const maxHeight = Math.max(
        MIN_PANEL_HEIGHT,
        containerHeight - MIN_EDITOR_RESERVE_HEIGHT
      );
      return Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight, targetHeight));
    },
    []
  );

  const verticalDrag = useVerticalDrag({
    onDragStart: () => {
      startHeightRef.current =
        panelRef.current?.getBoundingClientRect().height || 160;
    },
    onDragMove: (deltaY) => {
      if (onExpandedHeightChange) {
        onExpandedHeightChange(getClampedHeight(startHeightRef.current + deltaY));
      }
    }
  });

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!onExpandedHeightChange) {
      return;
    }
    const currentHeight =
      expandedHeight ?? (panelRef.current?.getBoundingClientRect().height || 160);
    const step = event.shiftKey ? 30 : 10;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      onExpandedHeightChange(getClampedHeight(currentHeight - step));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onExpandedHeightChange(getClampedHeight(currentHeight + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onExpandedHeightChange(MIN_PANEL_HEIGHT);
    } else if (event.key === "End") {
      event.preventDefault();
      const containerHeight =
        panelRef.current?.parentElement?.getBoundingClientRect().height ??
        window.innerHeight;
      onExpandedHeightChange(
        Math.max(MIN_PANEL_HEIGHT, containerHeight - MIN_EDITOR_RESERVE_HEIGHT)
      );
    }
  };

  return (
    <section
      ref={panelRef}
      className="glossaryDescriptionMetadataPanel"
      data-expanded={expanded}
      aria-label={translate("glossaryDescriptionTab.metadata.heading")}
      style={
        expanded && expandedHeight != null
          ? { height: `${expandedHeight}px`, maxBlockSize: "none" }
          : undefined
      }
    >
      <div className="glossaryDescriptionMetadataHeader">
        <button
          type="button"
          className="glossaryDescriptionMetadataToggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggleExpanded}
        >
          <span
            className="glossaryDescriptionMetadataToggleIcon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: expanded ? chevronsDownIcon : chevronsRightIcon
            }}
          />
          <span className="glossaryDescriptionMetadataHeading">
            {translate("glossaryDescriptionTab.metadata.heading")}
          </span>
        </button>
        {!expanded ? (
          <span className="glossaryDescriptionMetadataSummary">
            <span>
              {translate("glossaryDescriptionTab.metadata.summary.representative", {
                value: representative || "—"
              })}
            </span>
            <span>
              {translate("glossaryDescriptionTab.metadata.summary.atomCount", {
                count: draft.atoms.length
              })}
            </span>
            <span>
              {tagLabels.length > 0
                ? translate("glossaryDescriptionTab.metadata.summary.tags", {
                    tags: tagLabels.join(", ")
                  })
                : translate("glossaryDescriptionTab.metadata.summary.noTags")}
            </span>
          </span>
        ) : null}
        {!expanded && !validity.ok ? (
          <span
            className="glossaryDescriptionMetadataSummaryInvalid"
            role="alert"
          >
            {translate(
              validity.reason === "noAtoms"
                ? "glossaryEditor.validity.noAtoms"
                : "glossaryEditor.validity.duplicateAtomValue"
            )}
          </span>
        ) : null}
      </div>
      <div
        id={bodyId}
        className="glossaryDescriptionMetadataBody"
        hidden={!expanded}
      >
        <GlossaryEntryMetadataFields
          draft={draft}
          availableTags={availableTags}
          translate={translate}
          readOnly={readOnly}
          onOpenTagManager={onOpenTagManager}
          {...glossaryEntryMetadataDraftHandlers(onUpdateDraft)}
        />
      </div>
      {expanded ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={translate("glossaryDescriptionTab.metadataResizeHandle")}
          tabIndex={0}
          className="glossaryDescriptionMetadataResizeHandle"
          onKeyDown={handleResizeKeyDown}
          onPointerDown={verticalDrag.onPointerDown}
          onPointerMove={verticalDrag.onPointerMove}
          onPointerUp={verticalDrag.onPointerUp}
          onPointerCancel={verticalDrag.onPointerCancel}
        />
      ) : null}
    </section>
  );
}

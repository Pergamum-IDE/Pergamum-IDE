import { useEffect, useId, useState, type DragEvent as ReactDragEvent } from "react";
import type {
  FontFamilySetting,
  FontSlot
} from "../../shared/fontSettings";
import {
  buildFontFamilyCss,
  FONT_SLOT_GENERIC_FALLBACKS,
  GENERIC_FONT_FAMILIES
} from "../../shared/fontSettings";
import type { CachedFontFamily, FontCacheState } from "../../shared/fontCache";
import {
  insertSelectedFont,
  moveSelectedFont,
  removeSelectedFontAt
} from "../../shared/fontPickerDnd";
import type { Translate } from "../../shared/i18n";
import { InfoDialog } from "./InfoDialog";
import gripperIconRaw from "../../../assets/icons/codicons/dialog/gripper.svg?raw";

export interface FontPickerDialogProps {
  readonly isOpen: boolean;
  readonly slot: FontSlot;
  readonly initialValue?: readonly FontFamilySetting[];
  readonly translate: Translate;
  readonly opener?: Element | null;
  readonly onSave: (selectedFonts: FontFamilySetting[]) => void;
  readonly onClose: () => void;
}

/**
 * Preview-only mode for the sample text area. `selectedList` renders with the
 * full draft selected-font CSS fallback chain; `singleFamily` is a click-to-
 * preview override for a single row (selected or available) that never
 * mutates the draft list or settings. See #493.
 */
type SamplePreviewMode =
  | { kind: "selectedList" }
  | { kind: "singleFamily"; family: FontFamilySetting };

/**
 * #494: the row currently armed/dragging. Carries its own payload rather
 * than relying on `DataTransfer.getData()` round-tripping — this dialog only
 * ever drags within itself (cross-dialog drag is out of scope), so plain
 * React state is simpler and works uniformly across browsers/test
 * environments that don't fully implement `DataTransfer`.
 */
type DragSource =
  | { kind: "selected"; index: number }
  | { kind: "available"; family: CachedFontFamily };

type DragOverTarget =
  | { pane: "selected"; index: number }
  | { pane: "available" };

const MINI_SAMPLE_TEXT = "Aa あア亜 123";

function selectedRowKey(idx: number): string {
  return `selected-${idx}`;
}

function availableRowKey(family: string): string {
  return `available-${family}`;
}

/**
 * #496 remediation: the identity line shown on every font row. `family` is
 * always the raw CSS-facing name; `displayName` (when present and
 * different from `family`) is the localized name resolved at scan time
 * (#496). Different families can legitimately resolve to the same
 * localized `displayName` (e.g. "Yu Gothic" and "Yu Gothic UI" both ->
 * "游ゴシック") — always leading with `family` keeps those rows
 * distinguishable. This line never carries a represented-font style; only
 * the mini sample line below it does (see #493's symbol-font-identity fix).
 */
function formatRowIdentity(family: string, displayName?: string): string {
  const trimmedDisplayName = displayName?.trim();
  if (!trimmedDisplayName || trimmedDisplayName === family) {
    return family;
  }
  return `${family} / ${trimmedDisplayName}`;
}

export function FontPickerDialog({
  isOpen,
  slot,
  initialValue = [],
  translate,
  opener,
  onSave,
  onClose
}: FontPickerDialogProps): JSX.Element | null {
  const [selectedFonts, setSelectedFonts] = useState<FontFamilySetting[]>(
    () => [...initialValue]
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [highlightedAvailableFamily, setHighlightedAvailableFamily] =
    useState<CachedFontFamily | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [cacheState, setCacheState] = useState<FontCacheState>({
    status: "notScanned"
  });
  const [previewMode, setPreviewMode] = useState<SamplePreviewMode>({
    kind: "selectedList"
  });
  const [sampleText, setSampleText] = useState<string>("");

  // #494 drag-and-drop draft state — dialog-local only, discarded on close.
  const [armedRowKey, setArmedRowKey] = useState<string | null>(null);
  const [draggingSource, setDraggingSource] = useState<DragSource | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DragOverTarget | null>(null);

  const dialogId = useId();
  const searchInputId = `${dialogId}-search`;
  const sampleInputId = `${dialogId}-sample`;

  useEffect(() => {
    if (isOpen) {
      setSelectedFonts([...initialValue]);
      setSelectedIndex(null);
      setHighlightedAvailableFamily(null);
      setSearchQuery("");
      setPreviewMode({ kind: "selectedList" });
      setSampleText(translate("fontPicker.sampleText"));
      setArmedRowKey(null);
      setDraggingSource(null);
      setDragOverTarget(null);

      const fontCacheApi = window.pergamum?.fontCache;
      if (fontCacheApi?.load) {
        fontCacheApi
          .load()
          .then((state) => {
            if (state) {
              setCacheState(state);
            }
          })
          .catch((err) => {
            setCacheState({
              status: "error",
              message:
                err instanceof Error ? err.message : translate("fontCache.status.error")
            });
          });
      }
    }
  }, [isOpen, initialValue, translate]);

  if (!isOpen) {
    return null;
  }

  const getTitle = (): string => {
    switch (slot) {
      case "workbench.uiFontFamilyList":
        return translate("fontPicker.title.workbench");
      case "editor.fontFamilyList":
        return translate("fontPicker.title.editor");
      case "preview.fontFamilyList":
        return translate("fontPicker.title.preview");
    }
  };

  const handleSelectedRowClick = (font: FontFamilySetting, idx: number): void => {
    setSelectedIndex(idx);
    setPreviewMode({ kind: "singleFamily", family: font });
  };

  const handleAvailableRowClick = (candidate: CachedFontFamily): void => {
    setHighlightedAvailableFamily(candidate);
    setPreviewMode({
      kind: "singleFamily",
      family: { family: candidate.family, displayName: candidate.displayName }
    });
  };

  // #494/#494-remediation drag-and-drop wiring. This dialog is now
  // D&D-only for list manipulation (no Add/Remove/Up/Down buttons): drag
  // only ever starts from a row's gripper handle, which arms `armedRowKey`
  // on mousedown, and the row's own `draggable` attribute is only ever true
  // while it is the armed row — so a native drag gesture starting anywhere
  // else on the row (or on the search input or sample textarea, neither of
  // which touch `armedRowKey`) never begins a drag.
  const armRow = (rowKey: string): void => setArmedRowKey(rowKey);

  const resetDragState = (): void => {
    setDraggingSource(null);
    setDragOverTarget(null);
    setArmedRowKey(null);
  };

  const handleRowDragStart = (
    event: ReactDragEvent<HTMLLIElement>,
    rowKey: string,
    source: DragSource
  ): void => {
    if (armedRowKey !== rowKey) {
      event.preventDefault();
      return;
    }
    setDraggingSource(source);
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", rowKey);
    } catch {
      // Drag payload lives in React state, not DataTransfer — some
      // embedding/test environments don't implement it fully, which is
      // harmless here.
    }
  };

  const handleRowDragEnd = (): void => {
    resetDragState();
  };

  const handleSelectedPaneDragOver = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!draggingSource) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    const targetEl = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-row-index]"
    );
    let index = selectedFonts.length;
    if (targetEl && targetEl.dataset.rowIndex !== undefined) {
      const rowIndex = Number(targetEl.dataset.rowIndex);
      const rect = targetEl.getBoundingClientRect();
      const isAfter = event.clientY - rect.top > rect.height / 2;
      index = isAfter ? rowIndex + 1 : rowIndex;
    }
    setDragOverTarget({ pane: "selected", index });
  };

  const handleSelectedPaneDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!draggingSource) {
      return;
    }
    event.preventDefault();
    const dropIndex =
      dragOverTarget && dragOverTarget.pane === "selected"
        ? dragOverTarget.index
        : selectedFonts.length;

    if (draggingSource.kind === "available") {
      const candidate = draggingSource.family;
      setSelectedFonts((prev) =>
        insertSelectedFont(
          prev,
          { family: candidate.family, displayName: candidate.displayName },
          dropIndex
        )
      );
      setHighlightedAvailableFamily(null);
    } else {
      setSelectedFonts((prev) =>
        moveSelectedFont(prev, draggingSource.index, dropIndex)
      );
    }
    setSelectedIndex(null);
    setPreviewMode({ kind: "selectedList" });
    resetDragState();
  };

  const handleSelectedPaneDragLeave = (event: ReactDragEvent<HTMLDivElement>): void => {
    const related = event.relatedTarget as Node | null;
    if (!related || !event.currentTarget.contains(related)) {
      setDragOverTarget((prev) => (prev?.pane === "selected" ? null : prev));
    }
  };

  const handleAvailablePaneDragOver = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!draggingSource) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      // Right-pane-internal drags (available -> available) are a no-op by
      // design (#494: candidate pane reorder is out of scope) — reflect
      // that in the drop cursor.
      event.dataTransfer.dropEffect =
        draggingSource.kind === "selected" ? "move" : "none";
    }
    setDragOverTarget({ pane: "available" });
  };

  const handleAvailablePaneDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!draggingSource) {
      return;
    }
    event.preventDefault();
    if (draggingSource.kind === "selected") {
      setSelectedFonts((prev) => removeSelectedFontAt(prev, draggingSource.index));
      setSelectedIndex(null);
      setPreviewMode({ kind: "selectedList" });
    }
    // draggingSource.kind === "available": dropped back into the same pane
    // it came from — no-op.
    resetDragState();
  };

  const handleAvailablePaneDragLeave = (event: ReactDragEvent<HTMLDivElement>): void => {
    const related = event.relatedTarget as Node | null;
    if (!related || !event.currentTarget.contains(related)) {
      setDragOverTarget((prev) => (prev?.pane === "available" ? null : prev));
    }
  };

  const cachedFamilies: CachedFontFamily[] =
    cacheState.status === "loaded" ? cacheState.cache.families : [];

  const selectedFamilyKeys = new Set(
    selectedFonts.map((f) => f.family.toLowerCase())
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredCandidates = cachedFamilies
    .filter((candidate) => {
      const key = candidate.family.toLowerCase();
      if (GENERIC_FONT_FAMILIES.has(key)) {
        return false;
      }
      if (selectedFamilyKeys.has(key)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        candidate.displayName.toLowerCase().includes(normalizedQuery) ||
        candidate.family.toLowerCase().includes(normalizedQuery)
      );
    })
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: "base"
      })
    );

  const genericFallback = FONT_SLOT_GENERIC_FALLBACKS[slot];

  const previewCss =
    previewMode.kind === "selectedList"
      ? buildFontFamilyCss(selectedFonts, genericFallback)
      : buildFontFamilyCss([previewMode.family], genericFallback);

  const rowCssFor = (font: FontFamilySetting): string =>
    buildFontFamilyCss([font], genericFallback);

  const dragHandleLabel = translate("fontPicker.label.dragHandle");

  return (
    <InfoDialog
      title={getTitle()}
      opener={opener ?? null}
      className="fontPickerDialog"
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-cancel"
            onClick={onClose}
          >
            {translate("fontPicker.button.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-primary"
            onClick={() => {
              onSave(selectedFonts);
              onClose();
            }}
          >
            {translate("fontPicker.button.apply")}
          </button>
        </div>
      }
    >
      <div className="fontPickerContent">
        {/* #494 remediation: the font picker is D&D-only for list
            manipulation (no Add/Remove/Up/Down buttons) — this caption is
            the only explanation of how to adopt/unadopt/reorder. */}
        <p className="fontPickerDndCaption">
          {translate("fontPicker.label.dndCaption")}
        </p>
        <div className="fontPickerPanes">
          {/* Left pane: selected / adopted fonts */}
          <div
            className="fontPickerPane fontPickerPane-selected"
            role="group"
            aria-label={translate("fontPicker.label.selectedFonts")}
          >
            <div className="fontPickerPaneHeader">
              {translate("fontPicker.label.selectedFonts")}
            </div>
            <p className="fontPickerPriorityNote">
              {translate("fontPicker.label.priorityExplanation")}
            </p>
            <div
              className={
                dragOverTarget?.pane === "selected"
                  ? "fontPickerSelectedListBox fontPickerListBox-dropTarget"
                  : "fontPickerSelectedListBox"
              }
              onDragOver={handleSelectedPaneDragOver}
              onDrop={handleSelectedPaneDrop}
              onDragLeave={handleSelectedPaneDragLeave}
            >
              {selectedFonts.length === 0 ? (
                <div className="fontPickerEmptyNotice">
                  {translate("fontPicker.emptySelection")}
                </div>
              ) : (
                <ul className="fontPickerList">
                  {selectedFonts.map((font, idx) => {
                    const isActive = selectedIndex === idx;
                    const rowKey = selectedRowKey(idx);
                    const isDraggingThis =
                      draggingSource?.kind === "selected" &&
                      draggingSource.index === idx;
                    const showDropBefore =
                      dragOverTarget?.pane === "selected" &&
                      dragOverTarget.index === idx;
                    const showDropAfter =
                      dragOverTarget?.pane === "selected" &&
                      dragOverTarget.index === selectedFonts.length &&
                      idx === selectedFonts.length - 1;
                    const liClassName = [
                      "fontPickerRow",
                      isDraggingThis ? "fontPickerRow-dragging" : "",
                      showDropBefore ? "fontPickerRow-dropBefore" : "",
                      showDropAfter ? "fontPickerRow-dropAfter" : ""
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <li
                        key={`${font.family}-${idx}`}
                        data-row-index={idx}
                        draggable={armedRowKey === rowKey}
                        onDragStart={(e) =>
                          handleRowDragStart(e, rowKey, { kind: "selected", index: idx })
                        }
                        onDragEnd={handleRowDragEnd}
                        className={liClassName}
                      >
                        <button
                          type="button"
                          className="fontPickerRowGrip"
                          aria-label={dragHandleLabel}
                          onMouseDown={() => armRow(rowKey)}
                          onMouseUp={() => setArmedRowKey(null)}
                          dangerouslySetInnerHTML={{ __html: gripperIconRaw }}
                        />
                        <button
                          type="button"
                          className={
                            isActive
                              ? "fontPickerRowButton fontPickerRowButton-active"
                              : "fontPickerRowButton"
                          }
                          aria-pressed={isActive}
                          onClick={() => handleSelectedRowClick(font, idx)}
                        >
                          <span className="fontPickerRowName">
                            <span className="fontPickerSelectedIndex">
                              {idx + 1}.
                            </span>
                            {formatRowIdentity(font.family, font.displayName)}
                          </span>
                          <span
                            className="fontPickerRowSample"
                            style={{ fontFamily: rowCssFor(font) }}
                          >
                            {MINI_SAMPLE_TEXT}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Right pane: available / unselected fonts */}
          <div
            className="fontPickerPane fontPickerPane-available"
            role="group"
            aria-label={translate("fontPicker.label.availableFonts")}
          >
            <div className="fontPickerPaneHeader">
              {translate("fontPicker.label.availableFonts")}
            </div>
            {cacheState.status === "notScanned" ? (
              <div className="fontPickerNotice fontPickerNotice-warning">
                {translate("fontPicker.cacheNotScanned")}
              </div>
            ) : cacheState.status === "error" ? (
              <div className="fontPickerNotice fontPickerNotice-error">
                {cacheState.message || translate("fontCache.status.error")}
              </div>
            ) : (
              <>
                <div className="fontPickerSearchGroup">
                  <label htmlFor={searchInputId} className="fontPickerSearchLabel">
                    {translate("fontPicker.label.search")}
                  </label>
                  <input
                    id={searchInputId}
                    className="fontPickerSearchInput settingsTextInput"
                    type="search"
                    value={searchQuery}
                    placeholder={translate("fontPicker.label.search")}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHighlightedAvailableFamily(null);
                    }}
                  />
                </div>
                <div
                  className={
                    dragOverTarget?.pane === "available"
                      ? "fontPickerAvailableListBox fontPickerListBox-dropTarget"
                      : "fontPickerAvailableListBox"
                  }
                  onDragOver={handleAvailablePaneDragOver}
                  onDrop={handleAvailablePaneDrop}
                  onDragLeave={handleAvailablePaneDragLeave}
                >
                  {filteredCandidates.length === 0 ? (
                    <div className="fontPickerEmptyNotice">
                      {translate("fontPicker.emptyAvailable")}
                    </div>
                  ) : (
                    <ul className="fontPickerAvailableList">
                      {filteredCandidates.map((candidate) => {
                        const isActive =
                          highlightedAvailableFamily?.family === candidate.family;
                        const rowKey = availableRowKey(candidate.family);
                        const isDraggingThis =
                          draggingSource?.kind === "available" &&
                          draggingSource.family.family === candidate.family;
                        return (
                          <li
                            key={candidate.family}
                            draggable={armedRowKey === rowKey}
                            onDragStart={(e) =>
                              handleRowDragStart(e, rowKey, {
                                kind: "available",
                                family: candidate
                              })
                            }
                            onDragEnd={handleRowDragEnd}
                            className={
                              isDraggingThis
                                ? "fontPickerRow fontPickerRow-dragging"
                                : "fontPickerRow"
                            }
                          >
                            <button
                              type="button"
                              className="fontPickerRowGrip"
                              aria-label={dragHandleLabel}
                              onMouseDown={() => armRow(rowKey)}
                              onMouseUp={() => setArmedRowKey(null)}
                              dangerouslySetInnerHTML={{ __html: gripperIconRaw }}
                            />
                            <button
                              type="button"
                              className={
                                isActive
                                  ? "fontPickerRowButton fontPickerRowButton-active"
                                  : "fontPickerRowButton"
                              }
                              aria-pressed={isActive}
                              onClick={() => handleAvailableRowClick(candidate)}
                            >
                              <span className="fontPickerRowName">
                                {formatRowIdentity(candidate.family, candidate.displayName)}
                              </span>
                              <span
                                className="fontPickerRowSample"
                                style={{
                                  fontFamily: buildFontFamilyCss(
                                    [
                                      {
                                        family: candidate.family,
                                        displayName: candidate.displayName
                                      }
                                    ],
                                    genericFallback
                                  )
                                }}
                              >
                                {MINI_SAMPLE_TEXT}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* #494 remediation: full-width sample area below both panes. */}
        <div className="fontPickerSampleSection">
          <label htmlFor={sampleInputId} className="fontPickerSampleLabel">
            {translate("fontPicker.label.sampleInput")}
          </label>
          <textarea
            id={sampleInputId}
            className="fontPickerSampleInput settingsTextInput"
            rows={2}
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
          />
          <div className="fontPickerSamplePreviewHeader">
            <span className="fontPickerSampleLabel">
              {translate("fontPicker.label.sample")}
            </span>
            <button
              type="button"
              className={
                previewMode.kind === "selectedList"
                  ? "fontPickerPreviewModeButton fontPickerPreviewModeButton-active"
                  : "fontPickerPreviewModeButton"
              }
              aria-pressed={previewMode.kind === "selectedList"}
              onClick={() => setPreviewMode({ kind: "selectedList" })}
            >
              {translate("fontPicker.label.previewSelectedList")}
            </button>
          </div>
          <div
            className="fontPickerSamplePreview"
            style={{ fontFamily: previewCss, fontWeight: 400 }}
          >
            {sampleText}
          </div>
        </div>
      </div>
    </InfoDialog>
  );
}

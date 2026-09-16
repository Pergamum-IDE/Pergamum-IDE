import { useEffect, useId, useState } from "react";
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
import type { Translate } from "../../shared/i18n";
import { InfoDialog } from "./InfoDialog";

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

const MINI_SAMPLE_TEXT = "Aa あア亜 123";

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

  const handleMoveUp = (): void => {
    if (selectedIndex === null || selectedIndex <= 0) {
      return;
    }
    const next = [...selectedFonts];
    const prevIndex = selectedIndex - 1;
    const temp = next[prevIndex];
    next[prevIndex] = next[selectedIndex];
    next[selectedIndex] = temp;
    setSelectedFonts(next);
    setSelectedIndex(prevIndex);
    setPreviewMode({ kind: "selectedList" });
  };

  const handleMoveDown = (): void => {
    if (
      selectedIndex === null ||
      selectedIndex < 0 ||
      selectedIndex >= selectedFonts.length - 1
    ) {
      return;
    }
    const next = [...selectedFonts];
    const nextIndex = selectedIndex + 1;
    const temp = next[nextIndex];
    next[nextIndex] = next[selectedIndex];
    next[selectedIndex] = temp;
    setSelectedFonts(next);
    setSelectedIndex(nextIndex);
    setPreviewMode({ kind: "selectedList" });
  };

  const handleRemove = (): void => {
    if (
      selectedIndex === null ||
      selectedIndex < 0 ||
      selectedIndex >= selectedFonts.length
    ) {
      return;
    }
    const next = selectedFonts.filter((_, idx) => idx !== selectedIndex);
    setSelectedFonts(next);
    setSelectedIndex(null);
    setPreviewMode({ kind: "selectedList" });
  };

  const handleAddHighlighted = (): void => {
    if (!highlightedAvailableFamily) {
      return;
    }
    const candidate = highlightedAvailableFamily;
    const key = candidate.family.toLowerCase();
    if (GENERIC_FONT_FAMILIES.has(key)) {
      return;
    }
    if (selectedFonts.some((f) => f.family.toLowerCase() === key)) {
      return;
    }
    setSelectedFonts((prev) => [
      ...prev,
      { family: candidate.family, displayName: candidate.displayName }
    ]);
    setHighlightedAvailableFamily(null);
    setPreviewMode({ kind: "selectedList" });
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
            <div className="fontPickerSelectedListBox">
              {selectedFonts.length === 0 ? (
                <div className="fontPickerEmptyNotice">
                  {translate("fontPicker.emptySelection")}
                </div>
              ) : (
                <ul className="fontPickerList">
                  {selectedFonts.map((font, idx) => {
                    const isActive = selectedIndex === idx;
                    return (
                      <li key={`${font.family}-${idx}`}>
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
                            {font.displayName || font.family}
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
            <div className="fontPickerPaneActions">
              <button
                type="button"
                className="settingsButton"
                disabled={selectedIndex === null || selectedIndex <= 0}
                onClick={handleMoveUp}
              >
                {translate("fontPicker.button.moveUp")}
              </button>
              <button
                type="button"
                className="settingsButton"
                disabled={
                  selectedIndex === null ||
                  selectedIndex < 0 ||
                  selectedIndex >= selectedFonts.length - 1
                }
                onClick={handleMoveDown}
              >
                {translate("fontPicker.button.moveDown")}
              </button>
              <button
                type="button"
                className="settingsButton settingsButton-danger"
                disabled={
                  selectedIndex === null ||
                  selectedIndex < 0 ||
                  selectedIndex >= selectedFonts.length
                }
                onClick={handleRemove}
              >
                {translate("fontPicker.button.remove")}
              </button>
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
                <div className="fontPickerAvailableListBox">
                  {filteredCandidates.length === 0 ? (
                    <div className="fontPickerEmptyNotice">
                      {translate("fontPicker.emptyAvailable")}
                    </div>
                  ) : (
                    <ul className="fontPickerAvailableList">
                      {filteredCandidates.map((candidate) => {
                        const isActive =
                          highlightedAvailableFamily?.family === candidate.family;
                        return (
                          <li key={candidate.family}>
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
                                {candidate.displayName}
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
                <div className="fontPickerPaneActions">
                  <button
                    type="button"
                    className="settingsButton"
                    disabled={!highlightedAvailableFamily}
                    onClick={handleAddHighlighted}
                  >
                    {translate("fontPicker.button.add")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sample section */}
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

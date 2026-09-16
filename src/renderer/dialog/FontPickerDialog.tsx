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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [cacheState, setCacheState] = useState<FontCacheState>({
    status: "notScanned"
  });

  const dialogId = useId();
  const searchInputId = `${dialogId}-search`;

  useEffect(() => {
    if (isOpen) {
      setSelectedFonts([...initialValue]);
      setSelectedIndex(null);
      setSearchQuery("");

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
  };

  const handleAddCandidate = (candidate: CachedFontFamily): void => {
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

  const sampleCss = buildFontFamilyCss(
    selectedFonts,
    FONT_SLOT_GENERIC_FALLBACKS[slot]
  );

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
        {/* Selected Fonts Section */}
        <div className="fontPickerSection">
          <div className="fontPickerSectionLabel">
            {translate("fontPicker.label.selectedFonts")}
          </div>
          <div className="fontPickerSelectedList">
            {selectedFonts.length === 0 ? (
              <div className="fontPickerEmptyNotice">
                {translate("fontPicker.emptySelection")}
              </div>
            ) : (
              <ul className="fontPickerList">
                {selectedFonts.map((font, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <li key={`${font.family}-${idx}`}>
                      <button
                        type="button"
                        className={
                          isSelected
                            ? "fontPickerListItem fontPickerListItem-selected"
                            : "fontPickerListItem"
                        }
                        onClick={() => setSelectedIndex(idx)}
                      >
                        <span className="fontPickerListIndex">{idx + 1}.</span>
                        <span className="fontPickerListName">
                          {font.displayName || font.family}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="fontPickerSelectedActions">
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

        {/* Candidate Fonts Section */}
        <div className="fontPickerSection">
          <div className="fontPickerSectionLabel">
            {translate("fontPicker.label.addFont")}
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
            <div className="fontPickerCandidatesContainer">
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <ul className="fontPickerCandidateList">
                {filteredCandidates.map((candidate) => (
                  <li key={candidate.family}>
                    <button
                      type="button"
                      className="fontPickerCandidateItem"
                      onClick={() => handleAddCandidate(candidate)}
                    >
                      {candidate.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sample Preview Section */}
        <div className="fontPickerSection">
          <div className="fontPickerSectionLabel">
            {translate("fontPicker.label.sample")}
          </div>
          <div
            className="fontPickerSamplePreview"
            style={{ fontFamily: sampleCss, fontWeight: 400 }}
          >
            {translate("fontPicker.sampleText")}
          </div>
        </div>
      </div>
    </InfoDialog>
  );
}

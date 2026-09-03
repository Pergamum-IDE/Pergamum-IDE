import { useEffect, useMemo, useState, type DragEvent } from "react";
import type {
  ApplicationSettings,
  SaveApplicationSettingsRequest
} from "../shared/api";
import {
  DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR,
  DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MAX,
  DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MIN,
  defaultDocumentMapSettings,
  isValidViewportLensOpacity,
  normalizeDocumentMapColor,
  reorderDocumentMapDialoguePairs,
  type DocumentMapDialogueDelimiterPair,
  type DocumentMapSettings
} from "../shared/documentMapSettings";
import type { Translate } from "../shared/i18n";

/** Private DataTransfer type for the dialogue-pair reorder drag. */
const DIALOGUE_PAIR_MIME = "application/x-pergamum-document-map-dialogue-pair";
const DRAG_HANDLE_GLYPH = "⣿";

interface DocumentMapSettingsSectionProps {
  settings: ApplicationSettings;
  isLoading: boolean;
  translate: Translate;
  onChangeSettings: (settings: SaveApplicationSettingsRequest) => void;
}

/** A full save request from the current settings, `documentMap` replaced. */
function saveRequestWithDocumentMap(
  settings: ApplicationSettings,
  documentMap: DocumentMapSettings
): SaveApplicationSettingsRequest {
  const request: SaveApplicationSettingsRequest = {
    preview: settings.preview,
    workbench: settings.workbench,
    commandPalette: settings.commandPalette,
    editor: settings.editor,
    files: settings.files,
    documentMap
  };
  if (settings.notification !== undefined) {
    request.notification = settings.notification;
  }
  return request;
}

/** A `#rrggbb` safe to feed a native `<input type="color">` (else a grey). */
function colorPickerValue(raw: string): string {
  return normalizeDocumentMapColor(raw) ?? "#888888";
}

/**
 * #375: the Document Map section of the Settings page (rendered in the
 * Appearance pane). Edits narration / untagged-glossary colours and the
 * ORDERED `documentMap.dialogueDelimiterPairs`. Not a catalog item — the
 * dialogue-pair list + dual colour inputs don't fit the generic controls.
 * Immediate-save like the rest of the Settings page.
 */
export function DocumentMapSettingsSection({
  settings,
  isLoading,
  translate,
  onChangeSettings
}: DocumentMapSettingsSectionProps): JSX.Element {
  // Local draft so an in-progress invalid colour text can stay on screen; it
  // re-syncs whenever a save round-trips a new `settings.documentMap`.
  const [draft, setDraft] = useState<DocumentMapSettings>(
    settings.documentMap
  );
  // The viewport-lens opacity text input keeps its raw string separately, so a
  // partial value ("0.", "") can stay on screen without corrupting the number.
  const [opacityText, setOpacityText] = useState(
    String(settings.documentMap.viewportLensOpacity)
  );
  const settingsKey = useMemo(
    () => JSON.stringify(settings.documentMap),
    [settings.documentMap]
  );
  useEffect(() => {
    setDraft(settings.documentMap);
    setOpacityText(String(settings.documentMap.viewportLensOpacity));
  }, [settingsKey]);

  const [drag, setDrag] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function commit(next: DocumentMapSettings): void {
    setDraft(next);
    // Only persist when every colour is a valid #rrggbb and the lens opacity
    // is a valid number in range.
    const narration = normalizeDocumentMapColor(next.narrationColor);
    const fallback = normalizeDocumentMapColor(next.glossaryFallbackColor);
    const pairColors = next.dialogueDelimiterPairs.map((pair) =>
      normalizeDocumentMapColor(pair.color)
    );
    const pairsValid = next.dialogueDelimiterPairs.every(
      (pair, index) =>
        pair.open.length > 0 &&
        pair.close.length > 0 &&
        pairColors[index] !== null
    );

    if (
      narration &&
      fallback &&
      pairsValid &&
      isValidViewportLensOpacity(next.viewportLensOpacity)
    ) {
      onChangeSettings(
        saveRequestWithDocumentMap(settings, {
          narrationColor: narration,
          glossaryFallbackColor: fallback,
          dialogueDelimiterPairs: next.dialogueDelimiterPairs.map(
            (pair, index) => ({
              open: pair.open,
              close: pair.close,
              color: pairColors[index] as string
            })
          ),
          adjustTagColorsForVisibility: next.adjustTagColorsForVisibility,
          viewportLensOpacity: next.viewportLensOpacity
        })
      );
    }
  }

  // Keep the draft opacity and the text input in step. The range slider always
  // produces a valid in-range value; the text input is parsed and only pushed
  // to the draft (and persisted) when it is a valid number in `0.1`..`0.9`.
  function setOpacityFromNumber(value: number): void {
    setOpacityText(String(value));
    commit({ ...draft, viewportLensOpacity: value });
  }

  function setOpacityFromText(raw: string): void {
    setOpacityText(raw);
    const parsed = Number(raw);
    if (raw.trim() !== "" && isValidViewportLensOpacity(parsed)) {
      commit({ ...draft, viewportLensOpacity: parsed });
    }
  }

  const opacityInvalid = !isValidViewportLensOpacity(Number(opacityText));

  function updatePair(
    index: number,
    patch: Partial<DocumentMapDialogueDelimiterPair>
  ): void {
    commit({
      ...draft,
      dialogueDelimiterPairs: draft.dialogueDelimiterPairs.map((pair, i) =>
        i === index ? { ...pair, ...patch } : pair
      )
    });
  }

  function addPair(): void {
    commit({
      ...draft,
      dialogueDelimiterPairs: [
        ...draft.dialogueDelimiterPairs,
        { open: "「", close: "」", color: DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR }
      ]
    });
  }

  function deletePair(index: number): void {
    commit({
      ...draft,
      dialogueDelimiterPairs: draft.dialogueDelimiterPairs.filter(
        (_pair, i) => i !== index
      )
    });
  }

  function movePair(fromIndex: number, toIndex: number): void {
    const pairs = reorderDocumentMapDialoguePairs(
      draft.dialogueDelimiterPairs,
      fromIndex,
      toIndex
    );
    if (
      pairs.some(
        (pair, i) =>
          pair.open !== draft.dialogueDelimiterPairs[i]?.open ||
          pair.close !== draft.dialogueDelimiterPairs[i]?.close ||
          pair.color !== draft.dialogueDelimiterPairs[i]?.color
      )
    ) {
      commit({ ...draft, dialogueDelimiterPairs: pairs });
    }
  }

  function dropGapFor(
    event: { clientY: number; currentTarget: HTMLElement },
    index: number
  ): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  }

  const dragHandleLabel = translate(
    "settings.documentMap.dialogueDelimiterPairs.reorder"
  );

  const colorField = (
    label: string,
    field: "narrationColor" | "glossaryFallbackColor",
    settingKey: string
  ): JSX.Element => {
    const value = draft[field];
    const invalid = normalizeDocumentMapColor(value) === null;
    return (
      <div className="settingsItemRow documentMapSettingsColorField">
        <label>
          <span className="settingsItemLabel">{label}</span>
          <span className="documentMapSettingsColorInputs">
            <input
              type="color"
              className="documentMapSettingsColorSwatch"
              value={colorPickerValue(value)}
              disabled={isLoading}
              aria-label={label}
              onChange={(event) =>
                commit({ ...draft, [field]: event.target.value })
              }
            />
            <input
              type="text"
              className="documentMapSettingsColorText"
              value={value}
              disabled={isLoading}
              aria-label={label}
              aria-invalid={invalid || undefined}
              onChange={(event) =>
                commit({ ...draft, [field]: event.target.value })
              }
            />
          </span>
        </label>
        {invalid ? (
          <p className="documentMapSettingsError" role="alert">
            {translate("settings.documentMap.color.invalid")}
          </p>
        ) : null}
        {/* Setting-key line, same look as the Application settings rows. */}
        <code className="settingsItemKey">{settingKey}</code>
      </div>
    );
  };

  return (
    // The visible heading is the Settings pane's own category title
    // ("文書マップ / Document Map"); this section only names itself for a11y so
    // the heading is not shown twice (#375 fix).
    <section
      className="documentMapSettingsSection"
      aria-label={translate("settings.documentMap.title")}
    >
      {/* #375: viewport-lens opacity — top of the category. A range slider and
          a text input edit the same value; the text input validates to
          `0.1`..`0.9`. */}
      <div className="settingsItemRow documentMapSettingsOpacityField">
        <label>
          <span className="settingsItemLabel">
            {translate("settings.documentMap.viewportLensOpacity.label")}
          </span>
          <span className="documentMapSettingsOpacityInputs">
            <input
              type="range"
              className="documentMapSettingsOpacityRange"
              min={DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MIN}
              max={DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MAX}
              step={0.1}
              value={draft.viewportLensOpacity}
              disabled={isLoading}
              aria-label={translate(
                "settings.documentMap.viewportLensOpacity.label"
              )}
              onChange={(event) =>
                setOpacityFromNumber(event.target.valueAsNumber)
              }
            />
            <input
              type="text"
              inputMode="decimal"
              className="documentMapSettingsOpacityText"
              value={opacityText}
              disabled={isLoading}
              aria-label={translate(
                "settings.documentMap.viewportLensOpacity.label"
              )}
              aria-invalid={opacityInvalid || undefined}
              onChange={(event) => setOpacityFromText(event.target.value)}
            />
          </span>
        </label>
        {opacityInvalid ? (
          <p className="documentMapSettingsError" role="alert">
            {translate("settings.documentMap.viewportLensOpacity.invalid")}
          </p>
        ) : (
          <p className="documentMapSettingsHint">
            {translate(
              "settings.documentMap.viewportLensOpacity.description"
            )}
          </p>
        )}
        <code className="settingsItemKey">documentMap.viewportLensOpacity</code>
      </div>

      {colorField(
        translate("settings.documentMap.narrationColor.label"),
        "narrationColor",
        "documentMap.narrationColor"
      )}
      {colorField(
        translate("settings.documentMap.glossaryFallbackColor.label"),
        "glossaryFallbackColor",
        "documentMap.glossaryFallbackColor"
      )}

      {/* Same switch UI as the catalog-driven boolean settings (#375 fix):
          the <label> wraps the text + switch so either toggles it, and the
          checkbox is styled as a switch by `.settingsSwitchInput`. */}
      <div className="settingsItemRow documentMapSettingsToggleField">
        <label className="settingsItemHeader">
          <span
            id="documentMapSettingsAdjustTagColorsLabel"
            className="settingsItemLabel"
          >
            {translate(
              "settings.documentMap.adjustTagColorsForVisibility.label"
            )}
          </span>
          <div className="settingsItemControl">
            <input
              type="checkbox"
              className="settingsSwitchInput documentMapSettingsAdjustTagColors"
              checked={draft.adjustTagColorsForVisibility}
              disabled={isLoading}
              aria-labelledby="documentMapSettingsAdjustTagColorsLabel"
              onChange={(event) =>
                commit({
                  ...draft,
                  adjustTagColorsForVisibility: event.target.checked
                })
              }
            />
          </div>
        </label>
        <p className="settingsDescription">
          {translate(
            "settings.documentMap.adjustTagColorsForVisibility.description"
          )}
        </p>
        <code className="settingsItemKey">
          documentMap.adjustTagColorsForVisibility
        </code>
      </div>

      <div className="settingsItemRow documentMapSettingsDialoguePairs">
        <span className="settingsItemLabel">
          {translate("settings.documentMap.dialogueDelimiterPairs.label")}
        </span>
        <p className="documentMapSettingsHint">
          {translate(
            "settings.documentMap.dialogueDelimiterPairs.description"
          )}
        </p>
        <code className="settingsItemKey">
          documentMap.dialogueDelimiterPairs
        </code>

        <ul
          className="documentMapSettingsDialoguePairList"
          aria-label={translate(
            "settings.documentMap.dialogueDelimiterPairs.label"
          )}
        >
          {draft.dialogueDelimiterPairs.map((pair, index) => {
            const invalidColor = normalizeDocumentMapColor(pair.color) === null;
            const onDragOver = (event: DragEvent<HTMLElement>): void => {
              if (
                drag === null ||
                !Array.from(event.dataTransfer.types).includes(
                  DIALOGUE_PAIR_MIME
                )
              ) {
                return;
              }
              event.preventDefault();
              const gap = dropGapFor(event, index);
              if (gap !== dropIndex) {
                setDropIndex(gap);
              }
            };
            const onDrop = (event: DragEvent<HTMLElement>): void => {
              if (drag === null) {
                return;
              }
              event.preventDefault();
              const gap = dropGapFor(event, index);
              movePair(drag, gap > drag ? gap - 1 : gap);
              setDrag(null);
              setDropIndex(null);
            };

            return (
              <li
                key={index}
                className="documentMapSettingsDialoguePairRow"
                data-dragging={drag === index || undefined}
                data-drop-before={dropIndex === index || undefined}
                onDragOver={onDragOver}
                onDrop={onDrop}
              >
                <button
                  type="button"
                  className="glossaryEntryTagAssignmentDragHandle"
                  aria-label={dragHandleLabel}
                  title={dragHandleLabel}
                  draggable={!isLoading}
                  disabled={isLoading}
                  onDragStart={(event) => {
                    setDrag(index);
                    setDropIndex(null);
                    event.dataTransfer.setData(DIALOGUE_PAIR_MIME, String(index));
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setDropIndex(null);
                  }}
                  onKeyDown={(event) => {
                    if (isLoading) {
                      return;
                    }
                    if (event.key === "ArrowUp" && index > 0) {
                      event.preventDefault();
                      movePair(index, index - 1);
                    } else if (
                      event.key === "ArrowDown" &&
                      index < draft.dialogueDelimiterPairs.length - 1
                    ) {
                      event.preventDefault();
                      movePair(index, index + 1);
                    }
                  }}
                >
                  <span aria-hidden="true">{DRAG_HANDLE_GLYPH}</span>
                </button>

                <label className="documentMapSettingsDialogueDelimiter">
                  <span>
                    {translate(
                      "settings.documentMap.dialogueDelimiterPairs.open"
                    )}
                  </span>
                  <input
                    type="text"
                    value={pair.open}
                    disabled={isLoading}
                    aria-invalid={pair.open.length === 0 || undefined}
                    onChange={(event) =>
                      updatePair(index, { open: event.target.value })
                    }
                  />
                </label>
                <label className="documentMapSettingsDialogueDelimiter">
                  <span>
                    {translate(
                      "settings.documentMap.dialogueDelimiterPairs.close"
                    )}
                  </span>
                  <input
                    type="text"
                    value={pair.close}
                    disabled={isLoading}
                    aria-invalid={pair.close.length === 0 || undefined}
                    onChange={(event) =>
                      updatePair(index, { close: event.target.value })
                    }
                  />
                </label>

                <label className="documentMapSettingsDialogueColor">
                  <span>
                    {translate(
                      "settings.documentMap.dialogueDelimiterPairs.color"
                    )}
                  </span>
                  <span className="documentMapSettingsColorInputs">
                    <input
                      type="color"
                      className="documentMapSettingsColorSwatch"
                      value={colorPickerValue(pair.color)}
                      disabled={isLoading}
                      onChange={(event) =>
                        updatePair(index, { color: event.target.value })
                      }
                    />
                    <input
                      type="text"
                      className="documentMapSettingsColorText"
                      value={pair.color}
                      disabled={isLoading}
                      aria-invalid={invalidColor || undefined}
                      onChange={(event) =>
                        updatePair(index, { color: event.target.value })
                      }
                    />
                  </span>
                </label>

                <button
                  type="button"
                  className="documentMapSettingsDialoguePairDelete"
                  aria-label={translate(
                    "settings.documentMap.dialogueDelimiterPairs.delete"
                  )}
                  title={translate(
                    "settings.documentMap.dialogueDelimiterPairs.delete"
                  )}
                  disabled={isLoading}
                  onClick={() => deletePair(index)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="documentMapSettingsAddPair"
          disabled={isLoading}
          onClick={addPair}
        >
          {translate("settings.documentMap.dialogueDelimiterPairs.add")}
        </button>
      </div>
    </section>
  );
}

/** Exposed for tests / callers that want the built-in Document Map defaults. */
export { defaultDocumentMapSettings };

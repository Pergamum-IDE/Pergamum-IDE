import { useEffect, useMemo, useState, type DragEvent } from "react";
import type {
  ApplicationSettings,
  SaveApplicationSettingsRequest
} from "../shared/api";
import {
  DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR,
  defaultDocumentMapSettings,
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
  const settingsKey = useMemo(
    () => JSON.stringify(settings.documentMap),
    [settings.documentMap]
  );
  useEffect(() => {
    setDraft(settings.documentMap);
  }, [settingsKey]);

  const [drag, setDrag] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function commit(next: DocumentMapSettings): void {
    setDraft(next);
    // Only persist when every colour is a valid #rrggbb.
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

    if (narration && fallback && pairsValid) {
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
          adjustTagColorsForVisibility: next.adjustTagColorsForVisibility
        })
      );
    }
  }

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
    field: "narrationColor" | "glossaryFallbackColor"
  ): JSX.Element => {
    const value = draft[field];
    const invalid = normalizeDocumentMapColor(value) === null;
    return (
      <div className="documentMapSettingsColorField">
        <label>
          <span>{label}</span>
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
      {colorField(
        translate("settings.documentMap.narrationColor.label"),
        "narrationColor"
      )}
      {colorField(
        translate("settings.documentMap.glossaryFallbackColor.label"),
        "glossaryFallbackColor"
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
      </div>

      <div className="documentMapSettingsDialoguePairs">
        <h4>
          {translate("settings.documentMap.dialogueDelimiterPairs.label")}
        </h4>
        <p className="documentMapSettingsHint">
          {translate(
            "settings.documentMap.dialogueDelimiterPairs.description"
          )}
        </p>

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

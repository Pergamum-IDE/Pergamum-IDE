/**
 * #375 Document Map settings (`settings.json` → `documentMap`).
 *
 *   - `narrationColor`         — the plain-text / narration draw colour.
 *   - `glossaryFallbackColor`  — the Glossary-hit colour for an Entry with no
 *                                primary (first-assigned) tag.
 *   - `dialogueDelimiterPairs` — ordered `「…」`-style pairs. The ARRAY ORDER is
 *                                the draw order: a later pair is drawn later,
 *                                so on an overlap the later pair's colour wins.
 *
 * All three colours are `#RRGGBB` (accepting `#RGB` too, normalised the same
 * way as a Glossary tag colour). This module owns the shape + validation only
 * — persistence lives in the main settings store, presentation in the Settings
 * panel, and the draw side reads the resolved values.
 */

import {
  GlossaryValidationError,
  normalizeGlossaryRgbHex
} from "./glossary";

export interface DocumentMapDialogueDelimiterPair {
  /** Non-empty opening delimiter (usually one code point, e.g. `「`). */
  open: string;
  /** Non-empty closing delimiter (usually one code point, e.g. `」`). */
  close: string;
  /** Normalised `#rrggbb`. */
  color: string;
}

export interface DocumentMapSettings {
  narrationColor: string;
  glossaryFallbackColor: string;
  dialogueDelimiterPairs: DocumentMapDialogueDelimiterPair[];
  /**
   * #375: when `true` (the default), the Document Map draws each Glossary tag
   * in a visibility-adjusted colour (same hue / lightness, fixed saturation) —
   * the tag DEFINITION is never changed. `false` uses `GlossaryTag.backgroundRgb`
   * verbatim. The `glossaryFallbackColor` (untagged hit) is never adjusted.
   */
  adjustTagColorsForVisibility: boolean;
  /**
   * #375: alpha (`0.1`..`0.9`) of the viewport-lens FILL — the translucent pane
   * marking the currently visible editor range on the Document Map. Only the
   * fill; the lens border / edge colours stay fixed, and the lens colour itself
   * (achromatic white) is not configurable.
   */
  viewportLensOpacity: number;
}

// The narration colour is a dark grey, not pure black — the document map reads
// better against the (theme-dependent) pane background this way. The default
// `「」` dialogue pair is a mid grey; a tagged Glossary hit still stands out on
// top of it. The Glossary-hit fallback stays red (#375 Task Q).
export const DOCUMENT_MAP_DEFAULT_NARRATION_COLOR = "#3c3c3c";
export const DOCUMENT_MAP_DEFAULT_GLOSSARY_FALLBACK_COLOR = "#ff0000";
export const DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR = "#909090";

// #375: tag-colour visibility adjustment is ON by default — chip-tuned tag
// colours often disappear in the map otherwise.
export const DOCUMENT_MAP_DEFAULT_ADJUST_TAG_COLORS_FOR_VISIBILITY = true;

// #375: viewport-lens FILL alpha. `0.1`..`0.9`; the UI slider steps by `0.1`
// but any value in range is accepted (a slider on a non-step start value, a
// hand-edited settings.json). `0` (invisible) and `1` (opaque) are rejected.
export const DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MIN = 0.1;
export const DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MAX = 0.9;
export const DOCUMENT_MAP_DEFAULT_VIEWPORT_LENS_OPACITY = 0.28;

export function defaultDocumentMapDialogueDelimiterPairs(): DocumentMapDialogueDelimiterPair[] {
  return [
    { open: "「", close: "」", color: DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR }
  ];
}

export function defaultDocumentMapSettings(): DocumentMapSettings {
  return {
    narrationColor: DOCUMENT_MAP_DEFAULT_NARRATION_COLOR,
    glossaryFallbackColor: DOCUMENT_MAP_DEFAULT_GLOSSARY_FALLBACK_COLOR,
    dialogueDelimiterPairs: defaultDocumentMapDialogueDelimiterPairs(),
    adjustTagColorsForVisibility:
      DOCUMENT_MAP_DEFAULT_ADJUST_TAG_COLORS_FOR_VISIBILITY,
    viewportLensOpacity: DOCUMENT_MAP_DEFAULT_VIEWPORT_LENS_OPACITY
  };
}

/**
 * `true` when `value` is a finite number in the viewport-lens opacity range
 * (`0.1`..`0.9`, inclusive). Shared by the strict parse and the Settings UI's
 * live text-input validation.
 */
export function isValidViewportLensOpacity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MIN &&
    value <= DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MAX
  );
}

// ---------------------------------------------------------------------------
// Colour helpers (shared with the Settings UI's live `<input type="color">`)
// ---------------------------------------------------------------------------

/**
 * `#rrggbb` (lowercase) for `raw`, accepting `#RGB` / `#RRGGBB` in any case —
 * or `null` when `raw` is not a hex colour (so the UI can show a validation
 * error / skip the native colour input without throwing).
 */
export function normalizeDocumentMapColor(raw: unknown): string | null {
  try {
    return normalizeGlossaryRgbHex(raw);
  } catch (error) {
    if (error instanceof GlossaryValidationError) {
      return null;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Strict parse (save path — reject the whole write on any bad field)
// ---------------------------------------------------------------------------

export class DocumentMapSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentMapSettingsError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseColor(value: unknown, path: string): string {
  const normalized = normalizeDocumentMapColor(value);
  if (normalized === null) {
    throw new DocumentMapSettingsError(
      `${path} must be a #RRGGBB hex colour.`
    );
  }
  return normalized;
}

function parseDelimiter(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new DocumentMapSettingsError(`${path} must be a non-empty string.`);
  }
  return value;
}

export function parseDocumentMapDialogueDelimiterPair(
  value: unknown,
  path = "dialogueDelimiterPairs[]"
): DocumentMapDialogueDelimiterPair {
  if (!isObject(value)) {
    throw new DocumentMapSettingsError(`${path} must be an object.`);
  }
  return {
    open: parseDelimiter(value.open, `${path}.open`),
    close: parseDelimiter(value.close, `${path}.close`),
    color: parseColor(value.color, `${path}.color`)
  };
}

/**
 * Strict: throws {@link DocumentMapSettingsError} for any invalid field. An
 * empty `dialogueDelimiterPairs` array is valid. Missing top-level keys fall
 * back to the built-in default value for THAT key (the save request may omit a
 * field the user did not touch).
 */
export function parseDocumentMapSettingsForWrite(
  value: unknown
): DocumentMapSettings {
  if (!isObject(value)) {
    throw new DocumentMapSettingsError("documentMap must be an object.");
  }

  const defaults = defaultDocumentMapSettings();
  const narrationColor =
    value.narrationColor === undefined
      ? defaults.narrationColor
      : parseColor(value.narrationColor, "documentMap.narrationColor");
  const glossaryFallbackColor =
    value.glossaryFallbackColor === undefined
      ? defaults.glossaryFallbackColor
      : parseColor(
          value.glossaryFallbackColor,
          "documentMap.glossaryFallbackColor"
        );

  let dialogueDelimiterPairs: DocumentMapDialogueDelimiterPair[];
  if (value.dialogueDelimiterPairs === undefined) {
    dialogueDelimiterPairs = defaults.dialogueDelimiterPairs;
  } else if (!Array.isArray(value.dialogueDelimiterPairs)) {
    throw new DocumentMapSettingsError(
      "documentMap.dialogueDelimiterPairs must be an array."
    );
  } else {
    dialogueDelimiterPairs = value.dialogueDelimiterPairs.map((pair, index) =>
      parseDocumentMapDialogueDelimiterPair(
        pair,
        `documentMap.dialogueDelimiterPairs[${index}]`
      )
    );
  }

  let adjustTagColorsForVisibility = defaults.adjustTagColorsForVisibility;
  if (value.adjustTagColorsForVisibility !== undefined) {
    if (typeof value.adjustTagColorsForVisibility !== "boolean") {
      throw new DocumentMapSettingsError(
        "documentMap.adjustTagColorsForVisibility must be a boolean."
      );
    }
    adjustTagColorsForVisibility = value.adjustTagColorsForVisibility;
  }

  let viewportLensOpacity = defaults.viewportLensOpacity;
  if (value.viewportLensOpacity !== undefined) {
    if (!isValidViewportLensOpacity(value.viewportLensOpacity)) {
      throw new DocumentMapSettingsError(
        `documentMap.viewportLensOpacity must be a number between ` +
          `${DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MIN} and ` +
          `${DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MAX}.`
      );
    }
    viewportLensOpacity = value.viewportLensOpacity;
  }

  return {
    narrationColor,
    glossaryFallbackColor,
    dialogueDelimiterPairs,
    adjustTagColorsForVisibility,
    viewportLensOpacity
  };
}

// ---------------------------------------------------------------------------
// Tolerant read (load path — never throw; fall back per-field)
// ---------------------------------------------------------------------------

/**
 * Best-effort: any missing / invalid field is replaced with its built-in
 * default. A single bad dialogue pair is dropped (not the whole list). Never
 * throws — for the settings-file read path.
 */
export function readDocumentMapSettings(value: unknown): DocumentMapSettings {
  const defaults = defaultDocumentMapSettings();

  if (!isObject(value)) {
    return defaults;
  }

  const narrationColor =
    normalizeDocumentMapColor(value.narrationColor) ?? defaults.narrationColor;
  const glossaryFallbackColor =
    normalizeDocumentMapColor(value.glossaryFallbackColor) ??
    defaults.glossaryFallbackColor;

  let dialogueDelimiterPairs = defaults.dialogueDelimiterPairs;
  if (Array.isArray(value.dialogueDelimiterPairs)) {
    dialogueDelimiterPairs = value.dialogueDelimiterPairs.flatMap((pair) => {
      try {
        return [parseDocumentMapDialogueDelimiterPair(pair)];
      } catch {
        return [];
      }
    });
  }

  const adjustTagColorsForVisibility =
    typeof value.adjustTagColorsForVisibility === "boolean"
      ? value.adjustTagColorsForVisibility
      : defaults.adjustTagColorsForVisibility;

  // Tolerant: a finite number outside range is clamped, anything else falls
  // back to the default.
  let viewportLensOpacity = defaults.viewportLensOpacity;
  if (
    typeof value.viewportLensOpacity === "number" &&
    Number.isFinite(value.viewportLensOpacity)
  ) {
    viewportLensOpacity = Math.max(
      DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MIN,
      Math.min(
        DOCUMENT_MAP_VIEWPORT_LENS_OPACITY_MAX,
        value.viewportLensOpacity
      )
    );
  }

  return {
    narrationColor,
    glossaryFallbackColor,
    dialogueDelimiterPairs,
    adjustTagColorsForVisibility,
    viewportLensOpacity
  };
}

// ---------------------------------------------------------------------------
// Editing helpers (Settings UI draft mutations — all return a new array)
// ---------------------------------------------------------------------------

export function reorderDocumentMapDialoguePairs(
  pairs: readonly DocumentMapDialogueDelimiterPair[],
  fromIndex: number,
  toIndex: number
): DocumentMapDialogueDelimiterPair[] {
  const next = pairs.map((pair) => ({ ...pair }));

  if (
    !Number.isInteger(fromIndex) ||
    fromIndex < 0 ||
    fromIndex >= next.length
  ) {
    return next;
  }

  const target = Math.max(0, Math.min(Math.trunc(toIndex), next.length - 1));
  if (target === fromIndex) {
    return next;
  }

  const [moved] = next.splice(fromIndex, 1);
  next.splice(target, 0, moved);
  return next;
}

import type { Translate, TranslationKey } from "../shared/i18n";
import type { GlossaryTagDraftValidity } from "./glossaryTagDraft";
import { GlossaryTagChip } from "./GlossaryTagChip";
import {
  glossaryTagDraftPreview,
  glossaryTagDraftValidity,
  randomizeGlossaryTagDraftColors,
  type GlossaryTagDraft
} from "./glossaryTagDraft";

/** Stable id so a footer button outside the form can submit it. */
export const GLOSSARY_TAG_EDITOR_FORM_ID = "glossaryTagEditorForm";

const VALIDITY_MESSAGE_KEYS: Record<
  Extract<GlossaryTagDraftValidity, { ok: false }>["reason"],
  TranslationKey
> = {
  emptyLabel: "glossaryTagEditor.validity.emptyLabel",
  invalidBackground: "glossaryTagEditor.validity.invalidBackground",
  invalidForeground: "glossaryTagEditor.validity.invalidForeground"
};

const HEX6_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * A safe `#rrggbb` for a native `<input type="color">` — the raw text when it
 * is a valid 6-digit hex, otherwise the preview fallback (the picker cannot
 * hold anything else). The text input stays the source of truth; the picker
 * mirrors it and writes a normalized `#rrggbb` back on change.
 */
function colorPickerValue(raw: string, fallback: string): string {
  return HEX6_PATTERN.test(raw.trim()) ? raw.trim().toLowerCase() : fallback;
}

interface GlossaryTagEditorProps {
  draft: GlossaryTagDraft;
  translate: Translate;
  onChange: (draft: GlossaryTagDraft) => void;
  /** Fired on a valid `<form>` submit (Enter, or a footer submit button). */
  onSubmit: () => void;
  busy?: boolean;
  /** An operation error from a failed create / update (e.g. label conflict). */
  operationError?: string | null;
}

/**
 * #375: the Glossary Tag editor form BODY (no title, no action buttons) — it
 * is rendered inside the {@link InfoDialog} modal shell by GlossaryTagManager.
 * Fields: label, description, background / foreground `#RRGGBB` inputs, a
 * random-background button (which also recomputes the foreground via YIQ),
 * and a live preview chip. There is no manual "Auto foreground" button.
 */
export function GlossaryTagEditor({
  draft,
  translate,
  onChange,
  onSubmit,
  busy = false,
  operationError = null
}: GlossaryTagEditorProps): JSX.Element {
  const validity = glossaryTagDraftValidity(draft);
  const preview = glossaryTagDraftPreview(draft);
  const patch = (next: Partial<GlossaryTagDraft>): void =>
    onChange({ ...draft, ...next });

  return (
    <form
      id={GLOSSARY_TAG_EDITOR_FORM_ID}
      className="glossaryTagEditor"
      onSubmit={(event) => {
        event.preventDefault();

        if (validity.ok && !busy) {
          onSubmit();
        }
      }}
    >
      <label className="glossaryTagEditorField">
        <span>{translate("glossaryTagEditor.name")}</span>
        <input
          type="text"
          value={draft.label}
          disabled={busy}
          onChange={(event) => patch({ label: event.target.value })}
        />
      </label>

      <label className="glossaryTagEditorField">
        <span>{translate("glossaryTagEditor.description")}</span>
        <input
          type="text"
          value={draft.description}
          disabled={busy}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>

      <div className="glossaryTagEditorField glossaryTagEditorColorField">
        <span>{translate("glossaryTagEditor.background")}</span>
        <input
          type="color"
          className="glossaryTagEditorColorSwatch"
          value={colorPickerValue(draft.backgroundRgb, preview.backgroundRgb)}
          aria-label={translate("glossaryTagEditor.background")}
          disabled={busy}
          onChange={(event) => patch({ backgroundRgb: event.target.value })}
        />
        <input
          type="text"
          className="glossaryTagEditorColorInput"
          value={draft.backgroundRgb}
          aria-label={translate("glossaryTagEditor.background")}
          disabled={busy}
          onChange={(event) => patch({ backgroundRgb: event.target.value })}
        />
        <button
          type="button"
          className="glossaryTagEditorColorAction"
          disabled={busy}
          onClick={() => onChange(randomizeGlossaryTagDraftColors(draft))}
        >
          {translate("glossaryTagEditor.randomBackground")}
        </button>
      </div>

      <div className="glossaryTagEditorField glossaryTagEditorColorField">
        <span>{translate("glossaryTagEditor.foreground")}</span>
        <input
          type="color"
          className="glossaryTagEditorColorSwatch"
          value={colorPickerValue(draft.foregroundRgb, preview.foregroundRgb)}
          aria-label={translate("glossaryTagEditor.foreground")}
          disabled={busy}
          onChange={(event) => patch({ foregroundRgb: event.target.value })}
        />
        <input
          type="text"
          className="glossaryTagEditorColorInput"
          value={draft.foregroundRgb}
          aria-label={translate("glossaryTagEditor.foreground")}
          disabled={busy}
          onChange={(event) => patch({ foregroundRgb: event.target.value })}
        />
      </div>

      <div className="glossaryTagEditorPreview">
        <span>{translate("glossaryTagEditor.preview")}</span>
        <GlossaryTagChip
          tag={{
            label:
              preview.label ||
              translate("glossaryTagEditor.name"),
            backgroundRgb: preview.backgroundRgb,
            foregroundRgb: preview.foregroundRgb
          }}
        />
      </div>

      {!validity.ok ? (
        <p className="glossaryTagEditorValidity" role="alert">
          {translate(VALIDITY_MESSAGE_KEYS[validity.reason])}
        </p>
      ) : operationError ? (
        <p className="glossaryTagEditorValidity" role="alert">
          {operationError}
        </p>
      ) : null}
    </form>
  );
}

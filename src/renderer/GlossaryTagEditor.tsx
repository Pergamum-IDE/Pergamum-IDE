import type { Translate, TranslationKey } from "../shared/i18n";
import type { GlossaryTagDraftValidity } from "./glossaryTagDraft";
import { autoGlossaryTagForegroundRgb } from "../shared/glossaryTagColor";
import { randomGlossaryTagBackgroundRgb } from "../shared/glossaryTagColor";
import { GlossaryTagChip } from "./GlossaryTagChip";
import {
  glossaryTagDraftPreview,
  glossaryTagDraftValidity,
  type GlossaryTagDraft
} from "./glossaryTagDraft";

const VALIDITY_MESSAGE_KEYS: Record<
  Extract<GlossaryTagDraftValidity, { ok: false }>["reason"],
  TranslationKey
> = {
  emptyLabel: "glossaryTagEditor.validity.emptyLabel",
  invalidBackground: "glossaryTagEditor.validity.invalidBackground",
  invalidForeground: "glossaryTagEditor.validity.invalidForeground"
};

interface GlossaryTagEditorProps {
  draft: GlossaryTagDraft;
  translate: Translate;
  onChange: (draft: GlossaryTagDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * #375: GitHub-label-style single-tag form — name, description, background /
 * foreground `#RRGGBB` inputs, a random-background button, an auto-foreground
 * (YIQ) button, and a live preview chip.
 */
export function GlossaryTagEditor({
  draft,
  translate,
  onChange,
  onSubmit,
  onCancel,
  busy = false
}: GlossaryTagEditorProps): JSX.Element {
  const validity = glossaryTagDraftValidity(draft);
  const preview = glossaryTagDraftPreview(draft);
  const patch = (next: Partial<GlossaryTagDraft>): void =>
    onChange({ ...draft, ...next });

  return (
    <form
      className="glossaryTagEditor"
      aria-label={translate(
        draft.tagId === null
          ? "glossaryTagEditor.titleNew"
          : "glossaryTagEditor.titleEdit"
      )}
      onSubmit={(event) => {
        event.preventDefault();

        if (validity.ok && !busy) {
          onSubmit();
        }
      }}
    >
      <h2>
        {translate(
          draft.tagId === null
            ? "glossaryTagEditor.titleNew"
            : "glossaryTagEditor.titleEdit"
        )}
      </h2>

      <label className="glossaryTagEditorField">
        <span>{translate("glossaryTagEditor.name")}</span>
        <input
          type="text"
          value={draft.label}
          onChange={(event) => patch({ label: event.target.value })}
        />
      </label>

      <label className="glossaryTagEditorField">
        <span>{translate("glossaryTagEditor.description")}</span>
        <input
          type="text"
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>

      <div className="glossaryTagEditorField glossaryTagEditorColorField">
        <span>{translate("glossaryTagEditor.background")}</span>
        <input
          type="text"
          className="glossaryTagEditorColorInput"
          value={draft.backgroundRgb}
          aria-label={translate("glossaryTagEditor.background")}
          onChange={(event) =>
            patch({ backgroundRgb: event.target.value })
          }
        />
        <button
          type="button"
          className="glossaryTagEditorColorAction"
          onClick={() =>
            patch({ backgroundRgb: randomGlossaryTagBackgroundRgb() })
          }
        >
          {translate("glossaryTagEditor.randomBackground")}
        </button>
      </div>

      <div className="glossaryTagEditorField glossaryTagEditorColorField">
        <span>{translate("glossaryTagEditor.foreground")}</span>
        <input
          type="text"
          className="glossaryTagEditorColorInput"
          value={draft.foregroundRgb}
          aria-label={translate("glossaryTagEditor.foreground")}
          onChange={(event) =>
            patch({ foregroundRgb: event.target.value })
          }
        />
        <button
          type="button"
          className="glossaryTagEditorColorAction"
          onClick={() => {
            try {
              patch({
                foregroundRgb: autoGlossaryTagForegroundRgb(
                  draft.backgroundRgb
                )
              });
            } catch {
              // Background is not a valid color yet — leave foreground as is.
            }
          }}
        >
          {translate("glossaryTagEditor.autoForeground")}
        </button>
      </div>

      <div className="glossaryTagEditorPreview">
        <span>{translate("glossaryTagEditor.preview")}</span>
        <GlossaryTagChip
          tag={{
            label:
              preview.label ||
              translate(
                draft.tagId === null
                  ? "glossaryTagEditor.newTag"
                  : "glossaryTagEditor.titleEdit"
              ),
            backgroundRgb: preview.backgroundRgb,
            foregroundRgb: preview.foregroundRgb
          }}
        />
      </div>

      {!validity.ok ? (
        <p className="glossaryTagEditorValidity" role="alert">
          {translate(VALIDITY_MESSAGE_KEYS[validity.reason])}
        </p>
      ) : null}

      <div className="glossaryTagEditorActions">
        <button
          type="submit"
          className="glossaryTagEditorSave"
          disabled={!validity.ok || busy}
        >
          {translate("glossaryTagEditor.save")}
        </button>
        <button
          type="button"
          className="glossaryTagEditorCancel"
          disabled={busy}
          onClick={onCancel}
        >
          {translate("glossaryTagEditor.cancel")}
        </button>
      </div>
    </form>
  );
}

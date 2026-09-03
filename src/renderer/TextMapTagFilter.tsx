import { useId, useState, type FocusEvent } from "react";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { GlossaryTagChip } from "./GlossaryTagChip";

interface TextMapTagFilterProps {
  /**
   * Project-wide tags, ALREADY in `glossary_tags.sort_order` order (the store's
   * `listTags` order). Options and the selected-value chips follow this order —
   * never the click order.
   */
  tags: readonly GlossaryTag[];
  /**
   * Currently selected tag ids. Defaults (from the panel) to every project tag.
   * `[]` means "draw no Glossary hits" — it is NOT read as "All".
   */
  selectedTagIds: readonly string[];
  translate: Translate;
  /** Replace the selection. */
  onChange: (selectedTagIds: string[]) => void;
}

/** How many selected chips the compact trigger shows before collapsing to `+n`. */
const MAX_VISIBLE_CHIPS = 2;

/**
 * #375: the Document Map / Text Map "Render tags" multi-select. A trigger
 * button opens a list of every project tag ({@link GlossaryTagChip}); each row
 * is a full-width toggle button (the whole row is the hit target, not just a
 * checkbox square). The selection is local, never persisted, and defaults to
 * every tag; an EMPTY selection draws no Glossary hits. Disabled when the
 * project has no tags. Closes on focus-out; no global key listeners.
 */
export function TextMapTagFilter({
  tags,
  selectedTagIds,
  translate,
  onChange
}: TextMapTagFilterProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const labelId = useId();

  const selectedSet = new Set(selectedTagIds);
  // Selected chips / count in project order, not click order.
  const selectedTags = tags.filter((tag) => selectedSet.has(tag.id));
  const hasTags = tags.length > 0;
  const selectedCount = selectedTags.length;
  const allSelected = hasTags && selectedCount === tags.length;

  const visibleChips = selectedTags.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = selectedCount - visibleChips.length;

  function toggle(tagId: string): void {
    onChange(
      selectedSet.has(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId]
    );
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  return (
    <div className="textMapTagFilter" onBlur={handleBlur}>
      <span className="textMapTagFilterLabel" id={labelId}>
        {translate("textMap.renderTags.label")}
      </span>
      <button
        type="button"
        className="textMapTagFilterTrigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-labelledby={labelId}
        disabled={!hasTags}
        title={
          selectedCount > 0
            ? translate("textMap.renderTags.selectedCount", {
                count: selectedCount
              })
            : undefined
        }
        onClick={() => setOpen((current) => !current)}
      >
        <span className="textMapTagFilterValue">
          {!hasTags ? (
            translate("textMap.renderTags.noTags")
          ) : selectedCount === 0 ? (
            <span className="textMapTagFilterNoSelection">
              {translate("textMap.renderTags.noSelection")}
            </span>
          ) : allSelected ? (
            // Every tag selected — say so instead of listing every chip.
            <span className="textMapTagFilterAllSelected">
              {translate("textMap.renderTags.showAll")}
            </span>
          ) : (
            <span className="textMapTagFilterChips">
              {visibleChips.map((tag) => (
                <GlossaryTagChip key={tag.id} tag={tag} />
              ))}
              {overflowCount > 0 ? (
                <span className="textMapTagFilterMore">
                  {translate("textMap.renderTags.moreSelected", {
                    count: overflowCount
                  })}
                </span>
              ) : null}
            </span>
          )}
        </span>
        <span className="textMapTagFilterCaret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && hasTags ? (
        <div className="textMapTagFilterPopup">
          {tags.map((tag) => {
            const checked = selectedSet.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className="textMapTagFilterOption"
                aria-pressed={checked}
                onClick={() => toggle(tag.id)}
              >
                <span
                  className="textMapTagFilterCheck"
                  data-checked={checked || undefined}
                  aria-hidden="true"
                />
                <GlossaryTagChip tag={tag} />
              </button>
            );
          })}
          {!allSelected ? (
            <button
              type="button"
              className="textMapTagFilterShowAll"
              onClick={() => onChange(tags.map((tag) => tag.id))}
            >
              {translate("textMap.renderTags.showAll")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

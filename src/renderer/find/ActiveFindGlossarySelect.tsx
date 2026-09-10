import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import { glossaryCompletionCandidateDetail } from "../glossaryCompletion";
import {
  filterFindGlossaryCandidates,
  type FindGlossaryCandidate
} from "./findGlossaryPicker";

/**
 * #424 Slice 6 — the Glossary-search-mode selector that replaces the plain
 * text query input while `queryKind === "glossary"`.
 *
 * `variant="multi"` (Search tab): keeps a chip list of selected atoms; picking
 * a candidate toggles it; the popup stays open. `variant="single"` (Replace
 * tab): at most one selected atom; picking replaces it and closes.
 *
 * Rows reuse the shared editor-completion display: the registered form plus an
 * inline muted `"→ 代表語"` for a non-representative form. The SELECTED atom's
 * RAW value is what search runs against — never normalized to the
 * representative. The popup never takes focus; the filter input keeps the
 * caret and drives keyboard navigation.
 */
export interface ActiveFindGlossarySelectProps {
  readonly translate: Translate;
  readonly variant: "multi" | "single";
  readonly candidates: readonly FindGlossaryCandidate[];
  readonly selectedIds: readonly string[];
  readonly onChange: (selectedIds: string[]) => void;
  readonly placeholder: string;
  /** Bumped by the owner to focus the filter input (panel open / mode tab). */
  readonly focusToken: number;
  /**
   * Panel-level handling for keys this selector does not own — Ctrl+F / Ctrl+H
   * mode switching and Escape-closes-the-panel. Returns `true` when consumed.
   */
  readonly onUnhandledKeyDown?: (
    event: ReactKeyboardEvent<HTMLInputElement>
  ) => boolean;
}

function preventFocusSteal(event: ReactMouseEvent): void {
  event.preventDefault();
}

export function ActiveFindGlossarySelect({
  translate,
  variant,
  candidates,
  selectedIds,
  onChange,
  placeholder,
  focusToken,
  onUnhandledKeyDown
}: ActiveFindGlossarySelectProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusToken]);

  const byId = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.atomId, candidate])),
    [candidates]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCandidates = selectedIds
    .map((id) => byId.get(id))
    .filter((candidate): candidate is FindGlossaryCandidate => candidate != null);

  const visible = useMemo(
    () => filterFindGlossaryCandidates(candidates, filter),
    [candidates, filter]
  );

  useEffect(() => {
    setActiveIndex((index) =>
      visible.length === 0
        ? 0
        : Math.min(Math.max(index, 0), visible.length - 1)
    );
  }, [visible.length]);

  const closePopup = (): void => {
    setOpen(false);
    setFilter("");
  };

  const commit = (candidate: FindGlossaryCandidate): void => {
    if (variant === "single") {
      onChange([candidate.atomId]);
      closePopup();
      inputRef.current?.focus();
      return;
    }
    // multi: toggle membership, keep the popup open for the next pick
    onChange(
      selectedSet.has(candidate.atomId)
        ? selectedIds.filter((id) => id !== candidate.atomId)
        : [...selectedIds, candidate.atomId]
    );
    setFilter("");
    inputRef.current?.focus();
  };

  const removeId = (id: string): void => {
    onChange(selectedIds.filter((selectedId) => selectedId !== id));
    inputRef.current?.focus();
  };

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    const ctrlSpace =
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.code === "Space";
    if (ctrlSpace) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
      setActiveIndex(0);
      return;
    }

    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) =>
          visible.length === 0 ? 0 : (index + 1) % visible.length
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) =>
          visible.length === 0
            ? 0
            : (index - 1 + visible.length) % visible.length
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (visible.length > 0) {
          commit(visible[Math.min(activeIndex, visible.length - 1)]);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePopup();
        return;
      }
    } else if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(0);
      return;
    }

    if (
      event.key === "Backspace" &&
      variant === "multi" &&
      filter.length === 0 &&
      selectedIds.length > 0
    ) {
      event.preventDefault();
      removeId(selectedIds[selectedIds.length - 1]);
      return;
    }

    if (onUnhandledKeyDown?.(event)) {
      // Ctrl+F / Ctrl+H switched modes, or Escape closed the panel.
    }
  };

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      closePopup();
    }
  };

  return (
    <div
      className="activeFindPanelGlossarySelect"
      data-variant={variant}
      onBlur={handleBlur}
    >
      <div className="activeFindPanelGlossarySelectControl">
        {selectedCandidates.map((candidate) => (
          <span key={candidate.atomId} className="activeFindPanelGlossaryChip">
            <span
              className="activeFindPanelGlossaryChipValue"
              title={candidate.value}
            >
              {candidate.value}
            </span>
            <button
              type="button"
              className="activeFindPanelGlossaryChipRemove"
              aria-label={translate("editor.find.glossaryRemoveTerm", {
                value: candidate.value
              })}
              title={translate("editor.find.glossaryRemoveTerm", {
                value: candidate.value
              })}
              onMouseDown={preventFocusSteal}
              onClick={() => removeId(candidate.atomId)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="activeFindPanelInput activeFindPanelGlossarySelectInput"
          role="combobox"
          aria-expanded={open}
          aria-label={placeholder}
          placeholder={
            selectedCandidates.length === 0 ? placeholder : ""
          }
          value={filter}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setFilter(event.currentTarget.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onClick={() => setOpen(true)}
        />
      </div>

      {open ? (
        <ul
          className="activeFindPanelCompletion activeFindPanelGlossarySelectPopup"
          role="listbox"
          aria-label={placeholder}
        >
          {visible.length === 0 ? (
            <li
              className="activeFindPanelCompletionEmpty"
              aria-disabled="true"
            >
              {translate("editor.find.glossaryEmpty")}
            </li>
          ) : (
            visible.map((candidate, index) => {
              const detail = glossaryCompletionCandidateDetail(candidate);
              const isActive = index === activeIndex;
              const isSelected = selectedSet.has(candidate.atomId);
              return (
                <li
                  key={candidate.atomId}
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive ? "true" : undefined}
                  data-selected={isSelected ? "true" : undefined}
                  className="activeFindPanelCompletionOption activeFindPanelGlossarySelectOption"
                  title={detail ? `${candidate.value} ${detail}` : candidate.value}
                  onMouseDown={preventFocusSteal}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(candidate)}
                >
                  {variant === "multi" ? (
                    <span
                      className="activeFindPanelGlossarySelectCheck"
                      data-checked={isSelected ? "true" : undefined}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="activeFindPanelCompletionLabel">
                    {candidate.value}
                  </span>
                  {detail !== null ? (
                    <span className="activeFindPanelCompletionDetail">
                      {detail}
                    </span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The `Ab` / `Aa` / `.*` (and Glossary) icon toggle button, shared by the
 * project-wide Search pane (`SearchSidebar.tsx`, #384) and the active-document
 * Find panel (`find/ActiveFindPanel.tsx`, #424 Slice 2). Extracted verbatim so
 * neither feature reimplements the icon inlining or the button markup.
 */
import glossarySearchIconRaw from "../../assets/icons/svgrepo/search/vocabulary-svgrepo-com.svg?raw";
import wholeWordIconRaw from "../../assets/icons/codicons/search/whole-word.svg?raw";
import caseSensitiveIconRaw from "../../assets/icons/codicons/search/case-sensitive.svg?raw";
import useRegexIconRaw from "../../assets/icons/codicons/search/regex.svg?raw";

/**
 * The bundled svgrepo / Pergamum search glyphs ship as standalone documents
 * (XML prolog, `<!DOCTYPE>`, a BOM, a hard-coded black `fill`). Strip the
 * document scaffolding and swap the fixed fill for `currentColor` so the
 * icon inherits the toggle button's text colour in every theme.
 */
export function inlineSearchIcon(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/fill="#0{3}(?:0{3})?"/gi, 'fill="currentColor"')
    .replace(/fill:\s*#0{3}(?:0{3})?/gi, "fill:currentColor")
    .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/i, "$1")
    .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/i, "$1")
    .trim();
}

export const GLOSSARY_SEARCH_ICON = inlineSearchIcon(glossarySearchIconRaw);
export const WHOLE_WORD_ICON = inlineSearchIcon(wholeWordIconRaw);
export const CASE_SENSITIVE_ICON = inlineSearchIcon(caseSensitiveIconRaw);
export const USE_REGEX_ICON = inlineSearchIcon(useRegexIconRaw);

export interface SearchOptionToggleProps {
  readonly icon: string;
  readonly pressed: boolean;
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}

export function SearchOptionToggle({
  icon,
  pressed,
  label,
  hint,
  disabled = false,
  onToggle
}: SearchOptionToggleProps): JSX.Element {
  return (
    <button
      type="button"
      className="searchOptionToggle"
      data-pressed={pressed && !disabled ? "true" : undefined}
      aria-pressed={pressed && !disabled}
      aria-label={label}
      title={hint}
      disabled={disabled}
      // #424 Slice 3 focus polish: toggling an option must not pull focus out
      // of the adjacent search / replace input in real Chromium.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <span
        className="searchOptionToggleIcon"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    </button>
  );
}

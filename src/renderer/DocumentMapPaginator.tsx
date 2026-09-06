import type { Translate } from "../shared/i18n";

export interface DocumentMapPaginatorProps {
  /** 0-based current page index */
  currentPage: number;
  /** Total number of pages (>= 2 when rendered) */
  pageCount: number;
  translate: Translate;
  /** Callback when user changes page (previous, next, or dropdown) */
  onSelectPage: (pageIndex: number) => void;
}

/**
 * #403 Phase 2: Document Map paginator.
 *
 * Controls navigation between physical Document Map pages.
 * Layout: [ ◀ ] [ ページ 3 / 7 ▼ ] [ ▶ ]
 * English: [ ◀ ] [ Page 3 / 7 ▼ ] [ ▶ ]
 *
 * Only rendered when pageCount >= 2.
 */
export function DocumentMapPaginator({
  currentPage,
  pageCount,
  translate,
  onSelectPage
}: DocumentMapPaginatorProps): JSX.Element {
  if (pageCount < 2) {
    return <></>;
  }

  const isFirst = currentPage <= 0;
  const isLast = currentPage >= pageCount - 1;

  return (
    <div
      className="documentMapPaginator"
      role="navigation"
      aria-label={translate("documentMap.page.paginationLabel")}
    >
      <button
        type="button"
        className="documentMapPageButton"
        aria-label={translate("documentMap.page.previous")}
        title={translate("documentMap.page.previous")}
        disabled={isFirst}
        onClick={() => onSelectPage(currentPage - 1)}
      >
        <span aria-hidden="true">◀</span>
      </button>

      <div className="documentMapPageSelectWrapper">
        <span className="documentMapPageSelectLabel">
          {translate("documentMap.page.currentOfTotal", {
            current: currentPage + 1,
            total: pageCount
          })}
        </span>
        <span className="documentMapPageSelectCaret" aria-hidden="true">
          ▼
        </span>
        <select
          className="documentMapPageSelect"
          aria-label={translate("documentMap.page.selectLabel")}
          value={currentPage}
          onChange={(event) => onSelectPage(Number(event.currentTarget.value))}
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <option key={index} value={index}>
              {translate("documentMap.page.option", { page: index + 1 })}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="documentMapPageButton"
        aria-label={translate("documentMap.page.next")}
        title={translate("documentMap.page.next")}
        disabled={isLast}
        onClick={() => onSelectPage(currentPage + 1)}
      >
        <span aria-hidden="true">▶</span>
      </button>
    </div>
  );
}

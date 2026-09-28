import type { JSX } from "react";
import { useMemo } from "react";
import type { RecentProjectDocumentItem } from "../shared/api";
import type { GlossaryEntry, GlossaryEntryId } from "../shared/glossary";
import { representativeGlossaryAtom } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { formatLocalDateTime } from "../shared/resumeHubHelpers";

export interface ResumeHubProps {
  readonly recentDocuments: readonly RecentProjectDocumentItem[];
  readonly recentGlossaryEntries: readonly GlossaryEntry[];
  readonly translate: Translate;
  readonly onOpenDocument: (relativePath: string) => void;
  readonly onOpenGlossaryEntry: (entryId: GlossaryEntryId) => void;
}

export function ResumeHub({
  recentDocuments,
  recentGlossaryEntries,
  translate,
  onOpenDocument,
  onOpenGlossaryEntry
}: ResumeHubProps): JSX.Element {
  const topRecentDocuments = useMemo(() => {
    return recentDocuments.slice(0, 5);
  }, [recentDocuments]);

  const topRecentGlossaryEntries = useMemo(() => {
    return [...recentGlossaryEntries]
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt).getTime();
        const timeB = new Date(b.updatedAt).getTime();
        return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
      })
      .slice(0, 5);
  }, [recentGlossaryEntries]);

  return (
    <div className="resumeHubContainer">
      <header className="resumeHubHeader">
        <h1 className="resumeHubTitle">{translate("resumeHub.title")}</h1>
      </header>

      <div className="resumeHubBody">
        <section className="resumeHubSection">
          <h2 className="resumeHubSectionTitle">
            {translate("resumeHub.recentDocuments")}
          </h2>

          {topRecentDocuments.length === 0 ? (
            <p className="resumeHubEmptyState">
              {translate("resumeHub.noRecentDocuments")}
            </p>
          ) : (
            <ul className="resumeHubList">
              {topRecentDocuments.map((doc) => (
                <li key={doc.relativePath} className="resumeHubListItem">
                  <div className="resumeHubItemMain">
                    <span className="resumeHubItemPath">{doc.relativePath}</span>
                    <span className="resumeHubItemPreview">{doc.preview}</span>
                  </div>
                  <div className="resumeHubItemMeta">
                    <button
                      type="button"
                      className="resumeHubOpenButton"
                      onClick={() => onOpenDocument(doc.relativePath)}
                    >
                      {translate("resumeHub.openAction")}
                    </button>
                    <span className="resumeHubItemDate">{doc.updatedAt}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="resumeHubSection">
          <h2 className="resumeHubSectionTitle">
            {translate("resumeHub.recentGlossary")}
          </h2>

          {topRecentGlossaryEntries.length === 0 ? (
            <p className="resumeHubEmptyState">
              {translate("resumeHub.noRecentGlossary")}
            </p>
          ) : (
            <ul className="resumeHubList">
              {topRecentGlossaryEntries.map((entry) => {
                const name =
                  representativeGlossaryAtom(entry)?.value || "";
                const auxInfo = translate("resumeHub.glossaryAuxiliaryInfo", {
                  atomCount: entry.atoms.length,
                  tagCount: entry.tags.length
                });
                const formattedDate = formatLocalDateTime(entry.updatedAt);

                return (
                  <li key={entry.id} className="resumeHubListItem">
                    <div className="resumeHubItemMain">
                      <span className="resumeHubItemTitle">{name}</span>
                      <span className="resumeHubItemAux">{auxInfo}</span>
                    </div>
                    <div className="resumeHubItemMeta">
                      <button
                        type="button"
                        className="resumeHubOpenButton"
                        onClick={() => onOpenGlossaryEntry(entry.id)}
                      >
                        {translate("resumeHub.openAction")}
                      </button>
                      <span className="resumeHubItemDate">
                        {formattedDate}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

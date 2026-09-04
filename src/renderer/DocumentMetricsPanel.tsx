import { useMemo, useState, type ReactNode } from "react";
import type { Translate } from "../shared/i18n";
import { estimateManuscriptPages } from "../shared/manuscriptPages";
import type {
  DocumentMetricsAnalysis,
  DocumentMetricsGlossaryCount,
  DocumentMetricsTagCount
} from "./documentMetricsAnalysis";
import { CollapsibleSidebarSection } from "./CollapsibleSidebarSection";
import { GlossaryTagChip } from "./GlossaryTagChip";
import { DocumentDialogueRatioPieChart } from "./DocumentDialogueRatioPieChart";

/**
 * #360 — the Document Metrics (文書統計) left pane. Shows the ACTIVE
 * Markdown document "in numbers":
 *
 *   - Phase 1: character count (the SAME value the status bar shows — the
 *     host computes it once with the #259 algorithm/settings and hands it to
 *     both surfaces) + a 原稿用紙 estimate, and the backing file's last
 *     modified time. File creation time is intentionally NOT shown (birthtime
 *     is misleading for a manuscript — copy / restore / checkout / unzip).
 *   - Phase 2: per-Entry glossary occurrence counts, first-tag occurrence
 *     counts, and an approximate narration / dialogue character split. These
 *     come from a single debounced `DocumentMetricsAnalysis` the host runs
 *     only while this pane is visible.
 */
export type DocumentMetricsFileInfo =
  | { readonly kind: "unsaved" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "timestamps"; readonly modifiedAtIso: string | null };

interface DocumentMetricsPanelProps {
  readonly translate: Translate;
  /** Whether any document tab is active (Markdown or not). */
  readonly hasActiveDocument: boolean;
  /** Whether the active editor is a Markdown document. */
  readonly activeEditorIsMarkdown: boolean;
  /**
   * The active Markdown document's character count — the exact value the
   * status bar renders (#259 algorithm + `editor.characterCount.exclude`
   * settings). `null` while the shared debounced count has not resolved yet
   * for the current document.
   */
  readonly characterCount: number | null;
  /**
   * Phase 2 glossary / tag / dialogue analysis of the active document, or
   * `null` while the debounced analysis has not resolved yet.
   */
  readonly analysis: DocumentMetricsAnalysis | null;
  /** Backing-file last-modified time / unsaved / error state; `null` when N/A. */
  readonly fileInfo: DocumentMetricsFileInfo | null;
}

const EMPTY_VALUE = "-";

/** ISO string → locale date+time, or `-` for a missing / unparseable value. */
function formatFileTimestamp(iso: string | null): string {
  if (iso === null) {
    return EMPTY_VALUE;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? EMPTY_VALUE : date.toLocaleString();
}

function MetricRow({
  label,
  value
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="documentMetricsMetric">
      <dt className="documentMetricsMetricLabel">{label}</dt>
      <dd className="documentMetricsMetricValue">{value}</dd>
    </div>
  );
}

interface CountsTableRow {
  readonly key: string;
  /** Full text — used for the `title` tooltip on the plain-text variant. */
  readonly label: string;
  /** Optional rich label (a tag chip); falls back to plain ellipsised text. */
  readonly labelNode?: ReactNode;
  readonly count: number;
}

/** A compact `label | count` table. The label ellipsises; the full text is a
 *  `title` tooltip. Counts are right-aligned. Callers pass only rows with
 *  `count > 0`, already sorted. */
function CountsTable({
  headLabel,
  headCount,
  rows
}: {
  headLabel: string;
  headCount: string;
  rows: readonly CountsTableRow[];
}): JSX.Element {
  return (
    <table className="documentMetricsCountsTable">
      <thead>
        <tr>
          <th scope="col">{headLabel}</th>
          <th scope="col" className="documentMetricsCountsCount">
            {headCount}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="documentMetricsCountsLabel">
              {row.labelNode ?? (
                <span
                  className="documentMetricsCountsLabelText"
                  title={row.label}
                >
                  {row.label}
                </span>
              )}
            </td>
            <td className="documentMetricsCountsCount">
              {row.count.toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One narration / dialogue row — a colour swatch keyed to the pie chart,
 *  the label (left), and the right-aligned / tabular-nums value. */
function DialogueRatioRow({
  series,
  label,
  value
}: {
  series: "narration" | "dialogue";
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="documentMetricsDialogueRatioRow">
      <dt className="documentMetricsDialogueRatioLabel">
        <span
          className="documentMetricsDialogueSwatch"
          data-series={series}
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd className="documentMetricsDialogueRatioValue">{value}</dd>
    </div>
  );
}

export function DocumentMetricsPanel({
  translate,
  hasActiveDocument,
  activeEditorIsMarkdown,
  characterCount,
  analysis,
  fileInfo
}: DocumentMetricsPanelProps): JSX.Element {
  const [statisticsCollapsed, setStatisticsCollapsed] = useState(false);
  const [glossaryCountsCollapsed, setGlossaryCountsCollapsed] = useState(false);
  const [tagCountsCollapsed, setTagCountsCollapsed] = useState(false);
  const [dialogueRatioCollapsed, setDialogueRatioCollapsed] = useState(false);
  const [fileInfoCollapsed, setFileInfoCollapsed] = useState(false);

  const manuscriptPages = useMemo(
    () =>
      characterCount === null ? null : estimateManuscriptPages(characterCount),
    [characterCount]
  );

  const title = translate("documentMetrics.title");

  let body: JSX.Element;
  if (!hasActiveDocument) {
    body = (
      <div className="workspacePlaceholderList">
        <p className="workspacePlaceholder" role="status">
          {translate("documentMetrics.empty.noActiveDocument")}
        </p>
      </div>
    );
  } else if (!activeEditorIsMarkdown) {
    body = (
      <div className="workspacePlaceholderList">
        <p className="workspacePlaceholder" role="status">
          {translate("documentMetrics.empty.unsupportedDocument")}
        </p>
      </div>
    );
  } else {
    const charactersText =
      characterCount === null ? EMPTY_VALUE : characterCount.toLocaleString();
    const manuscriptPagesText =
      manuscriptPages === null
        ? EMPTY_VALUE
        : manuscriptPages === 0
          ? String(0)
          : translate("documentMetrics.metrics.aboutPages", {
              count: manuscriptPages
            });

    const glossaryRows: readonly DocumentMetricsGlossaryCount[] =
      analysis?.glossaryCounts ?? [];
    const tagRows: readonly DocumentMetricsTagCount[] =
      analysis?.tagCounts ?? [];
    const dialogueRatio = analysis?.dialogueRatio ?? null;

    const dialogueValue = (chars: number, percent: number): string =>
      translate("documentMetrics.dialogue.charsWithPercent", {
        count: chars.toLocaleString(),
        percent
      });

    body = (
      <div className="documentMetricsSections">
        <CollapsibleSidebarSection
          title={translate("documentMetrics.sections.statistics")}
          toggleLabel={translate("documentMetrics.sections.statistics")}
          collapsed={statisticsCollapsed}
          onToggleCollapsed={() =>
            setStatisticsCollapsed((current) => !current)
          }
        >
          <dl className="documentMetricsMetricList">
            <MetricRow
              label={translate("documentMetrics.metrics.characters")}
              value={charactersText}
            />
            <MetricRow
              label={translate(
                "documentMetrics.metrics.manuscriptPagesEstimate"
              )}
              value={manuscriptPagesText}
            />
          </dl>
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          title={translate("documentMetrics.sections.glossaryCounts")}
          toggleLabel={translate("documentMetrics.sections.glossaryCounts")}
          collapsed={glossaryCountsCollapsed}
          onToggleCollapsed={() =>
            setGlossaryCountsCollapsed((current) => !current)
          }
        >
          {analysis === null ? null : glossaryRows.length === 0 ? (
            <p className="documentMetricsNote">
              {translate("documentMetrics.empty.noGlossaryTerms")}
            </p>
          ) : (
            <CountsTable
              headLabel={translate("documentMetrics.tables.term")}
              headCount={translate("documentMetrics.tables.count")}
              rows={glossaryRows.map((row) => ({
                key: row.entryId,
                label: row.label,
                count: row.count
              }))}
            />
          )}
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          title={translate("documentMetrics.sections.tagCounts")}
          toggleLabel={translate("documentMetrics.sections.tagCounts")}
          collapsed={tagCountsCollapsed}
          onToggleCollapsed={() =>
            setTagCountsCollapsed((current) => !current)
          }
        >
          {analysis === null ? null : tagRows.length === 0 ? (
            <p className="documentMetricsNote">
              {translate("documentMetrics.empty.noTaggedTerms")}
            </p>
          ) : (
            <>
              <p className="documentMetricsNote">
                {translate("documentMetrics.tagCounts.description")}
              </p>
              <CountsTable
                headLabel={translate("documentMetrics.tables.tag")}
                headCount={translate("documentMetrics.tables.count")}
                rows={tagRows.map((row) => ({
                  key: row.tagId,
                  label: row.label,
                  labelNode: (
                    <GlossaryTagChip
                      tag={{
                        label: row.label,
                        backgroundRgb: row.backgroundRgb,
                        foregroundRgb: row.foregroundRgb
                      }}
                      compact
                    />
                  ),
                  count: row.count
                }))}
              />
            </>
          )}
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          title={translate("documentMetrics.sections.dialogueRatio")}
          toggleLabel={translate("documentMetrics.sections.dialogueRatio")}
          collapsed={dialogueRatioCollapsed}
          onToggleCollapsed={() =>
            setDialogueRatioCollapsed((current) => !current)
          }
        >
          {dialogueRatio === null ? null : (
            <>
              <div className="documentMetricsDialoguePieWrap">
                <DocumentDialogueRatioPieChart
                  narrationPercent={dialogueRatio.narrationPercent}
                  dialoguePercent={dialogueRatio.dialoguePercent}
                  totalCharacters={dialogueRatio.totalCharacters}
                  ariaLabel={`${translate(
                    "documentMetrics.dialogue.narration"
                  )} ${dialogueRatio.narrationPercent}% / ${translate(
                    "documentMetrics.dialogue.dialogue"
                  )} ${dialogueRatio.dialoguePercent}%`}
                />
              </div>
              <dl className="documentMetricsMetricList">
                <DialogueRatioRow
                  series="narration"
                  label={translate("documentMetrics.dialogue.narration")}
                  value={dialogueValue(
                    dialogueRatio.narrationCharacters,
                    dialogueRatio.narrationPercent
                  )}
                />
                <DialogueRatioRow
                  series="dialogue"
                  label={translate("documentMetrics.dialogue.dialogue")}
                  value={dialogueValue(
                    dialogueRatio.dialogueCharacters,
                    dialogueRatio.dialoguePercent
                  )}
                />
              </dl>
              <p className="documentMetricsNote">
                {translate("documentMetrics.dialogue.approximate")}
              </p>
            </>
          )}
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          title={translate("documentMetrics.sections.fileInfo")}
          toggleLabel={translate("documentMetrics.sections.fileInfo")}
          collapsed={fileInfoCollapsed}
          onToggleCollapsed={() => setFileInfoCollapsed((current) => !current)}
        >
          {fileInfo?.kind === "unsaved" ? (
            <p className="documentMetricsNote">
              {translate("documentMetrics.fileInfo.unsavedDocument")}
            </p>
          ) : (
            <>
              <dl className="documentMetricsMetricList">
                <MetricRow
                  label={translate("documentMetrics.fileInfo.lastModified")}
                  value={
                    fileInfo?.kind === "timestamps"
                      ? formatFileTimestamp(fileInfo.modifiedAtIso)
                      : EMPTY_VALUE
                  }
                />
              </dl>
              {fileInfo?.kind === "unavailable" ? (
                <p className="documentMetricsNote">
                  {translate("documentMetrics.fileInfo.unavailable")}
                </p>
              ) : null}
            </>
          )}
        </CollapsibleSidebarSection>
      </div>
    );
  }

  return (
    <aside
      className="workspaceSidebarPanel documentMetricsPanel"
      aria-label={title}
    >
      <div className="sidebarHeader">{title}</div>
      {body}
    </aside>
  );
}

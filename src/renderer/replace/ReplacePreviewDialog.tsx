import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import hourglassIconUrl from "../../../assets/icons/ionicons/dialog/hourglass-outline.svg?url";
import type { Translate, TranslationKey } from "../../shared/i18n";
import { InfoDialog } from "../dialog/InfoDialog";
import { buildReplacePreviewModeLabel } from "./replacePreviewMode";
import type {
  ReplaceApplyResult,
  ReplacePreviewCandidate,
  ReplacePreviewScope,
  ReplacePreviewSearchOptions
} from "./replacePreviewTypes";

export type {
  ReplaceApplyResult,
  ReplacePreviewCandidate,
  ReplacePreviewScope,
  ReplacePreviewSearchOptions,
  ReplacePreviewOpenRequest
} from "./replacePreviewTypes";

/**
 * #386 - the reusable Replace Preview Dialog.
 *
 * One component, two scopes:
 *  - `openDocuments` applies the selection to open editor buffers (dirty, not
 *    saved) - footer button is immediately enabled, and applying is
 *    synchronous (the host closes the dialog right away).
 *  - `projectDocuments` saves the selection straight to disk - a DESTRUCTIVE
 *    operation: an extra warning, the footer button is armed only after a 5s
 *    safety delay (hourglass icon, no countdown digits), is disabled when
 *    nothing is selected or the candidate ceiling was hit, and - once
 *    pressed - the dialog enters an `applying` state that CANNOT be
 *    dismissed (no Cancel, no Escape) until the host reports `applyResult`,
 *    at which point Close becomes available and the result is shown in place
 *    of the warning. The same dialog is never re-armed for a second apply.
 *
 * The dialog itself never touches a buffer or a file; `onApplySelected` hands
 * the still-applied ids to the host, which does the work for its scope.
 */

/** Delay (ms) before the destructive (project) apply button arms. Mirrors the
 *  File Explorer direct-delete confirmation's 5s friction. */
export const REPLACE_PREVIEW_PROJECT_APPLY_DELAY_MS = 5000;

interface ReplacePreviewScopeConfig {
  readonly titleKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly applyButtonKey: TranslationKey;
  readonly emptyKey: TranslationKey;
  /** Extra "cannot be undone" warning, shown for the destructive scope. */
  readonly destructiveWarningKey?: TranslationKey;
  readonly destructive: boolean;
}

const SCOPE_CONFIG: Record<ReplacePreviewScope, ReplacePreviewScopeConfig> = {
  openDocuments: {
    titleKey: "search.replace.preview.openDocs.title",
    descriptionKey: "search.replace.preview.openDocs.description",
    applyButtonKey: "search.replace.preview.applyAsEdits",
    emptyKey: "search.replace.preview.openDocs.noCandidates",
    destructive: false
  },
  projectDocuments: {
    titleKey: "search.replace.preview.project.title",
    descriptionKey: "search.replace.preview.project.description",
    applyButtonKey: "search.replace.preview.applyAndSave",
    emptyKey: "search.replace.project.emptyCandidates",
    destructiveWarningKey: "search.replace.preview.project.destructiveWarning",
    destructive: true
  }
};

export interface ReplacePreviewDialogProps {
  readonly scope: ReplacePreviewScope;
  /** The current search query, echoed in the summary (`置換前`). */
  readonly findText: string;
  /** The replace-with text, echoed in the summary (`置換後`). */
  readonly replaceText: string;
  /** The active text-search options, echoed as the `モード` line. */
  readonly searchOptions: ReplacePreviewSearchOptions;
  /**
   * `true` while the host is still generating candidates. The dialog opens
   * immediately in this state (loading message + skeleton rows, Cancel only)
   * so a slow generation never looks like a frozen click; `candidates` /
   * `limitReached` are ignored until it flips `false`.
   */
  readonly loading?: boolean;
  readonly candidates: readonly ReplacePreviewCandidate[];
  /** `true` when the preview search hit its candidate ceiling and not every
   *  replacement site is shown. Renders a "narrow the search" notice. */
  readonly limitReached?: boolean;
  /**
   * #386 destructive (project) scope only: `true` while the host is saving
   * the selection to disk. The dialog blocks every close affordance (Cancel /
   * Escape) while this is `true`. Ignored for `openDocuments`, whose apply is
   * synchronous - the host just closes the dialog.
   */
  readonly applying?: boolean;
  /**
   * #386 destructive (project) scope only: the settled outcome of the apply,
   * or `null` while it has not finished (or has not started). Once set, the
   * dialog shows it in place of the destructive warning, disables Apply for
   * good, and enables Close.
   */
  readonly applyResult?: ReplaceApplyResult | null;
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onCancel: () => void;
  /** Called with the ids still marked "apply" when the user presses the
   *  primary action. For `openDocuments` the host applies synchronously and
   *  closes the dialog; for `projectDocuments` the host starts the async save
   *  and reports back through `applying` / `applyResult`. */
  readonly onApplySelected: (candidateIds: readonly string[]) => void;
}

interface FileGroup {
  readonly fileId: string;
  readonly fileLabel: string;
  readonly filePath?: string;
  readonly candidates: readonly ReplacePreviewCandidate[];
}

function groupByFile(
  candidates: readonly ReplacePreviewCandidate[]
): FileGroup[] {
  const groups: FileGroup[] = [];
  const indexByFileId = new Map<string, number>();

  for (const candidate of candidates) {
    const existing = indexByFileId.get(candidate.fileId);
    if (existing === undefined) {
      indexByFileId.set(candidate.fileId, groups.length);
      groups.push({
        fileId: candidate.fileId,
        fileLabel: candidate.fileLabel,
        filePath: candidate.filePath,
        candidates: [candidate]
      });
    } else {
      groups[existing] = {
        ...groups[existing],
        candidates: [...groups[existing].candidates, candidate]
      };
    }
  }

  return groups;
}

function ReplacePreviewRow({
  translate,
  candidate,
  applied,
  onToggle
}: {
  translate: Translate;
  candidate: ReplacePreviewCandidate;
  applied: boolean;
  onToggle: (id: string, applied: boolean) => void;
}): JSX.Element {
  const highlighted = applied ? candidate.afterText : candidate.beforeText;

  return (
    <li className="replacePreviewRow" data-applied={applied ? "true" : "false"}>
      <span className="replacePreviewRowLocation">
        {candidate.line}:{candidate.column}
      </span>
      <span className="replacePreviewRowContext">
        {candidate.truncatedStart ? "…" : null}
        {candidate.contextBefore}
        <mark
          className={
            applied
              ? "replacePreviewMark replacePreviewMark-after"
              : "replacePreviewMark replacePreviewMark-before"
          }
        >
          {highlighted}
        </mark>
        {candidate.contextAfter}
        {candidate.truncatedEnd ? "…" : null}
      </span>
      <select
        className="replacePreviewRowControl"
        aria-label={translate("search.replace.preview.rowControlLabel")}
        value={applied ? "apply" : "ignore"}
        onChange={(event) =>
          onToggle(candidate.id, event.currentTarget.value === "apply")
        }
      >
        <option value="apply">
          {translate("search.replace.preview.rowApply")}
        </option>
        <option value="ignore">
          {translate("search.replace.preview.rowIgnore")}
        </option>
      </select>
    </li>
  );
}

export function ReplacePreviewDialog({
  scope,
  findText,
  replaceText,
  searchOptions,
  loading = false,
  candidates,
  limitReached = false,
  applying = false,
  applyResult = null,
  translate,
  opener,
  onCancel,
  onApplySelected
}: ReplacePreviewDialogProps): JSX.Element {
  const config = SCOPE_CONFIG[scope];
  const modeLabel = buildReplacePreviewModeLabel(translate, searchOptions);

  // Track the IGNORED ids; empty = everything applied (the default).
  const [ignoredIds, setIgnoredIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  // #386: destructive (project) scope only - the apply button arms after a
  // flat 5s safety delay (hourglass -> ready; no countdown digits, matching
  // the File Explorer direct-delete confirmation).
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!config.destructive || loading) {
      setArmed(false);
      return;
    }
    setArmed(false);
    const timer = setTimeout(
      () => setArmed(true),
      REPLACE_PREVIEW_PROJECT_APPLY_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [config.destructive, loading]);

  // #386: guards a double-click between the user's press and the host's next
  // prop update (which is what actually disables the button). Once pressed,
  // this dialog instance is spent - no re-apply, even if the host never sets
  // `applying` (e.g. openDocuments, which applies synchronously and closes).
  // A ref (not just the mirrored `submitted` state) because two synchronous
  // clicks in the same tick both run before React commits the state update -
  // the ref is what actually blocks the second one.
  const submittedRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const completed = applyResult !== null;

  const groups = useMemo(() => groupByFile(candidates), [candidates]);

  // #386: file-group navigation (jump the scroll area file-by-file). Simple
  // anchor refs + scrollIntoView; no candidate-row-level movement.
  const groupRefs = useRef<Array<HTMLLIElement | null>>([]);
  const activeGroupIndexRef = useRef(0);

  useEffect(() => {
    activeGroupIndexRef.current = 0;
    groupRefs.current.length = groups.length;
  }, [groups]);

  function scrollToAdjacentGroup(delta: -1 | 1): void {
    if (groups.length === 0) {
      return;
    }
    const next = Math.min(
      groups.length - 1,
      Math.max(0, activeGroupIndexRef.current + delta)
    );
    activeGroupIndexRef.current = next;
    groupRefs.current[next]?.scrollIntoView?.({ block: "start" });
  }

  const totalCount = candidates.length;
  const selectedCount = candidates.reduce(
    (count, candidate) => (ignoredIds.has(candidate.id) ? count : count + 1),
    0
  );
  const fileCount = groups.length;

  const isApplied = (id: string): boolean => !ignoredIds.has(id);

  function setApplied(ids: readonly string[], applied: boolean): void {
    setIgnoredIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (applied) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }

  function toggleRow(id: string, applied: boolean): void {
    setApplied([id], applied);
  }

  const allIds = candidates.map((candidate) => candidate.id);

  // Not armed yet = still inside the 5s delay (destructive scope only).
  const showHourglass = config.destructive && !armed && !applying && !completed;
  const applyDisabled =
    loading ||
    submitted ||
    applying ||
    completed ||
    (config.destructive && (!armed || selectedCount === 0 || limitReached));
  const applyLabel = applying
    ? translate("search.replace.preview.project.applying")
    : config.destructive
      ? translate("search.replace.preview.project.replaceLabel")
      : translate(config.applyButtonKey);
  // The short destructive label loses the "what does this do" context the
  // old long label carried - restore it as a tooltip instead (armed) or
  // explain the wait (not yet armed).
  const applyTitle = !config.destructive
    ? undefined
    : showHourglass
      ? translate("search.replace.preview.project.delayTooltip")
      : translate("search.replace.preview.applyAndSave");

  // While applying, no close affordance works: no Cancel/Close click, no
  // Escape. Once settled (applyResult arrives), Close is available again.
  const closeBlocked = applying;
  const handleRequestClose = (): void => {
    if (!closeBlocked) {
      onCancel();
    }
  };
  const secondaryIsClose = applying || completed;
  const secondaryLabel = secondaryIsClose
    ? translate("common.close")
    : translate("common.cancel");

  const hourglassIconStyle = {
    "--replace-preview-apply-icon": `url("${hourglassIconUrl}")`
  } as CSSProperties & { "--replace-preview-apply-icon": string };

  return (
    <InfoDialog
      title={translate(config.titleKey)}
      opener={opener}
      className={
        config.destructive
          ? "replacePreviewDialog appDialog-destructive"
          : "replacePreviewDialog"
      }
      onClose={handleRequestClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton"
            autoFocus={config.destructive && !completed}
            disabled={closeBlocked}
            aria-disabled={closeBlocked}
            onClick={handleRequestClose}
          >
            {secondaryLabel}
          </button>
          {loading || completed ? null : (
            <button
              type="button"
              className="appDialogButton appDialogButton-confirm"
              autoFocus={!config.destructive}
              disabled={applyDisabled}
              aria-disabled={applyDisabled}
              aria-busy={applying || undefined}
              title={applyTitle}
              aria-label={applyTitle}
              onClick={() => {
                if (submittedRef.current) {
                  return;
                }
                submittedRef.current = true;
                setSubmitted(true);
                onApplySelected(allIds.filter((id) => !ignoredIds.has(id)));
              }}
            >
              {showHourglass ? (
                <span
                  className="replacePreviewApplyIcon"
                  style={hourglassIconStyle}
                  aria-hidden="true"
                />
              ) : null}
              <span>{applyLabel}</span>
            </button>
          )}
        </div>
      }
    >
      <div className="replacePreviewContent">
        <p className="replacePreviewDescription">
          {translate(config.descriptionKey)}
        </p>
        {config.destructiveWarningKey && !applying && !completed ? (
          <p className="replacePreviewDestructiveWarning" role="alert">
            {translate(config.destructiveWarningKey)}
          </p>
        ) : null}
        {applyResult ? (
          <p
            className={`replacePreviewApplyResult replacePreviewApplyResult-${applyResult.kind}`}
            role="status"
          >
            {applyResult.kind === "success"
              ? translate("search.replace.project.savedSummary", {
                  replacementCount: applyResult.replacementCount,
                  fileCount: applyResult.fileCount
                })
              : applyResult.kind === "partialFailure"
                ? translate("search.replace.project.partialFailure.message", {
                    successFileCount: applyResult.successFileCount,
                    failureFileCount: applyResult.failureFileCount
                  })
                : translate(
                    applyResult.reason === "fileChanged"
                      ? "search.replace.project.fileChanged"
                      : "search.replace.project.allFailure.message"
                  )}
          </p>
        ) : null}

        <dl className="replacePreviewConditions">
          <div className="replacePreviewCondition">
            <dt className="replacePreviewConditionLabel">
              {translate("search.replace.preview.findLabel")}
            </dt>
            <dd
              className="replacePreviewConditionValue"
              title={findText.length > 0 ? findText : undefined}
            >
              {findText}
            </dd>
          </div>
          <div className="replacePreviewCondition">
            <dt className="replacePreviewConditionLabel">
              {translate("search.replace.preview.replaceLabel")}
            </dt>
            <dd
              className="replacePreviewConditionValue"
              title={replaceText.length > 0 ? replaceText : undefined}
            >
              {replaceText}
            </dd>
          </div>
          <div className="replacePreviewCondition">
            <dt className="replacePreviewConditionLabel">
              {translate("search.replace.preview.modeLabel")}
            </dt>
            <dd className="replacePreviewConditionValue replacePreviewConditionMode">
              {modeLabel}
            </dd>
          </div>
        </dl>

        {loading ? (
          <div
            className="replacePreviewLoading"
            role="status"
            aria-live="polite"
          >
            <p className="replacePreviewLoadingMessage">
              {translate("search.replace.preview.preparing")}
            </p>
            <div className="replacePreviewSkeletonList" aria-hidden="true">
              {[0, 1, 2].map((skeletonRow) => (
                <span
                  key={skeletonRow}
                  className="replacePreviewSkeletonRow"
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="replacePreviewSummary" role="status">
              {translate("search.replace.preview.summary", {
                candidateCount: totalCount,
                selectedCount,
                fileCount
              })}
            </p>

            {limitReached ? (
              <p className="replacePreviewLimitNotice" role="alert">
                {translate("search.replace.preview.limitReached")}
              </p>
            ) : null}

            {totalCount === 0 ? (
              <p className="replacePreviewEmpty">
                {translate(config.emptyKey)}
              </p>
            ) : (
              <>
                <div className="replacePreviewListHeader">
                  <div className="replacePreviewBulkActions">
                    <button
                      type="button"
                      className="replacePreviewBulkButton"
                      onClick={() => setApplied(allIds, true)}
                    >
                      {translate("search.replace.preview.applyAll", {
                        count: totalCount
                      })}
                    </button>
                    <button
                      type="button"
                      className="replacePreviewBulkButton"
                      onClick={() => setApplied(allIds, false)}
                    >
                      {translate("search.replace.preview.ignoreAll", {
                        count: totalCount
                      })}
                    </button>
                  </div>

                  {groups.length > 1 ? (
                    <div
                      className="replacePreviewGroupNav"
                      role="group"
                      aria-label={translate(
                        "search.replace.preview.groupNavLabel"
                      )}
                    >
                      <button
                        type="button"
                        className="replacePreviewGroupNavButton"
                        aria-label={translate(
                          "search.replace.preview.groupNavPrev"
                        )}
                        onClick={() => scrollToAdjacentGroup(-1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="replacePreviewGroupNavButton"
                        aria-label={translate(
                          "search.replace.preview.groupNavNext"
                        )}
                        onClick={() => scrollToAdjacentGroup(1)}
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                </div>

                <ul className="replacePreviewGroups">
                  {groups.map((group, groupIndex) => {
                    const groupIds = group.candidates.map(
                      (candidate) => candidate.id
                    );
                    const groupSelected = group.candidates.reduce(
                      (count, candidate) =>
                        ignoredIds.has(candidate.id) ? count : count + 1,
                      0
                    );

                    return (
                      <li
                        key={group.fileId}
                        className="replacePreviewGroup"
                        ref={(element) => {
                          groupRefs.current[groupIndex] = element;
                        }}
                      >
                        <div className="replacePreviewGroupHeader">
                          <span
                            className="replacePreviewGroupName"
                            title={group.filePath ?? group.fileLabel}
                          >
                            {group.fileLabel}
                          </span>
                          <span className="replacePreviewGroupActions">
                            <button
                              type="button"
                              className="replacePreviewGroupButton"
                              onClick={() => setApplied(groupIds, true)}
                            >
                              {translate(
                                "search.replace.preview.applyInFile",
                                { count: group.candidates.length }
                              )}
                            </button>
                            <button
                              type="button"
                              className="replacePreviewGroupButton"
                              onClick={() => setApplied(groupIds, false)}
                            >
                              {translate(
                                "search.replace.preview.ignoreInFile",
                                { count: group.candidates.length }
                              )}
                            </button>
                          </span>
                          <span className="replacePreviewGroupCount">
                            {translate("search.replace.preview.fileGroupCount", {
                              count: group.candidates.length
                            })}
                          </span>
                          <span className="replacePreviewGroupSelected">
                            {translate(
                              "search.replace.preview.fileGroupSelected",
                              { selectedCount: groupSelected }
                            )}
                          </span>
                        </div>
                        <ul className="replacePreviewRows">
                          {group.candidates.map((candidate) => (
                            <ReplacePreviewRow
                              key={candidate.id}
                              translate={translate}
                              candidate={candidate}
                              applied={isApplied(candidate.id)}
                              onToggle={toggleRow}
                            />
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </InfoDialog>
  );
}

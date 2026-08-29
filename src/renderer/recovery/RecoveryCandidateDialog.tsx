import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import type { Translate, TranslationKey } from "../../shared/i18n";
import type { RecoveryCandidate } from "../../shared/recoveryCandidate";
import checkSquareIconUrl from "../../../assets/icons/feather/dialog/check-square.svg?url";
import clipboardIconUrl from "../../../assets/icons/feather/dialog/clipboard.svg?url";
import xCircleIconUrl from "../../../assets/icons/feather/dialog/x-circle.svg?url";
import {
  performClipboardCopy,
  type ClipboardAdapter
} from "../dialog/clipboardAdapter";
import { InfoDialog } from "../dialog/InfoDialog";
import {
  recoveryUpdatedAtDisplayDate,
  isRecoverySortKey,
  nextRecoverySortState,
  pruneRecoverySelection,
  RECOVERY_INITIAL_SORT,
  recoveryHeaderCheckboxState,
  recoverySortIndicator,
  sortRecoveryCandidates,
  toggleRecoveryHeaderCheckbox,
  toggleRecoveryRowSelection,
  type RecoverySortKey,
  type RecoverySortState
} from "./recoveryCandidateListState";

export interface RecoveryCandidateDialogProps {
  candidates: readonly RecoveryCandidate[];
  translate: Translate;
  clipboardAdapter: ClipboardAdapter;
  opener: Element | null;
  onClose: () => void;
  /** Restore the given rows: parent writes `.recovered.md`, opens each,
   *  then finalizes (deletes) the rows it opened. */
  onRestoreSelected: (recoveryIds: readonly string[]) => Promise<void>;
  /** Fetch the body-free Recovery report text, or `null` on failure. */
  getReportText: () => Promise<string | null>;
  /** Called after the report is successfully copied. */
  onReportCopied?: (candidateCount: number) => void;
}

type CopyState = "idle" | "copied" | "failed";
const COPY_FEEDBACK_MS = 3000;

const SORTABLE_COLUMNS: readonly {
  key: RecoverySortKey;
  labelKey: TranslationKey;
}[] = [
  { key: "displayName", labelKey: "dialog.recovery.column.name" },
  { key: "updatedAt", labelKey: "dialog.recovery.column.updatedAt" },
  { key: "characterCount", labelKey: "dialog.recovery.column.characterCount" },
  { key: "documentType", labelKey: "dialog.recovery.column.documentType" }
];

function ariaSortFor(
  sort: RecoverySortState,
  key: RecoverySortKey
): "ascending" | "descending" | "none" {
  if (sort.key !== key) {
    return "none";
  }
  return sort.direction === "asc" ? "ascending" : "descending";
}

export function RecoveryCandidateDialog({
  candidates,
  translate,
  clipboardAdapter,
  opener,
  onClose,
  onRestoreSelected,
  getReportText,
  onReportCopied
}: RecoveryCandidateDialogProps): JSX.Element {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [sort, setSort] = useState<RecoverySortState>(RECOVERY_INITIAL_SORT);
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  const listedIds = useMemo(
    () => candidates.map((candidate) => candidate.recoveryId),
    [candidates]
  );
  const sortedCandidates = useMemo(
    () => sortRecoveryCandidates(candidates, sort),
    [candidates, sort]
  );

  // Keep the selection valid as the list shrinks (restore-finalize deletes
  // the rows it opened).
  useEffect(() => {
    setSelectedIds((current) => {
      const pruned = pruneRecoverySelection(current, listedIds);
      return pruned.size === current.size ? current : pruned;
    });
  }, [listedIds]);

  const headerState = recoveryHeaderCheckboxState(selectedIds, listedIds);
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate =
        headerState === "indeterminate";
    }
  }, [headerState]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    },
    []
  );

  // Restore is gated on an actual selection first — not merely on candidates
  // existing. Zero selected rows must disable the button whether or not any
  // candidates are present; `busy` disables it while a restore is in flight.
  const hasSelection = selectedIds.size > 0;
  const canRestore = !busy && hasSelection && candidates.length > 0;
  const restoreDisabled = !canRestore;

  function showCopyFeedback(next: Exclude<CopyState, "idle">): void {
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
    }
    setCopyState(next);
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopyState("idle");
    }, COPY_FEEDBACK_MS);
  }

  function handleHeaderCheckbox(): void {
    setSelectedIds((current) =>
      toggleRecoveryHeaderCheckbox(current, listedIds)
    );
  }

  function handleRowCheckbox(recoveryId: string): void {
    setSelectedIds((current) =>
      toggleRecoveryRowSelection(current, recoveryId)
    );
  }

  function handleSortHeader(key: string): void {
    if (!isRecoverySortKey(key)) {
      return;
    }
    setSort((current) => nextRecoverySortState(current, key));
  }

  async function handleRestore(): Promise<void> {
    // The primary guard is the selection itself: never restore with an empty
    // selection, even if the button's disabled state has regressed, and never
    // pass an empty id list downstream (which must not restore "everything").
    if (busy || selectedIds.size === 0 || candidates.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await onRestoreSelected([...selectedIds]);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyReport(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const text = await getReportText();
      if (text === null) {
        showCopyFeedback("failed");
        return;
      }
      const result = await performClipboardCopy(clipboardAdapter, text);
      showCopyFeedback(result.ok ? "copied" : "failed");
      if (result.ok) {
        onReportCopied?.(candidates.length);
      }
    } finally {
      setBusy(false);
    }
  }

  const copyFeedback =
    copyState === "copied"
      ? translate("dialog.recovery.reportCopied")
      : copyState === "failed"
        ? translate("dialog.recovery.reportCopyFailed")
        : null;
  const copyReportIconUrl =
    copyState === "copied"
      ? checkSquareIconUrl
      : copyState === "failed"
        ? xCircleIconUrl
        : clipboardIconUrl;
  const copyToastStyle = {
    "--about-dialog-copy-feedback-animation-ms": `${COPY_FEEDBACK_MS}ms`
  } as CSSProperties;

  return (
    <InfoDialog
      title={translate("dialog.recovery.title")}
      opener={opener}
      onClose={onClose}
      footer={
        <div className="aboutDialogFooterContent recoveryCandidateDialogFooterContent">
          <div className="aboutDialogTechnicalInfoControl">
            <button
              type="button"
              className="appDialogButton aboutDialogCopyTechnicalButton recoveryCandidateDialogReportButton"
              aria-label={translate("dialog.recovery.copyReport")}
              title={translate("dialog.recovery.copyReport")}
              disabled={busy}
              onClick={() => {
                void handleCopyReport();
              }}
            >
              <img
                className="aboutDialogCopyTechnicalIcon"
                src={copyReportIconUrl}
                alt=""
                aria-hidden="true"
              />
            </button>
            {copyFeedback ? (
              <span
                className={`aboutDialogCopyToast aboutDialogCopyToast-${copyState}`}
                role="status"
                aria-live="polite"
                style={copyToastStyle}
              >
                {copyFeedback}
              </span>
            ) : null}
          </div>
          <div className="appDialogActions recoveryCandidateDialogActions">
            <button
              type="button"
              className="appDialogButton appDialogButton-confirm"
              disabled={restoreDisabled}
              onClick={() => {
                void handleRestore();
              }}
            >
              {translate("dialog.recovery.restoreSelected")}
            </button>
            <button
              type="button"
              className="appDialogButton"
              autoFocus
              onClick={onClose}
            >
              {translate("common.close")}
            </button>
          </div>
        </div>
      }
    >
      <div className="recoveryCandidateDialogContent">
        <p className="recoveryCandidateDialogExplain">
          {translate("dialog.recovery.explainRestore")}
        </p>

        {candidates.length === 0 ? (
          <p className="recoveryCandidateDialogEmpty">
            {translate("dialog.recovery.emptyState")}
          </p>
        ) : (
          <div className="recoveryCandidateDialogTableWrap">
            <table className="recoveryCandidateDialogTable" role="grid">
              <thead>
                <tr>
                  <th scope="col" className="recoveryCandidateDialogCheckboxCol">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      aria-label={translate("dialog.recovery.selectAll")}
                      checked={headerState === "checked"}
                      onChange={handleHeaderCheckbox}
                    />
                  </th>
                  {SORTABLE_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={ariaSortFor(sort, column.key)}
                    >
                      <button
                        type="button"
                        className="recoveryCandidateDialogSortButton"
                        onClick={() => handleSortHeader(column.key)}
                      >
                        <span>{translate(column.labelKey)}</span>
                        <span
                          className="recoveryCandidateDialogSortIndicator"
                          aria-hidden="true"
                        >
                          {recoverySortIndicator(sort, column.key) ?? ""}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col">
                    {translate("dialog.recovery.column.preview")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedCandidates.map((candidate) => (
                  <tr key={candidate.recoveryId}>
                    <td className="recoveryCandidateDialogCheckboxCol">
                      <input
                        type="checkbox"
                        aria-label={candidate.displayName}
                        checked={selectedIds.has(candidate.recoveryId)}
                        onChange={() =>
                          handleRowCheckbox(candidate.recoveryId)
                        }
                      />
                    </td>
                    <td>{candidate.displayName}</td>
                    <td>{recoveryUpdatedAtDisplayDate(candidate.updatedAt)}</td>
                    <td className="recoveryCandidateDialogNumber">
                      {candidate.characterCount}
                    </td>
                    <td>
                      {translate(
                        candidate.documentType === "markdown.untitled"
                          ? "dialog.recovery.type.untitled"
                          : "dialog.recovery.type.file"
                      )}
                    </td>
                    <td className="recoveryCandidateDialogPreview">
                      {candidate.previewSnippet.length > 0
                        ? candidate.previewSnippet
                        : translate("dialog.recovery.previewEmpty")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </InfoDialog>
  );
}

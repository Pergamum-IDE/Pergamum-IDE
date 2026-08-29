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
import hourglassIconUrl from "../../../assets/icons/ionicons/dialog/hourglass-outline.svg?url";
import trashBinIconUrl from "../../../assets/icons/ionicons/dialog/trash-bin-outline.svg?url";
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
  trapFocus?: boolean;
  onClose: () => void;
  /** Restore the given rows: parent writes `.recovered.md`, opens each,
   *  then finalizes (deletes) the rows it opened. */
  onRestoreSelected: (recoveryIds: readonly string[]) => Promise<void>;
  /** Discard selected rows after parent-side destructive confirmation. */
  onDiscardSelected: (recoveryIds: readonly string[]) => Promise<void>;
  /** Discard all listed rows after parent-side destructive confirmation. */
  onDiscardAll: (recoveryIds: readonly string[]) => Promise<void>;
  /** Fetch the body-free Recovery report text, or `null` on failure. */
  getReportText: () => Promise<string | null>;
  /** Called after the report is successfully copied. */
  onReportCopied?: (candidateCount: number) => void;
}

type CopyState = "idle" | "copied" | "failed";
const COPY_FEEDBACK_MS = 3000;

/**
 * #300: an explicit discard is destructive and irreversible, so its button
 * can't be pressed the instant it becomes relevant. It "arms" only after
 * this delay, during which an hourglass icon is shown on the button's
 * leading edge. The timer restarts whenever the thing being discarded changes
 * (the selection for "discard selected"; the candidate set for
 * "discard all"). The confirmation dialog still runs afterwards — this
 * delay is friction, not a replacement for it.
 */
const DISCARD_ARM_DELAY_MS = 5000;

type DiscardButtonIconState = "pending" | "ready";
type DiscardButtonIconStyle = CSSProperties & {
  "--recovery-discard-button-icon": string;
};

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

function discardButtonIconState(
  hasTarget: boolean,
  armed: boolean
): DiscardButtonIconState | null {
  if (!hasTarget) {
    return null;
  }
  return armed ? "ready" : "pending";
}

function discardButtonIconStyle(
  state: DiscardButtonIconState
): DiscardButtonIconStyle {
  const iconUrl = state === "ready" ? trashBinIconUrl : hourglassIconUrl;
  return {
    "--recovery-discard-button-icon": `url("${iconUrl}")`
  };
}

function recoveryCandidateRowClassName(selected: boolean): string {
  return selected
    ? "recoveryCandidateDialogRow recoveryCandidateDialogRow-selected"
    : "recoveryCandidateDialogRow";
}

function recoveryDiscardButtonClassName(hasIcon: boolean): string {
  return hasIcon
    ? "appDialogButton appDialogButton-choice-destructive recoveryDiscardButton recoveryDiscardButton-hasIcon"
    : "appDialogButton appDialogButton-choice-destructive recoveryDiscardButton";
}

export function RecoveryCandidateDialog({
  candidates,
  translate,
  clipboardAdapter,
  opener,
  trapFocus = true,
  onClose,
  onRestoreSelected,
  onDiscardSelected,
  onDiscardAll,
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

  // #300: per-button "armed after the destructive delay" keys. Storing the
  // armed target key prevents a just-changed selection/candidate set from
  // rendering as ready for even one frame.
  const [discardSelectedArmedKey, setDiscardSelectedArmedKey] = useState<
    string | null
  >(null);
  const [discardAllArmedKey, setDiscardAllArmedKey] = useState<string | null>(
    null
  );
  const selectedDiscardKey = useMemo(
    () =>
      listedIds
        .filter((recoveryId) => selectedIds.has(recoveryId))
        .sort()
        .join("\u001f"),
    [listedIds, selectedIds]
  );
  useEffect(() => {
    setDiscardSelectedArmedKey(null);
    if (selectedDiscardKey.length === 0) {
      return;
    }
    const timer = setTimeout(
      () => setDiscardSelectedArmedKey(selectedDiscardKey),
      DISCARD_ARM_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [selectedDiscardKey]);

  const candidateSetKey = useMemo(
    () =>
      candidates
        .map(
          (candidate) =>
            `${candidate.recoveryId}\u001f${candidate.updatedAt}\u001f${candidate.characterCount}`
        )
        .sort()
        .join("\u001e"),
    [candidates]
  );
  useEffect(() => {
    setDiscardAllArmedKey(null);
    if (candidateSetKey.length === 0) {
      return;
    }
    const timer = setTimeout(
      () => setDiscardAllArmedKey(candidateSetKey),
      DISCARD_ARM_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [candidateSetKey]);
  const discardSelectedArmed =
    selectedDiscardKey.length > 0 &&
    discardSelectedArmedKey === selectedDiscardKey;
  const discardAllArmed =
    candidateSetKey.length > 0 && discardAllArmedKey === candidateSetKey;

  // Restore is gated on an actual selection first — not merely on candidates
  // existing. Zero selected rows must disable the button whether or not any
  // candidates are present; `busy` disables it while a restore is in flight.
  const hasSelection = selectedIds.size > 0;
  const canRestore = !busy && hasSelection && candidates.length > 0;
  const canDiscardSelected =
    !busy && hasSelection && candidates.length > 0 && discardSelectedArmed;
  const canDiscardAll = !busy && candidates.length > 0 && discardAllArmed;
  const restoreDisabled = !canRestore;
  const discardSelectedDisabled = !canDiscardSelected;
  const discardAllDisabled = !canDiscardAll;
  const discardSelectedIconState = discardButtonIconState(
    hasSelection && candidates.length > 0,
    discardSelectedArmed
  );
  const discardAllIconState = discardButtonIconState(
    candidates.length > 0,
    discardAllArmed
  );

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

  async function handleDiscardSelected(): Promise<void> {
    // The armed flag is the primary guard: never discard before the
    // destructive delay has elapsed, even if the disabled state regressed.
    if (
      busy ||
      selectedIds.size === 0 ||
      candidates.length === 0 ||
      !discardSelectedArmed
    ) {
      return;
    }

    setBusy(true);
    try {
      await onDiscardSelected([...selectedIds]);
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscardAll(): Promise<void> {
    if (busy || candidates.length === 0 || !discardAllArmed) {
      return;
    }

    setBusy(true);
    try {
      await onDiscardAll(listedIds);
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
  const closeButtonLabel =
    candidates.length > 0
      ? translate("dialog.recovery.decideLater")
      : translate("common.close");

  return (
    <InfoDialog
      title={translate("dialog.recovery.title")}
      opener={opener}
      onClose={onClose}
      trapFocus={trapFocus}
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
              className={recoveryDiscardButtonClassName(
                discardSelectedIconState !== null
              )}
              disabled={discardSelectedDisabled}
              onClick={() => {
                void handleDiscardSelected();
              }}
            >
              {discardSelectedIconState !== null ? (
                <span
                  className="recoveryDiscardButtonIcon"
                  style={discardButtonIconStyle(discardSelectedIconState)}
                  aria-hidden="true"
                />
              ) : null}
              <span>{translate("dialog.recovery.discardSelected")}</span>
            </button>
            <button
              type="button"
              className={recoveryDiscardButtonClassName(
                discardAllIconState !== null
              )}
              disabled={discardAllDisabled}
              onClick={() => {
                void handleDiscardAll();
              }}
            >
              {discardAllIconState !== null ? (
                <span
                  className="recoveryDiscardButtonIcon"
                  style={discardButtonIconStyle(discardAllIconState)}
                  aria-hidden="true"
                />
              ) : null}
              <span>{translate("dialog.recovery.discardAll")}</span>
            </button>
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
              {closeButtonLabel}
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
                {sortedCandidates.map((candidate) => {
                  const selected = selectedIds.has(candidate.recoveryId);
                  return (
                    <tr
                      key={candidate.recoveryId}
                      className={recoveryCandidateRowClassName(selected)}
                      aria-selected={selected}
                      onClick={() => handleRowCheckbox(candidate.recoveryId)}
                    >
                      <td className="recoveryCandidateDialogCheckboxCol">
                        <input
                          type="checkbox"
                          aria-label={candidate.displayName}
                          checked={selected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() =>
                            handleRowCheckbox(candidate.recoveryId)
                          }
                        />
                      </td>
                      <td>{candidate.displayName}</td>
                      <td>
                        {recoveryUpdatedAtDisplayDate(candidate.updatedAt)}
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </InfoDialog>
  );
}

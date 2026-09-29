import { useCallback, useEffect, useRef, useState } from "react";
import type { PergamumApi } from "../../shared/api";
import {
  formatLocalizedNumber,
  type Language,
  type Translate,
  type TranslationKey
} from "../../shared/i18n";
import { JAPANESE_LINT_MAX_RESULT_COUNT } from "../../shared/japaneseLint";
import {
  japaneseLintRuleResultLabelKey,
  japaneseLintRuleCatalog
} from "../../shared/japaneseLintRules";
import type {
  JapaneseMachineCheckFailureReason,
  JapaneseMachineCheckPrepareResult,
  JapaneseMachineCheckProgressStage,
  JapaneseMachineCheckSummary
} from "../../shared/japaneseMachineCheck";
import type { AppPlatform } from "../../shared/platform";
import { getDialogActionOrder } from "./appDialogTypes";
import { InfoDialog } from "./InfoDialog";

/**
 * #625 P2a: the "日本語表現チェック" wizard. Three screens - estimate, running,
 * summary - in one modal. It only ever handles counts and the file's display
 * name; the check itself runs in the Main Process's own Worker (see
 * main/japaneseMachineCheckIpc.ts), and only the saved file content is read.
 */

export type JapaneseMachineCheckBridge = PergamumApi["japaneseMachineCheck"];

export interface JapaneseMachineCheckDialogProps {
  /** Project-relative path of the File Explorer file. */
  readonly relativePath: string;
  /** The file has unsaved changes in an editor (the check ignores them). */
  readonly isDirty: boolean;
  readonly translate: Translate;
  readonly uiLanguage?: Language;
  readonly platform?: AppPlatform;
  readonly opener?: Element | null;
  readonly onClose: () => void;
  /** Defaults to `window.pergamum.japaneseMachineCheck`. */
  readonly bridge?: JapaneseMachineCheckBridge;
}

type Screen =
  | { readonly kind: "loading" }
  | {
      readonly kind: "estimate";
      readonly prepared: Extract<JapaneseMachineCheckPrepareResult, { ok: true }>;
    }
  | {
      readonly kind: "running";
      readonly stage: JapaneseMachineCheckProgressStage;
      readonly canceling: boolean;
    }
  | { readonly kind: "summary"; readonly summary: JapaneseMachineCheckSummary }
  | { readonly kind: "error"; readonly reason: JapaneseMachineCheckFailureReason };

const RUNNING_STAGE_KEY: Readonly<
  Record<JapaneseMachineCheckProgressStage, TranslationKey>
> = {
  starting: "japaneseMachineCheck.running.starting",
  "dictionary-check": "japaneseMachineCheck.running.dictionary",
  "lint-running": "japaneseMachineCheck.running.lint",
  aggregating: "japaneseMachineCheck.running.aggregating"
};

function errorKeyFor(
  reason: JapaneseMachineCheckFailureReason
): TranslationKey {
  switch (reason) {
    case "read-failed":
      return "japaneseMachineCheck.error.readFailed";
    case "no-project":
      return "japaneseMachineCheck.error.noProject";
    case "unsupported-file":
      return "japaneseMachineCheck.error.unsupported";
    case "busy":
      return "japaneseMachineCheck.error.busy";
    default:
      return "japaneseMachineCheck.error.generic";
  }
}

/** mm:ss (minutes keep counting past 59, e.g. 75:03). */
export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function baseName(relativePath: string): string {
  const parts = relativePath.split(/[\\/]/);

  return parts[parts.length - 1] ?? relativePath;
}

export function JapaneseMachineCheckDialog({
  relativePath,
  isDirty,
  translate,
  uiLanguage,
  platform,
  opener = null,
  onClose,
  bridge
}: JapaneseMachineCheckDialogProps): JSX.Element {
  const api: JapaneseMachineCheckBridge =
    bridge ?? window.pergamum.japaneseMachineCheck;
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;
  // A run that was canceled (or whose dialog closed) never becomes a summary,
  // even when its answer still arrives.
  const runTokenRef = useRef(0);
  // #625 P2c: names this dialog's run so that progress and cancel are matched
  // to it (a late event of another run is ignored / cannot cancel this one).
  const runIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // #625 P2b: the Markdown report save. Main owns the findings and the text;
  // only the result id travels.
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "canceled" | "failed"
  >("idle");
  const resultIdRef = useRef<string | null>(null);
  const fileName = baseName(relativePath);
  const format = (value: number): string =>
    formatLocalizedNumber(value, uiLanguage);

  useEffect(() => {
    mountedRef.current = true;

    let alive = true;

    void api
      .prepare({ relativePath, isDirty })
      .then((prepared) => {
        if (!alive) {
          return;
        }

        setScreen(
          prepared.ok
            ? { kind: "estimate", prepared }
            : { kind: "error", reason: prepared.reason }
        );
      })
      .catch(() => {
        if (alive) {
          setScreen({ kind: "error", reason: "read-failed" });
        }
      });

    return () => {
      alive = false;
      mountedRef.current = false;

      // Closing while a run is in flight stops it.
      if (screenRef.current.kind === "running") {
        runTokenRef.current += 1;
        void api
          .cancel(
            runIdRef.current !== null ? { runId: runIdRef.current } : undefined
          )
          .catch(() => undefined);
      }

      // Main may forget the finished run's findings and text.
      if (resultIdRef.current !== null) {
        void api
          .discardResult({ resultId: resultIdRef.current })
          .catch(() => undefined);
        resultIdRef.current = null;
      }
    };
    // The target is fixed for the dialog's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen.kind !== "running") {
      return undefined;
    }

    return api.onProgress((progress) => {
      // Only this dialog's own run: a stale run's stages are ignored.
      if (progress.runId !== runIdRef.current) {
        return;
      }

      setScreen((current) =>
        current.kind === "running" && !current.canceling
          ? { ...current, stage: progress.stage }
          : current
      );
    });
  }, [api, screen.kind]);

  // Elapsed time is the feedback of a long run (no fake progress bar).
  const isRunning = screen.kind === "running";

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    const startedAt = Date.now();

    setElapsedSeconds(0);

    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);

    return () => clearInterval(timer);
  }, [isRunning]);

  const startRun = useCallback(() => {
    const token = ++runTokenRef.current;
    const runId = `run-${Date.now().toString(36)}-${token}-${Math.floor(
      Math.random() * 1e9
    ).toString(36)}`;

    runIdRef.current = runId;
    setScreen({ kind: "running", stage: "starting", canceling: false });
    void api
      .run({ relativePath, runId })
      .then((result) => {
        if (token !== runTokenRef.current || !mountedRef.current) {
          return;
        }

        if (result.ok) {
          resultIdRef.current = result.summary.resultId;
          setSaveState("idle");
          setScreen({ kind: "summary", summary: result.summary });
        } else if (result.reason === "canceled") {
          onClose();
        } else {
          setScreen({ kind: "error", reason: result.reason });
        }
      })
      .catch(() => {
        if (token === runTokenRef.current && mountedRef.current) {
          setScreen({ kind: "error", reason: "worker-failed" });
        }
      });
  }, [api, onClose, relativePath]);

  const cancelRun = useCallback(() => {
    if (screenRef.current.kind !== "running") {
      return;
    }

    // Nothing the run sends from here on is adopted.
    runTokenRef.current += 1;
    setScreen({ kind: "running", stage: "starting", canceling: true });
    void api
      .cancel(
        runIdRef.current !== null ? { runId: runIdRef.current } : undefined
      )
      .catch(() => undefined)
      .finally(() => {
        if (mountedRef.current) {
          onClose();
        }
      });
  }, [api, onClose]);

  // Escape / backdrop / the Cancel button all mean "stop" while running.
  const requestClose = useCallback(() => {
    if (screenRef.current.kind === "running") {
      cancelRun();
    } else {
      onClose();
    }
  }, [cancelRun, onClose]);

  const resolvedPlatform: AppPlatform =
    platform ??
    (typeof window !== "undefined" && window.pergamum?.platform
      ? window.pergamum.platform
      : "windows");
  const actionOrder = getDialogActionOrder(resolvedPlatform);

  function arrange(
    confirm: JSX.Element | null,
    cancel: JSX.Element | null
  ): JSX.Element {
    const buttons =
      actionOrder === "confirmCancel" ? [confirm, cancel] : [cancel, confirm];

    return <div className="appDialogActions">{buttons}</div>;
  }

  const cancelButton = (
    <button
      key="cancel"
      type="button"
      className="appDialogButton appDialogButton-cancel"
      onClick={requestClose}
    >
      {translate("japaneseMachineCheck.button.cancel")}
    </button>
  );
  const saveReport = useCallback(() => {
    const resultId = resultIdRef.current;

    if (resultId === null || saveState === "saving") {
      return;
    }

    setSaveState("saving");
    void api
      .saveReport({ resultId })
      .then((result) => {
        if (!mountedRef.current) {
          return;
        }

        setSaveState(
          result.ok
            ? "saved"
            : result.reason === "canceled"
              ? "canceled"
              : "failed"
        );
      })
      .catch(() => {
        if (mountedRef.current) {
          setSaveState("failed");
        }
      });
  }, [api, saveState]);

  const closeButton = (
    <button
      key="close"
      type="button"
      className="appDialogButton appDialogButton-confirm"
      autoFocus
      onClick={onClose}
    >
      {translate("japaneseMachineCheck.button.close")}
    </button>
  );

  let body: JSX.Element;
  let footer: JSX.Element;

  if (screen.kind === "estimate") {
    const { prepared } = screen;
    const noRules = prepared.enabledRuleIds.length === 0;
    const estimateKey: TranslationKey =
      prepared.estimate === "short"
        ? "japaneseMachineCheck.estimate.short"
        : prepared.estimate === "medium"
          ? "japaneseMachineCheck.estimate.medium"
          : "japaneseMachineCheck.estimate.long";

    body = (
      <div className="japaneseMachineCheckBody">
        <dl className="japaneseMachineCheckFacts">
          <dt>{translate("japaneseMachineCheck.estimate.file")}</dt>
          <dd>{prepared.fileName}</dd>
          <dt>{translate("japaneseMachineCheck.estimate.type")}</dt>
          <dd>
            {translate(
              prepared.format === "markdown"
                ? "japaneseMachineCheck.type.markdown"
                : "japaneseMachineCheck.type.text"
            )}{" "}
            ({prepared.ext})
          </dd>
          <dt>{translate("japaneseMachineCheck.estimate.chars")}</dt>
          <dd>{format(prepared.sourceChars)}</dd>
          <dt>{translate("japaneseMachineCheck.estimate.lines")}</dt>
          <dd>{format(prepared.sourceLines)}</dd>
          <dt>{translate("japaneseMachineCheck.estimate.rules")}</dt>
          <dd>
            {translate("japaneseMachineCheck.estimate.ruleCount", {
              count: format(prepared.enabledRuleIds.length)
            })}
          </dd>
        </dl>
        <p
          className="japaneseMachineCheckEstimate"
          data-japanese-machine-check="estimate-text"
        >
          <strong>{translate("japaneseMachineCheck.estimate.time")}: </strong>
          {translate(estimateKey)}
        </p>
        {noRules ? (
          <p
            className="japaneseMachineCheckNotice"
            role="alert"
            data-japanese-machine-check="no-rules"
          >
            {translate("japaneseMachineCheck.estimate.noRules")}
          </p>
        ) : null}
        {prepared.isDirty ? (
          <p
            className="japaneseMachineCheckNotice"
            role="note"
            data-japanese-machine-check="dirty-warning"
          >
            {translate("japaneseMachineCheck.estimate.dirty")}
          </p>
        ) : null}
      </div>
    );
    footer = arrange(
      <button
        key="run"
        type="button"
        className="appDialogButton appDialogButton-confirm"
        autoFocus={!noRules}
        disabled={noRules}
        data-japanese-machine-check="run"
        onClick={startRun}
      >
        {translate("japaneseMachineCheck.button.run")}
      </button>,
      cancelButton
    );
  } else if (screen.kind === "running") {
    body = (
      <div className="japaneseMachineCheckBody">
        <p className="japaneseMachineCheckFile">{fileName}</p>
        <p className="japaneseMachineCheckRunningTitle">
          {translate("japaneseMachineCheck.running.title")}
        </p>
        <p
          className="japaneseMachineCheckElapsed"
          data-japanese-machine-check="elapsed"
        >
          {translate("japaneseMachineCheck.running.elapsed", {
            time: formatElapsed(elapsedSeconds)
          })}
        </p>
        <p
          className="japaneseMachineCheckStatus"
          role="status"
          data-japanese-machine-check="status"
        >
          {screen.canceling
            ? translate("japaneseMachineCheck.running.canceling")
            : translate(RUNNING_STAGE_KEY[screen.stage])}
        </p>
        <p
          className="japaneseMachineCheckRunningNote"
          data-japanese-machine-check="running-note"
        >
          {translate("japaneseMachineCheck.running.note")}
        </p>
      </div>
    );
    footer = arrange(
      null,
      <button
        key="cancel"
        type="button"
        className="appDialogButton appDialogButton-cancel"
        autoFocus
        disabled={screen.canceling}
        data-japanese-machine-check="cancel"
        onClick={cancelRun}
      >
        {translate("japaneseMachineCheck.button.cancel")}
      </button>
    );
  } else if (screen.kind === "summary") {
    const { summary } = screen;
    const label = (ruleId: string): string => {
      try {
        return translate(japaneseLintRuleResultLabelKey(ruleId as never) as never);
      } catch {
        return ruleId;
      }
    };

    body = (
      <div className="japaneseMachineCheckBody">
        <dl className="japaneseMachineCheckFacts">
          <dt>{translate("japaneseMachineCheck.estimate.file")}</dt>
          <dd>{summary.fileName}</dd>
          <dt>{translate("japaneseMachineCheck.summary.total")}</dt>
          <dd data-japanese-machine-check="total">
            {format(summary.totalMessages)}
          </dd>
          <dt>{translate("japaneseMachineCheck.summary.returned")}</dt>
          <dd data-japanese-machine-check="returned">
            {format(summary.returnedMessages)}
          </dd>
        </dl>
        {summary.truncated ? (
          <p
            className="japaneseMachineCheckNotice"
            role="note"
            data-japanese-machine-check="truncated"
          >
            {translate("japaneseMachineCheck.summary.truncated", {
              max: format(JAPANESE_LINT_MAX_RESULT_COUNT)
            })}
          </p>
        ) : null}
        {summary.ruleCounts.length === 0 ? (
          <p data-japanese-machine-check="none">
            {translate("japaneseMachineCheck.summary.none")}
          </p>
        ) : (
          <table
            className="japaneseMachineCheckTable"
            data-japanese-machine-check="rule-table"
          >
            <thead>
              <tr>
                <th scope="col">
                  {translate("japaneseMachineCheck.summary.table.rule")}
                </th>
                <th scope="col" className="japaneseMachineCheckCount">
                  {translate("japaneseMachineCheck.summary.table.count")}
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.ruleCounts.map((entry) => (
                <tr key={entry.ruleId} data-rule-id={entry.ruleId}>
                  <td>{label(entry.ruleId)}</td>
                  <td className="japaneseMachineCheckCount">
                    {format(entry.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {summary.ruleCounts.length > 0 &&
        japaneseLintRuleCatalog.length > summary.ruleCounts.length ? (
          <p className="japaneseMachineCheckMuted">
            {translate("japaneseMachineCheck.summary.zeroRules", {
              count: format(
                japaneseLintRuleCatalog.length - summary.ruleCounts.length
              )
            })}
          </p>
        ) : null}
        {saveState !== "idle" ? (
          <p
            className="japaneseMachineCheckReportStatus"
            role={saveState === "failed" ? "alert" : "status"}
            data-japanese-machine-check="report-status"
            data-report-state={saveState}
          >
            {translate(
              saveState === "saving"
                ? "japaneseMachineCheck.report.saving"
                : saveState === "saved"
                  ? "japaneseMachineCheck.report.saved"
                  : saveState === "canceled"
                    ? "japaneseMachineCheck.report.canceled"
                    : "japaneseMachineCheck.report.failed"
            )}
          </p>
        ) : null}
      </div>
    );
    // Close is the primary action; saving keeps the dialog open.
    footer = arrange(
      closeButton,
      <button
        key="save"
        type="button"
        className="appDialogButton appDialogButton-cancel"
        disabled={saveState === "saving"}
        data-japanese-machine-check="save-report"
        onClick={saveReport}
      >
        {translate("japaneseMachineCheck.report.button")}
      </button>
    );
  } else if (screen.kind === "error") {
    body = (
      <div className="japaneseMachineCheckBody">
        <p role="alert" data-japanese-machine-check="error">
          {translate(errorKeyFor(screen.reason))}
        </p>
      </div>
    );
    footer = arrange(closeButton, null);
  } else {
    body = (
      <div className="japaneseMachineCheckBody">
        <p role="status">{translate("japaneseMachineCheck.loading")}</p>
      </div>
    );
    footer = arrange(null, cancelButton);
  }

  return (
    <InfoDialog
      title={translate("japaneseMachineCheck.title")}
      opener={opener}
      className="japaneseMachineCheckDialog"
      onClose={requestClose}
      footer={footer}
    >
      {body}
    </InfoDialog>
  );
}

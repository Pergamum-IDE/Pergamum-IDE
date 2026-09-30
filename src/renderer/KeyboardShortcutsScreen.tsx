import { useEffect, useMemo, useState } from "react";
import type { GetKeyboardShortcutItemsResult } from "../shared/api";
import type { Translate } from "../shared/i18n";
import type { KeyboardShortcutRow } from "../shared/keybindings";
import shieldIcon from "../../assets/icons/feather/global/shield.svg?raw";
import { filterKeyboardShortcutRows } from "./keyboardShortcutSearch";

/**
 * #646: Keyboard Shortcuts UI v1 - a VIEW-ONLY list of the shortcuts in effect.
 *
 * No key capture, editing, deleting, resetting, conflict resolution or JSON
 * editor: changes are made in keybindings.json and apply after a restart. The
 * data (rows, key labels, diagnostics) is prepared by the main process from the
 * shared catalog; this component only filters and displays it, and never shows
 * a file path or document text.
 */

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly data: GetKeyboardShortcutItemsResult };

export interface KeyboardShortcutsScreenProps {
  readonly translate: Translate;
}

export function KeyboardShortcutsScreen({
  translate
}: KeyboardShortcutsScreenProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [openLocationFailed, setOpenLocationFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await window.pergamum.keybindings.getKeyboardShortcutItems();
        if (!cancelled) {
          setState({ kind: "ready", data });
        }
      } catch {
        if (!cancelled) {
          setState({ kind: "failed" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceLabel = (source: KeyboardShortcutRow["source"]): string =>
    translate(`keyboardShortcuts.source.${source}`);

  const rows = state.kind === "ready" ? state.data.items : [];
  const visibleRows = useMemo(
    () => filterKeyboardShortcutRows(rows, query, sourceLabel),
    // `sourceLabel` only depends on `translate`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, translate]
  );

  async function handleOpenLocation(): Promise<void> {
    setOpenLocationFailed(false);
    try {
      const result = await window.pergamum.keybindings.openKeybindingsJsonLocation();
      if (!result.ok) {
        setOpenLocationFailed(true);
      }
    } catch {
      setOpenLocationFailed(true);
    }
  }

  const diagnostics = state.kind === "ready" ? state.data.diagnostics : [];
  const hasDiagnosticError = diagnostics.some(
    (diagnostic) => diagnostic.severity === "error"
  );

  return (
    <section
      className="keyboardShortcutsTab"
      aria-labelledby="keyboardShortcutsTitle"
    >
      <header className="keyboardShortcutsHeader">
        <h2 id="keyboardShortcutsTitle" className="keyboardShortcutsTitle">
          {translate("keyboardShortcuts.title")}
        </h2>
        <p className="keyboardShortcutsDescription">
          {translate("keyboardShortcuts.description")}
        </p>
      </header>

      <div className="keyboardShortcutsToolbar">
        <label className="srOnly" htmlFor="keyboardShortcutsSearch">
          {translate("keyboardShortcuts.search.label")}
        </label>
        <input
          id="keyboardShortcutsSearch"
          className="keyboardShortcutsSearch"
          type="search"
          value={query}
          placeholder={translate("keyboardShortcuts.search.placeholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="keyboardShortcutsOpenLocation"
          onClick={() => {
            void handleOpenLocation();
          }}
        >
          {translate("keyboardShortcuts.openLocation")}
        </button>
      </div>

      {openLocationFailed ? (
        <p className="keyboardShortcutsError" role="alert">
          {translate("keyboardShortcuts.openLocation.failed")}
        </p>
      ) : null}

      {diagnostics.length > 0 ? (
        <section
          className={
            hasDiagnosticError
              ? "keyboardShortcutsDiagnostics keyboardShortcutsDiagnostics-error"
              : "keyboardShortcutsDiagnostics keyboardShortcutsDiagnostics-warning"
          }
          role={hasDiagnosticError ? "alert" : "status"}
        >
          <p className="keyboardShortcutsDiagnosticsSummary">
            {translate("keyboardShortcuts.diagnostics.summary", {
              count: diagnostics.length
            })}
          </p>
          <ul className="keyboardShortcutsDiagnosticsList">
            {diagnostics.map((diagnostic, position) => (
              <li
                key={`${position}:${diagnostic.code}`}
                className="keyboardShortcutsDiagnostic"
              >
                <span
                  className={`keyboardShortcutsDiagnosticSeverity keyboardShortcutsDiagnosticSeverity-${diagnostic.severity}`}
                >
                  {translate(
                    `keyboardShortcuts.diagnostics.severity.${diagnostic.severity}`
                  )}
                </span>{" "}
                <span className="keyboardShortcutsDiagnosticMessage">
                  {diagnostic.message}
                </span>
                {diagnostic.command !== undefined ? (
                  <code className="keyboardShortcutsDiagnosticCommand">
                    {diagnostic.command}
                  </code>
                ) : null}
                {diagnostic.key !== undefined ? (
                  <code className="keyboardShortcutsDiagnosticKey">
                    {diagnostic.key}
                  </code>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="keyboardShortcutsRestartNote">
        {translate("keyboardShortcuts.restartNote")}
      </p>

      {state.kind === "loading" ? (
        <p className="keyboardShortcutsStatus" role="status">
          {translate("keyboardShortcuts.loading")}
        </p>
      ) : state.kind === "failed" ? (
        <p className="keyboardShortcutsError" role="alert">
          {translate("keyboardShortcuts.loadFailed")}
        </p>
      ) : visibleRows.length === 0 ? (
        <p className="keyboardShortcutsStatus" role="status">
          {translate("keyboardShortcuts.empty")}
        </p>
      ) : (
        <>
          <p className="keyboardShortcutsStatus" role="status">
            {translate("keyboardShortcuts.count", { count: visibleRows.length })}
          </p>
          <ul className="keyboardShortcutsList">
            {visibleRows.map((row, position) => (
              <li
                key={`${row.commandId}:${row.key ?? "unassigned"}:${position}`}
                className="keyboardShortcutRow"
                data-readonly={row.readonly ? "true" : "false"}
                tabIndex={0}
              >
                <div className="keyboardShortcutRowMain">
                  <span className="keyboardShortcutTitle">{row.title}</span>
                  <span className="keyboardShortcutRowBadges">
                    {row.readonly ? (
                      <span
                        className="keyboardShortcutReadonly"
                        title={translate("keyboardShortcuts.readonly.tooltip")}
                      >
                        <span
                          className="keyboardShortcutReadonlyIcon"
                          aria-hidden="true"
                          dangerouslySetInnerHTML={{ __html: shieldIcon }}
                        />
                        {translate("keyboardShortcuts.readonly")}
                      </span>
                    ) : null}
                    {row.keyLabel !== null ? (
                      <kbd className="keyboardShortcutKey" title={row.key ?? undefined}>
                        {row.keyLabel}
                      </kbd>
                    ) : (
                      <span className="keyboardShortcutUnassigned">
                        {translate("keyboardShortcuts.unassigned")}
                      </span>
                    )}
                  </span>
                </div>
                <div className="keyboardShortcutRowMeta">
                  <code className="keyboardShortcutCommandId">{row.commandId}</code>
                  <span className="keyboardShortcutCategory">{row.category}</span>
                  <span className="keyboardShortcutScope">{row.scope}</span>
                  <span className="keyboardShortcutSource">
                    {sourceLabel(row.source)}
                  </span>
                  <span className="keyboardShortcutWhen">
                    {row.when === null
                      ? translate("keyboardShortcuts.whenNone")
                      : translate("keyboardShortcuts.when", { when: row.when })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  GetKeyboardShortcutItemsResult
} from "../shared/api";
import type { Translate } from "../shared/i18n";
import {
  formatKeybindingLabel,
  groupKeyboardShortcutRows,
  type KeyboardShortcutCommandGroup,
  type KeyboardShortcutOriginKind,
  type KeybindingEditRequest,
  type KeybindingEditTarget,
  type KeyboardShortcutRow
} from "../shared/keybindings";
import editIcon from "../../assets/icons/codicons/general/edit.svg?raw";
import eraserIcon from "../../assets/icons/codicons/general/eraser.svg?raw";
import refreshIcon from "../../assets/icons/codicons/general/refresh.svg?raw";
import addIcon from "../../assets/icons/codicons/general/add.svg?raw";
import shieldIcon from "../../assets/icons/codicons/general/shield.svg?raw";
import { setEffectiveKeybindings } from "./keybindings/effectiveKeybindingStore";
import { filterKeyboardShortcutGroups } from "./keyboardShortcutSearch";
import { KeyboardShortcutCaptureDialog } from "./KeyboardShortcutCaptureDialog";
import {
  KeyboardShortcutNoticeDialog,
  type KeyboardShortcutNotice
} from "./KeyboardShortcutNoticeDialog";

/**
 * Keyboard Shortcuts screen: the list (#646) and the editing operations
 * (#647: change, unbind, reset).
 *
 * All keybinding semantics (target identification, conflict / reserved checks,
 * the keybindings.json update, re-resolution, the menu rebuild) live in the
 * shared / main code. This component only orchestrates: it captures a key,
 * sends ONE request, and updates the list and the renderer's effective
 * keybindings ONLY after main confirms success - never optimistically. It never
 * shows a file path or document text.
 */

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly data: GetKeyboardShortcutItemsResult };

export interface KeyboardShortcutsScreenProps {
  readonly translate: Translate;
}

function targetOf(row: KeyboardShortcutRow): KeybindingEditTarget {
  return {
    commandId: row.commandId,
    key: row.key,
    origin: row.origin,
    defaultKey: row.defaultKey
  };
}

function Icon({ svg }: { readonly svg: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="keyboardShortcutActionIcon"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

type EditAction = "edit" | "unbind" | "reset";

/** What the capture dialog is capturing for (#648). */
type CaptureState =
  | { readonly mode: "edit"; readonly row: KeyboardShortcutRow }
  | { readonly mode: "add"; readonly group: KeyboardShortcutCommandGroup };

/** What to restore (scroll + focus) once a successful change has re-rendered. */
interface PendingRestore {
  readonly scrollTop: number;
  readonly commandId: string;
  readonly action: EditAction;
  readonly newKey?: string;
}

/**
 * Picks the row that corresponds to the one that was operated on. A changed
 * row gets a new `rowId`, so it is matched by command (and the new key).
 */
function findCorrespondingRowId(
  items: readonly KeyboardShortcutRow[],
  pending: PendingRestore
): string | null {
  const sameCommand = items.filter((item) => item.commandId === pending.commandId);
  const match =
    (pending.newKey === undefined
      ? undefined
      : sameCommand.find((item) => item.key === pending.newKey)) ?? sameCommand[0];
  return match?.rowId ?? null;
}

export function KeyboardShortcutsScreen({
  translate
}: KeyboardShortcutsScreenProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [openLocationFailed, setOpenLocationFailed] = useState(false);
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [notice, setNotice] = useState<KeyboardShortcutNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const openerRef = useRef<Element | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const pendingRestoreRef = useRef<PendingRestore | null>(null);
  const pendingFocusRef = useRef<PendingRestore | null>(null);

  // After a successful change: restore the scroll position before paint, then
  // (in a passive effect, so a closing capture dialog's own focus restore has
  // already run) put focus on the corresponding row. Its id may have changed.
  // No-op on any other render.
  useLayoutEffect(() => {
    const pending = pendingRestoreRef.current;
    const root = rootRef.current;
    if (pending === null || root === null || state.kind !== "ready") {
      return;
    }
    pendingRestoreRef.current = null;
    pendingFocusRef.current = pending;
    root.scrollTop = pending.scrollTop;
  }, [state]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    const root = rootRef.current;
    if (pending === null || root === null || state.kind !== "ready") {
      return;
    }
    pendingFocusRef.current = null;
    const rowId = findCorrespondingRowId(state.data.items, pending);
    const rowElement =
      rowId === null
        ? null
        : Array.from(root.querySelectorAll<HTMLElement>("[data-row-id]")).find(
            (element) => element.dataset.rowId === rowId
          ) ?? null;
    const target =
      rowElement?.querySelector<HTMLElement>(`.keyboardShortcutAction-${pending.action}`) ??
      rowElement?.querySelector<HTMLElement>(".keyboardShortcutAction-edit") ??
      rowElement;
    target?.focus({ preventScroll: true });
    root.scrollTop = pending.scrollTop;
  }, [state]);

  async function loadItems(): Promise<void> {
    try {
      const data = await window.pergamum.keybindings.getKeyboardShortcutItems();
      setState({ kind: "ready", data });
    } catch {
      setState((current) => (current.kind === "ready" ? current : { kind: "failed" }));
    }
  }

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
  const platform = state.kind === "ready" ? state.data.platform : "win32";
  const groups = useMemo(() => groupKeyboardShortcutRows(rows), [rows]);
  const originLabel = (origin: KeyboardShortcutOriginKind): string =>
    translate(`keyboardShortcuts.origin.${origin}`);
  const visibleGroups = useMemo(
    () => filterKeyboardShortcutGroups(groups, query, sourceLabel, originLabel),
    // `sourceLabel` / `originLabel` only depend on `translate`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, query, translate]
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

  /**
   * Sends one edit. The list and the renderer's effective keybindings change
   * only after main reports success; a failure shows why and changes nothing.
   */
  async function applyChange(
    request: KeybindingEditRequest,
    keyLabel?: string
  ): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    const scrollTop = rootRef.current?.scrollTop ?? 0;
    try {
      const result = await window.pergamum.keybindings.applyKeybindingChange(request);
      if (result.ok && result.items !== undefined && result.keybindings !== undefined) {
        setEffectiveKeybindings(result.platform, result.keybindings);
        pendingRestoreRef.current = {
          scrollTop,
          commandId: request.target.commandId,
          action: request.kind === "change" || request.kind === "add" ? "edit" : request.kind,
          ...(request.kind === "change" || request.kind === "add"
            ? { newKey: request.newKey }
            : {})
        };
        setState({
          kind: "ready",
          data: {
            platform: result.platform,
            items: result.items,
            diagnostics: result.diagnostics
          }
        });
      } else {
        const reason = result.failure?.reason ?? "invalid";
        setNotice({
          reason,
          ...(result.failure?.conflict === undefined
            ? {}
            : { conflict: result.failure.conflict }),
          ...(keyLabel === undefined ? {} : { keyLabel })
        });
        if (reason === "stale") {
          await loadItems();
        }
      }
    } catch {
      setNotice({ reason: "saveFailed" });
    } finally {
      setBusy(false);
      // Last resort when focus was lost (no corresponding row is visible):
      // keep the keyboard user in the screen without scrolling.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) {
          searchRef.current?.focus({ preventScroll: true });
        }
      });
    }
  }

  function startEdit(row: KeyboardShortcutRow, button: Element): void {
    openerRef.current = button;
    setCapture({ mode: "edit", row });
  }

  function startAdd(group: KeyboardShortcutCommandGroup, button: Element): void {
    openerRef.current = button;
    setCapture({ mode: "add", group });
  }

  function handleCaptured(notation: string): void {
    const current = capture;
    setCapture(null);
    if (current === null) {
      return;
    }
    const keyLabel = formatKeybindingLabel(notation, platform);
    void applyChange(
      current.mode === "add"
        ? {
            kind: "add",
            target: { commandId: current.group.commandId },
            newKey: notation
          }
        : { kind: "change", target: targetOf(current.row), newKey: notation },
      keyLabel
    );
  }

  const diagnostics = state.kind === "ready" ? state.data.diagnostics : [];
  const hasDiagnosticError = diagnostics.some(
    (diagnostic) => diagnostic.severity === "error"
  );

  return (
    <section
      ref={rootRef}
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
          ref={searchRef}
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
      ) : visibleGroups.length === 0 ? (
        <p className="keyboardShortcutsStatus" role="status">
          {translate("keyboardShortcuts.empty")}
        </p>
      ) : (
        <>
          <p className="keyboardShortcutsStatus" role="status">
            {translate("keyboardShortcuts.count", { count: visibleGroups.length })}
          </p>
          <ul className="keyboardShortcutsList">
            {visibleGroups.map((group) => (
              <li
                key={group.commandId}
                className="keyboardShortcutGroup"
                data-readonly={group.editable ? "false" : "true"}
              >
                <div className="keyboardShortcutGroupHeader">
                  <div className="keyboardShortcutGroupTitleBlock">
                    <span className="keyboardShortcutTitle">{group.title}</span>
                    <code className="keyboardShortcutCommandId">{group.commandId}</code>
                  </div>
                  <span className="keyboardShortcutGroupMeta">
                    <span className="keyboardShortcutCategory">{group.category}</span>
                    <span className="keyboardShortcutScope">{group.scope}</span>
                    <span className="keyboardShortcutSource">
                      {sourceLabel(group.source)}
                    </span>
                    <span className="keyboardShortcutWhen">
                      {group.when === null
                        ? translate("keyboardShortcuts.whenNone")
                        : translate("keyboardShortcuts.when", { when: group.when })}
                    </span>
                  </span>
                  {group.canAdd ? (
                    <button
                      type="button"
                      className="keyboardShortcutActionButton keyboardShortcutActionAdd keyboardShortcutAction-add"
                      aria-label={translate("keyboardShortcuts.action.add")}
                      title={translate("keyboardShortcuts.action.add")}
                      disabled={busy}
                      onClick={(event) => startAdd(group, event.currentTarget)}
                    >
                      <Icon svg={addIcon} />
                    </button>
                  ) : (
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
                  )}
                </div>
                <ul className="keyboardShortcutBindings">
                  {group.bindings.map((row) => (
                    <li
                      key={row.rowId}
                      data-row-id={row.rowId}
                      className="keyboardShortcutRow"
                      data-readonly={row.editable ? "false" : "true"}
                      tabIndex={0}
                    >
                      <span className="keyboardShortcutRowKey">
                        {row.keyLabel !== null ? (
                          <kbd className="keyboardShortcutKey" title={row.key ?? undefined}>
                            {row.keyLabel}
                          </kbd>
                        ) : row.defaultKeyLabel !== null ? (
                          <span className="keyboardShortcutUnassignedDefault">
                            {translate("keyboardShortcuts.unassignedDefault", {
                              key: row.defaultKeyLabel
                            })}
                          </span>
                        ) : (
                          <span className="keyboardShortcutUnassigned">
                            {translate("keyboardShortcuts.unassigned")}
                          </span>
                        )}
                        {row.originKind !== null ? (
                          <span
                            className={`keyboardShortcutOrigin keyboardShortcutOrigin-${row.originKind}`}
                          >
                            {originLabel(row.originKind)}
                          </span>
                        ) : null}
                      </span>
                      {row.editable ? (
                        <span className="keyboardShortcutActions">
                          <button
                            type="button"
                            className="keyboardShortcutActionButton keyboardShortcutActionEdit keyboardShortcutAction-edit"
                            aria-label={translate("keyboardShortcuts.action.edit")}
                            title={translate("keyboardShortcuts.action.edit")}
                            disabled={busy}
                            onClick={(event) => startEdit(row, event.currentTarget)}
                          >
                            <Icon svg={editIcon} />
                          </button>
                          {row.key !== null ? (
                            <button
                              type="button"
                              className="keyboardShortcutActionButton keyboardShortcutActionUnbind keyboardShortcutAction-unbind"
                              aria-label={translate("keyboardShortcuts.action.unbind")}
                              title={translate("keyboardShortcuts.action.unbind")}
                              disabled={busy}
                              onClick={(event) => {
                                openerRef.current = event.currentTarget;
                                void applyChange({ kind: "unbind", target: targetOf(row) });
                              }}
                            >
                              <Icon svg={eraserIcon} />
                            </button>
                          ) : null}
                          {row.canReset && row.origin !== "user" ? (
                            <button
                              type="button"
                              className="keyboardShortcutActionButton keyboardShortcutActionReset keyboardShortcutAction-reset"
                              aria-label={translate("keyboardShortcuts.action.reset")}
                              title={translate("keyboardShortcuts.action.reset")}
                              disabled={busy}
                              onClick={(event) => {
                                openerRef.current = event.currentTarget;
                                void applyChange({ kind: "reset", target: targetOf(row) });
                              }}
                            >
                              <Icon svg={refreshIcon} />
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {capture !== null ? (
        <KeyboardShortcutCaptureDialog
          translate={translate}
          platform={platform}
          row={capture.mode === "add" ? capture.group.bindings[0]! : capture.row}
          mode={capture.mode}
          opener={openerRef.current}
          onCapture={handleCaptured}
          onCancel={() => setCapture(null)}
        />
      ) : null}

      {notice !== null ? (
        <KeyboardShortcutNoticeDialog
          translate={translate}
          notice={notice}
          opener={openerRef.current}
          onClose={() => setNotice(null)}
        />
      ) : null}
    </section>
  );
}

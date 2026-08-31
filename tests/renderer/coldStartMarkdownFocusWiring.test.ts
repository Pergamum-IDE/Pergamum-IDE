import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/renderer/App.tsx", "utf8");
const markdownEditor = readFileSync("src/renderer/MarkdownEditor.tsx", "utf8");
const editorSurface = readFileSync("src/renderer/EditorSurface.tsx", "utf8");
const commandPalette = readFileSync(
  "src/renderer/CommandPalette.tsx",
  "utf8"
);
const recentProjectsPanel = readFileSync(
  "src/renderer/RecentProjectsPanel.tsx",
  "utf8"
);
const queue = readFileSync(
  "src/renderer/dialog/deferredErrorDialogQueue.ts",
  "utf8"
);

function sourceBlock(startNeedle: string, length = 1600): string {
  const start = app.indexOf(startNeedle);
  expect(start, `${startNeedle} should exist`).toBeGreaterThan(-1);
  return app.slice(start, start + length);
}

describe("cold-start Markdown focus wiring (#280)", () => {
  it("routes focus through the pure policy and never exposes CodeMirror to App", () => {
    expect(app).toContain(
      'import { resolveColdStartMarkdownFocusPolicy } from "./coldStartMarkdownFocusPolicy"'
    );
    expect(app).toContain("resolveColdStartMarkdownFocusPolicy({");
    expect(app).toContain("setMarkdownEditorFocusRequest({");
    expect(app).not.toContain("EditorView.focus");
    expect(app).not.toContain(".cm-content");
  });

  it("arms the policy only for a restored Session, not ordinary startup fallback", () => {
    const finishColdStart = sourceBlock("finishColdStart: (sessionWasRestored)");

    expect(finishColdStart).toContain(
      "setColdStartMarkdownFocusArmed(sessionWasRestored)"
    );
  });

  it("waits for deferred Markdown launch routing to settle before requesting focus", () => {
    const routingEffect = sourceBlock(
      "const { filePath, scope } = pendingMarkdownLaunchTargetForRestore;"
    );
    const routingSettled = sourceBlock(
      "const coldStartMarkdownLaunchRoutingSettled"
    );
    const policyInput = sourceBlock("const result = resolveColdStartMarkdownFocusPolicy");

    expect(routingEffect).toContain(
      "setColdStartMarkdownLaunchRoutingInFlight(true)"
    );
    expect(routingEffect).toContain(
      "routeMarkdownLaunchTargetNow(filePath, scope).finally(() => {"
    );
    expect(routingEffect).toContain(
      "setColdStartMarkdownLaunchRoutingInFlight(false)"
    );
    expect(routingSettled).toContain(
      "pendingMarkdownLaunchTargetForRestore === null"
    );
    expect(routingSettled).toContain("!coldStartMarkdownLaunchRoutingInFlight");
    expect(policyInput).toContain(
      "launchRoutingSettled: coldStartMarkdownLaunchRoutingSettled"
    );
  });

  it("uses pendingRestoreViewStatesRef as the authoritative View State completion gate", () => {
    const pendingGate = sourceBlock("const isActiveRestoreViewStatePending");
    const policyInput = sourceBlock("const result = resolveColdStartMarkdownFocusPolicy");

    expect(pendingGate).toContain(
      "pendingRestoreViewStatesRef.current.has(activeDocumentKey)"
    );
    expect(policyInput).toContain(
      "pendingRestoreViewStateKey: isActiveRestoreViewStatePending"
    );
    expect(app).toContain(
      "pendingRestoreViewStatesRef.current.delete(key)"
    );
    expect(app).toContain(
      "setPendingRestoreViewStateVersion((version) => version + 1)"
    );
  });

  it("blocks focus while deferred restore Error dialogs are owed or presenting", () => {
    const pump = sourceBlock("function pumpDeferredRestoreErrorDialogs()");
    const policyInput = sourceBlock("const result = resolveColdStartMarkdownFocusPolicy");
    const readyEffect = app.slice(
      app.indexOf("deferredRestoreErrorDialogsReadyRef.current = true"),
      app.indexOf("createProjectCommandRef.current = createProject;")
    );

    expect(queue).toContain("hasOutstanding(): boolean");
    expect(queue).toContain("private readonly presenting");
    expect(pump).toContain("const presentation = deferredRestoreErrorDialogs.pump");
    expect(pump).toContain("setDeferredRestoreErrorDialogVersion");
    expect(readyEffect).toContain("coldStartMarkdownLaunchRoutingSettled");
    expect(readyEffect).toContain("deferredRestoreErrorDialogs.markReady()");
    expect(policyInput).toContain(
      "deferredRestoreErrorDialogs.hasOutstanding()"
    );
  });

  it("treats the Command Palette as a focus-claiming modal surface", () => {
    const modalGate = sourceBlock("const isAppModalSurfacePendingOrOpen");
    const policyInput = sourceBlock("const result = resolveColdStartMarkdownFocusPolicy");

    expect(commandPalette).toContain('role="dialog"');
    expect(commandPalette).toContain('aria-modal="true"');
    expect(commandPalette).toContain("input.focus()");
    expect(modalGate).toContain("isCommandPaletteOpen");
    expect(modalGate).not.toContain("isRecentProjectsOpen");
    expect(policyInput).toContain(
      "commandPaletteMarkdownFocusRestorePending"
    );
  });

  it("restores Markdown focus from Command Palette close through a separate policy", () => {
    const closeHelper = sourceBlock(
      "function closeCommandPaletteAndRestoreMarkdownFocus()"
    );
    const restoreEffect = sourceBlock(
      "const result = resolveCommandPaletteFocusRestorePolicy"
    );
    const paletteProps = app.slice(
      app.indexOf("<CommandPalette"),
      app.indexOf("lineJumpEditorSnapshot={lineJumpEditorSnapshot}")
    );

    expect(app).toContain(
      'import { resolveCommandPaletteFocusRestorePolicy } from "./commandPaletteFocusRestorePolicy"'
    );
    expect(closeHelper).toContain("setIsCommandPaletteOpen(false)");
    expect(closeHelper).toContain(
      "setCommandPaletteMarkdownFocusRestorePending(true)"
    );
    expect(restoreEffect).toContain(
      "activeSurface: activeEditorFocusSurface"
    );
    expect(restoreEffect).toContain("activeDocumentKey");
    expect(restoreEffect).toContain(
      "deferredRestoreErrorDialogs.hasOutstanding()"
    );
    expect(restoreEffect).toContain("isActiveRestoreViewStatePending");
    expect(restoreEffect).toContain("requestMarkdownEditorFocus");
    expect(paletteProps).toContain(
      "closeCommandPaletteAndRestoreMarkdownFocus();"
    );
    expect(paletteProps).toContain(
      "onClose={closeCommandPaletteAndRestoreMarkdownFocus}"
    );
  });

  it("does not add Recent Projects to the focus gate while it has no explicit focus claim", () => {
    expect(recentProjectsPanel).not.toMatch(/\.focus\(|autoFocus/);
    expect(recentProjectsPanel).not.toContain('aria-modal="true"');
  });

  it("passes the one-shot focus request down to the MarkdownEditor owner", () => {
    expect(app).toContain("markdownEditorFocusRequest={");
    expect(app).toContain(
      "onMarkdownEditorFocusRequestApplied={"
    );
    expect(editorSurface).toContain(
      "markdownEditorFocusRequest: MarkdownEditorFocusRequest | null"
    );
    expect(editorSurface).toContain(
      "focusRequest={markdownEditorFocusRequest}"
    );
    expect(markdownEditor).toContain("export interface MarkdownEditorFocusRequest");
    expect(markdownEditor).toContain("focusRequest.documentKey !== documentKey");
    expect(markdownEditor).toContain("view.focus()");
  });

  it("does not add OS-level focus or persisted focus state", () => {
    const main = readFileSync("src/main/main.ts", "utf8");
    const windowLifecycle = readFileSync("src/main/windowLifecycle.ts", "utf8");
    const preload = readFileSync("src/preload/preload.ts", "utf8");
    const session = readFileSync("src/shared/session.ts", "utf8");
    const sessionSnapshot = readFileSync(
      "src/renderer/session/sessionSnapshot.ts",
      "utf8"
    );
    const relevant = [
      app,
      main,
      windowLifecycle,
      preload,
      session,
      sessionSnapshot
    ].join("\n");

    expect(relevant).not.toContain("BrowserWindow.focus");
    expect(relevant).not.toContain("focusedEditorId");
    expect(relevant).not.toMatch(/\bfocused:\s*true\b/);
    expect(relevant).not.toMatch(/\bfocused:\s*false\b/);
  });
});

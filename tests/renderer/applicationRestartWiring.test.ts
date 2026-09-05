import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

describe("Application self-relaunch wiring (#394 Step 3)", () => {
  it("requestApplicationRestart now calls restartApplication (no longer a Step 2 no-op)", () => {
    const source = appSource();
    const index = source.indexOf("function requestApplicationRestart(");

    expect(index).toBeGreaterThan(-1);

    const block = source.slice(index, index + 400);

    expect(block).toContain("void restartApplication();");
  });

  it("quitApplication and restartApplication are both thin wrappers around the same shared preflight, differing only by the restartAfterQuit flag", () => {
    const source = appSource();
    const flowIndex = source.indexOf(
      "async function runQuitOrRestartFlow(restartAfterQuit: boolean): Promise<void> {"
    );
    const quitIndex = source.indexOf(
      "async function quitApplication(): Promise<void> {",
      flowIndex
    );
    const restartIndex = source.indexOf(
      "async function restartApplication(): Promise<void> {",
      quitIndex
    );

    expect(flowIndex).toBeGreaterThan(-1);
    expect(quitIndex).toBeGreaterThan(flowIndex);
    expect(restartIndex).toBeGreaterThan(quitIndex);

    const quitBlock = source.slice(quitIndex, restartIndex);
    const restartBlock = source.slice(
      restartIndex,
      restartIndex + 400
    );

    expect(quitBlock).toContain("await runQuitOrRestartFlow(false);");
    expect(restartBlock).toContain("await runQuitOrRestartFlow(true);");
  });

  it("the shared flow only reaches the main-process IPC call after the dirty preflight resolves (Cancel/save-failure short-circuit BEFORE it, for both quit and restart)", () => {
    const source = appSource();
    const flowIndex = source.indexOf(
      "async function runQuitOrRestartFlow(restartAfterQuit: boolean): Promise<void> {"
    );
    const quitIndex = source.indexOf(
      "async function quitApplication(): Promise<void> {",
      flowIndex
    );

    expect(flowIndex).toBeGreaterThan(-1);
    expect(quitIndex).toBeGreaterThan(flowIndex);

    const flowBlock = source.slice(flowIndex, quitIndex);
    const dirtyResolutionIndex = flowBlock.indexOf(
      "const dirtyResolution = await resolveDirtyForLifecycle("
    );
    const shortCircuitIndex = flowBlock.indexOf(
      'dirtyResolution.status !== "resolved" &&',
      dirtyResolutionIndex
    );
    const returnIndex = flowBlock.indexOf("return;", shortCircuitIndex);
    const ipcCallIndex = flowBlock.indexOf(
      "await window.pergamum.lifecycle.quitApplication({",
      returnIndex
    );

    expect(dirtyResolutionIndex).toBeGreaterThan(-1);
    expect(shortCircuitIndex).toBeGreaterThan(dirtyResolutionIndex);
    expect(returnIndex).toBeGreaterThan(shortCircuitIndex);
    expect(ipcCallIndex).toBeGreaterThan(returnIndex);

    // The IPC call carries the flag straight through — main is the only
    // place that decides whether to call app.relaunch().
    expect(flowBlock).toContain("restartAfterQuit\n        });");

    // A failed save produces dirtyResolution.status === "aborted", which
    // also fails the "resolved"/"discarded" check above and returns before
    // ever reaching the IPC call — same short-circuit, no separate branch.
    expect(flowBlock).not.toContain('"aborted"');
  });

  it("reports restart failures through the existing status-bar mechanism with a dedicated i18n key, not a new dialog or Toast", () => {
    const source = appSource();
    const flowIndex = source.indexOf(
      "async function runQuitOrRestartFlow(restartAfterQuit: boolean): Promise<void> {"
    );
    const quitIndex = source.indexOf(
      "async function quitApplication(): Promise<void> {",
      flowIndex
    );
    const flowBlock = source.slice(flowIndex, quitIndex);

    expect(flowBlock).toContain(
      'key: restartAfterQuit ? "status.restartFailed" : "status.quitFailed"'
    );
    // The restart failure path reuses `setStatus` — the same status-bar
    // reporting quitFailed already uses — rather than the separate Toast
    // notification system (notificationController/NotificationHost).
    expect(flowBlock).not.toContain("notificationController");
    expect(flowBlock).not.toContain("NotificationHost");
  });

  it("never calls an Electron app-lifecycle API directly from the renderer (contextIsolation/sandbox boundary preserved)", () => {
    const source = appSource();
    const flowIndex = source.indexOf(
      "async function runQuitOrRestartFlow(restartAfterQuit: boolean): Promise<void> {"
    );
    const restartIndex = source.indexOf(
      "async function restartApplication(): Promise<void> {",
      flowIndex
    );
    const restartBlock = source.slice(restartIndex, restartIndex + 400);
    const bodyStart = restartBlock.indexOf("{");
    const restartBody = restartBlock
      .slice(bodyStart)
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    expect(restartBody).not.toContain("app.relaunch");
    expect(restartBody).not.toContain("app.quit");
    expect(restartBody).not.toContain("app.exit");
    expect(source).not.toContain('require("electron")');
    expect(source).not.toContain("from \"electron\"");
  });

  it("reuses lifecycleOperationInProgressRef as the single re-entrancy guard shared by quit and restart — no separate restart-specific lock", () => {
    const source = appSource();
    const flowIndex = source.indexOf(
      "async function runQuitOrRestartFlow(restartAfterQuit: boolean): Promise<void> {"
    );
    const quitIndex = source.indexOf(
      "async function quitApplication(): Promise<void> {",
      flowIndex
    );
    const flowBlock = source.slice(flowIndex, quitIndex);

    expect(flowBlock).toContain("if (lifecycleOperationInProgressRef.current)");
    expect(flowBlock).toContain(
      "lifecycleOperationInProgressRef.current = true;"
    );
    expect(flowBlock).toContain(
      "lifecycleOperationInProgressRef.current = false;"
    );
  });
});

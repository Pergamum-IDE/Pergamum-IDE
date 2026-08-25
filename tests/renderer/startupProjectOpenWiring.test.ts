import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("startup project open wiring", () => {
  it("runs startup project open once after settings load and routes results through the existing read-only resolver", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const functionIndex = source.indexOf("async function openStartupProject()");
    const invokeIndex = source.indexOf(
      "window.pergamum.projects.openStartupProject()",
      functionIndex
    );
    const noRequestIndex = source.indexOf(
      'startupProjectOpenResult.kind === "noStartupProjectOpen"',
      invokeIndex
    );
    const failedResultIndex = source.indexOf(
      'startupProjectOpenResult.kind === "startupProjectOpenFailed"',
      noRequestIndex
    );
    const resolverIndex = source.indexOf(
      "resolveProjectOpenResult(",
      failedResultIndex
    );
    const effectIndex = source.indexOf(
      "startupProjectOpenAttemptedRef.current = true;",
      resolverIndex
    );

    expect(functionIndex).toBeGreaterThan(-1);
    expect(invokeIndex).toBeGreaterThan(functionIndex);
    expect(noRequestIndex).toBeGreaterThan(invokeIndex);
    expect(failedResultIndex).toBeGreaterThan(noRequestIndex);
    expect(resolverIndex).toBeGreaterThan(failedResultIndex);
    expect(effectIndex).toBeGreaterThan(resolverIndex);
    expect(source.slice(effectIndex - 240, effectIndex)).toContain(
      "isSettingsLoading"
    );
    expect(source.slice(effectIndex, effectIndex + 120)).toContain(
      "void openStartupProject();"
    );
  });
});

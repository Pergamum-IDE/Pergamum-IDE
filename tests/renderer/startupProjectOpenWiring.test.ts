import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #274: the bare "open the startup project" effect was replaced by the
 * cold-start Session restore + launch-routing sequence. This guards the
 * new wiring:
 *   - `runColdStartRestore` runs exactly once, gated on `isSettingsLoading`
 *     and a one-shot ref
 *   - the ordinary startup-project open still exists and is reached only as
 *     the "no matching Session" fallback (`openLaunchTargetProjectNormally`)
 */
describe("cold-start restore wiring (#274)", () => {
  const source = readFileSync("src/renderer/App.tsx", "utf8");

  it("runs cold-start restore once, after settings load", () => {
    const effectIndex = source.indexOf(
      "coldStartRestoreAttemptedRef.current = true;"
    );
    expect(effectIndex).toBeGreaterThan(-1);

    const effectBody = source.slice(effectIndex - 260, effectIndex + 160);
    expect(effectBody).toContain("isSettingsLoading");
    expect(effectBody).toContain("coldStartRestoreAttemptedRef.current");
    expect(source.slice(effectIndex, effectIndex + 200)).toContain(
      "runColdStartRestore(coldStartRestoreDeps)"
    );
  });

  it("keeps the ordinary startup-project open as the launch-target fallback", () => {
    const functionIndex = source.indexOf(
      "async function openStartupProject()"
    );
    expect(functionIndex).toBeGreaterThan(-1);
    expect(
      source.indexOf(
        "window.pergamum.projects.openStartupProject()",
        functionIndex
      )
    ).toBeGreaterThan(functionIndex);

    // It is wired into the restore deps as the "open normally" path.
    expect(source).toContain("openLaunchTargetProjectNormally: async () => {");
    const normallyIndex = source.indexOf(
      "openLaunchTargetProjectNormally: async () => {"
    );
    expect(source.slice(normallyIndex, normallyIndex + 160)).toContain(
      "await openStartupProject();"
    );
  });

  it("routes the restore's project reopen through the existing read-only resolver", () => {
    expect(source).toContain(
      "resolveProjectOpenResult: (result) => resolveProjectOpenResult(result)"
    );
  });
});

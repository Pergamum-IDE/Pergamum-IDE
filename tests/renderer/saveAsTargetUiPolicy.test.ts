import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateStandaloneSaveTargetForSaveAsUi } from "../../src/renderer/saveAsTargetUiPolicy";

describe("Save As target UI policy (#223)", () => {
  const readOnlyProject = {
    currentProjectRootPath: "C:\\Novel\\ProjectUnderTest",
    isReadOnlyProject: true,
    platform: "windows" as const
  };

  it("rejects protected suffix targets before read-only root confirmation", () => {
    expect(
      validateStandaloneSaveTargetForSaveAsUi({
        ...readOnlyProject,
        filePath: "C:\\Novel\\ProjectUnderTest\\Project.PERGAMUM"
      })
    ).toEqual({ kind: "rejected", reason: "protected" });
  });

  it("rejects the current project lock directory itself before read-only root confirmation", () => {
    expect(
      validateStandaloneSaveTargetForSaveAsUi({
        ...readOnlyProject,
        filePath: "C:\\Novel\\ProjectUnderTest\\.pergamum.lock"
      })
    ).toEqual({ kind: "rejected", reason: "protected" });
  });

  it("rejects targets under the current project lock directory before read-only root confirmation", () => {
    expect(
      validateStandaloneSaveTargetForSaveAsUi({
        ...readOnlyProject,
        filePath: "C:\\Novel\\ProjectUnderTest\\.pergamum.lock\\anything.md"
      })
    ).toEqual({ kind: "rejected", reason: "protected" });
  });

  it("keeps normal Markdown targets under a read-only project root behind confirmation", () => {
    expect(
      validateStandaloneSaveTargetForSaveAsUi({
        ...readOnlyProject,
        filePath: "C:\\Novel\\ProjectUnderTest\\drafts\\chapter.md"
      })
    ).toEqual({
      kind: "allowed",
      requiresReadOnlyProjectConfirmation: true
    });
  });

  it("allows targets outside the current read-only project root without confirmation", () => {
    expect(
      validateStandaloneSaveTargetForSaveAsUi({
        ...readOnlyProject,
        filePath: "D:\\Exports\\chapter.md"
      })
    ).toEqual({
      kind: "allowed",
      requiresReadOnlyProjectConfirmation: false
    });
  });

  it("does not require read-only confirmation for read-write projects", () => {
    expect(
      validateStandaloneSaveTargetForSaveAsUi({
        ...readOnlyProject,
        isReadOnlyProject: false,
        filePath: "C:\\Novel\\ProjectUnderTest\\drafts\\chapter.md"
      })
    ).toEqual({
      kind: "allowed",
      requiresReadOnlyProjectConfirmation: false
    });
  });

  it("fails safe when renderer-side protected target comparison is not possible", () => {
    expect(
      validateStandaloneSaveTargetForSaveAsUi({
        ...readOnlyProject,
        filePath: "relative\\target.md"
      })
    ).toEqual({ kind: "rejected", reason: "protected" });
  });

  it("keeps the renderer policy lightweight", () => {
    const source = readFileSync(
      "src/renderer/saveAsTargetUiPolicy.ts",
      "utf8"
    );

    expect(source).not.toContain("fs.");
    expect(source).not.toContain("realpath");
  });
});

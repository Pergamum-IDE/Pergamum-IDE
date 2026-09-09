import { describe, expect, it } from "vitest";
import {
  createProjectWindowTitle,
  defaultProjectWindowTitle,
  projectWindowTitleDefaultSuffix,
  projectWindowTitleStatusFromAccessMode,
  projectWindowTitleStatusText
} from "../../src/main/projectWindowTitle";

describe("project window title", () => {
  it("uses the default title suffix when no project is active", () => {
    expect(projectWindowTitleDefaultSuffix("ja")).toBe("a novel IDE");
    expect(projectWindowTitleDefaultSuffix("en")).toBe("a novel IDE");
    expect(
      createProjectWindowTitle({
        projectName: null,
        titleStatus: null,
        language: "ja"
      })
    ).toBe(defaultProjectWindowTitle);
    expect(defaultProjectWindowTitle).toBe("a novel IDE - Pergamum");
  });

  it("builds a project title without a status suffix for readWrite access", () => {
    expect(
      createProjectWindowTitle({
        projectName: "王都",
        titleStatus: projectWindowTitleStatusFromAccessMode({
          kind: "readWrite"
        }),
        language: "ja"
      })
    ).toBe("王都 - Pergamum");
  });

  it("builds the readOnly marker as a localized status suffix", () => {
    const titleStatus = projectWindowTitleStatusFromAccessMode({
      kind: "readOnly",
      reason: "writeLockUnavailable"
    });

    expect(titleStatus).toEqual({ kind: "readOnly" });
    expect(projectWindowTitleStatusText(titleStatus!, "ja")).toBe(
      "読み取り専用"
    );
    expect(projectWindowTitleStatusText(titleStatus!, "en")).toBe("Read-only");
    expect(
      createProjectWindowTitle({
        projectName: "王都",
        titleStatus,
        language: "ja"
      })
    ).toBe("王都 - [読み取り専用] - Pergamum");
    expect(
      createProjectWindowTitle({
        projectName: "Novel",
        titleStatus,
        language: "en"
      })
    ).toBe("Novel - [Read-only] - Pergamum");
  });
});

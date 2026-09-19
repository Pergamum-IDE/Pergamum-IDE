// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { ExportConfirmationDialog } from "../../src/renderer/dialog/ExportConfirmationDialog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translate: Translate = (key, values) => t("en", key, values);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const candidates = [
  {
    documentKey: "First/01.md",
    filePath: "First/01.md",
    parentPath: "First",
    fileName: "01.md",
    kind: "markdown" as const,
    previewStart: "吾輩は猫で",
    previewEnd: "まだない。",
    characterCount: 10,
    included: true
  },
  {
    documentKey: "First/notes.txt",
    filePath: "First/notes.txt",
    parentPath: "First",
    fileName: "notes.txt",
    kind: "text" as const,
    previewStart: "plain text",
    previewEnd: "text memo",
    characterCount: 5,
    included: true
  }
] as const;

function mountDialog(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ExportConfirmationDialog
        origin={{ kind: "folder", folderPath: "First" }}
        projectName="Novel"
        candidates={candidates}
        translate={translate}
        opener={null}
        onClose={vi.fn()}
      />
    );
  });
}

function summary(kind: string): string {
  return (
    container!.querySelector<HTMLElement>(
      `[data-export-confirmation-summary="${kind}"]`
    )?.textContent ?? ""
  );
}

function includeToggle(filePath: string): HTMLInputElement {
  return container!.querySelector<HTMLInputElement>(
    `[data-export-include-toggle-file-path="${filePath}"]`
  )!;
}

describe("ExportConfirmationDialog (#523)", () => {
  it("labels the project root origin with the project name when available", () => {
    const markup = renderToStaticMarkup(
      <ExportConfirmationDialog
        origin={{ kind: "projectRoot" }}
        projectName="Novel"
        candidates={[]}
        translate={translate}
        opener={null}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("Project root (Novel)");
  });

  it("renders the origin, candidate count, and flat candidate list", () => {
    const markup = renderToStaticMarkup(
      <ExportConfirmationDialog
        origin={{ kind: "folder", folderPath: "First" }}
        projectName="Novel"
        candidates={candidates}
        translate={translate}
        opener={null}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("Export Confirmation");
    expect(markup).toContain("Target:");
    expect(markup).toContain("First");
    expect(markup).toContain("Candidates:");
    expect(markup).toContain("2 files");
    expect(markup).toContain("Included:");
    expect(markup).toContain("Total characters:");
    expect(markup).toContain("15 chars");
    expect(markup).toContain("01.md");
    expect(markup).toContain("notes.txt");
    expect(markup).toContain("吾輩は猫で");
    expect(markup).toContain("text memo");
    expect(markup).toContain("exportConfirmationDialogHandleIcon");
    expect(markup).toContain("exportConfirmationDialogKindIcon");
    expect(markup).toContain("disabled=\"\"");
  });

  it("renders a safe empty state", () => {
    const markup = renderToStaticMarkup(
      <ExportConfirmationDialog
        origin={{ kind: "file", filePath: "assets/cover.png" }}
        projectName="Novel"
        candidates={[]}
        translate={translate}
        opener={null}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("assets/cover.png");
    expect(markup).toContain("0 files");
    expect(markup).toContain("No exportable documents found.");
    expect(markup).not.toContain("<tbody>");
  });

  it("updates included count and total characters when a row is toggled", () => {
    mountDialog();

    expect(summary("candidate-count")).toBe("2 files");
    expect(summary("included-count")).toBe("2 files");
    expect(summary("character-count")).toBe("15 chars");

    act(() => includeToggle("First/01.md").click());

    expect(summary("candidate-count")).toBe("2 files");
    expect(summary("included-count")).toBe("1 files");
    expect(summary("character-count")).toBe("5 chars");

    act(() => includeToggle("First/01.md").click());

    expect(summary("included-count")).toBe("2 files");
    expect(summary("character-count")).toBe("15 chars");
  });
});

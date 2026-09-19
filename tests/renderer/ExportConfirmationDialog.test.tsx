import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { ExportConfirmationDialog } from "../../src/renderer/dialog/ExportConfirmationDialog";

const translate: Translate = (key, values) => t("en", key, values);

describe("ExportConfirmationDialog (#523 Slice 1)", () => {
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
        candidates={[
          {
            documentKey: "First/01.md",
            filePath: "First/01.md",
            parentPath: "First",
            fileName: "01.md",
            kind: "markdown"
          },
          {
            documentKey: "First/notes.txt",
            filePath: "First/notes.txt",
            parentPath: "First",
            fileName: "notes.txt",
            kind: "text"
          }
        ]}
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
    expect(markup).toContain("01.md");
    expect(markup).toContain("notes.txt");
    expect(markup).toContain("Markdown");
    expect(markup).toContain("Text");
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
});

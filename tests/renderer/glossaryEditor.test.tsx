import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryEditor } from "../../src/renderer/GlossaryEditor";
import { createGlossaryEntryDraft } from "../../src/renderer/glossaryEntryDraft";

const translate: Translate = (key) => key;
const timestamp = "2026-01-01T00:00:00.000Z";

function glossaryEntry(description: string): GlossaryEntry {
  return {
    id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
    kind: "place",
    description,
    createdAt: timestamp,
    updatedAt: timestamp,
    forms: [
      {
        id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
        entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
        surface: "王都",
        relation: null,
        warningPolicy: null,
        isCanonical: true,
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        allowSingleCharacterMatch: false,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
        entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
        surface: "首都",
        relation: "alias",
        warningPolicy: "default",
        isCanonical: false,
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        allowSingleCharacterMatch: false,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]
  };
}

describe("GlossaryEditor", () => {
  it("renders a Glossary entry as an editable Editor surface", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, {
        draft: createGlossaryEntryDraft(glossaryEntry("王国の首都")),
        translate,
        onChangeKind: () => undefined,
        onChangeDescription: () => undefined,
        onChangeCanonicalSurface: () => undefined,
        onChangeCanonicalMatchBoundaryStart: () => undefined,
        onChangeCanonicalMatchBoundaryEnd: () => undefined,
        onChangeCanonicalAllowSingleCharacterMatch: () => undefined,
        onAddForm: () => undefined,
        onChangeFormSurface: () => undefined,
        onChangeFormWarningPolicy: () => undefined,
        onChangeFormMatchBoundaryStart: () => undefined,
        onChangeFormMatchBoundaryEnd: () => undefined,
        onChangeFormAllowSingleCharacterMatch: () => undefined,
        onDeleteForm: () => undefined,
        onDeleteEntry: () => undefined,
        onNavigateToPreviousOccurrence: () => undefined,
        onNavigateToNextOccurrence: () => undefined
      })
    );

    expect(markup).toContain("glossaryEditor.label");
    expect(markup).toContain("王都");
    expect(markup).toContain("place");
    expect(markup).toContain("首都");
    expect(markup).toContain("glossaryEditor.addAlias");
  });

  it("renders description as Markdown source through the preview renderer", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, {
        draft: createGlossaryEntryDraft(glossaryEntry("**王都** の説明")),
        translate,
        onChangeKind: () => undefined,
        onChangeDescription: () => undefined,
        onChangeCanonicalSurface: () => undefined,
        onChangeCanonicalMatchBoundaryStart: () => undefined,
        onChangeCanonicalMatchBoundaryEnd: () => undefined,
        onChangeCanonicalAllowSingleCharacterMatch: () => undefined,
        onAddForm: () => undefined,
        onChangeFormSurface: () => undefined,
        onChangeFormWarningPolicy: () => undefined,
        onChangeFormMatchBoundaryStart: () => undefined,
        onChangeFormMatchBoundaryEnd: () => undefined,
        onChangeFormAllowSingleCharacterMatch: () => undefined,
        onDeleteForm: () => undefined,
        onDeleteEntry: () => undefined,
        onNavigateToPreviousOccurrence: () => undefined,
        onNavigateToNextOccurrence: () => undefined
      })
    );

    expect(markup).toContain("<strong>王都</strong>");
    expect(markup).not.toContain("**王都**");
  });

  it("does not create a separate description Editor boundary", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, {
        draft: createGlossaryEntryDraft(glossaryEntry("説明")),
        translate,
        onChangeKind: () => undefined,
        onChangeDescription: () => undefined,
        onChangeCanonicalSurface: () => undefined,
        onChangeCanonicalMatchBoundaryStart: () => undefined,
        onChangeCanonicalMatchBoundaryEnd: () => undefined,
        onChangeCanonicalAllowSingleCharacterMatch: () => undefined,
        onAddForm: () => undefined,
        onChangeFormSurface: () => undefined,
        onChangeFormWarningPolicy: () => undefined,
        onChangeFormMatchBoundaryStart: () => undefined,
        onChangeFormMatchBoundaryEnd: () => undefined,
        onChangeFormAllowSingleCharacterMatch: () => undefined,
        onDeleteForm: () => undefined,
        onDeleteEntry: () => undefined,
        onNavigateToPreviousOccurrence: () => undefined,
        onNavigateToNextOccurrence: () => undefined
      })
    );

    expect(markup).toContain("glossaryEditor.description");
    expect(markup).not.toContain("documentTab");
    expect(markup).not.toContain("EditorId");
  });
});

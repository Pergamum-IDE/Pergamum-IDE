import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { createUntitledEditorId } from "../../src/shared/editorId";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryOccurrencesPanel } from "../../src/renderer/GlossaryOccurrencesPanel";
import type { GlossaryOccurrenceTrackingActiveState } from "../../src/renderer/glossaryOccurrenceTracking";

const translate: Translate = (key, values) => {
  if (!values) {
    return key;
  }

  return `${key}:${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join(",")}`;
};

const maidEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-100000000001",
  description: "",
  tags: [],
  atoms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-200000000001",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-100000000001",
      sortOrder: 0,
      value: "メイド",
      matchFlags: 0,
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z"
    }
  ],
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z"
};

const activeSession: GlossaryOccurrenceTrackingActiveState = {
  kind: "active",
  entryId: maidEntry.id,
  entryLabel: "メイド",
  entrySnapshot: maidEntry,
  targetMarkdownEditorId: createUntitledEditorId(1),
  ranges: [
    { start: 0, end: 3 },
    { start: 10, end: 13 },
    { start: 20, end: 23 }
  ],
  currentIndex: 1
};

describe("GlossaryOccurrencesPanel", () => {
  it("shows the empty state when tracking is inactive", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryOccurrencesPanel, {
        session: { kind: "inactive" },
        translate,
        onNavigatePrevious: () => undefined,
        onNavigateNext: () => undefined,
        onOpenEntry: () => undefined,
        onCloseTracking: () => undefined
      })
    );

    expect(markup).toContain("utilityWindow.occurrences.empty");
    expect(markup).not.toContain("utilityWindow.occurrences.previous");
  });

  it("shows the entry label, position, and action buttons while tracking is active", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryOccurrencesPanel, {
        session: activeSession,
        translate,
        onNavigatePrevious: () => undefined,
        onNavigateNext: () => undefined,
        onOpenEntry: () => undefined,
        onCloseTracking: () => undefined
      })
    );

    expect(markup).toContain("utilityWindow.occurrences.title:name=メイド");
    expect(markup).toContain(
      "utilityWindow.occurrences.position:current=2,total=3"
    );
    expect(markup).toContain("utilityWindow.occurrences.previous");
    expect(markup).toContain("utilityWindow.occurrences.next");
    expect(markup).toContain("utilityWindow.occurrences.openEntry");
    expect(markup).toContain("utilityWindow.occurrences.closeTracking");
    expect(markup).not.toContain("utilityWindow.occurrences.empty");
  });
});

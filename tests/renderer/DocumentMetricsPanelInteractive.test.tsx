// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DocumentMetricsPanel,
  type DocumentMetricsFileInfo
} from "../../src/renderer/DocumentMetricsPanel";
import type { DocumentMetricsAnalysis } from "../../src/renderer/documentMetricsAnalysis";

const sampleAnalysis: DocumentMetricsAnalysis = {
  glossaryCounts: [],
  tagCounts: [],
  dialogueRatio: {
    narrationCharacters: 700,
    pairs: [
      {
        pairIndex: 0,
        open: "「",
        close: "」",
        color: "#61afef",
        characters: 300,
        percent: 30
      }
    ],
    dialogueCharacters: 300,
    totalCharacters: 1000,
    narrationPercent: 70,
    dialoguePercent: 30
  }
};

const fileInfo: DocumentMetricsFileInfo = {
  kind: "timestamps",
  modifiedAtIso: "2026-09-06T12:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DocumentMetricsPanel interactive chart switching and animation triggers (#396)", () => {
  it("defaults to Pie chart and renders both selector buttons with correct icons", () => {
    act(() => {
      root.render(
        <DocumentMetricsPanel
          translate={(key) => key}
          hasActiveDocument={true}
          activeEditorIsMarkdown={true}
          characterCount={1000}
          analysis={sampleAnalysis}
          fileInfo={fileInfo}
        />
      );
    });

    const selector = container.querySelector(".documentMetricsChartSelector");
    expect(selector).not.toBeNull();

    const buttons = container.querySelectorAll(".documentMetricsChartTypeButton");
    expect(buttons.length).toBe(2);

    const pieButton = buttons[0] as HTMLButtonElement;
    const barButton = buttons[1] as HTMLButtonElement;

    // Default: Pie selected
    expect(pieButton.getAttribute("data-selected")).toBe("true");
    expect(pieButton.getAttribute("aria-pressed")).toBe("true");
    expect(barButton.getAttribute("data-selected")).toBeNull();
    expect(barButton.getAttribute("aria-pressed")).toBe("false");

    // Icons present
    expect(pieButton.querySelector("svg.feather-pie-chart")).not.toBeNull();
    expect(barButton.querySelector("svg.feather-bar-chart")).not.toBeNull();

    // Pie chart is rendered, Bar chart is not
    expect(container.querySelector(".documentMetricsDialoguePie")).not.toBeNull();
    expect(container.querySelector(".documentMetricsDialogueBar")).toBeNull();
  });

  it("switches from Pie to Bar and back to Pie when buttons are clicked", () => {
    act(() => {
      root.render(
        <DocumentMetricsPanel
          translate={(key) => key}
          hasActiveDocument={true}
          activeEditorIsMarkdown={true}
          characterCount={1000}
          analysis={sampleAnalysis}
          fileInfo={fileInfo}
        />
      );
    });

    const buttons = container.querySelectorAll(".documentMetricsChartTypeButton");
    const pieButton = buttons[0] as HTMLButtonElement;
    const barButton = buttons[1] as HTMLButtonElement;

    // Switch to Bar
    act(() => {
      barButton.click();
    });

    expect(barButton.getAttribute("data-selected")).toBe("true");
    expect(barButton.getAttribute("aria-pressed")).toBe("true");
    expect(pieButton.getAttribute("data-selected")).toBeNull();
    expect(pieButton.getAttribute("aria-pressed")).toBe("false");

    // Bar chart is now rendered, Pie is unrendered
    expect(container.querySelector(".documentMetricsDialogueBar")).not.toBeNull();
    expect(container.querySelector(".documentMetricsDialoguePie")).toBeNull();

    // Data in bar chart matches analysis
    expect(container.querySelector(".documentMetricsBarRow")).not.toBeNull();
    expect(container.textContent).toContain("700");
    expect(container.textContent).toContain("300");

    // Switch back to Pie
    act(() => {
      pieButton.click();
    });

    expect(pieButton.getAttribute("data-selected")).toBe("true");
    expect(barButton.getAttribute("data-selected")).toBeNull();
    expect(container.querySelector(".documentMetricsDialoguePie")).not.toBeNull();
    expect(container.querySelector(".documentMetricsDialogueBar")).toBeNull();
  });

  it("increments animation generation on chart toggle", () => {
    act(() => {
      root.render(
        <DocumentMetricsPanel
          translate={(key) => key}
          hasActiveDocument={true}
          activeEditorIsMarkdown={true}
          characterCount={1000}
          analysis={sampleAnalysis}
          fileInfo={fileInfo}
        />
      );
    });

    // Initial show: pie chart has data-revealing
    const pieSvg = container.querySelector(".documentMetricsDialoguePie");
    expect(pieSvg?.getAttribute("data-revealing")).toBe("true");

    const barButton = container.querySelectorAll(".documentMetricsChartTypeButton")[1] as HTMLButtonElement;
    act(() => {
      barButton.click();
    });

    const barContainer = container.querySelector(".documentMetricsDialogueBar");
    expect(barContainer?.getAttribute("data-revealing")).toBe("true");
  });

  it("does NOT trigger animation or remount on normal data updates", () => {
    act(() => {
      root.render(
        <DocumentMetricsPanel
          translate={(key) => key}
          hasActiveDocument={true}
          activeEditorIsMarkdown={true}
          characterCount={1000}
          analysis={sampleAnalysis}
          fileInfo={fileInfo}
        />
      );
    });

    const initialPie = container.querySelector(".documentMetricsDialoguePie");
    expect(initialPie).not.toBeNull();

    // Update data while visible
    const updatedAnalysis: DocumentMetricsAnalysis = {
      ...sampleAnalysis,
      dialogueRatio: {
        ...sampleAnalysis.dialogueRatio,
        narrationCharacters: 800,
        totalCharacters: 1100
      }
    };

    act(() => {
      root.render(
        <DocumentMetricsPanel
          translate={(key) => key}
          hasActiveDocument={true}
          activeEditorIsMarkdown={true}
          characterCount={1100}
          analysis={updatedAnalysis}
          fileInfo={fileInfo}
        />
      );
    });

    const currentPie = container.querySelector(".documentMetricsDialoguePie");
    // Pie DOM element remains the same (no remount)
    expect(currentPie).toBe(initialPie);
  });

  it("re-triggers animation generation when isVisible transitions from false to true", () => {
    act(() => {
      root.render(
        <DocumentMetricsPanel
          translate={(key) => key}
          hasActiveDocument={true}
          activeEditorIsMarkdown={true}
          characterCount={1000}
          analysis={sampleAnalysis}
          fileInfo={fileInfo}
          isVisible={true}
        />
      );
    });

    const initialPie = container.querySelector(".documentMetricsDialoguePie");
    expect(initialPie).not.toBeNull();

    // Become hidden
    act(() => {
      root.render(
        <DocumentMetricsPanel
          translate={(key) => key}
          hasActiveDocument={true}
          activeEditorIsMarkdown={true}
          characterCount={1000}
          analysis={sampleAnalysis}
          fileInfo={fileInfo}
          isVisible={false}
        />
      );
    });

    // Become visible again (re-show)
    act(() => {
      root.render(
        <DocumentMetricsPanel
          translate={(key) => key}
          hasActiveDocument={true}
          activeEditorIsMarkdown={true}
          characterCount={1000}
          analysis={sampleAnalysis}
          fileInfo={fileInfo}
          isVisible={true}
        />
      );
    });

    const reShownPie = container.querySelector(".documentMetricsDialoguePie");
    expect(reShownPie).not.toBeNull();
    // Animation key has changed, so a new SVG element was mounted
    expect(reShownPie).not.toBe(initialPie);
  });
});

// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ListFileExplorerChildrenResult,
  PergamumProject
} from "../../src/shared/api";
import type { Translate } from "../../src/shared/i18n";
import { FileExplorer } from "../../src/renderer/FileExplorer";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translate: Translate = (key) => key;

describe("FileExplorer root tooltip and logical name (#422)", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(window, "pergamum", {
      configurable: true,
      value: {
        projects: {
          listFileExplorerChildren: vi.fn(
            async (): Promise<ListFileExplorerChildrenResult> => ({
              kind: "ok",
              directoryRelativePath: null,
              entries: []
            })
          )
        }
      }
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }

    if (container) {
      container.remove();
      container = null;
    }

    delete (window as unknown as { pergamum?: unknown }).pergamum;
  });

  it("root label shows logical project name and title shows physical DB file path", async () => {
    const project: PergamumProject = {
      rootPath: "C:\\works\\Novel",
      activeProjectFilePath: "C:\\works\\Novel\\story.pergamum",
      accessMode: { kind: "readWrite" },
      name: "迷子たちと千年領主",
      config: null,
      documents: []
    };

    act(() => {
      root!.render(
        <FileExplorer
          project={project}
          highlightedRelativePath={null}
          translate={translate}
          onActivateDocument={vi.fn()}
        />
      );
    });

    const rootButton = container!.querySelector(
      '[data-file-explorer-entry-kind="root"]'
    );
    expect(rootButton).not.toBeNull();
    expect(rootButton!.textContent).toContain("迷子たちと千年領主");
    expect(rootButton!.getAttribute("title")).toBe(
      "C:\\works\\Novel\\story.pergamum"
    );
  });

  it("after logical rename, root label updates while title tooltip remains unchanged", async () => {
    const initialProject: PergamumProject = {
      rootPath: "C:\\works\\Novel",
      activeProjectFilePath: "C:\\works\\Novel\\story.pergamum",
      accessMode: { kind: "readWrite" },
      name: "Initial Name",
      config: null,
      documents: []
    };

    act(() => {
      root!.render(
        <FileExplorer
          project={initialProject}
          highlightedRelativePath={null}
          translate={translate}
          onActivateDocument={vi.fn()}
        />
      );
    });

    const rootButton = container!.querySelector(
      '[data-file-explorer-entry-kind="root"]'
    );
    expect(rootButton).not.toBeNull();
    expect(rootButton!.textContent).toContain("Initial Name");
    expect(rootButton!.getAttribute("title")).toBe(
      "C:\\works\\Novel\\story.pergamum"
    );

    // Simulate project state update after rename
    const updatedProject: PergamumProject = {
      ...initialProject,
      name: "Renamed Logical Title: Part 2"
    };

    act(() => {
      root!.render(
        <FileExplorer
          project={updatedProject}
          highlightedRelativePath={null}
          translate={translate}
          onActivateDocument={vi.fn()}
        />
      );
    });

    const updatedRootButton = container!.querySelector(
      '[data-file-explorer-entry-kind="root"]'
    );
    expect(updatedRootButton!.textContent).toContain(
      "Renamed Logical Title: Part 2"
    );
    expect(updatedRootButton!.getAttribute("title")).toBe(
      "C:\\works\\Novel\\story.pergamum"
    );
  });
});

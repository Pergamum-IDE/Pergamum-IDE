// @vitest-environment happy-dom
//
// #372: interactive coverage for the Command Palette file quick open footer
// detail preview. Drives the real widget so the selected-candidate preview
// fetch, its stale-result guard, and the #370 footer detail wiring are
// exercised together. Mirrors the harness in
// commandPaletteActiveSelection.test.tsx.
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../../src/shared/api";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import type { Translate } from "../../src/shared/i18n";
import {
  CommandPalette,
  resolveProjectFileQuickOpenFooterModel,
  shouldRequestProjectFileQuickOpenPreview,
  type CommandPaletteProps
} from "../../src/renderer/CommandPalette";
import type { CommandPaletteFooterDetailSettings } from "../../src/shared/settings";
import type { ProjectFileQuickOpenCandidate } from "../../src/renderer/projectFileQuickOpen";

const translate: Translate = (key) => key;

const footerDetailEnabled: CommandPaletteFooterDetailSettings = {
  enable: true,
  marquee: { delay: 2000, speed: 40 }
};
const footerDetailDisabled: CommandPaletteFooterDetailSettings = {
  enable: false,
  marquee: { delay: 2000, speed: 40 }
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
  vi.restoreAllMocks();
});

function projectDocument(relativePath: string): ProjectDocument {
  return {
    relativePath,
    name: relativePath.split(/[\\/]/).pop() ?? relativePath
  };
}

function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register({
    id: defineCommandId("test.palette.alpha"),
    title: "Alpha Command",
    description: "Alpha description",
    execute: () => undefined,
    isEnabled: () => true
  });
  return registry;
}

function baseProps(
  overrides: Partial<CommandPaletteProps> = {}
): CommandPaletteProps {
  return {
    commandRegistry: buildRegistry(),
    translate,
    isComposing: () => false,
    commandContext: {} as CommandContext,
    onExecuteCommand: vi.fn(),
    onBlockedCommand: vi.fn(),
    onClose: vi.fn(),
    initialInputValue: "",
    footerDetailSettings: footerDetailEnabled,
    ...overrides
  };
}

function render(props: CommandPaletteProps): void {
  act(() => {
    root.render(React.createElement(CommandPalette, props));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function inputEl(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(".commandPaletteInput")!;
}

function footerStatusText(): string | null {
  return (
    container.querySelector<HTMLElement>(".commandPaletteFooterStatusText")
      ?.textContent ?? null
  );
}

function pressKey(key: string): void {
  act(() => {
    inputEl().dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true
      })
    );
  });
}

function candidate(relativePath: string): ProjectFileQuickOpenCandidate {
  return {
    document: projectDocument(relativePath),
    filename: { text: projectDocument(relativePath).name, ranges: [] },
    relativePath: { text: relativePath, ranges: [] },
    matchKind: null
  };
}

describe("resolveProjectFileQuickOpenFooterModel (#372)", () => {
  it("rides the #370 footer detail channel with a path-keyed reset key", () => {
    expect(
      resolveProjectFileQuickOpenFooterModel({
        activeCandidate: candidate("drafts/chapter-01.md"),
        previewText: "# 第一章",
        detailEnabled: true
      })
    ).toEqual({
      statusKey: null,
      detailText: "# 第一章",
      detailResetKey: "projectFileQuickOpenPreview:drafts/chapter-01.md",
      canRunSelected: true
    });
  });

  it("shows no detail when footer detail is disabled, the preview is empty, or nothing is selected", () => {
    expect(
      resolveProjectFileQuickOpenFooterModel({
        activeCandidate: candidate("a.md"),
        previewText: "# body",
        detailEnabled: false
      })
    ).toEqual({ statusKey: null, canRunSelected: true });
    expect(
      resolveProjectFileQuickOpenFooterModel({
        activeCandidate: candidate("a.md"),
        previewText: null,
        detailEnabled: true
      })
    ).toEqual({ statusKey: null, canRunSelected: true });
    expect(
      resolveProjectFileQuickOpenFooterModel({
        activeCandidate: null,
        previewText: "# body",
        detailEnabled: true
      })
    ).toEqual({ statusKey: null, canRunSelected: false });
  });
});

describe("shouldRequestProjectFileQuickOpenPreview (#372)", () => {
  it("is true only in file mode, with detail enabled, and a selected candidate", () => {
    expect(
      shouldRequestProjectFileQuickOpenPreview({
        mode: "file",
        activeRelativePath: "a.md",
        detailEnabled: true
      })
    ).toBe(true);
    expect(
      shouldRequestProjectFileQuickOpenPreview({
        mode: "command",
        activeRelativePath: "a.md",
        detailEnabled: true
      })
    ).toBe(false);
    expect(
      shouldRequestProjectFileQuickOpenPreview({
        mode: "file",
        activeRelativePath: null,
        detailEnabled: true
      })
    ).toBe(false);
    expect(
      shouldRequestProjectFileQuickOpenPreview({
        mode: "file",
        activeRelativePath: "a.md",
        detailEnabled: false
      })
    ).toBe(false);
  });
});

describe("Command Palette file quick open footer preview (#372)", () => {
  it("shows the selected file preview line in the footer detail", async () => {
    const onRequestProjectFileQuickOpenPreview = vi
      .fn()
      .mockResolvedValue("# 第一章");
    render(
      baseProps({
        initialInputValue: "chap",
        projectFileQuickOpenDocuments: [
          projectDocument("drafts/chapter-01.md"),
          projectDocument("drafts/chapter-02.md")
        ],
        onRequestProjectFileQuickOpenPreview
      })
    );

    await flush();

    expect(onRequestProjectFileQuickOpenPreview).toHaveBeenCalledWith(
      "drafts/chapter-01.md"
    );
    expect(footerStatusText()).toBe("# 第一章");
  });

  it("updates the preview when the active candidate changes", async () => {
    const onRequestProjectFileQuickOpenPreview = vi
      .fn()
      .mockImplementation((relativePath: string) =>
        Promise.resolve(`preview of ${relativePath}`)
      );
    render(
      baseProps({
        initialInputValue: "chap",
        projectFileQuickOpenDocuments: [
          projectDocument("drafts/chapter-01.md"),
          projectDocument("drafts/chapter-02.md")
        ],
        onRequestProjectFileQuickOpenPreview
      })
    );

    await flush();
    expect(footerStatusText()).toBe("preview of drafts/chapter-01.md");

    pressKey("ArrowDown");
    await flush();

    expect(footerStatusText()).toBe("preview of drafts/chapter-02.md");
    expect(onRequestProjectFileQuickOpenPreview).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale async result whose candidate is no longer selected", async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    const onRequestProjectFileQuickOpenPreview = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(() => Promise.resolve("FRESH preview"));

    render(
      baseProps({
        initialInputValue: "chap",
        projectFileQuickOpenDocuments: [
          projectDocument("drafts/chapter-01.md"),
          projectDocument("drafts/chapter-02.md")
        ],
        onRequestProjectFileQuickOpenPreview
      })
    );

    // Move selection before the first request resolves, then let the fresh
    // request settle, then finally resolve the stale one.
    pressKey("ArrowDown");
    await flush();
    expect(footerStatusText()).toBe("FRESH preview");

    act(() => resolveFirst("STALE preview"));
    await flush();

    expect(footerStatusText()).toBe("FRESH preview");
    expect(footerStatusText()).not.toBe("STALE preview");
  });

  it("does not request a preview when footer detail is disabled", async () => {
    const onRequestProjectFileQuickOpenPreview = vi
      .fn()
      .mockResolvedValue("# body");
    render(
      baseProps({
        initialInputValue: "chap",
        footerDetailSettings: footerDetailDisabled,
        projectFileQuickOpenDocuments: [projectDocument("drafts/chapter-01.md")],
        onRequestProjectFileQuickOpenPreview
      })
    );

    await flush();

    expect(onRequestProjectFileQuickOpenPreview).not.toHaveBeenCalled();
    expect(footerStatusText()).toBeNull();
  });

  it("does not request a preview when there are no candidates or no project", async () => {
    const onRequestProjectFileQuickOpenPreview = vi
      .fn()
      .mockResolvedValue("# body");
    render(
      baseProps({
        initialInputValue: "chapter",
        // No documents at all → project-not-open-equivalent.
        onRequestProjectFileQuickOpenPreview
      })
    );

    await flush();

    expect(onRequestProjectFileQuickOpenPreview).not.toHaveBeenCalled();
    expect(footerStatusText()).toBeNull();
  });

  it("does not request a preview in command mode", async () => {
    const onRequestProjectFileQuickOpenPreview = vi
      .fn()
      .mockResolvedValue("# body");
    render(
      baseProps({
        initialInputValue: ">Alpha",
        projectFileQuickOpenDocuments: [projectDocument("Alpha Command.md")],
        onRequestProjectFileQuickOpenPreview
      })
    );

    await flush();

    expect(onRequestProjectFileQuickOpenPreview).not.toHaveBeenCalled();
  });

  it("does not display anything and does not close on a failed preview fetch", async () => {
    const onClose = vi.fn();
    const onRequestProjectFileQuickOpenPreview = vi
      .fn()
      .mockRejectedValue(new Error("read failed"));
    render(
      baseProps({
        initialInputValue: "chap",
        projectFileQuickOpenDocuments: [projectDocument("drafts/chapter-01.md")],
        onRequestProjectFileQuickOpenPreview,
        onClose
      })
    );

    await flush();

    expect(footerStatusText()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(inputEl()).not.toBeNull();
  });

  it("keeps the line jump footer behaviour untouched", async () => {
    const onRequestProjectFileQuickOpenPreview = vi.fn();
    render(
      baseProps({
        initialInputValue: ":10",
        lineJumpEditorSnapshot: { lineCount: 40, getLineText: () => "body" },
        onRequestProjectFileQuickOpenPreview
      })
    );

    await flush();

    expect(onRequestProjectFileQuickOpenPreview).not.toHaveBeenCalled();
    expect(container.textContent).toContain("commandPalette.lineJump.goToLine");
  });

  it("never calls File Explorer reveal / selection sync from the palette", () => {
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

    for (const forbidden of [
      "revealFileExplorer",
      "setFileExplorerRevealRequest",
      "fileExplorerSelection",
      "selectionSync"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

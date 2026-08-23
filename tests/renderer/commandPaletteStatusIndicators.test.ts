import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  commandPaletteStatusIndicatorForReason,
  resolveDisabledCommandPaletteStatusIndicator
} from "../../src/renderer/commandPaletteStatusIndicators";

describe("Command Palette status indicators", () => {
  it("does not change CommandDisabledReason for notImplemented", () => {
    const source = readFileSync("src/shared/commandEnablement.ts", "utf8");

    expect(source).toContain('export type CommandDisabledReason = "readOnlyProject";');
    expect(source).not.toContain('"notImplemented"');
  });

  it("maps readOnlyProject disabled display state to the Feather Shield icon", () => {
    const indicator = resolveDisabledCommandPaletteStatusIndicator({
      enabled: false,
      disabledReason: "readOnlyProject"
    });

    expect(indicator?.kind).toBe("readOnlyProject");
    expect(indicator?.iconSvg).toContain("feather-shield");
    expect(indicator?.iconSvg).toContain('stroke="currentColor"');
  });

  it("maps disabled display state with null reason to the Ionicons Ban icon", () => {
    const indicator = resolveDisabledCommandPaletteStatusIndicator({
      enabled: false,
      disabledReason: null
    });

    expect(indicator?.kind).toBe("conditionUnavailable");
    expect(indicator?.iconSvg).toContain("ionicon");
    expect(indicator?.iconSvg).toContain("294.16 294.16");
  });

  it("does not show an icon for enabled commands", () => {
    expect(
      resolveDisabledCommandPaletteStatusIndicator({
        enabled: true,
        disabledReason: null
      })
    ).toBeNull();
  });

  it("keeps the notImplemented Construct indicator in the display layer", () => {
    const indicator = commandPaletteStatusIndicatorForReason("notImplemented");

    expect(indicator.kind).toBe("notImplemented");
    expect(indicator.iconSvg).toContain("ionicon");
    expect(indicator.iconSvg).toContain("stroke-linejoin");
  });
});

describe("icon asset layout", () => {
  const featherFiles = [
    "activity-bar/file.svg",
    "activity-bar/glossary.svg",
    "activity-bar/search.svg",
    "activity-bar/settings.svg",
    "dialog/alert-circle.svg",
    "dialog/clipboard.svg",
    "dialog/help-circle.svg",
    "dialog/info.svg",
    "dialog/x-circle.svg",
    "global/alert-triangle.svg",
    "global/close-x.svg",
    "global/edit-2.svg",
    "global/shield.svg",
    "glossary/delete.svg"
  ];

  it("stores existing Feather icons under assets/icons/feather without renaming files", () => {
    for (const relativePath of featherFiles) {
      expect(existsSync(`assets/icons/feather/${relativePath}`)).toBe(true);
      expect(existsSync(`assets/icons/${relativePath}`)).toBe(false);
    }
  });

  it("stores icon licenses per icon library", () => {
    expect(readFileSync("assets/icons/feather/LICENSE.txt", "utf8")).toContain(
      "Copyright (c) 2013-2023 Cole Bemis"
    );
    expect(readFileSync("assets/icons/ionicons/LICENSE.txt", "utf8")).toContain(
      "Copyright (c) 2015-present Ionic"
    );
    expect(existsSync("assets/icons/LICENSE.txt")).toBe(false);
  });

  it("adds only the required Ionicons Command Palette assets", () => {
    expect(
      existsSync("assets/icons/ionicons/command-palette/ban-outline.svg")
    ).toBe(true);
    expect(
      existsSync("assets/icons/ionicons/command-palette/construct-outline.svg")
    ).toBe(true);
    expect(
      existsSync("assets/icons/ionicons/command-palette/shield-outline.svg")
    ).toBe(false);
    expect(
      existsSync(
        "assets/icons/ionicons/command-palette/information-circle-outline.svg"
      )
    ).toBe(false);
  });
});

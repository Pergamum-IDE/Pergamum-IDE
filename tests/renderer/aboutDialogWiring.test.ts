import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("About dialog command wiring (#221)", () => {
  it("routes app.about.open through the App command registry into AboutDialog state", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain(
      "openAbout: () => openAboutDialogCommandRef.current()"
    );
    expect(source).toContain("openAboutDialogCommandRef.current = openAboutDialog");
    expect(source).toContain("await window.pergamum.appInfo.getAppInfo()");
    expect(source).toContain("setAboutDialogAppInfo(appInfo)");
    expect(source).toContain("<AboutDialog");
  });

  it("treats the About dialog as an app modal command blocker without using the confirm/choice controller", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const blockerIndex = source.indexOf("registry.setCommandExecutionBlocker(");
    const ignoredIndex = source.indexOf("registry.setOnCommandIgnored(");

    expect(blockerIndex).toBeGreaterThan(-1);
    expect(ignoredIndex).toBeGreaterThan(blockerIndex);

    const blockerBlock = source.slice(blockerIndex, ignoredIndex);

    expect(blockerBlock).toContain("dialogController.getPendingRequest()");
    expect(blockerBlock).toContain("isAboutDialogPendingOrOpenRef.current");
    expect(blockerBlock).toContain('"app_modal_open"');
  });
});

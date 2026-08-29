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

  it("routes About hidden staff credits through the app NotificationController with typed icon and anchor placement (#298)", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const start = source.indexOf("function showAboutStaffCredits(");
    const end = source.indexOf("/**", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);

    expect(block).toContain("notificationController.notify({");
    expect(block).toContain("message: aboutCreditsHeading(aboutDialogAppInfo)");
    expect(block).toContain('icon: { kind: "preset", name: "pergamum" }');
    expect(block).toContain("placement,");
    expect(block).toContain('motion: { kind: "fade" }');
    expect(block).toContain("detailRows: aboutCreditsRows()");
    expect(source).toContain("onShowStaffCredits={showAboutStaffCredits}");
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

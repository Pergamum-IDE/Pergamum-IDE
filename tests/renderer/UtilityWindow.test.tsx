import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import { UtilityWindow } from "../../src/renderer/UtilityWindow";

const translate: Translate = (key) => key;

describe("UtilityWindow", () => {
  it("shows the Occurrences tab and no longer the Debug Log tab (#377)", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        UtilityWindow,
        {
          activeTab: "occurrences",
          height: 220,
          translate,
          onSelectTab: () => undefined,
          onClose: () => undefined
        },
        React.createElement("p", null, "occurrences-panel")
      )
    );

    expect(markup).toContain("utilityWindow.tabs.occurrences");
    // #377: the Debug Log moved out of the Utility Window entirely.
    expect(markup).not.toContain("utilityWindow.tabs.debugLog");
    expect(markup).not.toContain("debugLog.title");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("occurrences-panel");
  });
});

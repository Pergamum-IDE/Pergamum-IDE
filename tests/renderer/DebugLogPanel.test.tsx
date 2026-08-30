import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import { DebugLogPanelView } from "../../src/renderer/DebugLogPanel";

const translate: Translate = (key, values) => {
  if (!values) {
    return key;
  }

  return `${key}:${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join(",")}`;
};

describe("DebugLogPanelView", () => {
  it("shows the disabled empty state", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DebugLogPanelView, {
        translate,
        state: {
          snapshot: {
            enabled: false,
            sessionId: null,
            events: [],
            uiDroppedEventCount: 0,
            uiBufferLimit: 1000
          },
          events: [],
          possibleGap: false
        }
      })
    );

    expect(markup).toContain("debugLog.disabled.title");
    expect(markup).toContain("debugLog.disabled.hint");
    expect(markup).not.toContain("debugLog.showingLatest");
  });

  it("shows enabled events, dropped count, details, and no session ID", () => {
    const sessionId = "018f4b8c-7a2b-4c3d-9e4f-100000000001";
    const markup = renderToStaticMarkup(
      React.createElement(DebugLogPanelView, {
        translate,
        now: new Date(2026, 7, 14, 23, 0, 0, 0),
        state: {
          snapshot: {
            enabled: true,
            sessionId,
            events: [],
            uiDroppedEventCount: 12,
            uiBufferLimit: 1000
          },
          events: [
            {
              seq: 1,
              timestamp: "2026-08-14T22:00:21.959+09:00",
              level: "info",
              event: "app.start",
              details: {
                debugMode: true,
                platform: "win32"
              }
            },
            {
              seq: 2,
              timestamp: "2026-08-15T00:00:00.012+09:00",
              level: "debug",
              event: "command.invoked",
              details: {
                commandId: "workspace.files.toggle"
              }
            }
          ],
          possibleGap: true
        }
      })
    );

    expect(markup).toContain("debugLog.enabled.description");
    expect(markup).toContain("debugLog.showingLatest:limit=1000");
    expect(markup).toContain("debugLog.droppedEvents:count=12");
    expect(markup).toContain("debugLog.possibleGap");
    expect(markup).toContain("debugLog.column.seq");
    expect(markup).toContain("22:00:21.959");
    expect(markup).toContain("2026-08-15 00:00:00.012");
    expect(markup).toContain("command.invoked");
    expect(markup).toContain("workspace.files.toggle");
    expect(markup).not.toContain(sessionId);
    expect(markup).not.toContain(".jsonl");
  });
});

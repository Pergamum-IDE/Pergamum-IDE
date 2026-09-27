import { describe, expect, it } from "vitest";
import { knownDebugLogCommandIds } from "../../src/shared/debugLog";
import {
  applicationCommandIds,
  applicationMenuCommandIds,
  editorCommandIds
} from "../../src/shared/commandIds";

describe("shortcut command ID scope", () => {
  it("does not add shortcut-specific Command IDs", () => {
    const commandIds = [
      applicationCommandIds.createProject,
      applicationCommandIds.openProject,
      editorCommandIds.openMarkdownDocument,
      editorCommandIds.saveDocument,
      ...applicationMenuCommandIds,
      ...knownDebugLogCommandIds
    ];

    expect(commandIds.join("\n")).not.toContain("shortcut.");
    expect(commandIds.join("\n")).not.toContain("keyboard.");
  });
});

import { describe, expect, it } from "vitest";
import {
  resolveCommandPaletteFocusRestorePolicy,
  type CommandPaletteFocusRestorePolicyInput
} from "../../src/renderer/commandPaletteFocusRestorePolicy";

const baseInput: CommandPaletteFocusRestorePolicyInput = {
  focusRestorePending: true,
  focusClaimingSurfacePendingOrOpen: false,
  hasOpenDocumentTab: true,
  activeSurface: "markdown",
  activeDocumentKey: "editor:active"
};

function resolve(
  overrides: Partial<CommandPaletteFocusRestorePolicyInput> = {}
) {
  return resolveCommandPaletteFocusRestorePolicy({
    ...baseInput,
    ...overrides
  });
}

describe("Command Palette focus restore policy", () => {
  it("returns the close-time active Markdown editor as the focus target", () => {
    expect(resolve({ activeDocumentKey: "editor:B" })).toEqual({
      kind: "requestFocus",
      documentKey: "editor:B"
    });
  });

  it("does nothing when no restore is pending", () => {
    expect(resolve({ focusRestorePending: false })).toEqual({
      kind: "blocked",
      reason: "focusRestoreNotPending"
    });
  });

  it("does not restore focus when another surface should keep keyboard focus", () => {
    expect(resolve({ focusClaimingSurfacePendingOrOpen: true })).toEqual({
      kind: "blocked",
      reason: "focusClaimingSurfacePendingOrOpen"
    });
  });

  it("does not restore focus in zero-tab state", () => {
    expect(
      resolve({
        hasOpenDocumentTab: false,
        activeSurface: "empty",
        activeDocumentKey: null
      })
    ).toEqual({
      kind: "blocked",
      reason: "zeroTab"
    });
  });

  it("does not restore focus when Settings is active", () => {
    expect(resolve({ activeSurface: "special" })).toEqual({
      kind: "blocked",
      reason: "specialSurfaceActive"
    });
  });

  it("does not restore focus when Glossary is active", () => {
    expect(resolve({ activeSurface: "glossary" })).toEqual({
      kind: "blocked",
      reason: "glossaryActive"
    });
  });

  it("does not restore focus without an active Markdown editor key", () => {
    expect(resolve({ activeDocumentKey: null })).toEqual({
      kind: "blocked",
      reason: "activeMarkdownEditorMissing"
    });
  });
});

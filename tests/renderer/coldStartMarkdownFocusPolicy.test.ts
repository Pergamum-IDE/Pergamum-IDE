import { describe, expect, it } from "vitest";
import {
  resolveColdStartMarkdownFocusPolicy,
  type ColdStartMarkdownFocusPolicyInput
} from "../../src/renderer/coldStartMarkdownFocusPolicy";

const baseInput: ColdStartMarkdownFocusPolicyInput = {
  coldStartRestoreSettled: true,
  coldStartMarkdownFocusArmed: true,
  launchRoutingSettled: true,
  deferredRestoreErrorDialogOutstanding: false,
  modalSurfacePendingOrOpen: false,
  hasOpenDocumentTab: true,
  activeSurface: "markdown",
  activeDocumentKey: "editor:final",
  pendingRestoreViewStateKey: null,
  documentHasFocus: true,
  focusAlreadyRequested: false
};

function resolve(
  overrides: Partial<ColdStartMarkdownFocusPolicyInput> = {}
) {
  return resolveColdStartMarkdownFocusPolicy({
    ...baseInput,
    ...overrides
  });
}

describe("cold-start Markdown focus policy (#280)", () => {
  it("allows the happy path for the final active Markdown editor", () => {
    expect(resolve()).toEqual({
      kind: "requestFocus",
      documentKey: "editor:final"
    });
  });

  it("waits while cold-start restore is not settled", () => {
    expect(resolve({ coldStartRestoreSettled: false })).toEqual({
      kind: "blocked",
      reason: "coldStartRestorePending"
    });
  });

  it("does not arm focus for ordinary startup fallback paths", () => {
    expect(resolve({ coldStartMarkdownFocusArmed: false })).toEqual({
      kind: "blocked",
      reason: "coldStartFocusNotArmed"
    });
  });

  it("waits while deferred launch routing is in-flight", () => {
    expect(resolve({ launchRoutingSettled: false })).toEqual({
      kind: "blocked",
      reason: "launchRoutingPending"
    });
  });

  it("waits while a deferred restore Error dialog is outstanding", () => {
    expect(
      resolve({ deferredRestoreErrorDialogOutstanding: true })
    ).toEqual({
      kind: "blocked",
      reason: "deferredRestoreErrorDialogOutstanding"
    });
  });

  it("waits while another modal surface is open or pending", () => {
    expect(resolve({ modalSurfacePendingOrOpen: true })).toEqual({
      kind: "blocked",
      reason: "modalSurfacePendingOrOpen"
    });
  });

  it("does not focus in zero-tab state", () => {
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

  it("does not focus when a Glossary editor is active", () => {
    expect(resolve({ activeSurface: "glossary" })).toEqual({
      kind: "blocked",
      reason: "glossaryActive"
    });
  });

  it("does not focus when a special surface is active", () => {
    expect(resolve({ activeSurface: "special" })).toEqual({
      kind: "blocked",
      reason: "specialSurfaceActive"
    });
  });

  it("does not focus without a final active Markdown editor key", () => {
    expect(resolve({ activeDocumentKey: null })).toEqual({
      kind: "blocked",
      reason: "activeMarkdownEditorMissing"
    });
  });

  it("waits while the final editor still has pending View State restore", () => {
    expect(
      resolve({ pendingRestoreViewStateKey: "editor:final" })
    ).toEqual({
      kind: "blocked",
      reason: "viewStatePending"
    });
  });

  it("does not focus while the renderer document is inactive", () => {
    expect(resolve({ documentHasFocus: false })).toEqual({
      kind: "blocked",
      reason: "documentInactive"
    });
  });

  it("is one-shot after a focus request has already been issued", () => {
    expect(resolve({ focusAlreadyRequested: true })).toEqual({
      kind: "blocked",
      reason: "alreadyRequested"
    });
  });
});

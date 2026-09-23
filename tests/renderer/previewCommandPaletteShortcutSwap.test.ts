/**
 * #554: Swap Command Palette / Preview toggle shortcuts.
 *
 * `App.tsx` is too large to mount in a full render test (no existing test
 * does this — see `toolbarCommandBox.test.ts`'s "App.tsx wiring
 * (source-level assertions)" convention, reused here), so these are
 * source-level assertions on the `useGlobalKeyboardShortcuts` registration
 * that guard against the Ctrl+P / Ctrl+Shift+P mapping silently drifting
 * back. Manual verification is documented in the PR description.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Preview toggle global shortcut wiring (source-level assertions, #554)", () => {
  it("registers togglePreview with ctrlOrCmd + shift, not plain ctrlOrCmd", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    const registrationStart = source.indexOf('id: "togglePreview"');
    expect(registrationStart).toBeGreaterThan(-1);

    const registrationEnd = source.indexOf("handler:", registrationStart);
    const block = source.slice(registrationStart, registrationEnd);

    expect(block).toContain(
      'match: { key: "p", ctrlOrCmd: true, shift: true }'
    );
  });
});

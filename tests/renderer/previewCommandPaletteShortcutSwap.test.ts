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
import { resolveDefaultKeybindings } from "../../src/shared/keybindings";

/** The catalog's win32 key for a command (the shortcut key is catalog-derived, #643). */
function catalogKey(commandId: string): string | null | undefined {
  return resolveDefaultKeybindings("win32").find(
    (binding) => binding.command === commandId
  )?.key;
}


describe("Preview toggle global shortcut wiring (source-level assertions, #554)", () => {
  it("registers togglePreview with ctrlOrCmd + shift, not plain ctrlOrCmd", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    const registrationStart = source.indexOf('id: "togglePreview"');
    expect(registrationStart).toBeGreaterThan(-1);

    const registrationEnd = source.indexOf("handler:", registrationStart);
    const block = source.slice(registrationStart, registrationEnd);

    // #643: the key is the catalog's Mod-Shift-p (Shift required, not plain Mod).
    expect(block).toContain(
      "commandId: rendererShortcutCommandIds.previewToggle"
    );
    expect(catalogKey("editor.preview.toggle")).toBe("Mod-Shift-p");
  });
});

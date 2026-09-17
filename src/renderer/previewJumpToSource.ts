/**
 * #504 Preview double-click jump-to-source.
 *
 * Pure DOM resolution logic for mapping a double-click inside the Markdown
 * Preview to a `data-source-line` source line, kept independent of
 * React/CodeMirror so it can be unit tested directly against DOM elements.
 */

/**
 * Elements whose native double-click behavior (navigation, an interactive
 * control, editable content) must not be hijacked by the source-line jump
 * (#504 decision D5).
 */
export const PREVIEW_JUMP_IGNORED_TARGET_SELECTOR =
  'a, img, button, input, textarea, select, label, summary, video, audio, [contenteditable], [role="button"], [role="link"]';

/**
 * #504 decision D4: only a plain double-click (no modifier key), following
 * VS Code's Markdown preview, triggers the jump.
 */
export function isPreviewJumpModifierHeld(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
}

export type PreviewJumpTargetResolution =
  | { kind: "ignoredTarget" }
  | { kind: "noSourceLine" }
  | { kind: "invalidLine"; rawValue: string }
  | { kind: "line"; sourceLine: number };

/**
 * Resolves a preview double-click's event target to a source line, or the
 * reason it cannot jump. Uses the innermost `[data-source-line]` ancestor
 * (`closest`), so a block nested inside another block (e.g. a `<p>` inside an
 * `<li>`) resolves to its own line, not its container's (#504 decision D6).
 */
export function resolvePreviewJumpTarget(
  eventTarget: EventTarget | null,
  container: HTMLElement
): PreviewJumpTargetResolution {
  const target = eventTarget instanceof Element ? eventTarget : null;

  if (target?.closest(PREVIEW_JUMP_IGNORED_TARGET_SELECTOR)) {
    return { kind: "ignoredTarget" };
  }

  const sourceElement = target?.closest("[data-source-line]") ?? null;
  if (!sourceElement || !container.contains(sourceElement)) {
    return { kind: "noSourceLine" };
  }

  const rawValue = sourceElement.getAttribute("data-source-line") ?? "";
  const parsed = parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return { kind: "invalidLine", rawValue };
  }

  return { kind: "line", sourceLine: parsed };
}

export interface PreviewJumpLineClampResult {
  targetLine: number;
  clamped: boolean;
}

/**
 * Clamps a parsed source line to `[1, docLineCount]` — the preview can lag
 * behind editor edits because of the debounced render pipeline, so a stale
 * block's line can exceed the current document's line count (#504 decision
 * D2).
 */
export function clampPreviewJumpLine(
  sourceLine: number,
  docLineCount: number
): PreviewJumpLineClampResult {
  if (sourceLine > docLineCount) {
    return { targetLine: docLineCount, clamped: true };
  }
  return { targetLine: sourceLine, clamped: false };
}

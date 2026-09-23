/**
 * #542: Toolbar Command Box POC component.
 *
 * The Command Box is a mode selector + launcher, NOT a real input field.
 * - Prefix button: cycles the mode. Does NOT open the Command Palette.
 * - Launcher body: opens the existing central Command Palette in the current
 *   mode by calling `onOpenCommandPalette` with the mode's `initialPrefix`.
 *
 * Text input, candidate filtering, IME handling, Enter/Esc navigation, and
 * candidate display are all delegated to the existing Command Palette.
 */

import {
  useRef,
  useState,
  type FC,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import {
  TOOLBAR_COMMAND_BOX_DEFAULT_INDEX,
  nextToolbarCommandBoxModeIndex,
  resolveToolbarCommandBoxModeEntry
} from "../toolbarCommandBoxModes";
import type { QuickAccessPrefix } from "../quickAccessInputParser";
import { normalizeCommandPaletteLaunchAnimationDurationMs } from "../../shared/commandPaletteLaunchAnimationSettings";

const COMMAND_PALETTE_LAUNCH_ANIMATION_EASING = "ease-out";

export interface ToolbarCommandBoxProps {
  /**
   * Called when the user clicks the launcher body (or activates it with
   * Enter/Space). The `initialPrefix` corresponds to the current mode's
   * QuickAccess prefix (e.g. `">"` for command mode, `""` for file mode).
   *
   * IMPORTANT: file mode uses `""` (empty string). The caller must NOT
   * collapse this to `">"`. Use `initialPrefix ?? ">"`, not `initialPrefix || ">"`.
   */
  onOpenCommandPalette: (initialPrefix: QuickAccessPrefix) => void;
  isCommandPaletteOpen: boolean;
  launchAnimationDurationMs: number;
  translate: Translate;
}

function isUsableRect(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function measureCommandPaletteInputTargetRect(): DOMRect | null {
  if (typeof document === "undefined" || !document.body) {
    return null;
  }

  const measureRoot = document.createElement("div");
  measureRoot.className = "commandPaletteLaunchMeasure";
  measureRoot.setAttribute("aria-hidden", "true");

  const palette = document.createElement("div");
  palette.className = "commandPalette";

  const inputRow = document.createElement("div");
  inputRow.className = "commandPaletteInputRow";

  const inputTarget = document.createElement("div");
  inputTarget.className = "commandPaletteLaunchMeasureInput";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "commandPaletteCloseButton";
  closeButton.tabIndex = -1;
  closeButton.textContent = "\u00d7";

  inputRow.append(inputTarget, closeButton);
  palette.append(inputRow);
  measureRoot.append(palette);
  document.body.append(measureRoot);

  try {
    const rect = inputTarget.getBoundingClientRect();
    return isUsableRect(rect) ? rect : null;
  } finally {
    measureRoot.remove();
  }
}

function createCommandPaletteLaunchGhost(input: {
  readonly sourceRect: DOMRect;
  readonly prefixLabel: string;
  readonly placeholderText: string;
  readonly isEmptyPrefix: boolean;
  readonly durationMs: number;
}): HTMLDivElement {
  const ghost = document.createElement("div");
  ghost.className = "commandPaletteLaunchGhost";
  ghost.style.left = `${input.sourceRect.left}px`;
  ghost.style.top = `${input.sourceRect.top}px`;
  ghost.style.width = `${input.sourceRect.width}px`;
  ghost.style.height = `${input.sourceRect.height}px`;
  ghost.style.setProperty(
    "--command-palette-launch-animation-duration",
    `${input.durationMs}ms`
  );

  const prefix = document.createElement("span");
  prefix.className = input.isEmptyPrefix
    ? "commandPaletteLaunchGhostPrefix commandPaletteLaunchGhostPrefixEmpty"
    : "commandPaletteLaunchGhostPrefix";
  prefix.textContent = input.prefixLabel;

  const placeholder = document.createElement("span");
  placeholder.className = "commandPaletteLaunchGhostPlaceholder";
  placeholder.textContent = input.placeholderText;

  ghost.append(prefix, placeholder);
  return ghost;
}

function finishCommandPaletteLaunchAnimation(
  ghost: HTMLElement,
  onComplete: () => void
): void {
  onComplete();
  ghost.remove();
}

function runCommandPaletteLaunchAnimation(input: {
  readonly launcher: HTMLElement;
  readonly prefixLabel: string;
  readonly placeholderText: string;
  readonly isEmptyPrefix: boolean;
  readonly durationMs: number;
  readonly onComplete: () => void;
}): boolean {
  const durationMs = normalizeCommandPaletteLaunchAnimationDurationMs(
    input.durationMs
  );

  if (
    durationMs <= 0 ||
    prefersReducedMotion() ||
    typeof document === "undefined" ||
    !document.body
  ) {
    return false;
  }

  const sourceRect = input.launcher.getBoundingClientRect();
  if (!isUsableRect(sourceRect)) {
    return false;
  }

  const targetRect = measureCommandPaletteInputTargetRect();
  if (!targetRect || !isUsableRect(targetRect)) {
    return false;
  }

  const ghost = createCommandPaletteLaunchGhost({
    sourceRect,
    prefixLabel: input.prefixLabel,
    placeholderText: input.placeholderText,
    isEmptyPrefix: input.isEmptyPrefix,
    durationMs
  });
  document.body.append(ghost);

  if (typeof ghost.animate !== "function") {
    ghost.remove();
    return false;
  }

  const deltaX = targetRect.left - sourceRect.left;
  const deltaY = targetRect.top - sourceRect.top;
  const scaleX = targetRect.width / sourceRect.width;
  const scaleY = targetRect.height / sourceRect.height;
  let didFinish = false;

  const finish = (): void => {
    if (didFinish) {
      return;
    }

    didFinish = true;
    finishCommandPaletteLaunchAnimation(ghost, input.onComplete);
  };

  try {
    const animation = ghost.animate(
      [
        {
          opacity: 1,
          transform: "translate3d(0, 0, 0) scale(1, 1)",
          boxShadow: "0 2px 8px rgba(15, 36, 56, 0.12)"
        },
        {
          opacity: 0.94,
          transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
          boxShadow: "0 10px 28px rgba(15, 36, 56, 0.22)"
        }
      ],
      {
        duration: durationMs,
        easing: COMMAND_PALETTE_LAUNCH_ANIMATION_EASING,
        fill: "forwards"
      }
    );

    void animation.finished.then(finish, finish);
  } catch {
    ghost.remove();
    return false;
  }

  return true;
}

/**
 * Toolbar Command Box POC.
 *
 * Internal state: `modeIndex` — which entry in `TOOLBAR_COMMAND_BOX_MODES`
 * is currently selected. This state is local to the Command Box and does NOT
 * affect the global Command Palette or Ctrl+P (#554) behavior.
 */
export const ToolbarCommandBox: FC<ToolbarCommandBoxProps> = ({
  onOpenCommandPalette,
  isCommandPaletteOpen,
  launchAnimationDurationMs,
  translate
}) => {
  const [modeIndex, setModeIndex] = useState(TOOLBAR_COMMAND_BOX_DEFAULT_INDEX);
  const isLaunchAnimationPendingRef = useRef(false);

  const modeEntry = resolveToolbarCommandBoxModeEntry(modeIndex);

  function handlePrefixClick(): void {
    setModeIndex((current) => nextToolbarCommandBoxModeIndex(current));
  }

  function openCommandPalette(): void {
    onOpenCommandPalette(modeEntry.initialPrefix);
  }

  const prefixLabel =
    modeEntry.initialPrefix !== "" ? modeEntry.initialPrefix : "…";
  const isEmpty = modeEntry.initialPrefix === "";
  const placeholderText = translate(modeEntry.placeholderKey);
  const prefixButtonLabel = `${translate(
    "toolbar.commandBox.cycleMode"
  )} (${placeholderText})`;

  function handleBodyClick(event: ReactMouseEvent<HTMLButtonElement>): void {
    if (isLaunchAnimationPendingRef.current) {
      return;
    }

    if (isCommandPaletteOpen || event.detail === 0) {
      openCommandPalette();
      return;
    }

    isLaunchAnimationPendingRef.current = true;
    const didStartAnimation = runCommandPaletteLaunchAnimation({
      launcher: event.currentTarget,
      prefixLabel,
      placeholderText,
      isEmptyPrefix: isEmpty,
      durationMs: launchAnimationDurationMs,
      onComplete: () => {
        isLaunchAnimationPendingRef.current = false;
        openCommandPalette();
      }
    });

    if (!didStartAnimation) {
      isLaunchAnimationPendingRef.current = false;
      openCommandPalette();
    }
  }

  return (
    <div className="toolbarCommandBoxGroup">
      <div className="toolbarCommandBox" data-testid="toolbarCommandBox">
        {/* Prefix / mode cycle button */}
        <button
          type="button"
          className="toolbarCommandBoxPrefix"
          onClick={handlePrefixClick}
          aria-label={prefixButtonLabel}
          title={prefixButtonLabel}
          data-testid="toolbarCommandBoxPrefix"
          data-mode={modeEntry.mode}
        >
          <span
            className={isEmpty ? "toolbarCommandBoxPrefixEmpty" : undefined}
            aria-hidden="true"
          >
            {prefixLabel}
          </span>
        </button>

        {/* Launcher body — looks like an input, behaves as a button */}
        <button
          type="button"
          className="toolbarCommandBoxBody"
          onClick={handleBodyClick}
          aria-label={translate(modeEntry.launcherLabelKey)}
          title={translate(modeEntry.launcherLabelKey)}
          data-testid="toolbarCommandBoxBody"
          data-mode={modeEntry.mode}
        >
          <span className="toolbarCommandBoxBodyPlaceholder">
            {placeholderText}
          </span>
        </button>
      </div>
    </div>
  );
};

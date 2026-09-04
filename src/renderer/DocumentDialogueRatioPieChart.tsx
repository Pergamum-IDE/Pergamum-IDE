/**
 * #360 UI polish — a tiny SVG donut chart for the Document Navigation pane's
 * narration / dialogue split. Pure display: it takes the SAME
 * `narrationPercent` / `dialoguePercent` the numbers below it show (produced
 * by `analyzeDocumentNavigationDialogueRatio`) and never recomputes the
 * split. Colours come from theme tokens (see styles.css) so light / dark
 * both stay legible; no new settings.
 *
 * Method A (stroke-dasharray on `r = 100 / 2π`, so a percent maps 1:1 to arc
 * length): a full "dialogue" ring is drawn, then the "narration" arc on top.
 * narration 0% → the dialogue ring shows through (dialogue 100%); narration
 * 100% → a full narration ring. `total = 0` → only a neutral outline track.
 */

/** Circle radius whose circumference is exactly 100 (percent → arc length). */
const RING_RADIUS = 100 / (2 * Math.PI);
/** Rotate the dash start from 3 o'clock to 12 o'clock (quarter of 100). */
const RING_DASH_OFFSET = 25;

export interface DialogueRatioPieModel {
  /** No data to plot (`total <= 0`) — render an outline-only track. */
  readonly isEmpty: boolean;
  /** 0..100 integer; `narrationPercent + dialoguePercent === 100` when not empty. */
  readonly narrationPercent: number;
  readonly dialoguePercent: number;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value >= 100 ? 100 : Math.round(value);
}

/**
 * Render model for the donut. Defensive against non-finite / out-of-range
 * input even though the analysis never produces it: percents are clamped to
 * `0..100` and forced to sum to 100 (dialogue = remainder of narration) so
 * the ring is always whole.
 */
export function dialogueRatioPieModel(
  narrationPercent: number,
  dialoguePercent: number,
  totalCharacters: number
): DialogueRatioPieModel {
  if (!Number.isFinite(totalCharacters) || totalCharacters <= 0) {
    return { isEmpty: true, narrationPercent: 0, dialoguePercent: 0 };
  }

  const narration = clampPercent(narrationPercent);
  // Trust narration; dialogue is whatever is left so the two always sum to
  // 100, regardless of rounding in the source percents.
  const dialogue = 100 - narration;
  // `dialoguePercent` is only consulted to disambiguate a 0/0 source (which
  // `totalCharacters > 0` should already rule out, but be safe).
  if (narration === 0 && clampPercent(dialoguePercent) === 0) {
    return { isEmpty: true, narrationPercent: 0, dialoguePercent: 0 };
  }

  return { isEmpty: false, narrationPercent: narration, dialoguePercent: dialogue };
}

interface DocumentDialogueRatioPieChartProps {
  readonly narrationPercent: number;
  readonly dialoguePercent: number;
  readonly totalCharacters: number;
  /** Accessible description, e.g. "地の文 68% / 会話文 32%". */
  readonly ariaLabel: string;
}

export function DocumentDialogueRatioPieChart({
  narrationPercent,
  dialoguePercent,
  totalCharacters,
  ariaLabel
}: DocumentDialogueRatioPieChartProps): JSX.Element {
  const model = dialogueRatioPieModel(
    narrationPercent,
    dialoguePercent,
    totalCharacters
  );

  return (
    <svg
      className="documentNavigationDialoguePie"
      viewBox="0 0 36 36"
      role="img"
      aria-label={ariaLabel}
      data-empty={model.isEmpty ? "true" : undefined}
    >
      <circle
        className="documentNavigationDialoguePieTrack"
        cx="18"
        cy="18"
        r={RING_RADIUS}
        fill="none"
      />
      {model.isEmpty ? null : (
        <>
          <circle
            className="documentNavigationDialoguePieDialogue"
            cx="18"
            cy="18"
            r={RING_RADIUS}
            fill="none"
          />
          <circle
            className="documentNavigationDialoguePieNarration"
            cx="18"
            cy="18"
            r={RING_RADIUS}
            fill="none"
            strokeDasharray={`${model.narrationPercent} ${
              100 - model.narrationPercent
            }`}
            strokeDashoffset={RING_DASH_OFFSET}
          />
        </>
      )}
    </svg>
  );
}

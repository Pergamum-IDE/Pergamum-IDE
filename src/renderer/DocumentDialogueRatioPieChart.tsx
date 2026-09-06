/**
 * #360 UI polish & Final chart refinement:
 * A standard SVG pie chart (sector paths, no donut hole) for the Document
 * Metrics pane's narration / dialogue split.
 *
 * Slices are plotted using raw counts (not rounded percentages) to ensure the
 * circle closes mathematically to 360 degrees:
 *   - Narration sector
 *   - Individual dialogue pair sectors (in order, colored by pair.color)
 *   - No aggregate "dialogue total" slice.
 *
 * Edge cases handled defensively:
 *   - totalCharacters <= 0 -> neutral track circle, data-empty="true"
 *   - 100% single slice -> full <circle> (SVG arc degenerate case)
 *   - zero-count pairs -> omitted from slice rendering
 *   - animationProgress -> clamps sector angles (0..1)
 */

/**
 * Pie radius in SVG user coordinates (viewBox 0 0 36 36).
 * Note: The reveal animation mask circle uses radius = PIE_RADIUS / 2 = 7.5 and
 * strokeWidth = PIE_RADIUS = 15.
 * Its circumference is 2π × 7.5 ≈ 47.124, which is mirrored in styles.css
 * for .documentMetricsDialoguePieMaskCircle and @keyframes documentMetricsPieReveal.
 * If PIE_RADIUS changes, update styles.css accordingly.
 */
export const PIE_RADIUS = 15;
export const PIE_CENTER_X = 18;
export const PIE_CENTER_Y = 18;

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
 * Back-compat render model for tests expecting `dialogueRatioPieModel`.
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
  const dialogue = 100 - narration;
  if (narration === 0 && clampPercent(dialoguePercent) === 0) {
    return { isEmpty: true, narrationPercent: 0, dialoguePercent: 0 };
  }

  return { isEmpty: false, narrationPercent: narration, dialoguePercent: dialogue };
}

/**
 * SVG path description for a pie sector starting at `startAngle` and sweeping
 * clockwise to `endAngle` (angles in radians, 0 is 12 o'clock).
 */
export function describePieSector(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const x1 = cx + r * Math.sin(startAngle);
  const y1 = cy - r * Math.cos(startAngle);
  const x2 = cx + r * Math.sin(endAngle);
  const y2 = cy - r * Math.cos(endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx.toFixed(3)} ${cy.toFixed(3)} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${largeArcFlag} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

export interface DocumentDialogueRatioPieSlice {
  readonly pairIndex?: number;
  readonly characters?: number;
  readonly percent: number;
  readonly color: string;
}

export interface ComputedPieSlice {
  readonly key: string;
  readonly isFullCircle: boolean;
  readonly pathData: string;
  readonly color?: string;
  readonly className: string;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly count: number;
}

export function computePieSlices(
  totalCharacters: number,
  narrationCount: number,
  pairs: readonly {
    readonly pairIndex?: number;
    readonly characters?: number;
    readonly color?: string;
  }[],
  animationProgress = 1
): ComputedPieSlice[] {
  if (!Number.isFinite(totalCharacters) || totalCharacters <= 0) {
    return [];
  }

  const progress = Math.max(0, Math.min(1, animationProgress));
  if (progress <= 0) {
    return [];
  }

  const maxAngle = progress * 2 * Math.PI;

  const rawItems: {
    readonly key: string;
    readonly count: number;
    readonly color?: string;
    readonly className: string;
  }[] = [
    {
      key: "narration",
      count: narrationCount,
      color: undefined,
      className: "documentMetricsDialoguePieSector documentMetricsDialoguePieNarration"
    },
    ...pairs.map((pair, index) => ({
      key: `pair-${pair.pairIndex ?? index}`,
      count: pair.characters ?? 0,
      color: pair.color,
      className: "documentMetricsDialoguePieSector documentMetricsDialoguePiePair"
    }))
  ];

  // If progress is complete (1) and a single slice represents 100% of the total:
  if (progress >= 1) {
    const fullSlice = rawItems.find((it) => it.count === totalCharacters && it.count > 0);
    if (fullSlice) {
      return [
        {
          key: fullSlice.key,
          isFullCircle: true,
          pathData: "",
          color: fullSlice.color,
          className: fullSlice.className,
          startAngle: 0,
          endAngle: 2 * Math.PI,
          count: fullSlice.count
        }
      ];
    }
  }

  const slices: ComputedPieSlice[] = [];
  let cumulative = 0;

  for (const item of rawItems) {
    if (item.count <= 0) {
      continue;
    }

    const startAngle = (cumulative / totalCharacters) * 2 * Math.PI;
    const endAngle = ((cumulative + item.count) / totalCharacters) * 2 * Math.PI;
    cumulative += item.count;

    const clampedStart = Math.min(startAngle, maxAngle);
    const clampedEnd = Math.min(endAngle, maxAngle);

    if (clampedEnd <= clampedStart) {
      continue;
    }

    if (clampedEnd - clampedStart >= 2 * Math.PI - 1e-6) {
      slices.push({
        key: item.key,
        isFullCircle: true,
        pathData: "",
        color: item.color,
        className: item.className,
        startAngle: clampedStart,
        endAngle: clampedEnd,
        count: item.count
      });
    } else {
      slices.push({
        key: item.key,
        isFullCircle: false,
        pathData: describePieSector(
          PIE_CENTER_X,
          PIE_CENTER_Y,
          PIE_RADIUS,
          clampedStart,
          clampedEnd
        ),
        color: item.color,
        className: item.className,
        startAngle: clampedStart,
        endAngle: clampedEnd,
        count: item.count
      });
    }
  }

  return slices;
}

export interface DocumentDialogueRatioPieChartProps {
  readonly narrationPercent: number;
  readonly totalCharacters: number;
  readonly narrationCharacters?: number;
  /**
   * Slices for each dialogue delimiter pair.
   * Rendered with individual colors (`pair.color`).
   */
  readonly pairs?: readonly DocumentDialogueRatioPieSlice[];
  /** Accessible description, e.g. "地の文 68% / 会話文 「 ～ 」 22%". */
  readonly ariaLabel: string;
  /** Optional animation progress for reveal animation (0..1). Defaults to 1 (fully revealed). */
  readonly animationProgress?: number;
  /** Key that changes when pane shows or chart switches to trigger CSS animation */
  readonly animationKey?: number;
  /** Backwards compatibility for callers/tests with legacy 2-slice parameters */
  readonly dialoguePercent?: number;
}

export function DocumentDialogueRatioPieChart({
  narrationPercent,
  dialoguePercent,
  totalCharacters,
  narrationCharacters,
  pairs,
  ariaLabel,
  animationProgress = 1,
  animationKey
}: DocumentDialogueRatioPieChartProps): JSX.Element {
  const isEmpty = !Number.isFinite(totalCharacters) || totalCharacters <= 0;

  let slices: ComputedPieSlice[] = [];
  if (!isEmpty) {
    if (pairs !== undefined) {
      const narrationCount =
        narrationCharacters ??
        Math.max(
          0,
          totalCharacters - pairs.reduce((sum, p) => sum + (p.characters ?? 0), 0)
        );
      slices = computePieSlices(
        totalCharacters,
        narrationCount,
        pairs,
        animationProgress
      );
    } else {
      // Legacy 2-slice fallback
      const narrationCount =
        narrationCharacters ??
        Math.round((clampPercent(narrationPercent) / 100) * totalCharacters);
      const dialogueCount = totalCharacters - narrationCount;
      slices = computePieSlices(
        totalCharacters,
        narrationCount,
        dialogueCount > 0
          ? [
              {
                pairIndex: 0,
                characters: dialogueCount,
                color: "var(--workspace-sidebar-focus-ring)"
              }
            ]
          : [],
        animationProgress
      );
    }
  }

  return (
    <svg
      key={animationKey}
      className="documentMetricsDialoguePie"
      viewBox="0 0 36 36"
      role="img"
      aria-label={ariaLabel}
      data-empty={isEmpty ? "true" : undefined}
      data-revealing={animationKey !== undefined ? "true" : undefined}
    >
      <defs>
        <mask id="documentMetricsPieMask">
          {/* Mask circle: r = PIE_RADIUS / 2 = 7.5, strokeWidth = PIE_RADIUS = 15.
              Circumference = 2π × 7.5 ≈ 47.124 (mirrored in styles.css .documentMetricsDialoguePieMaskCircle) */}
          <circle
            cx={PIE_CENTER_X}
            cy={PIE_CENTER_Y}
            r={PIE_RADIUS / 2}
            stroke="white"
            strokeWidth={PIE_RADIUS}
            fill="none"
            transform={`rotate(-90 ${PIE_CENTER_X} ${PIE_CENTER_Y})`}
            className="documentMetricsDialoguePieMaskCircle"
          />
        </mask>
      </defs>
      <circle
        className="documentMetricsDialoguePieTrack"
        cx={PIE_CENTER_X}
        cy={PIE_CENTER_Y}
        r={PIE_RADIUS}
        fill="none"
      />
      <g
        className="documentMetricsDialoguePieSlices"
        mask="url(#documentMetricsPieMask)"
      >
        {slices.map((slice) =>
          slice.isFullCircle ? (
            <circle
              key={slice.key}
              className={slice.className}
              cx={PIE_CENTER_X}
              cy={PIE_CENTER_Y}
              r={PIE_RADIUS}
              fill={slice.color}
            />
          ) : (
            <path
              key={slice.key}
              className={slice.className}
              d={slice.pathData}
              fill={slice.color}
            />
          )
        )}
      </g>
    </svg>
  );
}

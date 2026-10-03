import type {
  PreferredPlacement,
  RectLike,
  SizeLike,
  UsageTourPlacementResult
} from "./usageTourTypes";

export const USAGE_TOUR_SPOTLIGHT_PADDING = 4;
export const USAGE_TOUR_BALLOON_OFFSET = 12;
export const USAGE_TOUR_VIEWPORT_MARGIN = 16;

export function calculateUsageTourPlacement(
  targetRect: RectLike | null,
  balloonSize: SizeLike,
  viewport: SizeLike,
  preferredPlacement: PreferredPlacement = "bottom"
): UsageTourPlacementResult {
  // If no target is available, fallback to centered non-anchored position
  if (!targetRect || targetRect.width <= 0 || targetRect.height <= 0) {
    const centeredLeft = Math.max(
      USAGE_TOUR_VIEWPORT_MARGIN,
      Math.round((viewport.width - balloonSize.width) / 2)
    );
    const centeredTop = Math.max(
      USAGE_TOUR_VIEWPORT_MARGIN,
      Math.round((viewport.height - balloonSize.height) / 2)
    );

    return {
      balloonPosition: {
        left: centeredLeft,
        top: centeredTop
      },
      arrowPlacement: "none",
      spotlightRect: null
    };
  }

  const spotlightRect: RectLike = {
    left: Math.round(targetRect.left - USAGE_TOUR_SPOTLIGHT_PADDING),
    top: Math.round(targetRect.top - USAGE_TOUR_SPOTLIGHT_PADDING),
    width: Math.round(targetRect.width + USAGE_TOUR_SPOTLIGHT_PADDING * 2),
    height: Math.round(targetRect.height + USAGE_TOUR_SPOTLIGHT_PADDING * 2)
  };

  let left = 0;
  let top = 0;
  let arrowPlacement: "top" | "bottom" | "left" | "right" | "none" = "none";

  if (preferredPlacement === "right") {
    const idealLeft =
      spotlightRect.left + spotlightRect.width + USAGE_TOUR_BALLOON_OFFSET;
    const fitsRight =
      idealLeft + balloonSize.width <=
      viewport.width - USAGE_TOUR_VIEWPORT_MARGIN;

    if (fitsRight) {
      left = idealLeft;
      arrowPlacement = "left"; // Arrow points left toward the target
    } else {
      // Fallback to left
      const fallbackLeft =
        spotlightRect.left - USAGE_TOUR_BALLOON_OFFSET - balloonSize.width;
      left = fallbackLeft;
      arrowPlacement = "right"; // Arrow points right toward the target
    }

    // Align vertically around center of spotlight
    top = Math.round(
      spotlightRect.top + (spotlightRect.height - balloonSize.height) / 2
    );
  } else if (preferredPlacement === "bottom") {
    const idealTop =
      spotlightRect.top + spotlightRect.height + USAGE_TOUR_BALLOON_OFFSET;
    const fitsBottom =
      idealTop + balloonSize.height <=
      viewport.height - USAGE_TOUR_VIEWPORT_MARGIN;

    if (fitsBottom) {
      top = idealTop;
      arrowPlacement = "top"; // Arrow points top toward the target
    } else {
      // Fallback to top
      const fallbackTop =
        spotlightRect.top - USAGE_TOUR_BALLOON_OFFSET - balloonSize.height;
      top = fallbackTop;
      arrowPlacement = "bottom"; // Arrow points bottom toward the target
    }

    // Align horizontally around center of spotlight
    left = Math.round(
      spotlightRect.left + (spotlightRect.width - balloonSize.width) / 2
    );
  } else if (preferredPlacement === "left") {
    const idealLeft =
      spotlightRect.left - USAGE_TOUR_BALLOON_OFFSET - balloonSize.width;
    const fitsLeft = idealLeft >= USAGE_TOUR_VIEWPORT_MARGIN;

    if (fitsLeft) {
      left = idealLeft;
      arrowPlacement = "right";
    } else {
      left =
        spotlightRect.left + spotlightRect.width + USAGE_TOUR_BALLOON_OFFSET;
      arrowPlacement = "left";
    }

    top = Math.round(
      spotlightRect.top + (spotlightRect.height - balloonSize.height) / 2
    );
  } else {
    // preferredPlacement === "top"
    const idealTop =
      spotlightRect.top - USAGE_TOUR_BALLOON_OFFSET - balloonSize.height;
    const fitsTop = idealTop >= USAGE_TOUR_VIEWPORT_MARGIN;

    if (fitsTop) {
      top = idealTop;
      arrowPlacement = "bottom";
    } else {
      top =
        spotlightRect.top + spotlightRect.height + USAGE_TOUR_BALLOON_OFFSET;
      arrowPlacement = "top";
    }

    left = Math.round(
      spotlightRect.left + (spotlightRect.width - balloonSize.width) / 2
    );
  }

  // Clamp within viewport margins
  const maxLeft = Math.max(
    USAGE_TOUR_VIEWPORT_MARGIN,
    viewport.width - balloonSize.width - USAGE_TOUR_VIEWPORT_MARGIN
  );
  const maxTop = Math.max(
    USAGE_TOUR_VIEWPORT_MARGIN,
    viewport.height - balloonSize.height - USAGE_TOUR_VIEWPORT_MARGIN
  );

  const clampedLeft = Math.min(
    maxLeft,
    Math.max(USAGE_TOUR_VIEWPORT_MARGIN, left)
  );
  const clampedTop = Math.min(maxTop, Math.max(USAGE_TOUR_VIEWPORT_MARGIN, top));

  return {
    balloonPosition: {
      left: clampedLeft,
      top: clampedTop
    },
    arrowPlacement,
    spotlightRect
  };
}

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { USAGE_TOUR_STEPS } from "./usageTourSteps";
import { calculateUsageTourPlacement } from "./usageTourPlacement";
import type { RectLike, SizeLike } from "./usageTourTypes";
import type { Translate } from "../../shared/i18n";
import "./usageTour.css";

export interface UsageTourProps {
  isOpen: boolean;
  isManual: boolean;
  translate: Translate;
  onClose: () => void;
  onDismissAutoShow: () => void;
  onComplete: () => void;
}

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElementsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector)
  ).filter(
    (el) => !el.hidden && el.getAttribute("aria-hidden") !== "true" && el.tabIndex >= 0
  );
}

export const UsageTour: FC<UsageTourProps> = ({
  isOpen,
  isManual: _isManual,
  translate,
  onClose,
  onDismissAutoShow,
  onComplete
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const balloonRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  const [targetRect, setTargetRect] = useState<RectLike | null>(null);
  const [balloonSize, setBalloonSize] = useState<SizeLike>({
    width: 360,
    height: 220
  });
  const [viewportSize, setViewportSize] = useState<SizeLike>({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768
  });

  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const bodyId = `${dialogId}-body`;

  const totalSteps = USAGE_TOUR_STEPS.length;
  const currentStep = USAGE_TOUR_STEPS[stepIndex] ?? USAGE_TOUR_STEPS[0];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;

  // Save active element when opened, restore when closed
  useEffect(() => {
    if (isOpen) {
      if (document.activeElement instanceof HTMLElement) {
        previousActiveElementRef.current = document.activeElement;
      }
      setStepIndex(0);
    } else {
      if (
        previousActiveElementRef.current &&
        document.contains(previousActiveElementRef.current)
      ) {
        previousActiveElementRef.current.focus();
      }
      previousActiveElementRef.current = null;
    }
  }, [isOpen]);

  // Update target rect based on current step
  const updateGeometry = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    setViewportSize({
      width: window.innerWidth,
      height: window.innerHeight
    });

    if (balloonRef.current) {
      const bRect = balloonRef.current.getBoundingClientRect();
      if (bRect.width > 0 && bRect.height > 0) {
        setBalloonSize({
          width: bRect.width,
          height: bRect.height
        });
      }
    }

    if (!currentStep.targetId) {
      setTargetRect(null);
      return;
    }

    const targetElement = document.querySelector(
      `[data-usage-tour-target="${currentStep.targetId}"]`
    );

    if (targetElement && targetElement instanceof HTMLElement) {
      const rect = targetElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        });
        return;
      }
    }

    // Fallback to null (centered) if target element is missing or not visible
    setTargetRect(null);
  }, [currentStep]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updateGeometry();

    const handleResize = (): void => {
      updateGeometry();
    };

    window.addEventListener("resize", handleResize);

    let observer: ResizeObserver | null = null;
    if (currentStep.targetId && typeof ResizeObserver !== "undefined") {
      const targetElement = document.querySelector(
        `[data-usage-tour-target="${currentStep.targetId}"]`
      );
      if (targetElement) {
        observer = new ResizeObserver(() => {
          updateGeometry();
        });
        observer.observe(targetElement);
      }
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [isOpen, currentStep, updateGeometry]);

  // Auto-focus primary button on step change
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Small delay to let the DOM settle
    const timer = setTimeout(() => {
      if (primaryButtonRef.current) {
        primaryButtonRef.current.focus();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, stepIndex]);

  // Focus trap inside the balloon & Escape key dismissal
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key === "Tab") {
      if (!balloonRef.current) {
        return;
      }

      const focusable = focusableElementsIn(balloonRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (
          document.activeElement === first ||
          !balloonRef.current.contains(document.activeElement)
        ) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (
          document.activeElement === last ||
          !balloonRef.current.contains(document.activeElement)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  };

  if (!isOpen) {
    return null;
  }

  const placement = calculateUsageTourPlacement(
    targetRect,
    balloonSize,
    viewportSize,
    currentStep.preferredPlacement
  );

  const handleNext = (): void => {
    if (isLastStep) {
      onComplete();
    } else {
      setStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
    }
  };

  const handleBack = (): void => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  return (
    <div
      ref={containerRef}
      className="usageTourContainer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={handleKeyDown}
      data-testid="usageTour"
    >
      {/* Background click blocker */}
      <div
        className={`usageTourBackdrop ${!placement.spotlightRect ? "isDimmed" : ""}`}
        aria-hidden="true"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />

      {/* Spotlight highlight: blocks clicks as well */}
      {placement.spotlightRect && (
        <div
          className="usageTourSpotlight"
          aria-hidden="true"
          style={{
            left: `${placement.spotlightRect.left}px`,
            top: `${placement.spotlightRect.top}px`,
            width: `${placement.spotlightRect.width}px`,
            height: `${placement.spotlightRect.height}px`
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}

      {/* Speech Balloon */}
      <div
        ref={balloonRef}
        className="usageTourBalloon"
        style={{
          left: `${placement.balloonPosition.left}px`,
          top: `${placement.balloonPosition.top}px`
        }}
        data-step={stepIndex + 1}
      >
        <div className="usageTourHeader">
          <h2 id={titleId} className="usageTourTitle">
            {translate(currentStep.titleKey)}
          </h2>
          <span
            className="usageTourStepBadge"
            aria-label={translate("usageTour.stepBadge.ariaLabel", {
              current: stepIndex + 1,
              total: totalSteps
            })}
          >
            {stepIndex + 1} / {totalSteps}
          </span>
        </div>

        <div id={bodyId} className="usageTourBody">
          {translate(currentStep.bodyKey)}
        </div>

        <div className="usageTourFooter">
          <button
            type="button"
            className="usageTourButton"
            disabled={isFirstStep}
            onClick={handleBack}
            data-testid="usageTourBack"
          >
            {translate("usageTour.action.back")}
          </button>

          <div className="usageTourFooterRight">
            {!isLastStep && (
              <button
                type="button"
                className="usageTourButton"
                onClick={onDismissAutoShow}
                data-testid="usageTourDismiss"
              >
                {translate("usageTour.action.dismissAutoShow")}
              </button>
            )}

            <button
              ref={primaryButtonRef}
              type="button"
              className="usageTourButton usageTourButtonPrimary"
              onClick={handleNext}
              data-testid={isLastStep ? "usageTourComplete" : "usageTourNext"}
            >
              {translate(
                isLastStep
                  ? "usageTour.action.complete"
                  : "usageTour.action.next"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

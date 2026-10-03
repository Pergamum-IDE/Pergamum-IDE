// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsageTour } from "../../../src/renderer/usageTour/UsageTour";
import { t, type Translate } from "../../../src/shared/i18n";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const jaTranslate: Translate = (key, values) => t("ja", key, values);
const enTranslate: Translate = (key, values) => t("en", key, values);

describe("UsageTour component", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders nothing when isOpen is false", () => {
    act(() => {
      root.render(
        <UsageTour
          isOpen={false}
          isManual={false}
          translate={jaTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders modal dialog with accessible attributes when isOpen is true (ja)", () => {
    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={jaTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");

    const title = container.querySelector(".usageTourTitle");
    expect(title?.textContent).toBe("ようこそ");

    const badge = container.querySelector(".usageTourStepBadge");
    expect(badge?.textContent).toBe("1 / 15");
    expect(badge?.getAttribute("aria-label")).toBe("ステップ 1 / 15");
  });

  it("navigates through steps with Next and Back buttons in Japanese", () => {
    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={jaTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    const backButton = container.querySelector('[data-testid="usageTourBack"]') as HTMLButtonElement;
    const nextButton = container.querySelector('[data-testid="usageTourNext"]') as HTMLButtonElement;
    const dismissButton = container.querySelector('[data-testid="usageTourDismiss"]') as HTMLButtonElement;

    // Step 1
    expect(backButton.disabled).toBe(true);
    expect(backButton.textContent).toBe("戻る");
    expect(dismissButton).not.toBeNull();
    expect(dismissButton.textContent).toBe("説明は要らない");
    expect(nextButton.textContent).toBe("続き");
    expect(container.querySelector(".usageTourStepBadge")?.textContent).toBe("1 / 15");
    expect(container.querySelector(".usageTourTitle")?.textContent).toBe("ようこそ");

    // Move to Step 2
    act(() => {
      nextButton.click();
    });
    expect(backButton.disabled).toBe(false);
    expect(container.querySelector(".usageTourStepBadge")?.textContent).toBe("2 / 15");
    expect(container.querySelector(".usageTourTitle")?.textContent).toBe("ファイルエクスプローラー");

    // Move back to Step 1
    act(() => {
      backButton.click();
    });
    expect(backButton.disabled).toBe(true);
    expect(container.querySelector(".usageTourStepBadge")?.textContent).toBe("1 / 15");
  });

  it("calls onDismissAutoShow when '説明は要らない' is clicked", () => {
    const onDismiss = vi.fn();
    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={jaTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={onDismiss}
          onComplete={vi.fn()}
        />
      );
    });

    const dismissButton = container.querySelector('[data-testid="usageTourDismiss"]') as HTMLButtonElement;
    act(() => {
      dismissButton.click();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows '完了' button on final step (15/15) and hides '説明は要らない'", () => {
    const onComplete = vi.fn();
    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={jaTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={onComplete}
        />
      );
    });

    // Fast-forward to step 15
    for (let i = 1; i < 15; i++) {
      const nextBtn = container.querySelector('[data-testid="usageTourNext"]') as HTMLButtonElement;
      act(() => {
        nextBtn.click();
      });
    }

    expect(container.querySelector(".usageTourStepBadge")?.textContent).toBe("15 / 15");
    expect(container.querySelector(".usageTourTitle")?.textContent).toBe("ツアー完了");
    expect(container.querySelector('[data-testid="usageTourDismiss"]')).toBeNull();

    const completeBtn = container.querySelector('[data-testid="usageTourComplete"]') as HTMLButtonElement;
    expect(completeBtn).not.toBeNull();
    expect(completeBtn.textContent).toBe("完了");

    act(() => {
      completeBtn.click();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("renders correctly in English mode with no Japanese characters", () => {
    const japaneseRegex = /[ぁ-んァ-ヶ一-龠々]/;

    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={enTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    // Step 1
    const title = container.querySelector(".usageTourTitle");
    expect(title?.textContent).toBe("Welcome");
    expect(container.querySelector(".usageTourBody")?.textContent).toContain("Welcome to Pergamum.");

    const badge = container.querySelector(".usageTourStepBadge");
    expect(badge?.textContent).toBe("1 / 15");
    expect(badge?.getAttribute("aria-label")).toBe("Step 1 of 15");

    const backButton = container.querySelector('[data-testid="usageTourBack"]') as HTMLButtonElement;
    const dismissButton = container.querySelector('[data-testid="usageTourDismiss"]') as HTMLButtonElement;
    const nextButton = container.querySelector('[data-testid="usageTourNext"]') as HTMLButtonElement;

    expect(backButton.textContent).toBe("Back");
    expect(dismissButton.textContent).toBe("Don't show again");
    expect(nextButton.textContent).toBe("Next");

    // Fast-forward to Step 7 (Editor)
    for (let i = 1; i < 7; i++) {
      const btn = container.querySelector('[data-testid="usageTourNext"]') as HTMLButtonElement;
      act(() => {
        btn.click();
      });
    }
    expect(container.querySelector(".usageTourTitle")?.textContent).toBe("Editor");

    // Fast-forward to Step 15 (Completion)
    for (let i = 7; i < 15; i++) {
      const btn = container.querySelector('[data-testid="usageTourNext"]') as HTMLButtonElement;
      act(() => {
        btn.click();
      });
    }
    expect(container.querySelector(".usageTourTitle")?.textContent).toBe("Tour Complete");
    const completeBtn = container.querySelector('[data-testid="usageTourComplete"]') as HTMLButtonElement;
    expect(completeBtn.textContent).toBe("Finish");

    // Verify no Japanese characters anywhere in the dialog DOM
    const fullText = container.textContent ?? "";
    expect(japaneseRegex.test(fullText)).toBe(false);
  });

  it("updates text dynamically upon runtime language switch", () => {
    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={jaTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    // In Japanese initially
    expect(container.querySelector(".usageTourTitle")?.textContent).toBe("ようこそ");
    expect(container.querySelector('[data-testid="usageTourNext"]')?.textContent).toBe("続き");

    // Runtime language switch to English
    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={enTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    // Text immediately updates to English
    expect(container.querySelector(".usageTourTitle")?.textContent).toBe("Welcome");
    expect(container.querySelector('[data-testid="usageTourNext"]')?.textContent).toBe("Next");
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={jaTranslate}
          onClose={onClose}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to previous active element on close", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);

    act(() => {
      root.render(
        <UsageTour
          isOpen={true}
          isManual={false}
          translate={jaTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    // Close tour
    act(() => {
      root.render(
        <UsageTour
          isOpen={false}
          isManual={false}
          translate={jaTranslate}
          onClose={vi.fn()}
          onDismissAutoShow={vi.fn()}
          onComplete={vi.fn()}
        />
      );
    });

    expect(document.activeElement).toBe(button);
    button.remove();
  });
});

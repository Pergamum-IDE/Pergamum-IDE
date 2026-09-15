// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveFindShortcuts } from "../../src/renderer/editorFindShortcuts";
import { ActiveFindPanel } from "../../src/renderer/find/ActiveFindPanel";
import { DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS } from "../../src/renderer/find/activeDocumentFind";
import { DEFAULT_ACTIVE_GLOSSARY_NEARBY_SETTINGS } from "../../src/renderer/find/activeGlossaryNearbySearch";
import { t } from "../../src/shared/i18n";

function TestShortcutComponent({
  active = true,
  findMatchesCount = 2,
  onNext = vi.fn(),
  onPrevious = vi.fn()
}: {
  active?: boolean;
  findMatchesCount?: number;
  onNext?: () => void;
  onPrevious?: () => void;
}) {
  useActiveFindShortcuts({ active, findMatchesCount, onNext, onPrevious });
  return <div data-testid="container">Test Component</div>;
}

describe("Active Find F3 / Shift+F3 shortcut interaction (#482)", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  it("triggers onNext on F3 when matches exist", () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    act(() => {
      root?.render(
        <TestShortcutComponent onNext={onNext} onPrevious={onPrevious} />
      );
    });

    const event = new KeyboardEvent("keydown", {
      key: "F3",
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("triggers onPrevious on Shift+F3 when matches exist", () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    act(() => {
      root?.render(
        <TestShortcutComponent onNext={onNext} onPrevious={onPrevious} />
      );
    });

    const event = new KeyboardEvent("keydown", {
      key: "F3",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not trigger navigation and does not prevent default when match count is 0 (no-op)", () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    act(() => {
      root?.render(
        <TestShortcutComponent
          findMatchesCount={0}
          onNext={onNext}
          onPrevious={onPrevious}
        />
      );
    });

    const event = new KeyboardEvent("keydown", {
      key: "F3",
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not trigger when focused in an excluded generic input outside Active Find panel", () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    act(() => {
      root?.render(
        <TestShortcutComponent onNext={onNext} onPrevious={onPrevious} />
      );
    });

    const genericInput = document.createElement("input");
    document.body.appendChild(genericInput);
    genericInput.focus();

    const event = new KeyboardEvent("keydown", {
      key: "F3",
      bubbles: true,
      cancelable: true
    });
    genericInput.dispatchEvent(event);

    expect(onNext).not.toHaveBeenCalled();

    document.body.removeChild(genericInput);
  });

  it("renders next match button with '次の候補へ（F3）' and previous match button with '前の候補へ（Shift+F3）' tooltip/aria-label", () => {
    const translate = (key: Parameters<typeof t>[1], values?: Parameters<typeof t>[2]) =>
      t("ja", key, values);

    act(() => {
      root?.render(
        <ActiveFindPanel
          translate={translate}
          mode="search"
          query="foo"
          replaceText=""
          options={DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS}
          markAll={true}
          regexError={null}
          templateError={null}
          readOnly={false}
          replaceCurrentEnabled={false}
          replaceAllEnabled={false}
          glossaryCandidates={[]}
          queryKind="text"
          glossaryRelation="any"
          glossaryNearbySettings={DEFAULT_ACTIVE_GLOSSARY_NEARBY_SETTINGS}
          searchGlossaryAtomIds={[]}
          replaceGlossaryAtomId={null}
          matchCount={2}
          activeIndex={0}
          focusToken={1}
          onModeChange={vi.fn()}
          onQueryChange={vi.fn()}
          onReplaceTextChange={vi.fn()}
          onToggleOption={vi.fn()}
          onToggleMarkAll={vi.fn()}
          onReplaceCurrent={vi.fn()}
          onReplaceAll={vi.fn()}
          onQueryKindChange={vi.fn()}
          onGlossaryRelationChange={vi.fn()}
          onSearchGlossaryAtomIdsChange={vi.fn()}
          onReplaceGlossaryAtomIdChange={vi.fn()}
          onNext={vi.fn()}
          onPrevious={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    const prevButton = container?.querySelector(".activeFindPanelPrevButton");
    const nextButton = container?.querySelector(".activeFindPanelNextButton");

    expect(prevButton).not.toBeNull();
    expect(prevButton?.getAttribute("aria-label")).toBe("前の候補へ（Shift+F3）");
    expect(prevButton?.getAttribute("title")).toBe("前の候補へ（Shift+F3）");

    expect(nextButton).not.toBeNull();
    expect(nextButton?.getAttribute("aria-label")).toBe("次の候補へ（F3）");
    expect(nextButton?.getAttribute("title")).toBe("次の候補へ（F3）");
  });
});

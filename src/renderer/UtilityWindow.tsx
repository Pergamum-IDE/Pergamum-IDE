import type { ReactNode } from "react";
import type { Translate } from "../shared/i18n";
import type { UtilityWindowTabId } from "./workbenchLayout";

interface UtilityWindowProps {
  activeTab: UtilityWindowTabId;
  height: number;
  translate: Translate;
  onSelectTab: (tab: UtilityWindowTabId) => void;
  onClose: () => void;
  children?: ReactNode;
}

const utilityWindowTabs: readonly UtilityWindowTabId[] = ["occurrences"];

function utilityWindowTabLabel(
  tab: UtilityWindowTabId,
  translate: Translate
): string {
  switch (tab) {
    case "occurrences":
      return translate("utilityWindow.tabs.occurrences");
  }
}

export function UtilityWindow({
  activeTab,
  height,
  translate,
  onSelectTab,
  onClose,
  children
}: UtilityWindowProps): JSX.Element {
  const label = translate("utilityWindow.label");

  return (
    <section
      className="utilityWindow"
      aria-label={label}
      style={{ height }}
    >
      <div className="utilityWindowHeader">
        <div
          className="utilityWindowTabBar"
          role="tablist"
          aria-label={label}
        >
          {utilityWindowTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`utilityWindowTab${
                tab === activeTab ? " isActive" : ""
              }`}
              role="tab"
              aria-selected={tab === activeTab}
              onClick={() => onSelectTab(tab)}
            >
              {utilityWindowTabLabel(tab, translate)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="utilityWindowCloseButton"
          aria-label={translate("utilityWindow.close")}
          title={translate("utilityWindow.close")}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="utilityWindowContent">{children}</div>
    </section>
  );
}

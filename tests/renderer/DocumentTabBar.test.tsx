import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentTabBar } from "../../src/renderer/DocumentTabBar";
import type { ProjectAccessMode } from "../../src/shared/api";
import type { DocumentTab } from "../../src/renderer/openDocuments";
import { t, type Translate } from "../../src/shared/i18n";
import {
  createEditorIdForPath,
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  type ActiveProjectContext,
  type EditorId
} from "../../src/shared/editorId";
import {
  specialWorkspaceTabId,
  type SpecialTabId,
  type SpecialWorkspaceTab,
  type WorkspaceTabId
} from "../../src/renderer/workspaceTabs";

const realTranslateEn: Translate = (key, values) => t("en", key, values);
const realTranslateJa: Translate = (key, values) => t("ja", key, values);
const noop = () => undefined;

const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };
const projectDocumentId: EditorId = createProjectDocumentEditorId(
  "chapter-01.md",
  projectContext
);
const secondProjectDocumentId: EditorId = createProjectDocumentEditorId(
  "chapter-02.md",
  projectContext
);
const externalFileId: EditorId = createEditorIdForPath(
  "C:\\Outside\\notes.md",
  null
);
const glossaryEntryId: EditorId = createGlossaryEntryEditorId(
  "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  projectContext
);

function renderTabBar(
  tabs: DocumentTab[],
  overrides: {
    activeDocumentId?: EditorId;
    projectAccessMode?: ProjectAccessMode | null;
    activeWorkspaceTabId?: WorkspaceTabId;
    specialTabs?: SpecialWorkspaceTab[];
    translate?: Translate;
    onCloseDocument?: (documentId: EditorId) => void;
    onSelectSpecialTab?: (tabId: SpecialTabId) => void;
    onCloseSpecialTab?: (tabId: SpecialTabId) => void;
  } = {}
): string {
  return renderToStaticMarkup(
    React.createElement(DocumentTabBar, {
      tabs,
      activeDocumentId: overrides.activeDocumentId ?? tabs[0]?.id ?? projectDocumentId,
      projectAccessMode: overrides.projectAccessMode,
      activeWorkspaceTabId: overrides.activeWorkspaceTabId,
      specialTabs: overrides.specialTabs,
      translate: overrides.translate ?? realTranslateEn,
      onSelectDocument: noop,
      onCloseDocument: overrides.onCloseDocument ?? noop,
      onSelectSpecialTab: overrides.onSelectSpecialTab,
      onCloseSpecialTab: overrides.onCloseSpecialTab,
      isUtilityWindowOpen: false,
      onToggleUtilityWindow: noop
    })
  );
}

function tabMarkup(markup: string, occurrence = 0): string {
  const starts: number[] = [];
  let cursor = 0;

  for (;;) {
    const index = markup.indexOf('role="tab"', cursor);

    if (index === -1) {
      break;
    }

    starts.push(index);
    cursor = index + 1;
  }

  const start = starts[occurrence];
  const end =
    occurrence + 1 < starts.length ? starts[occurrence + 1] : markup.length;

  return markup.slice(start, end);
}

function tablistMarkup(markup: string): string {
  const start = markup.indexOf('role="tablist"');
  const navStart = markup.lastIndexOf("<nav", start);
  const navEnd = markup.indexOf("</nav>", start);

  if (navStart === -1 || navEnd === -1) {
    throw new Error("Tablist markup was not found.");
  }

  return markup.slice(navStart, navEnd);
}

describe("DocumentTabBar special tabs (#181)", () => {
  const settingsTab: SpecialWorkspaceTab = {
    kind: "special",
    id: "settings",
    title: "Application Settings"
  };

  it("renders Settings as a named special tab in the same tab row", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      { specialTabs: [settingsTab] }
    );

    expect(tabMarkup(markup, 0)).toContain(">chapter-01.md<");
    expect(tabMarkup(markup, 1)).toContain(">Application Settings<");
  });

  it("marks the Settings special tab active independently from the active document", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      {
        activeWorkspaceTabId: specialWorkspaceTabId("settings"),
        specialTabs: [settingsTab]
      }
    );

    expect(tabMarkup(markup, 0)).toContain('aria-selected="false"');
    expect(tabMarkup(markup, 1)).toContain('aria-selected="true"');
  });

  it("renders a close button for Settings without dirty document affordances", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: true,
          isExternalMarkdownFile: false
        }
      ],
      {
        activeWorkspaceTabId: specialWorkspaceTabId("settings"),
        specialTabs: [settingsTab]
      }
    );
    const settingsTabMarkup = tabMarkup(markup, 1);

    expect(settingsTabMarkup).toContain("documentTabCloseButton");
    expect(settingsTabMarkup).not.toContain("documentTabDirtyIndicator");
  });
});

describe("DocumentTabBar", () => {
  it("does not render the read-only shield indicator for readWrite projects", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      {
        projectAccessMode: { kind: "readWrite" }
      }
    );

    expect(markup).not.toContain("projectAccessModeIndicator-readOnly");
    expect(markup).not.toContain("feather-shield");
  });

  it("renders the read-only shield indicator before document tabs", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      {
        projectAccessMode: {
          kind: "readOnly",
          reason: "writeLockUnavailable"
        }
      }
    );
    const indicatorIndex = markup.indexOf("projectAccessModeIndicator-readOnly");
    const tablistIndex = markup.indexOf('role="tablist"');
    const firstTabIndex = markup.indexOf('role="tab"');

    expect(indicatorIndex).toBeGreaterThan(-1);
    expect(tablistIndex).toBeGreaterThan(indicatorIndex);
    expect(firstTabIndex).toBeGreaterThan(tablistIndex);
    expect(markup).toContain("feather-shield");
  });

  it("does not treat the read-only indicator as a document tab", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        },
        {
          id: secondProjectDocumentId,
          title: "chapter-02.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      {
        projectAccessMode: {
          kind: "readOnly",
          reason: "writeLockUnavailable"
        }
      }
    );
    const tabRoles = markup.match(/role="tab"/g) ?? [];
    const indicatorIndex = markup.indexOf("projectAccessModeIndicator-readOnly");
    const indicatorTag = markup.slice(
      markup.lastIndexOf("<", indicatorIndex),
      markup.indexOf(">", indicatorIndex)
    );

    expect(tabRoles).toHaveLength(2);
    expect(indicatorTag).toContain('role="img"');
    expect(indicatorTag).not.toContain('role="tab"');
    expect(tablistMarkup(markup)).not.toContain(
      "projectAccessModeIndicator-readOnly"
    );
  });

  it("localizes the read-only shield tooltip", () => {
    const enMarkup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      {
        projectAccessMode: {
          kind: "readOnly",
          reason: "writeLockUnavailable"
        },
        translate: realTranslateEn
      }
    );
    const jaMarkup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      {
        projectAccessMode: {
          kind: "readOnly",
          reason: "writeLockUnavailable"
        },
        translate: realTranslateJa
      }
    );

    expect(enMarkup).toContain('aria-label="Opened in read-only mode"');
    expect(enMarkup).toContain('title="Opened in read-only mode"');
    expect(jaMarkup).toContain(
      'aria-label="\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067\u958B\u3044\u3066\u3044\u307E\u3059"'
    );
    expect(jaMarkup).toContain(
      'title="\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067\u958B\u3044\u3066\u3044\u307E\u3059"'
    );
  });

  it("uses the shield.svg asset and read-only blue CSS token", () => {
    const source = readFileSync("src/renderer/DocumentTabBar.tsx", "utf8");
    const css = readFileSync("src/renderer/styles.css", "utf8");
    const shieldSvg = readFileSync("assets/icons/global/shield.svg", "utf8");

    expect(source).toContain(
      "../../assets/icons/global/shield.svg?raw"
    );
    expect(shieldSvg).toContain("feather-shield");
    expect(shieldSvg).toContain('stroke="currentColor"');
    expect(css).toContain("--color-project-read-only");
    expect(css).toContain(
      "color: var(--color-project-read-only);"
    );
    expect(css).not.toContain("--color-project-read-only: #a32929");
    expect(css).not.toContain("--color-project-read-only: #8a4c0f");
  });

  it("renders the alert-triangle warning icon before the file name for an external Markdown tab", () => {
    const markup = renderTabBar([
      {
        id: externalFileId,
        title: "notes.md",
        isDirty: false,
        isExternalMarkdownFile: true
      }
    ]);

    const iconIndex = markup.indexOf("documentTabExternalIcon");
    const titleIndex = markup.indexOf("documentTabTitle");

    expect(iconIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeGreaterThan(iconIndex);
    // The actual alert-triangle.svg content (feather icon class name) is
    // what gets injected, not a placeholder/different icon.
    expect(markup).toContain("feather-alert-triangle");
  });

  it("does not render the warning icon for a project document tab", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);

    expect(markup).not.toContain("documentTabExternalIcon");
    expect(markup).not.toContain("feather-alert-triangle");
  });

  it("does not render the warning icon for a glossary editor tab", () => {
    const markup = renderTabBar([
      {
        id: glossaryEntryId,
        title: "王都",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);

    expect(markup).not.toContain("documentTabExternalIcon");
  });

  it("gives the icon an accessible label and tooltip with the exact English warning text", () => {
    const markup = renderTabBar([
      {
        id: externalFileId,
        title: "notes.md",
        isDirty: false,
        isExternalMarkdownFile: true
      }
    ]);

    expect(markup).toContain('aria-label="This file is outside the project"');
    expect(markup).toContain('title="This file is outside the project"');
  });

  it("gives the icon the exact Japanese warning text when translated", () => {
    const markup = renderTabBar(
      [
        {
          id: externalFileId,
          title: "notes.md",
          isDirty: false,
          isExternalMarkdownFile: true
        }
      ],
      { translate: realTranslateJa }
    );

    expect(markup).toContain(
      'aria-label="\u6CE8\u610F\uFF1A\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u5916\u306E\u30D5\u30A1\u30A4\u30EB\u3067\u3059"'
    );
  });

  it("does not replace the tab title — the file name text is still present alongside the icon", () => {
    const markup = renderTabBar([
      {
        id: externalFileId,
        title: "notes.md",
        isDirty: false,
        isExternalMarkdownFile: true
      }
    ]);

    expect(markup).toContain(">notes.md<");
  });

  it("gives the icon role=img for clearer accessible semantics", () => {
    const markup = renderTabBar([
      {
        id: externalFileId,
        title: "notes.md",
        isDirty: false,
        isExternalMarkdownFile: true
      }
    ]);

    const iconIndex = markup.indexOf("documentTabExternalIcon");
    const iconTagEnd = markup.indexOf(">", iconIndex);
    const iconOpenTag = markup.slice(iconIndex, iconTagEnd);

    expect(iconOpenTag).toContain('role="img"');
  });

  it("exposes the external-file warning on the tab's own title attribute, combined with the file name, since nested-element tooltips are inconsistent across browsers", () => {
    const markup = renderTabBar([
      {
        id: externalFileId,
        title: "notes.md",
        isDirty: false,
        isExternalMarkdownFile: true
      }
    ]);

    expect(markup).toContain(
      'title="notes.md — This file is outside the project"'
    );
  });

  it("keeps a project document tab's own title attribute as the plain file name — no warning suffix appended", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);
    const tab = tabMarkup(markup);
    const tabTagEnd = tab.indexOf(">");
    const tabOpenTag = tab.slice(0, tabTagEnd);

    expect(tabOpenTag).toContain('title="chapter-01.md"');
    expect(tabOpenTag).not.toContain("outside the project");
  });

  it("the external warning icon remains on the left side, independent of the right trailing slot's dirty indicator (#184)", () => {
    const markup = renderTabBar(
      [
        {
          id: externalFileId,
          title: "notes.md",
          isDirty: true,
          isExternalMarkdownFile: true
        },
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      { activeDocumentId: projectDocumentId }
    );
    const tab = tabMarkup(markup, 0);
    const externalIconIndex = tab.indexOf("documentTabExternalIcon");
    const titleIndex = tab.indexOf("documentTabTitle");
    const trailingIndex = tab.indexOf("documentTabTrailing");

    expect(externalIconIndex).toBeGreaterThan(-1);
    expect(externalIconIndex).toBeLessThan(titleIndex);
    expect(titleIndex).toBeLessThan(trailingIndex);
    expect(tab).toContain("documentTabDirtyIndicator");
  });
});

describe("DocumentTabBar tab element (#184)", () => {
  it("renders each tab as a non-button element with role=tab (a nested close <button> would be invalid inside a <button>)", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);
    const tab = tabMarkup(markup);
    const tabTagName = tab.slice(1, tab.indexOf(" "));

    expect(tabTagName).not.toBe("button");
  });

  it("keeps each tab keyboard-reachable via tabIndex", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);
    const tab = tabMarkup(markup);

    expect(tab).toContain('tabindex="0"');
  });
});

describe("DocumentTabBar trailing slot (#184)", () => {
  function tabs(): DocumentTab[] {
    return [
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      },
      {
        id: secondProjectDocumentId,
        title: "chapter-02.md",
        isDirty: true,
        isExternalMarkdownFile: false
      }
    ];
  }

  it("always renders the trailing slot container, even when empty", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      { activeDocumentId: secondProjectDocumentId }
    );

    expect(markup).toContain("documentTabTrailing");
  });

  it("shows a close button, not the dirty indicator, on the active tab even when it is dirty", () => {
    const markup = renderTabBar(tabs(), {
      activeDocumentId: secondProjectDocumentId
    });
    const activeTab = tabMarkup(markup, 1);

    expect(activeTab).toContain("documentTabCloseButton");
    expect(activeTab).not.toContain("documentTabDirtyIndicator");
  });

  it("shows the dirty indicator, not a close button, on an inactive dirty tab", () => {
    const markup = renderTabBar(tabs(), {
      activeDocumentId: projectDocumentId
    });
    const inactiveDirtyTab = tabMarkup(markup, 1);

    expect(inactiveDirtyTab).toContain("documentTabDirtyIndicator");
    expect(inactiveDirtyTab).not.toContain("documentTabCloseButton");
  });

  it("shows neither a close button nor a dirty indicator on an inactive clean tab", () => {
    const markup = renderTabBar(tabs(), {
      activeDocumentId: secondProjectDocumentId
    });
    const inactiveCleanTab = tabMarkup(markup, 0);

    expect(inactiveCleanTab).not.toContain("documentTabCloseButton");
    expect(inactiveCleanTab).not.toContain("documentTabDirtyIndicator");
  });

  it("never renders a close button and a dirty indicator on the same tab", () => {
    const markup = renderTabBar(tabs(), {
      activeDocumentId: secondProjectDocumentId
    });

    for (let index = 0; index < tabs().length; index += 1) {
      const tab = tabMarkup(markup, index);
      const hasClose = tab.includes("documentTabCloseButton");
      const hasDirty = tab.includes("documentTabDirtyIndicator");

      expect(hasClose && hasDirty).toBe(false);
    }
  });
});

describe("DocumentTabBar close button (#184)", () => {
  it("gives the close button an accessible label and tooltip", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);

    expect(markup).toContain('aria-label="Close tab"');
    expect(markup).toContain('title="Close tab"');
  });

  it("gives the close button the exact Japanese label when translated", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        }
      ],
      { translate: realTranslateJa }
    );

    expect(markup).toContain('aria-label="\u30BF\u30D6\u3092\u9589\u3058\u308B"');
  });

  it("renders the close button as a real <button> element, keyboard reachable when visible", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);
    const closeButtonIndex = markup.indexOf("documentTabCloseButton");
    const beforeButton = markup.slice(0, closeButtonIndex);
    const tagStart = beforeButton.lastIndexOf("<");

    expect(markup.slice(tagStart, tagStart + 7)).toBe("<button");
  });

  it("uses the close-x Feather icon", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);

    expect(markup).toContain("feather-x");
  });
});

describe("DocumentTabBar dirty indicator (#184)", () => {
  it("gives the dirty indicator a tooltip and accessible label indicating unsaved changes", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        },
        {
          id: secondProjectDocumentId,
          title: "chapter-02.md",
          isDirty: true,
          isExternalMarkdownFile: false
        }
      ],
      { activeDocumentId: projectDocumentId }
    );
    const inactiveDirtyTab = tabMarkup(markup, 1);

    expect(inactiveDirtyTab).toContain('aria-label="Unsaved"');
    expect(inactiveDirtyTab).toContain('title="Unsaved"');
  });

  it("is non-interactive — not a button, no click handler markup, no tabindex", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        },
        {
          id: secondProjectDocumentId,
          title: "chapter-02.md",
          isDirty: true,
          isExternalMarkdownFile: false
        }
      ],
      { activeDocumentId: projectDocumentId }
    );
    const inactiveDirtyTab = tabMarkup(markup, 1);
    const indicatorIndex = inactiveDirtyTab.indexOf("documentTabDirtyIndicator");
    const beforeIndicator = inactiveDirtyTab.slice(0, indicatorIndex);
    const tagStart = beforeIndicator.lastIndexOf("<");
    const indicatorOpenTag = inactiveDirtyTab.slice(
      tagStart,
      inactiveDirtyTab.indexOf(">", tagStart)
    );

    expect(inactiveDirtyTab.slice(tagStart, tagStart + 5)).toBe("<span");
    expect(indicatorOpenTag).not.toContain("tabindex");
  });

  it("uses the edit-2 Feather icon", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: false,
          isExternalMarkdownFile: false
        },
        {
          id: secondProjectDocumentId,
          title: "chapter-02.md",
          isDirty: true,
          isExternalMarkdownFile: false
        }
      ],
      { activeDocumentId: projectDocumentId }
    );

    expect(markup).toContain("feather-edit-2");
  });
});

describe("DocumentTabBar tab title reflects unsaved state (#184 follow-up)", () => {
  // The dirty indicator's own tooltip can't reliably be hovered to (the
  // close button replaces it on hover), so the tab's own title/accessible
  // name carries the unsaved state instead.
  it("clean normal tab: plain file name, no unsaved suffix", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);
    const tab = tabMarkup(markup);
    const tabTagEnd = tab.indexOf(">");
    const tabOpenTag = tab.slice(0, tabTagEnd);

    expect(tabOpenTag).toContain('title="chapter-01.md"');
  });

  it("dirty normal tab: file name — Unsaved", () => {
    const markup = renderTabBar([
      {
        id: projectDocumentId,
        title: "chapter-01.md",
        isDirty: true,
        isExternalMarkdownFile: false
      }
    ]);
    const tab = tabMarkup(markup);
    const tabTagEnd = tab.indexOf(">");
    const tabOpenTag = tab.slice(0, tabTagEnd);

    expect(tabOpenTag).toContain('title="chapter-01.md — Unsaved"');
  });

  it("external clean tab: file name — external warning, no unsaved suffix", () => {
    const markup = renderTabBar([
      {
        id: externalFileId,
        title: "notes.md",
        isDirty: false,
        isExternalMarkdownFile: true
      }
    ]);
    const tab = tabMarkup(markup);
    const tabTagEnd = tab.indexOf(">");
    const tabOpenTag = tab.slice(0, tabTagEnd);

    expect(tabOpenTag).toContain(
      'title="notes.md — This file is outside the project"'
    );
  });

  it("external dirty tab: file name — external warning — Unsaved", () => {
    const markup = renderTabBar([
      {
        id: externalFileId,
        title: "notes.md",
        isDirty: true,
        isExternalMarkdownFile: true
      }
    ]);
    const tab = tabMarkup(markup);
    const tabTagEnd = tab.indexOf(">");
    const tabOpenTag = tab.slice(0, tabTagEnd);

    expect(tabOpenTag).toContain(
      'title="notes.md — This file is outside the project — Unsaved"'
    );
  });

  it("dirty normal tab in Japanese: file name — 未保存", () => {
    const markup = renderTabBar(
      [
        {
          id: projectDocumentId,
          title: "chapter-01.md",
          isDirty: true,
          isExternalMarkdownFile: false
        }
      ],
      { translate: realTranslateJa }
    );
    const tab = tabMarkup(markup);
    const tabTagEnd = tab.indexOf(">");
    const tabOpenTag = tab.slice(0, tabTagEnd);

    expect(tabOpenTag).toContain(
      'title="chapter-01.md — 未保存"'
    );
  });
});

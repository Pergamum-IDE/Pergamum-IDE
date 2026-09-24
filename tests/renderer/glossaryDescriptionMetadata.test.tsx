// @vitest-environment happy-dom
//
// #573 Slice 5: glossary metadata (表記 / 検索設定 / タグ) editing inside the
// glossary Description tab — a collapsible panel over the tab's OWN draft.
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import type { GlossaryEntry, GlossaryTag } from "../../src/shared/glossary";
import { GlossaryDescriptionMetadataPanel } from "../../src/renderer/GlossaryDescriptionMetadataPanel";
import { glossaryEntryMetadataDraftHandlers } from "../../src/renderer/GlossaryEntryMetadataFields";
import {
  createGlossaryEntryDraft,
  glossaryEntryDraftUpdateInput,
  type GlossaryEntryDraft
} from "../../src/renderer/glossaryEntryDraft";
import {
  createGlossaryDescriptionCurrentEditor,
  createMarkdownCurrentEditor,
  isCurrentEditorDirty,
  markdownDocumentForEditor,
  updateGlossaryDescriptionEditorDraft,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  createInitialOpenDocumentsState,
  getDirtyWorkingCopies,
  openOrActivateEditor,
  updateActiveOpenEditor
} from "../../src/renderer/openDocuments";

const translate = (key: Parameters<typeof t>[1], values?: Record<string, string | number>) =>
  t("ja", key, values);
const entryId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f9a0b";

const tags: GlossaryTag[] = [
  {
    id: "0190b6a1-1c2d-7e3f-8a4b-00000000a001",
    label: "Markdown",
    description: null,
    backgroundRgb: "#ffffff",
    foregroundRgb: "#000000",
    sortOrder: 0,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  } as GlossaryTag,
  {
    id: "0190b6a1-1c2d-7e3f-8a4b-00000000a002",
    label: "記法",
    description: null,
    backgroundRgb: "#ffffff",
    foregroundRgb: "#000000",
    sortOrder: 1,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  } as GlossaryTag
];

function entry(): GlossaryEntry {
  return {
    id: entryId,
    description: "説明",
    atoms: ["コードフェンス", "フェンス", "code fence"].map((value, index) => ({
      id: `0190b6a1-1c2d-7e3f-8a4b-00000000000${index + 1}`,
      entryId,
      sortOrder: index,
      value,
      matchFlags: 0,
      createdAt: "2026-09-24T00:00:00.000Z",
      updatedAt: "2026-09-24T00:00:00.000Z"
    })),
    tags,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  };
}

const inputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
)!.set!;

let containers: HTMLDivElement[] = [];
let roots: Root[] = [];

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
  for (const container of containers) {
    container.remove();
  }
  containers = [];
  roots = [];
});

function mountPanel(options: { readOnly?: boolean; initialDraft?: GlossaryEntryDraft } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  containers.push(container);
  roots.push(root);
  const drafts: GlossaryEntryDraft[] = [];

  function Harness(): JSX.Element {
    const [draft, setDraft] = useState(
      options.initialDraft ?? createGlossaryEntryDraft(entry())
    );
    const [expanded, setExpanded] = useState(false);

    return (
      <GlossaryDescriptionMetadataPanel
        draft={draft}
        availableTags={tags}
        translate={translate}
        readOnly={options.readOnly ?? false}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((value) => !value)}
        onUpdateDraft={(update) =>
          setDraft((current) => {
            const next = update(current);
            drafts.push(next);
            return next;
          })
        }
        onOpenTagManager={vi.fn()}
      />
    );
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    container,
    drafts,
    toggle: () =>
      act(() => {
        container
          .querySelector<HTMLButtonElement>(".glossaryDescriptionMetadataToggle")!
          .click();
      }),
    body: () =>
      container.querySelector<HTMLElement>(".glossaryDescriptionMetadataBody")!
  };
}

describe("GlossaryDescriptionMetadataPanel (#573 Slice 5)", () => {
  it("starts collapsed with a one-line summary", () => {
    const panel = mountPanel();
    const toggle = panel.container.querySelector(
      ".glossaryDescriptionMetadataToggle"
    )!;

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.body().hidden).toBe(true);
    expect(
      panel.container.querySelector(".glossaryDescriptionMetadataSummary")
        ?.textContent
    ).toBe("代表: コードフェンス表記: 3タグ: Markdown, 記法");
  });

  it("expands to the shared atom / match-flag / tag editor", () => {
    const panel = mountPanel();
    panel.toggle();

    expect(
      panel.container
        .querySelector(".glossaryDescriptionMetadataToggle")!
        .getAttribute("aria-expanded")
    ).toBe("true");
    expect(panel.body().hidden).toBe(false);
    expect(
      panel.container.querySelectorAll(".glossaryEditorAtomValue")
    ).toHaveLength(3);
    expect(panel.container.querySelector(".glossaryEditorTags")).not.toBeNull();
    expect(
      panel.container.querySelector(".glossaryDescriptionMetadataSummary")
    ).toBeNull();
  });

  it("edits the given draft through onUpdateDraft", () => {
    const panel = mountPanel();
    panel.toggle();
    const input = panel.container.querySelector<HTMLInputElement>(
      ".glossaryEditorAtomValue"
    )!;

    act(() => {
      inputValueSetter.call(input, "コードブロック");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(panel.drafts.at(-1)?.atoms[0].value).toBe("コードブロック");
    expect(panel.drafts.at(-1)?.saveState).toBe("dirty");

    act(() => {
      panel.container
        .querySelector<HTMLButtonElement>(".glossaryEditorAddAtom")!
        .click();
    });
    expect(panel.drafts.at(-1)?.atoms).toHaveLength(4);
  });

  it("explains why saving is blocked, collapsed or expanded", () => {
    const invalid = createGlossaryEntryDraft(entry());
    invalid.atoms = [invalid.atoms[0], { ...invalid.atoms[1], value: "コードフェンス" }];
    const panel = mountPanel({ initialDraft: invalid });
    const message = translate("glossaryEditor.validity.duplicateAtomValue");

    expect(
      panel.container.querySelector(".glossaryDescriptionMetadataSummaryInvalid")
        ?.textContent
    ).toBe(message);

    panel.toggle();
    expect(
      panel.container.querySelector(".glossaryEditorValidityMessage")?.textContent
    ).toBe(message);
  });

  it("is read-only in a read-only project", () => {
    const panel = mountPanel({ readOnly: true });
    panel.toggle();

    expect(
      panel.container.querySelector<HTMLInputElement>(".glossaryEditorAtomValue")!
        .readOnly
    ).toBe(true);
    expect(
      panel.container.querySelector<HTMLButtonElement>(".glossaryEditorAddAtom")!
        .disabled
    ).toBe(true);
  });
});

describe("glossary metadata draft edits in the tab (#573 Slice 5)", () => {
  function openedState() {
    return openOrActivateEditor(
      createInitialOpenDocumentsState(),
      createGlossaryDescriptionCurrentEditor(entry()),
      { rootPath: "C:/novel" }
    );
  }

  it("dirties the tab and joins the existing working-copy flow", () => {
    const handlers = (
      apply: (update: (draft: GlossaryEntryDraft) => GlossaryEntryDraft) => void
    ) => glossaryEntryMetadataDraftHandlers(apply);
    let state = openedState();

    handlers((update) => {
      state = updateActiveOpenEditor(state, (editor) =>
        updateGlossaryDescriptionEditorDraft(editor, update)
      );
    }).onUnassignTag(tags[1].id);

    const editor = state.documents[0].editor as GlossaryDescriptionCurrentEditor;
    expect(editor.draft.tagIds).toEqual([tags[0].id]);
    expect(isCurrentEditorDirty(editor)).toBe(true);
    expect(getDirtyWorkingCopies(state)).toHaveLength(1);
    expect(markdownDocumentForEditor(editor)).toBeNull();
    // Ctrl+S saves the WHOLE draft: metadata and Description together.
    expect(glossaryEntryDraftUpdateInput(editor.draft)).toMatchObject({
      id: entryId,
      description: "説明",
      tagIds: [tags[0].id]
    });
  });

  it("maps every metadata callback onto the draft helpers", () => {
    let draft = createGlossaryEntryDraft(entry());
    const handlers = glossaryEntryMetadataDraftHandlers((update) => {
      draft = update(draft);
    });

    handlers.onReorderAtom(draft.atoms[2].id, 0);
    expect(draft.atoms[0].value).toBe("code fence");
    handlers.onChangeAtomMatchFlags(draft.atoms[0].id, 1);
    expect(draft.atoms[0].matchFlags).toBe(1);
    handlers.onDeleteAtom(draft.atoms[1].id);
    expect(draft.atoms).toHaveLength(2);
    handlers.onReorderAssignedTag(tags[1].id, 0);
    expect(draft.tagIds).toEqual([tags[1].id, tags[0].id]);
    handlers.onUnassignTag(tags[0].id);
    handlers.onAssignTag(tags[0].id, 0);
    expect(draft.tagIds).toEqual([tags[0].id, tags[1].id]);
  });

  it("leaves a Markdown editor untouched", () => {
    const markdown = createMarkdownCurrentEditor(
      createProjectDocument({ relativePath: "a.md", name: "a.md" }, "本文")
    );

    expect(updateGlossaryDescriptionEditorDraft(markdown, (draft) => draft)).toBe(
      markdown
    );
  });
});

describe("App glossary metadata wiring (#573 Slice 5)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  it("routes metadata edits to the tab's own draft behind the mutation gate", () => {
    const start = appSource.indexOf("function updateGlossaryDescriptionDraft(");
    const block = appSource.slice(
      start,
      appSource.indexOf("const glossaryDescriptionMetadataConfig", start)
    );

    expect(block).toContain("if (!canMutateActiveWorkingCopy())");
    expect(block).toContain("createGlossaryDescriptionEditorId(entryId)");
    expect(block).toContain(
      "updateGlossaryDescriptionEditorDraft(editor, update)"
    );
    expect(block).not.toContain("window.pergamum.glossary");
  });

  it("hands the metadata config to EditorSurface", () => {
    expect(appSource).toContain(
      "glossaryDescriptionMetadata={\n                          glossaryDescriptionMetadataConfig\n                        }"
    );
  });
});

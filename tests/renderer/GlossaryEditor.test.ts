import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { pergamumContextSurfaceAttribute } from "../../src/shared/editContextMenu";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryEditor } from "../../src/renderer/GlossaryEditor";
import { GlossaryFormAdvancedMatchingSettings } from "../../src/renderer/GlossaryFormAdvancedMatchingSettings";
import { createGlossaryEntryDraft } from "../../src/renderer/glossaryEntryDraft";

const translate: Translate = (key) => key;

const entry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  kind: "place",
  description: "王国の首都",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  forms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      surface: "王都",
      relation: null,
      warningPolicy: null,
      isCanonical: true,
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      surface: "首都",
      relation: "alias",
      warningPolicy: "default",
      isCanonical: false,
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      surface: "王都",
      relation: "variant",
      warningPolicy: "warn",
      isCanonical: false,
      matchBoundaryStart: "none",
      matchBoundaryEnd: "strict",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ]
};

type GlossaryEditorPropsForTest = Parameters<typeof GlossaryEditor>[0];

type ElementProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

function collectElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<ElementProps>) => boolean
): React.ReactElement<ElementProps>[] {
  const elements: React.ReactElement<ElementProps>[] = [];

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<ElementProps>(child)) {
      return;
    }

    if (predicate(child)) {
      elements.push(child);
    }

    elements.push(...collectElements(child.props.children, predicate));
  });

  return elements;
}

function glossaryEditorProps(
  overrides: Partial<GlossaryEditorPropsForTest> = {}
): GlossaryEditorPropsForTest {
  return {
    draft: createGlossaryEntryDraft(entry),
    translate,
    onChangeKind: () => undefined,
    onChangeDescription: () => undefined,
    onChangeCanonicalSurface: () => undefined,
    onChangeCanonicalMatchBoundaryStart: () => undefined,
    onChangeCanonicalMatchBoundaryEnd: () => undefined,
    onAddForm: () => undefined,
    onChangeFormSurface: () => undefined,
    onChangeFormWarningPolicy: () => undefined,
    onChangeFormMatchBoundaryStart: () => undefined,
    onChangeFormMatchBoundaryEnd: () => undefined,
    onDeleteForm: () => undefined,
    onDeleteEntry: () => undefined,
    onNavigateToPreviousOccurrence: () => undefined,
    onNavigateToNextOccurrence: () => undefined,
    ...overrides
  };
}

describe("GlossaryEditor", () => {
  it("lets the kind field be edited and reports the new kind through onChangeKind", () => {
    const onChangeKind = vi.fn();
    const draft = createGlossaryEntryDraft(entry);
    const element = GlossaryEditor(glossaryEditorProps({
      draft,
      onChangeKind
    }));
    const selects = collectElements(
      element,
      (child) => child.type === "select"
    );

    expect(selects.length).toBeGreaterThan(1);
    expect(selects[0].props.value).toBe("place");

    const onChange = selects[0].props.onChange as (event: unknown) => void;
    onChange({ target: { value: "person" } });

    expect(onChangeKind).toHaveBeenCalledWith("person");
  });

  it("reports canonical surface edits", () => {
    const onChangeCanonicalSurface = vi.fn();
    const element = GlossaryEditor(
      glossaryEditorProps({ onChangeCanonicalSurface })
    );
    const inputs = collectElements(
      element,
      (child) => child.type === "input"
    );

    expect(inputs[0].props.value).toBe("王都");

    const onChange = inputs[0].props.onChange as (event: unknown) => void;
    onChange({ target: { value: "新王都" } });

    expect(onChangeCanonicalSurface).toHaveBeenCalledWith("新王都");
  });

  it("reports alias and variant surface edits", () => {
    const onChangeFormSurface = vi.fn();
    const element = GlossaryEditor(
      glossaryEditorProps({ onChangeFormSurface })
    );
    const inputs = collectElements(
      element,
      (child) => child.type === "input"
    );

    expect(inputs[1].props.value).toBe("首都");
    expect(inputs[2].props.value).toBe("王都");

    const aliasOnChange = inputs[1].props.onChange as (
      event: unknown
    ) => void;
    const variantOnChange = inputs[2].props.onChange as (
      event: unknown
    ) => void;

    aliasOnChange({ target: { value: "王都アルセリア" } });
    variantOnChange({ target: { value: "王都 Arceria" } });

    expect(onChangeFormSurface).toHaveBeenCalledWith(
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      "王都アルセリア"
    );
    expect(onChangeFormSurface).toHaveBeenCalledWith(
      "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
      "王都 Arceria"
    );
  });

  it("reports warning policy changes", () => {
    const onChangeFormWarningPolicy = vi.fn();
    const element = GlossaryEditor(
      glossaryEditorProps({ onChangeFormWarningPolicy })
    );
    const selects = collectElements(
      element,
      (child) => child.type === "select"
    );

    expect(selects[1].props.value).toBe("default");
    expect(selects[2].props.value).toBe("warn");

    const onChange = selects[1].props.onChange as (event: unknown) => void;
    onChange({ target: { value: "ignore" } });

    expect(onChangeFormWarningPolicy).toHaveBeenCalledWith(
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      "ignore"
    );
  });

  it("renders an advanced matching settings control for the canonical surface and per form", () => {
    const element = GlossaryEditor(glossaryEditorProps());
    const advancedSettings = collectElements(
      element,
      (child) => child.type === GlossaryFormAdvancedMatchingSettings
    );

    expect(advancedSettings).toHaveLength(3);
    expect(advancedSettings[0].props.matchBoundaryStart).toBe("auto");
    expect(advancedSettings[0].props.matchBoundaryEnd).toBe("auto");
    expect(advancedSettings[1].props.matchBoundaryStart).toBe("strict");
    expect(advancedSettings[1].props.matchBoundaryEnd).toBe("none");
    expect(advancedSettings[2].props.matchBoundaryStart).toBe("none");
    expect(advancedSettings[2].props.matchBoundaryEnd).toBe("strict");
  });

  it("reports canonical match boundary changes through the canonical callbacks", () => {
    const onChangeCanonicalMatchBoundaryStart = vi.fn();
    const onChangeCanonicalMatchBoundaryEnd = vi.fn();
    const element = GlossaryEditor(
      glossaryEditorProps({
        onChangeCanonicalMatchBoundaryStart,
        onChangeCanonicalMatchBoundaryEnd
      })
    );
    const advancedSettings = collectElements(
      element,
      (child) => child.type === GlossaryFormAdvancedMatchingSettings
    );

    (
      advancedSettings[0].props.onChangeMatchBoundaryStart as (
        value: string
      ) => void
    )("none");
    (
      advancedSettings[0].props.onChangeMatchBoundaryEnd as (
        value: string
      ) => void
    )("strict");

    expect(onChangeCanonicalMatchBoundaryStart).toHaveBeenCalledWith("none");
    expect(onChangeCanonicalMatchBoundaryEnd).toHaveBeenCalledWith("strict");
  });

  it("reports form match boundary changes scoped to the edited form", () => {
    const onChangeFormMatchBoundaryStart = vi.fn();
    const onChangeFormMatchBoundaryEnd = vi.fn();
    const element = GlossaryEditor(
      glossaryEditorProps({
        onChangeFormMatchBoundaryStart,
        onChangeFormMatchBoundaryEnd
      })
    );
    const advancedSettings = collectElements(
      element,
      (child) => child.type === GlossaryFormAdvancedMatchingSettings
    );

    const onChangeMatchBoundaryStart = advancedSettings[2].props
      .onChangeMatchBoundaryStart as (value: string) => void;
    const onChangeMatchBoundaryEnd = advancedSettings[2].props
      .onChangeMatchBoundaryEnd as (value: string) => void;

    onChangeMatchBoundaryStart("auto");
    onChangeMatchBoundaryEnd("none");

    expect(onChangeFormMatchBoundaryStart).toHaveBeenCalledWith(
      "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
      "auto"
    );
    expect(onChangeFormMatchBoundaryEnd).toHaveBeenCalledWith(
      "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
      "none"
    );
  });

  it("reports alias and variant add and delete actions", () => {
    const onAddForm = vi.fn();
    const onDeleteForm = vi.fn();
    const element = GlossaryEditor(
      glossaryEditorProps({ onAddForm, onDeleteForm })
    );
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );

    const aliasRemoveButton = buttons.find(
      (button) =>
        button.props.className === "glossaryEditorRemoveFormButton"
    );
    const aliasAddButton = buttons.find(
      (button) => button.props.children === "glossaryEditor.addAlias"
    );
    const variantAddButton = buttons.find(
      (button) => button.props.children === "glossaryEditor.addVariant"
    );

    expect(aliasRemoveButton).toBeDefined();
    expect(aliasAddButton).toBeDefined();
    expect(variantAddButton).toBeDefined();

    (aliasRemoveButton?.props.onClick as () => void)();
    (aliasAddButton?.props.onClick as () => void)();
    (variantAddButton?.props.onClick as () => void)();

    expect(onDeleteForm).toHaveBeenCalledWith(
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc"
    );
    expect(onAddForm).toHaveBeenCalledWith("alias");
    expect(onAddForm).toHaveBeenCalledWith("variant");
  });

  it("renders previous/next occurrence buttons with i18n-backed display labels and aria-label/title", () => {
    const element = GlossaryEditor(glossaryEditorProps());
    const buttons = collectElements(
      element,
      (child) =>
        child.type === "button" &&
        child.props.className === "glossaryEditorOccurrenceButton"
    );

    expect(buttons).toHaveLength(2);

    const [previousButton, nextButton] = buttons;

    expect(previousButton.props["aria-label"]).toBe(
      "glossaryEditor.previousOccurrence"
    );
    expect(previousButton.props.title).toBe(
      "glossaryEditor.previousOccurrence"
    );
    expect(previousButton.props.children).toBe(
      "glossaryEditor.previousOccurrenceLabel"
    );

    expect(nextButton.props["aria-label"]).toBe(
      "glossaryEditor.nextOccurrence"
    );
    expect(nextButton.props.title).toBe("glossaryEditor.nextOccurrence");
    expect(nextButton.props.children).toBe(
      "glossaryEditor.nextOccurrenceLabel"
    );
  });

  it("disables write controls in read-only mode without disabling occurrence navigation", () => {
    const onChangeKind = vi.fn();
    const onChangeDescription = vi.fn();
    const onChangeCanonicalSurface = vi.fn();
    const onChangeCanonicalMatchBoundaryStart = vi.fn();
    const onChangeCanonicalMatchBoundaryEnd = vi.fn();
    const onAddForm = vi.fn();
    const onChangeFormSurface = vi.fn();
    const onChangeFormWarningPolicy = vi.fn();
    const onChangeFormMatchBoundaryStart = vi.fn();
    const onChangeFormMatchBoundaryEnd = vi.fn();
    const onDeleteForm = vi.fn();
    const onDeleteEntry = vi.fn();
    const onNavigateToPreviousOccurrence = vi.fn();
    const onNavigateToNextOccurrence = vi.fn();
    const element = GlossaryEditor(glossaryEditorProps({
      readOnly: true,
      onChangeKind,
      onChangeDescription,
      onChangeCanonicalSurface,
      onChangeCanonicalMatchBoundaryStart,
      onChangeCanonicalMatchBoundaryEnd,
      onAddForm,
      onChangeFormSurface,
      onChangeFormWarningPolicy,
      onChangeFormMatchBoundaryStart,
      onChangeFormMatchBoundaryEnd,
      onDeleteForm,
      onDeleteEntry,
      onNavigateToPreviousOccurrence,
      onNavigateToNextOccurrence
    }));
    const inputs = collectElements(
      element,
      (child) => child.type === "input"
    );
    const selects = collectElements(
      element,
      (child) => child.type === "select"
    );
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const markdownEditors = collectElements(
      element,
      (child) =>
        typeof child.type === "function" && child.type.name === "MarkdownEditor"
    );
    const advancedSettings = collectElements(
      element,
      (child) => child.type === GlossaryFormAdvancedMatchingSettings
    );
    const occurrenceButtons = buttons.filter(
      (button) =>
        button.props.className === "glossaryEditorOccurrenceButton"
    );
    const removeButtons = buttons.filter(
      (button) =>
        button.props.className === "glossaryEditorRemoveFormButton"
    );
    const addButtons = buttons.filter(
      (button) => button.props.className === "glossaryEditorAddForm"
    );
    const deleteButton = buttons.find(
      (button) => button.props.className === "glossaryEditorDeleteButton"
    );

    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      expect(input.props.readOnly).toBe(true);
    }
    expect(selects).toHaveLength(3);
    for (const select of selects) {
      expect(select.props.disabled).toBe(true);
    }
    expect(markdownEditors[0].props.readOnly).toBe(true);
    expect(advancedSettings).toHaveLength(3);
    for (const settings of advancedSettings) {
      expect(settings.props.readOnly).toBe(true);
    }
    expect(removeButtons).toHaveLength(2);
    expect(addButtons).toHaveLength(2);
    for (const button of [...removeButtons, ...addButtons]) {
      expect(button.props.disabled).toBe(true);
    }
    expect(deleteButton?.props.disabled).toBe(true);
    expect(occurrenceButtons).toHaveLength(2);
    expect(occurrenceButtons[0].props.disabled).toBeUndefined();
    expect(occurrenceButtons[1].props.disabled).toBeUndefined();

    (inputs[0].props.onChange as (event: unknown) => void)({
      target: { value: "新王都" }
    });
    (inputs[1].props.onChange as (event: unknown) => void)({
      target: { value: "新別名" }
    });
    (selects[0].props.onChange as (event: unknown) => void)({
      target: { value: "person" }
    });
    (selects[1].props.onChange as (event: unknown) => void)({
      target: { value: "ignore" }
    });
    (
      advancedSettings[0].props.onChangeMatchBoundaryStart as (
        value: string
      ) => void
    )("none");
    (
      advancedSettings[1].props.onChangeMatchBoundaryEnd as (
        value: string
      ) => void
    )("strict");
    (markdownEditors[0].props.onChange as (value: string) => void)("変更");
    (removeButtons[0].props.onClick as () => void)();
    (addButtons[0].props.onClick as () => void)();
    (deleteButton?.props.onClick as () => void)();
    (occurrenceButtons[0].props.onClick as () => void)();
    (occurrenceButtons[1].props.onClick as () => void)();

    expect(onChangeKind).not.toHaveBeenCalled();
    expect(onChangeDescription).not.toHaveBeenCalled();
    expect(onChangeCanonicalSurface).not.toHaveBeenCalled();
    expect(onChangeCanonicalMatchBoundaryStart).not.toHaveBeenCalled();
    expect(onChangeCanonicalMatchBoundaryEnd).not.toHaveBeenCalled();
    expect(onAddForm).not.toHaveBeenCalled();
    expect(onChangeFormSurface).not.toHaveBeenCalled();
    expect(onChangeFormWarningPolicy).not.toHaveBeenCalled();
    expect(onChangeFormMatchBoundaryStart).not.toHaveBeenCalled();
    expect(onChangeFormMatchBoundaryEnd).not.toHaveBeenCalled();
    expect(onDeleteForm).not.toHaveBeenCalled();
    expect(onDeleteEntry).not.toHaveBeenCalled();
    expect(onNavigateToPreviousOccurrence).toHaveBeenCalledTimes(1);
    expect(onNavigateToNextOccurrence).toHaveBeenCalledTimes(1);
  });

  it("reports occurrence navigation clicks through the onNavigateToPrevious/NextOccurrence props, not inline logic", () => {
    const onNavigateToPreviousOccurrence = vi.fn();
    const onNavigateToNextOccurrence = vi.fn();
    const element = GlossaryEditor(
      glossaryEditorProps({
        onNavigateToPreviousOccurrence,
        onNavigateToNextOccurrence
      })
    );
    const buttons = collectElements(
      element,
      (child) =>
        child.type === "button" &&
        child.props.className === "glossaryEditorOccurrenceButton"
    );
    const [previousButton, nextButton] = buttons;

    (previousButton.props.onClick as () => void)();
    (nextButton.props.onClick as () => void)();

    expect(onNavigateToPreviousOccurrence).toHaveBeenCalledTimes(1);
    expect(onNavigateToNextOccurrence).toHaveBeenCalledTimes(1);
  });

  it("renders a danger-styled delete-entry icon button with an i18n aria-label and title", () => {
    const element = GlossaryEditor(glossaryEditorProps());
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const deleteButton = buttons.find(
      (button) => button.props.className === "glossaryEditorDeleteButton"
    );

    expect(deleteButton).toBeDefined();
    expect(deleteButton?.props["aria-label"]).toBe(
      "glossaryEditor.deleteEntry"
    );
    expect(deleteButton?.props.title).toBe("glossaryEditor.deleteEntry");
  });

  it("reports the delete-entry action through onDeleteEntry", () => {
    const onDeleteEntry = vi.fn();
    const element = GlossaryEditor(glossaryEditorProps({ onDeleteEntry }));
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const deleteButton = buttons.find(
      (button) => button.props.className === "glossaryEditorDeleteButton"
    );

    (deleteButton?.props.onClick as () => void)();

    expect(onDeleteEntry).toHaveBeenCalledTimes(1);
  });

  it("renders the delete-entry button using the delete.svg icon markup", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, glossaryEditorProps())
    );

    expect(markup).toContain('class="glossaryEditorDeleteButton"');
    expect(markup).toContain("feather-trash-2");
  });

  it("renders alias/variant remove buttons as delete.svg icon buttons with an i18n aria-label and title", () => {
    const element = GlossaryEditor(glossaryEditorProps());
    const buttons = collectElements(
      element,
      (child) =>
        child.type === "button" &&
        child.props.className === "glossaryEditorRemoveFormButton"
    );

    expect(buttons).toHaveLength(2);

    for (const button of buttons) {
      expect(button.props["aria-label"]).toBe("glossaryEditor.removeForm");
      expect(button.props.title).toBe("glossaryEditor.removeForm");
    }
  });

  it("does not use the entry-deletion danger style for alias/variant remove buttons", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, glossaryEditorProps())
    );

    expect(markup).toContain('class="glossaryEditorRemoveFormButton"');
    expect(markup).not.toContain(
      'class="glossaryEditorRemoveFormButton glossaryEditorDeleteButton"'
    );
    expect(markup).not.toContain(
      'class="glossaryEditorDeleteButton glossaryEditorRemoveFormButton"'
    );
  });

  it("passes the draft description to the Markdown editor for editing", () => {
    const draft = createGlossaryEntryDraft(entry);
    const onChangeDescription = vi.fn();
    const element = GlossaryEditor(glossaryEditorProps({
      draft: { ...draft, description: "編集中の説明" },
      onChangeDescription
    }));
    const markdownEditors = collectElements(
      element,
      (child) => typeof child.type === "function" && child.type.name === "MarkdownEditor"
    );

    expect(markdownEditors).toHaveLength(1);
    expect(markdownEditors[0].props.value).toBe("編集中の説明");
    expect(markdownEditors[0].props.onChange).toBe(onChangeDescription);
  });

  it("renders the draft description as Markdown preview, not raw source", () => {
    const draft = {
      ...createGlossaryEntryDraft(entry),
      description: "**強調**テキスト"
    };
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, glossaryEditorProps({
        draft,
      }))
    );

    expect(markup).toContain("<strong>強調</strong>");
    expect(markup).not.toContain("**強調**");
  });

  it("shows the empty-description placeholder only when the draft description is blank", () => {
    const draft = createGlossaryEntryDraft(entry);
    const emptyMarkup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, glossaryEditorProps({
        draft: { ...draft, description: "  " },
      }))
    );
    const filledMarkup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, glossaryEditorProps({
        draft: { ...draft, description: "本文" },
      }))
    );

    expect(emptyMarkup).toContain("glossaryEditor.emptyDescription");
    expect(filledMarkup).not.toContain("glossaryEditor.emptyDescription");
    expect(filledMarkup).toContain("本文");
  });

  it("renders canonical surface and forms as editable inputs", () => {
    const draft = {
      ...createGlossaryEntryDraft(entry),
      kind: "person" as const,
      description: "変更後"
    };
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, glossaryEditorProps({
        draft,
      }))
    );

    expect(markup).toContain("王都");
    expect(markup).toContain("首都");
    expect(markup).toContain("王都");
    expect(markup).toMatch(/<input[^>]*value="王都"/);
    expect(markup).toMatch(/<input[^>]*value="首都"/);
  });

  it("marks only supported Glossary edit fields as context menu surfaces", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEditor, glossaryEditorProps())
    );

    expect(markup).toContain(
      `${pergamumContextSurfaceAttribute}="glossaryCanonicalInput"`
    );
    expect(markup).toContain(
      `${pergamumContextSurfaceAttribute}="glossaryDescription"`
    );
    expect(markup.match(/data-pergamum-context-surface="glossaryFormSurface"/g))
      .toHaveLength(2);
    expect(markup).not.toContain(
      `${pergamumContextSurfaceAttribute}="unknownEditable"`
    );
  });
});

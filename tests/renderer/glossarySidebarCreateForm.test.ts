import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  GlossarySidebarView,
  initialGlossaryCreateFormState
} from "../../src/renderer/GlossarySidebar";
import { createLoadedGlossarySidebarState } from "../../src/renderer/glossarySidebarState";
import type { Translate } from "../../src/shared/i18n";

const translate: Translate = (key) => key;

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

function renderView(overrides: Partial<Parameters<typeof GlossarySidebarView>[0]> = {}) {
  return GlossarySidebarView({
    state: createLoadedGlossarySidebarState([], null),
    highlightedEntryId: null,
    translate,
    onSelectEntry: () => undefined,
    onActivateEntry: () => undefined,
    canCreateEntry: true,
    searchQuery: "",
    createForm: initialGlossaryCreateFormState,
    onChangeSearchQuery: () => undefined,
    onToggleCreateForm: () => undefined,
    onChangeCreateSurface: () => undefined,
    onChangeCreateKind: () => undefined,
    onSubmitCreateForm: () => undefined,
    ...overrides
  });
}

describe("Glossary Sidebar create form (identity-only creation UI)", () => {
  it("disables + Add when no project is open and enables it otherwise", () => {
    const closedForm = renderView({ canCreateEntry: false });
    const addButtonWhenDisabled = collectElements(
      closedForm,
      (child) => child.type === "button" && child.props.className === "workspaceSidebarButton"
    )[0];

    expect(addButtonWhenDisabled.props.disabled).toBe(true);

    const openForm = renderView({ canCreateEntry: true });
    const addButtonWhenEnabled = collectElements(
      openForm,
      (child) => child.type === "button" && child.props.className === "workspaceSidebarButton"
    )[0];

    expect(addButtonWhenEnabled.props.disabled).toBe(false);
  });

  it("toggles the creation form through onToggleCreateForm when + Add is clicked", () => {
    const onToggleCreateForm = vi.fn();
    const element = renderView({ onToggleCreateForm });
    const addButton = collectElements(
      element,
      (child) => child.type === "button" && child.props.className === "workspaceSidebarButton"
    )[0];

    (addButton.props.onClick as () => void)();

    expect(onToggleCreateForm).toHaveBeenCalledTimes(1);
  });

  it("disables + Add and ignores the add action in read-only project sessions", () => {
    const onToggleCreateForm = vi.fn();
    const element = renderView({
      canCreateEntry: true,
      readOnly: true,
      onToggleCreateForm
    });
    const addButton = collectElements(
      element,
      (child) =>
        child.type === "button" &&
        child.props.className === "workspaceSidebarButton"
    )[0];

    expect(addButton.props.disabled).toBe(true);

    (addButton.props.onClick as () => void)();

    expect(onToggleCreateForm).not.toHaveBeenCalled();
  });

  it("does not render the creation form fields until it is opened", () => {
    const closed = renderView({ createForm: initialGlossaryCreateFormState });

    expect(collectElements(closed, (child) => child.type === "form")).toHaveLength(0);
  });

  it("only accepts canonical surface and kind while creating an entry", () => {
    const onChangeCreateSurface = vi.fn();
    const onChangeCreateKind = vi.fn();
    const element = renderView({
      createForm: { ...initialGlossaryCreateFormState, isOpen: true },
      onChangeCreateSurface,
      onChangeCreateKind
    });

    const textInputs = collectElements(
      element,
      (child) => child.type === "input" && child.props.type === "text"
    );
    const selects = collectElements(element, (child) => child.type === "select");

    expect(textInputs).toHaveLength(1);
    expect(selects).toHaveLength(1);

    (textInputs[0].props.onChange as (event: unknown) => void)({
      target: { value: "王都" }
    });
    expect(onChangeCreateSurface).toHaveBeenCalledWith("王都");

    (selects[0].props.onChange as (event: unknown) => void)({
      target: { value: "person" }
    });
    expect(onChangeCreateKind).toHaveBeenCalledWith("person");
  });

  it("disables submit until a canonical surface is entered, and submits through onSubmitCreateForm", () => {
    const onSubmitCreateForm = vi.fn();
    const emptySurfaceForm = renderView({
      createForm: { ...initialGlossaryCreateFormState, isOpen: true },
      onSubmitCreateForm
    });
    const emptySubmitButton = collectElements(
      emptySurfaceForm,
      (child) => child.type === "button" && child.props.type === "submit"
    )[0];

    expect(emptySubmitButton.props.disabled).toBe(true);

    const filledForm = renderView({
      createForm: {
        ...initialGlossaryCreateFormState,
        isOpen: true,
        canonicalSurface: "王都"
      },
      onSubmitCreateForm
    });
    const form = collectElements(filledForm, (child) => child.type === "form")[0];
    const filledSubmitButton = collectElements(
      filledForm,
      (child) => child.type === "button" && child.props.type === "submit"
    )[0];

    expect(filledSubmitButton.props.disabled).toBe(false);

    (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({
      preventDefault: () => undefined
    });
    expect(onSubmitCreateForm).toHaveBeenCalledTimes(1);
  });

  it("disables create form write controls and submit in read-only project sessions", () => {
    const onChangeCreateSurface = vi.fn();
    const onChangeCreateKind = vi.fn();
    const onSubmitCreateForm = vi.fn();
    const element = renderView({
      readOnly: true,
      createForm: {
        ...initialGlossaryCreateFormState,
        isOpen: true,
        canonicalSurface: "王都"
      },
      onChangeCreateSurface,
      onChangeCreateKind,
      onSubmitCreateForm
    });
    const form = collectElements(element, (child) => child.type === "form")[0];
    const textInput = collectElements(
      element,
      (child) => child.type === "input" && child.props.type === "text"
    )[0];
    const select = collectElements(
      element,
      (child) => child.type === "select"
    )[0];
    const submitButton = collectElements(
      element,
      (child) => child.type === "button" && child.props.type === "submit"
    )[0];
    const cancelButton = collectElements(
      element,
      (child) => child.type === "button" && child.props.type === "button"
    )[0];

    expect(textInput.props.disabled).toBe(true);
    expect(select.props.disabled).toBe(true);
    expect(submitButton.props.disabled).toBe(true);
    expect(cancelButton.props.disabled).toBe(false);

    (textInput.props.onChange as (event: unknown) => void)({
      target: { value: "新王都" }
    });
    (select.props.onChange as (event: unknown) => void)({
      target: { value: "person" }
    });
    (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({
      preventDefault: () => undefined
    });

    expect(onChangeCreateSurface).not.toHaveBeenCalled();
    expect(onChangeCreateKind).not.toHaveBeenCalled();
    expect(onSubmitCreateForm).not.toHaveBeenCalled();
  });

  it("shows the creation error message when the last submission failed", () => {
    const withError = renderView({
      createForm: {
        ...initialGlossaryCreateFormState,
        isOpen: true,
        error: "glossary.create.error"
      }
    });

    const alerts = collectElements(
      withError,
      (child) => child.props.role === "alert" && child.type === "p"
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].props.children).toBe("glossary.create.error");
  });
});

// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { diagnosticCount, forEachDiagnostic } from "@codemirror/lint";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMarkdownSyntaxCheckerExtension,
  registerEditorViewSyntaxCheckerOptions,
  triggerMarkdownSyntaxCheckNow,
  unregisterEditorViewSyntaxCheckerOptions,
  type MarkdownSyntaxCheckerOptions
} from "../../src/renderer/markdownSyntaxChecker/markdownSyntaxCheckerExtension";
import { createGlossaryDescriptionMarkdownSurfaceSource } from "../../src/renderer/markdownSurfaceSource";
import { createGlossaryDescriptionCurrentEditor } from "../../src/renderer/currentEditor";
import type { GlossaryEntry } from "../../src/shared/glossary";

// Valid Markdown vs. Markdown with a markdownlint finding (MD022: a heading
// without surrounding blank lines).
const VALID = "# 見出し\n\n本文です。\n";
const WITH_FINDING = "本文です。\n# 見出し\n本文です。\n";

const app = readFileSync("src/renderer/App.tsx", "utf8");

describe("Markdown syntax checker enablement for a glossary Description (#690)", () => {
  it("enables the checker for the whole Markdown editing target, reusing the existing gate", () => {
    expect(app).toContain(
      "const canUseMarkdownSyntaxChecker = activeEditorIsMarkdownEditingTarget;"
    );
    expect(app).toContain(
      "const activeEditorIsMarkdownEditingTarget =\n    activeEditorIsMarkdown || isGlossaryDescriptionEditorActive;"
    );
  });

  it("keeps every special tab (and .txt) out: both operands carry the special-tab gate", () => {
    expect(app).toMatch(
      /const activeEditorIsMarkdown =\s+!isEditorAreaSpecialTabActive &&\s+currentEditor\?\.kind === "markdown" &&\s+isMarkdownCurrentDocument\(currentEditor\.document\);/
    );
    expect(app).toMatch(
      /const isGlossaryDescriptionEditorActive =\s+!isEditorAreaSpecialTabActive &&\s+currentEditor\?\.kind === "glossaryDescription";/
    );
  });

  it("drives Toolbar, Command Registry, shortcut and the editor from the one gate", () => {
    expect(app).toContain(
      "canToggleSyntaxCheckerCommandRef.current = () => canUseMarkdownSyntaxChecker;"
    );
    expect(app).toContain("canUseMarkdownSyntaxChecker={canUseMarkdownSyntaxChecker}");
    expect(app).toMatch(
      /commandId: rendererShortcutCommandIds\.toggleSyntaxChecker,\s+handler: \(\) => \{\s+if \(canUseMarkdownSyntaxChecker\)/
    );
    expect(app).toContain(
      "canUseMarkdownSyntaxChecker && isMarkdownSyntaxCheckerActive"
    );
  });

  it("keeps the toggle a single App-level flag: only the toggle and the project reset write it", () => {
    const writes = app.match(/setIsMarkdownSyntaxCheckerActive\(/g) ?? [];

    // useState declaration is not a call; these are the toggle and the
    // [project] reset. No per-tab state, no reset on tab switch.
    expect(writes).toHaveLength(2);
    expect(app).toContain("setIsMarkdownSyntaxCheckerActive((prev) => !prev);");
    expect(app).toContain("setIsMarkdownSyntaxCheckerActive(false);");
  });

  it("a glossary Description surface is already a Markdown source for the checker", () => {
    const entry: GlossaryEntry = {
      id: "0190b6a1-1c2d-7e3f-8a4b-0000000000e1",
      description: "保存済み",
      atoms: [
        {
          id: "0190b6a1-1c2d-7e3f-8a4b-000000000001",
          entryId: "0190b6a1-1c2d-7e3f-8a4b-0000000000e1",
          sortOrder: 0,
          value: "用語",
          matchFlags: 0,
          createdAt: "2026-09-24T00:00:00.000Z",
          updatedAt: "2026-09-24T00:00:00.000Z"
        }
      ],
      tags: [],
      createdAt: "2026-09-24T00:00:00.000Z",
      updatedAt: "2026-09-24T00:00:00.000Z"
    };
    const source = createGlossaryDescriptionMarkdownSurfaceSource(
      createGlossaryDescriptionCurrentEditor(entry)
    );

    expect(source.isMarkdownDocument).toBe(true);
  });
});

describe("Markdown syntax checker on a glossary Description editor (#690)", () => {
  let parent: HTMLElement;
  let view: EditorView;
  let active: boolean;
  let isMarkdownDocument: boolean;

  const options: MarkdownSyntaxCheckerOptions = {
    getIsActive: () => active,
    getIsMarkdownDocument: () => isMarkdownDocument
  };

  function stateFor(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [createMarkdownSyntaxCheckerExtension(options)]
    });
  }

  function mount(doc: string): void {
    view = new EditorView({ parent, state: stateFor(doc) });
    registerEditorViewSyntaxCheckerOptions(view, options);
  }

  function messages(): string[] {
    const found: string[] = [];

    forEachDiagnostic(view.state, (diagnostic) => {
      found.push(diagnostic.message);
    });

    return found;
  }

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
    active = true;
    isMarkdownDocument = true; // what a Description surface source reports
  });

  afterEach(() => {
    unregisterEditorViewSyntaxCheckerOptions(view);
    view.destroy();
    parent.remove();
  });

  it("produces markdownlint diagnostics for the Description's current text", () => {
    mount(WITH_FINDING);
    triggerMarkdownSyntaxCheckNow(view, options);

    expect(diagnosticCount(view.state)).toBeGreaterThan(0);
    expect(messages().some((message) => message.startsWith("MD022"))).toBe(
      true
    );
  });

  it("lints the unsaved draft, not the saved value", () => {
    // saved: VALID (clean). The editor holds an unsaved draft with a finding.
    mount(VALID);
    triggerMarkdownSyntaxCheckNow(view, options);
    expect(diagnosticCount(view.state)).toBe(0);

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: WITH_FINDING }
    });
    triggerMarkdownSyntaxCheckNow(view, options);

    expect(diagnosticCount(view.state)).toBeGreaterThan(0);
  });

  it("clears diagnostics when turned OFF and re-checks the draft when ON again", () => {
    mount(WITH_FINDING);
    triggerMarkdownSyntaxCheckNow(view, options);
    expect(diagnosticCount(view.state)).toBeGreaterThan(0);

    active = false;
    triggerMarkdownSyntaxCheckNow(view, options);
    expect(diagnosticCount(view.state)).toBe(0);

    active = true;
    triggerMarkdownSyntaxCheckNow(view, options);
    expect(diagnosticCount(view.state)).toBeGreaterThan(0);
  });

  it("an editor switch (A with a finding -> B clean) never carries A's diagnostics to B", () => {
    mount(WITH_FINDING);
    triggerMarkdownSyntaxCheckNow(view, options);
    expect(diagnosticCount(view.state)).toBeGreaterThan(0);

    // Same view, another document's EditorState (Description A -> B, or a
    // Markdown document <-> a Description), then the switch-time check.
    view.setState(stateFor(VALID));
    expect(diagnosticCount(view.state)).toBe(0);
    triggerMarkdownSyntaxCheckNow(view, options);
    expect(diagnosticCount(view.state)).toBe(0);
  });

  it("a remounted editor starts without the old editor's diagnostics", () => {
    mount(WITH_FINDING);
    triggerMarkdownSyntaxCheckNow(view, options);
    unregisterEditorViewSyntaxCheckerOptions(view);
    view.destroy();

    mount(VALID);
    triggerMarkdownSyntaxCheckNow(view, options);

    expect(diagnosticCount(view.state)).toBe(0);
  });

  it("stays silent on a non-Markdown surface (.txt)", () => {
    isMarkdownDocument = false;
    mount(WITH_FINDING);
    triggerMarkdownSyntaxCheckNow(view, options);

    expect(diagnosticCount(view.state)).toBe(0);
  });
});

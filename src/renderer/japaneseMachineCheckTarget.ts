import {
  isJapaneseMachineCheckPath,
  type JapaneseMachineCheckGlossaryDescriptionTarget,
  type JapaneseMachineCheckProjectFileTarget,
  type JapaneseMachineCheckTarget
} from "../shared/japaneseMachineCheck";
import type { CurrentEditor } from "./currentEditor";
import { presetRepresentativeOrDefault } from "./glossaryEntryTabCommands";

/**
 * #688: what "日本語表現チェック..." would check right now, or null when
 * nothing can be checked. The one place that decides it: the command's
 * enablement and its invocation both call this, so they cannot disagree.
 *
 * The returned target is a fresh snapshot (plain values, no reference to the
 * editor): the dialog freezes it and uses that same object for the estimate,
 * the run and the report.
 */
export interface JapaneseMachineCheckTargetContext {
  readonly currentEditor: CurrentEditor | null;
  /** A special tab (Settings, a manager, ...) is the active tab. */
  readonly isSpecialTabActive: boolean;
  /**
   * The active editor's backing project file (project-relative), or null. As
   * before #688, this is not gated on the active tab kind.
   */
  readonly activeProjectDocumentRelativePath: string | null;
  readonly isProjectDocumentDirty: (relativePath: string) => boolean;
}

/**
 * The glossary Description tab's current draft, as a target. Both parts are
 * read from the live draft (not the saved entry, and not the tab's cached
 * `representativeSurface`, which does not follow edits or Atom reordering):
 *  - text:        the draft's Description
 *  - displayName: the draft's first Atom (the representative Atom), trimmed;
 *                 the usual fallback when it is empty or missing, so an
 *                 incomplete draft can still be checked. Kept whole, however
 *                 long: only the Save dialog's suggested file name is cut.
 */
export function createGlossaryDescriptionMachineCheckTarget(
  editor: Extract<CurrentEditor, { kind: "glossaryDescription" }>
): JapaneseMachineCheckGlossaryDescriptionTarget {
  const representative = editor.draft.atoms[0]?.value.trim();

  return {
    kind: "glossaryDescription",
    text: editor.draft.description,
    displayName: presetRepresentativeOrDefault(representative)
  };
}

export function resolveJapaneseMachineCheckTarget(
  context: JapaneseMachineCheckTargetContext
): JapaneseMachineCheckTarget | null {
  const { currentEditor } = context;

  if (currentEditor?.kind === "glossaryDescription") {
    // A special tab in front: the Description behind it is not the target.
    return context.isSpecialTabActive
      ? null
      : createGlossaryDescriptionMachineCheckTarget(currentEditor);
  }

  const relativePath = context.activeProjectDocumentRelativePath;

  if (relativePath === null || !isJapaneseMachineCheckPath(relativePath)) {
    return null;
  }

  const target: JapaneseMachineCheckProjectFileTarget = {
    kind: "projectFile",
    relativePath,
    isDirty: context.isProjectDocumentDirty(relativePath)
  };

  return target;
}

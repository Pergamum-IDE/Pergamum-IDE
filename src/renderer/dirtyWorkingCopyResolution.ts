import type { EditorId } from "../shared/editorId";
import type { Translate, TranslationKey } from "../shared/i18n";
import type {
  DirtyWorkingCopy,
  DirtyWorkingCopyScope,
  LifecycleIntent,
  SaveWorkingCopyOutcome
} from "../shared/lifecycle";
import {
  AppDialogError,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult,
  type AppDialogChoiceId
} from "./dialog/appDialogTypes";
import {
  findOpenDocument,
  getDirtyWorkingCopies,
  isOpenDocumentDirty,
  type OpenDocumentsState
} from "./openDocuments";
import type {
  LifecycleCommitBarrierIntent,
  LifecycleCommitBarrierToken
} from "./lifecycleCommitBarrier";

export const lifecycleDirtyChoiceIds = {
  saveAll: "saveAll",
  discardAll: "discardAll",
  cancel: "cancel"
} as const satisfies Record<string, AppDialogChoiceId>;

export type LifecycleDirtyChoiceId =
  (typeof lifecycleDirtyChoiceIds)[keyof typeof lifecycleDirtyChoiceIds];

export type DirtyResolutionIntent = Extract<
  LifecycleIntent,
  "explicitProjectClose" | "ordinaryWindowClose" | "explicitApplicationQuit"
>;

export type DirtyWorkingCopyResolutionResult =
  | {
      readonly status: "resolved";
      readonly commitBarrierToken: LifecycleCommitBarrierToken;
    }
  | {
      readonly status: "discarded";
      readonly commitBarrierToken: LifecycleCommitBarrierToken;
    }
  | { readonly status: "cancelled" }
  | {
      readonly status: "aborted";
      readonly editorId: EditorId;
      readonly outcome: Exclude<SaveWorkingCopyOutcome, "saved">;
    };

export interface DirtyWorkingCopyResolutionDeps {
  readonly getState: () => OpenDocumentsState;
  readonly translate: Translate;
  readonly targetName: string;
  readonly choiceDialog: (
    options: AppChoiceDialogOptions
  ) => Promise<AppChoiceDialogResult>;
  readonly saveDirtyWorkingCopy: (
    workingCopy: DirtyWorkingCopy
  ) => Promise<SaveWorkingCopyOutcome>;
  readonly enterCommitBarrier: (
    intent: LifecycleCommitBarrierIntent
  ) => LifecycleCommitBarrierToken;
}

function titleKeyForIntent(intent: DirtyResolutionIntent): TranslationKey {
  switch (intent) {
    case "explicitProjectClose":
    case "ordinaryWindowClose":
    case "explicitApplicationQuit":
      return "dialog.unsavedChanges.title";
  }
}

function messageKeyForIntent(intent: DirtyResolutionIntent): TranslationKey {
  switch (intent) {
    case "explicitProjectClose":
    case "ordinaryWindowClose":
      return "dialog.unsavedChanges.prompt";
    case "explicitApplicationQuit":
      return "dialog.unsavedChanges.quitPrompt";
  }
}

function saveAllKeyForIntent(intent: DirtyResolutionIntent): TranslationKey {
  switch (intent) {
    case "explicitProjectClose":
    case "ordinaryWindowClose":
      return "dialog.unsavedChanges.saveAllAndClose";
    case "explicitApplicationQuit":
      return "dialog.unsavedChanges.saveAllAndQuit";
  }
}

function discardKeyForIntent(intent: DirtyResolutionIntent): TranslationKey {
  switch (intent) {
    case "explicitProjectClose":
    case "ordinaryWindowClose":
      return "dialog.unsavedChanges.discardAndClose";
    case "explicitApplicationQuit":
      return "dialog.unsavedChanges.discardAndQuit";
  }
}

function isProjectOwnedDirtyWorkingCopyScope(
  scope: DirtyWorkingCopyScope
): boolean {
  return scope === "projectDocument" || scope === "glossary";
}

export function getDirtyWorkingCopiesForLifecycle(
  intent: DirtyResolutionIntent,
  state: OpenDocumentsState
): DirtyWorkingCopy[] {
  const dirtyWorkingCopies = getDirtyWorkingCopies(state);

  if (intent !== "explicitProjectClose") {
    return dirtyWorkingCopies;
  }

  return dirtyWorkingCopies.filter((workingCopy) =>
    isProjectOwnedDirtyWorkingCopyScope(workingCopy.scope)
  );
}

export function buildLifecycleDirtyChoiceDialogOptions(
  intent: DirtyResolutionIntent,
  translate: Translate,
  targetName: string
): AppChoiceDialogOptions {
  return {
    title: translate(titleKeyForIntent(intent)),
    message: {
      kind: "plainText",
      text: translate(messageKeyForIntent(intent), { targetName })
    },
    icon: {
      kind: "warning",
      tooltip: translate("dialog.icon.warning")
    },
    choices: [
      {
        id: lifecycleDirtyChoiceIds.saveAll,
        label: translate(saveAllKeyForIntent(intent)),
        role: "primary"
      },
      {
        id: lifecycleDirtyChoiceIds.discardAll,
        label: translate(discardKeyForIntent(intent)),
        role: "destructive",
        icon: { kind: "alertTriangle" }
      },
      {
        id: lifecycleDirtyChoiceIds.cancel,
        label: translate("dialog.unsavedChanges.cancel"),
        role: "cancel"
      }
    ],
    primaryChoiceId: lifecycleDirtyChoiceIds.saveAll,
    cancelChoiceId: lifecycleDirtyChoiceIds.cancel,
    initialFocusChoiceId: lifecycleDirtyChoiceIds.cancel,
    clipboardText: null,
    dismissOnBackdropClick: false
  };
}

export async function resolveDirtyWorkingCopies(
  intent: DirtyResolutionIntent,
  deps: DirtyWorkingCopyResolutionDeps
): Promise<DirtyWorkingCopyResolutionResult> {
  const dirtyWorkingCopies = getDirtyWorkingCopiesForLifecycle(
    intent,
    deps.getState()
  );

  if (dirtyWorkingCopies.length === 0) {
    return {
      status: "resolved",
      commitBarrierToken: deps.enterCommitBarrier(intent)
    };
  }

  let result: AppChoiceDialogResult;

  try {
    result = await deps.choiceDialog(
      buildLifecycleDirtyChoiceDialogOptions(
        intent,
        deps.translate,
        deps.targetName
      )
    );
  } catch (error) {
    if (error instanceof AppDialogError && error.kind === "dialogAlreadyOpen") {
      return { status: "cancelled" };
    }

    throw error;
  }

  if (
    result.kind === "dismissed" ||
    result.id === lifecycleDirtyChoiceIds.cancel
  ) {
    return { status: "cancelled" };
  }

  if (result.id === lifecycleDirtyChoiceIds.discardAll) {
    return {
      status: "discarded",
      commitBarrierToken: deps.enterCommitBarrier(intent)
    };
  }

  if (result.id !== lifecycleDirtyChoiceIds.saveAll) {
    return { status: "cancelled" };
  }

  for (const workingCopy of dirtyWorkingCopies) {
    const latestState = deps.getState();

    if (!findOpenDocument(latestState, workingCopy.editorId)) {
      return {
        status: "aborted",
        editorId: workingCopy.editorId,
        outcome: "ignored"
      };
    }

    if (!isOpenDocumentDirty(latestState, workingCopy.editorId)) {
      continue;
    }

    const outcome = await deps.saveDirtyWorkingCopy(workingCopy);

    if (outcome !== "saved") {
      return {
        status: "aborted",
        editorId: workingCopy.editorId,
        outcome
      };
    }
  }

  const remainingDirtyWorkingCopy = getDirtyWorkingCopiesForLifecycle(
    intent,
    deps.getState()
  )[0];

  if (remainingDirtyWorkingCopy) {
    return {
      status: "aborted",
      editorId: remainingDirtyWorkingCopy.editorId,
      outcome: "ignored"
    };
  }

  return {
    status: "resolved",
    commitBarrierToken: deps.enterCommitBarrier(intent)
  };
}

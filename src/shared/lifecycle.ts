import type { EditorId } from "./editorId";

export type LifecycleIntent =
  | "explicitProjectClose"
  | "ordinaryWindowClose"
  | "explicitApplicationQuit"
  | "systemTermination";

export type SaveWorkingCopyOutcome =
  | "saved"
  | "cancelled"
  | "rejected"
  | "failed"
  | "ignored";

export type DirtyWorkingCopyKind = "markdown" | "glossaryEntry";

export type DirtyWorkingCopyScope =
  | "projectDocument"
  | "glossary"
  | "standaloneMarkdown"
  | "untitledMarkdown";

export interface DirtyWorkingCopy {
  readonly editorId: EditorId;
  readonly kind: DirtyWorkingCopyKind;
  readonly scope: DirtyWorkingCopyScope;
  readonly title: string;
}

export interface CloseCurrentProjectRequest {
  readonly requestId: string;
  readonly intent: "explicitProjectClose";
}

export type CloseCurrentProjectResult =
  | { readonly status: "closed" }
  | { readonly status: "noProject" }
  | {
      readonly status: "failed";
      readonly reason: "releaseFailed" | "unexpected";
    };

export interface LifecycleWindowCloseRequest {
  readonly requestId: string;
  readonly intent: "ordinaryWindowClose";
  readonly isFinalWindow: boolean;
}

export type LifecycleCloseDecision =
  | { readonly status: "approved"; readonly requestId: string }
  | { readonly status: "cancelled"; readonly requestId: string }
  | {
      readonly status: "failed";
      readonly requestId: string;
      readonly reason: "dirtyResolutionFailed" | "rendererUnavailable";
    };

export interface QuitApplicationRequest {
  readonly requestId: string;
  readonly intent: "explicitApplicationQuit";
  /**
   * #394 Step 3: when true, main relaunches the app (`app.relaunch()`)
   * BEFORE calling `app.quit()` for this request — i.e. only once quit
   * itself is being authorized here, never earlier (see
   * requestApplicationQuit in windowLifecycle.ts). Absent/false is an
   * ordinary quit with no relaunch. This is generic restart-request
   * plumbing, not specific to any one Settings key.
   */
  readonly restartAfterQuit?: boolean;
}

export type QuitApplicationResult =
  | { readonly status: "quitting" }
  | { readonly status: "ignored"; readonly reason: "quitAlreadyApproved" };

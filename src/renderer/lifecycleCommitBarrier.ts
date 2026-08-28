import type { LifecycleIntent } from "../shared/lifecycle";

export type LifecycleCommitBarrierIntent = Extract<
  LifecycleIntent,
  "explicitProjectClose" | "ordinaryWindowClose" | "explicitApplicationQuit"
>;

export interface LifecycleCommitBarrierToken {
  readonly id: number;
  readonly intent: LifecycleCommitBarrierIntent;
}

export interface LifecycleCommitBarrierController {
  enter(intent: LifecycleCommitBarrierIntent): LifecycleCommitBarrierToken;
  exit(token: LifecycleCommitBarrierToken): boolean;
  isActive(): boolean;
  isCurrent(token: LifecycleCommitBarrierToken): boolean;
  currentIntent(): LifecycleCommitBarrierIntent | null;
}

export interface WorkingCopyMutationBlockInput {
  readonly lifecycleCommitBarrierActive: boolean;
  readonly isReadOnlyProjectOwnedEditor: boolean;
}

export function canMutateWorkingCopy({
  lifecycleCommitBarrierActive,
  isReadOnlyProjectOwnedEditor
}: WorkingCopyMutationBlockInput): boolean {
  return !lifecycleCommitBarrierActive && !isReadOnlyProjectOwnedEditor;
}

export function createLifecycleCommitBarrier(): LifecycleCommitBarrierController {
  let activeToken: LifecycleCommitBarrierToken | null = null;
  let nextTokenId = 1;

  return {
    enter(intent) {
      if (activeToken) {
        throw new Error("Lifecycle commit barrier is already active.");
      }

      activeToken = {
        id: nextTokenId,
        intent
      };
      nextTokenId += 1;

      return activeToken;
    },
    exit(token) {
      if (!activeToken || activeToken.id !== token.id) {
        return false;
      }

      activeToken = null;
      return true;
    },
    isActive() {
      return activeToken !== null;
    },
    isCurrent(token) {
      return activeToken?.id === token.id;
    },
    currentIntent() {
      return activeToken?.intent ?? null;
    }
  };
}

import type { SaveMarkdownRejectedReason } from "../shared/api";
import type { AppPlatform } from "../shared/platform";
import {
  isPathEqualOrInsideDirectory,
  isProjectWriteLockDirectoryTarget,
  isProtectedPergamumDataFilePath
} from "../shared/saveTargetPolicy";

export type StandaloneSaveTargetPolicyResult =
  | {
      readonly kind: "allowed";
      readonly requiresReadOnlyProjectConfirmation: boolean;
    }
  | {
      readonly kind: "rejected";
      readonly reason: SaveMarkdownRejectedReason;
    };

export interface ValidateStandaloneSaveTargetForSaveAsUiInput {
  readonly filePath: string;
  readonly currentProjectRootPath: string | null;
  readonly isReadOnlyProject: boolean;
  readonly platform: AppPlatform;
}

export function validateStandaloneSaveTargetForSaveAsUi({
  filePath,
  currentProjectRootPath,
  isReadOnlyProject,
  platform
}: ValidateStandaloneSaveTargetForSaveAsUiInput): StandaloneSaveTargetPolicyResult {
  if (isProtectedPergamumDataFilePath(filePath)) {
    return { kind: "rejected", reason: "protected" };
  }

  if (currentProjectRootPath) {
    try {
      if (
        isProjectWriteLockDirectoryTarget(
          filePath,
          currentProjectRootPath,
          platform
        )
      ) {
        return { kind: "rejected", reason: "protected" };
      }
    } catch {
      return { kind: "rejected", reason: "protected" };
    }
  }

  if (!currentProjectRootPath || !isReadOnlyProject) {
    return {
      kind: "allowed",
      requiresReadOnlyProjectConfirmation: false
    };
  }

  try {
    return {
      kind: "allowed",
      requiresReadOnlyProjectConfirmation: isPathEqualOrInsideDirectory(
        filePath,
        currentProjectRootPath,
        platform
      )
    };
  } catch {
    return {
      kind: "allowed",
      requiresReadOnlyProjectConfirmation: true
    };
  }
}

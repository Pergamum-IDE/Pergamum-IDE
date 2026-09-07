/**
 * #411: IPC handler for broken project-local image-link diagnostics.
 *
 * Channel: `markdownImageLinkDiagnostics:validate`.
 *
 * The renderer sends `{ resolutionContext, links }`. The project root is NEVER
 * accepted from the renderer — it is resolved authoritatively here
 * (`currentProjectRootPath()`); if no project is open the result is
 * `{ ok: false, diagnostics: [] }` and the renderer shows nothing. #412: the
 * `resolutionContext` is `sourceFile` for a Markdown document editor and
 * `projectRoot` for the Glossary editor — the same
 * {@link ProjectLocalImageResolutionContext} the Preview uses; there is no
 * Glossary-specific validator.
 *
 * Read-only: this never writes, repairs, converts, or rewrites anything. It
 * classifies each link's path shape ({@link classifyProjectLocalImageLink})
 * and, for shape-valid candidates, runs the shared filesystem validation
 * ({@link validateProjectLocalImageFile}) once per distinct `src`.
 */

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  MARKDOWN_IMAGE_LINK_DIAGNOSTICS_CHANNELS,
  type MarkdownImageLinkDiagnostic,
  type MarkdownImageLinkDiagnosticReason,
  type MarkdownImageLinkDiagnosticsRequest,
  type MarkdownImageLinkDiagnosticsResult,
  type ProjectLocalImageResolutionContext
} from "../shared/api";
import { validateAttachedImageSaveDestination } from "../shared/attachedImageSaveDestination";
import {
  classifyProjectLocalImageLink,
  decodeImageLinkSrcForResolution
} from "../shared/projectLocalImageLink";
import type { AppPlatform } from "../shared/platform";
import { currentProjectRootPath as defaultCurrentProjectRootPath } from "./projectIpc";
import {
  defaultProjectLocalImageFileSystem,
  validateProjectLocalImageFile,
  type ProjectLocalImageFileSystem,
  type ValidateProjectLocalImageFileInput,
  type ProjectLocalImageFileValidationResult
} from "./projectLocalImageFileValidation";

export interface MarkdownImageLinkDiagnosticsDeps {
  readonly currentProjectRootPath?: () => string | null;
  readonly fileSystem?: ProjectLocalImageFileSystem;
  readonly platform?: AppPlatform;
  readonly maxBytes?: number;
  readonly validateFile?: (
    input: ValidateProjectLocalImageFileInput
  ) => Promise<ProjectLocalImageFileValidationResult>;
}

function nodePlatformToAppPlatform(platform: NodeJS.Platform): AppPlatform {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "other";
  }
}

function isResolutionContext(
  value: unknown
): value is ProjectLocalImageResolutionContext {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { kind?: unknown };
  if (candidate.kind === "none" || candidate.kind === "projectRoot") {
    return true;
  }
  return (
    candidate.kind === "sourceFile" &&
    typeof (candidate as { sourceMarkdownProjectRelativePath?: unknown })
      .sourceMarkdownProjectRelativePath === "string"
  );
}

function isValidRequest(
  value: unknown
): value is MarkdownImageLinkDiagnosticsRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<MarkdownImageLinkDiagnosticsRequest>;
  return (
    isResolutionContext(candidate.resolutionContext) &&
    Array.isArray(candidate.links)
  );
}

/**
 * A `sourceFile` context must name a sane, in-project relative path — a `..`
 * climbing above the root or an absolute path is not something we resolve
 * links against, so diagnostics are refused. `projectRoot` and `none` need no
 * path check.
 */
function isUsableResolutionContext(
  context: ProjectLocalImageResolutionContext
): context is Exclude<ProjectLocalImageResolutionContext, { kind: "none" }> {
  if (context.kind === "none") {
    return false;
  }
  if (context.kind === "projectRoot") {
    return true;
  }
  return validateAttachedImageSaveDestination(
    context.sourceMarkdownProjectRelativePath
  ).ok;
}

async function reasonForSrc(
  /** Already percent-decoded for resolution — see the caller. */
  resolutionSrc: string,
  context: ProjectLocalImageResolutionContext,
  projectRootPath: string,
  deps: Required<
    Pick<
      MarkdownImageLinkDiagnosticsDeps,
      "fileSystem" | "platform" | "validateFile"
    >
  > & { readonly maxBytes?: number }
): Promise<MarkdownImageLinkDiagnosticReason | null> {
  const classification = classifyProjectLocalImageLink(resolutionSrc, context);

  switch (classification.kind) {
    case "external":
    case "empty":
      return null;
    case "invalidPath":
      return "invalidPath";
    case "outsideProject":
      return "outsideProject";
    case "unsupportedFormat":
      return "unsupportedFormat";
    case "candidate": {
      const validation = await deps.validateFile({
        projectRootPath,
        projectRelativeSegments:
          classification.projectRelativePath.split("/"),
        fileSystem: deps.fileSystem,
        platform: deps.platform,
        maxBytes: deps.maxBytes
      });
      return validation.ok ? null : validation.reason;
    }
    default: {
      const exhaustiveCheck: never = classification;
      return exhaustiveCheck;
    }
  }
}

export async function computeMarkdownImageLinkDiagnostics(
  request: unknown,
  deps: MarkdownImageLinkDiagnosticsDeps = {}
): Promise<MarkdownImageLinkDiagnosticsResult> {
  const getProjectRootPath =
    deps.currentProjectRootPath ?? defaultCurrentProjectRootPath;
  const projectRootPath = getProjectRootPath();
  if (!projectRootPath) {
    return { ok: false, diagnostics: [] };
  }

  if (!isValidRequest(request)) {
    return { ok: false, diagnostics: [] };
  }

  const context = request.resolutionContext;
  if (!isUsableResolutionContext(context)) {
    return { ok: false, diagnostics: [] };
  }

  const resolvedDeps = {
    fileSystem: deps.fileSystem ?? defaultProjectLocalImageFileSystem,
    platform:
      deps.platform ?? nodePlatformToAppPlatform(process.platform),
    validateFile: deps.validateFile ?? validateProjectLocalImageFile,
    maxBytes: deps.maxBytes
  };

  const reasonBySrc = new Map<
    string,
    MarkdownImageLinkDiagnosticReason | null
  >();
  const diagnostics: MarkdownImageLinkDiagnostic[] = [];

  for (const link of request.links) {
    if (
      typeof link?.src !== "string" ||
      !Number.isInteger(link.from) ||
      !Number.isInteger(link.to)
    ) {
      continue;
    }

    // Resolve against the percent-DECODED destination (so Preview and
    // diagnostics agree on the target file), but keep the author's original,
    // still-encoded `link.src` for the diagnostic range + message.
    const resolutionSrc = decodeImageLinkSrcForResolution(link.src);

    let reason = reasonBySrc.get(resolutionSrc);
    if (reason === undefined) {
      reason = await reasonForSrc(
        resolutionSrc,
        context,
        projectRootPath,
        resolvedDeps
      );
      reasonBySrc.set(resolutionSrc, reason);
    }

    if (reason !== null) {
      diagnostics.push({
        from: link.from,
        to: link.to,
        src: link.src,
        reason
      });
    }
  }

  return { ok: true, diagnostics };
}

export function registerMarkdownImageLinkDiagnosticsIpc(
  deps: MarkdownImageLinkDiagnosticsDeps & {
    readonly ipcMain?: {
      handle: (
        channel: string,
        listener: (
          event: IpcMainInvokeEvent,
          payload: unknown
        ) => Promise<MarkdownImageLinkDiagnosticsResult>
      ) => void;
    };
  } = {}
): void {
  const ipc = deps.ipcMain ?? ipcMain;

  ipc.handle(
    MARKDOWN_IMAGE_LINK_DIAGNOSTICS_CHANNELS.validate,
    (_event, payload: unknown) =>
      computeMarkdownImageLinkDiagnostics(payload, deps)
  );
}

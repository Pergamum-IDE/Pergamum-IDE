/**
 * #409: authoritative main-process handler for the `pergamum-asset://`
 * protocol that serves project-local images to the Markdown Preview.
 *
 * Every request is fully re-validated here - the renderer's rewrite pass is a
 * UX convenience, not a trust boundary:
 *   1. a project must be open; its root is resolved from main-side state,
 *      never from the request,
 *   2. the URL is parsed strictly ({@link parsePergamumAssetUrl}) - `..`,
 *      `..\`, a leading `/`, backslashes, percent-encoded separators and
 *      control characters are rejected, not normalized,
 *   3. everything filesystem-touching — lexical containment, protected
 *      locations, supported extension, realpath containment, regular-file /
 *      size / magic-byte checks — is delegated to the shared
 *      {@link validateProjectLocalImageFile} helper (also used by #411's
 *      image-link diagnostics), so the two paths cannot diverge.
 *
 * Only then are the bytes returned. Any failure yields a bare `404` (or a
 * more specific 4xx) with no body, so nothing about the filesystem leaks.
 */

import { protocol as electronProtocol } from "electron";

import type { AppPlatform } from "../shared/platform";
import {
  IMAGE_ATTACHMENT_MAX_BYTES,
  imageAttachmentMimeType
} from "../shared/imageAttachmentFormat";
import {
  PERGAMUM_ASSET_SCHEME,
  parsePergamumAssetUrl
} from "../shared/pergamumAssetUrl";
import { currentProjectRootPath as defaultCurrentProjectRootPath } from "./projectIpc";
import {
  defaultProjectLocalImageFileSystem,
  validateProjectLocalImageFile,
  type ProjectLocalImageFileRejectionReason,
  type ProjectLocalImageFileSystem
} from "./projectLocalImageFileValidation";

/** @deprecated kept as an alias for existing importers; see the shared helper. */
export type PergamumAssetProtocolFileSystem = ProjectLocalImageFileSystem;

export interface RegisterPergamumAssetProtocolDeps {
  readonly protocol?: {
    handle(
      scheme: string,
      handler: (request: { url: string }) => Promise<Response>
    ): void;
  };
  readonly currentProjectRootPath?: () => string | null;
  readonly fileSystem?: ProjectLocalImageFileSystem;
  readonly platform?: AppPlatform;
  /** Upper bound on a served file, bytes. Defaults to the #407 128 MiB cap. */
  readonly maxBytes?: number;
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

function errorResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

const REJECTION_STATUS: Record<ProjectLocalImageFileRejectionReason, number> = {
  outsideProject: 403,
  protectedLocation: 403,
  unsupportedFormat: 415,
  missing: 404,
  directory: 404,
  tooLarge: 413,
  formatMismatch: 415
};

export async function handlePergamumAssetRequest(
  request: { url: string },
  deps: Required<
    Pick<
      RegisterPergamumAssetProtocolDeps,
      "currentProjectRootPath" | "fileSystem" | "platform" | "maxBytes"
    >
  >
): Promise<Response> {
  try {
    const projectRootPath = deps.currentProjectRootPath();
    if (!projectRootPath) {
      return errorResponse(404);
    }

    const parsed = parsePergamumAssetUrl(request.url);
    if (!parsed.ok) {
      return errorResponse(400);
    }

    const validation = await validateProjectLocalImageFile({
      projectRootPath,
      projectRelativeSegments: parsed.segments,
      fileSystem: deps.fileSystem,
      platform: deps.platform,
      maxBytes: deps.maxBytes
    });

    if (!validation.ok) {
      return errorResponse(REJECTION_STATUS[validation.reason]);
    }

    // Re-wrap into a fresh, definitely-`ArrayBuffer`-backed typed array: the
    // shared helper's return type widens `bytes` to `Uint8Array<ArrayBufferLike>`,
    // which this TS lib's `BodyInit` rejects (see #409).
    const body = Uint8Array.from(validation.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": imageAttachmentMimeType(validation.format),
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox;"
      }
    });
  } catch {
    return errorResponse(404);
  }
}

export function registerPergamumAssetProtocol(
  deps: RegisterPergamumAssetProtocolDeps = {}
): void {
  const protocol = deps.protocol ?? electronProtocol;
  const resolvedDeps = {
    currentProjectRootPath:
      deps.currentProjectRootPath ?? defaultCurrentProjectRootPath,
    fileSystem: deps.fileSystem ?? defaultProjectLocalImageFileSystem,
    platform:
      deps.platform ?? nodePlatformToAppPlatform(process.platform),
    maxBytes: deps.maxBytes ?? IMAGE_ATTACHMENT_MAX_BYTES
  };

  protocol.handle(PERGAMUM_ASSET_SCHEME, (request) =>
    handlePergamumAssetRequest(request, resolvedDeps)
  );
}

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
 *   3. `path.resolve` + lexical containment in the project root,
 *   4. the target is not a Pergamum-owned / protected location,
 *   5. the filename extension names a supported format (PNG/JPEG/GIF/WebP),
 *   6. realpath containment of the project root AND the resolved file
 *      (symlink / junction escape),
 *   7. the target is a regular file (not a directory), under the size cap,
 *   8. the file's magic bytes actually identify that supported format.
 *
 * Only then are the bytes returned. Any failure yields a bare `404` (or a
 * more specific 4xx) with no body, so nothing about the filesystem leaks.
 */

import path from "node:path";
import { promises as nodeFs } from "node:fs";
import { protocol as electronProtocol } from "electron";

import {
  isPathEqualOrInsideDirectory,
  isProjectWriteLockDirectoryTarget,
  isProtectedPergamumDataFilePath
} from "../shared/saveTargetPolicy";
import type { AppPlatform } from "../shared/platform";
import {
  IMAGE_ATTACHMENT_MAGIC_PREFIX_LENGTH,
  IMAGE_ATTACHMENT_MAX_BYTES,
  imageAttachmentMimeType,
  resolveImageAttachmentFormat,
  supportedImageAttachmentFormatForFileName
} from "../shared/imageAttachmentFormat";
import {
  PERGAMUM_ASSET_SCHEME,
  parsePergamumAssetUrl
} from "../shared/pergamumAssetUrl";
import { currentProjectRootPath as defaultCurrentProjectRootPath } from "./projectIpc";

export interface PergamumAssetProtocolFileSystem {
  realpath(target: string): Promise<string>;
  stat(
    target: string
  ): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
  readFile(target: string): Promise<Uint8Array>;
}

export interface RegisterPergamumAssetProtocolDeps {
  readonly protocol?: {
    handle(
      scheme: string,
      handler: (request: { url: string }) => Promise<Response>
    ): void;
  };
  readonly currentProjectRootPath?: () => string | null;
  readonly fileSystem?: PergamumAssetProtocolFileSystem;
  readonly platform?: AppPlatform;
  /** Upper bound on a served file, bytes. Defaults to the #407 128 MiB cap. */
  readonly maxBytes?: number;
}

const defaultFileSystem: PergamumAssetProtocolFileSystem = {
  realpath: (target) => nodeFs.realpath(target),
  stat: (target) => nodeFs.stat(target),
  readFile: (target) => nodeFs.readFile(target)
};

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

    const projectRootAbsolute = path.resolve(projectRootPath);
    const resolved = path.resolve(projectRootAbsolute, ...parsed.segments);

    // 3. Lexical containment.
    try {
      if (
        !isPathEqualOrInsideDirectory(
          resolved,
          projectRootAbsolute,
          deps.platform
        )
      ) {
        return errorResponse(403);
      }
    } catch {
      return errorResponse(403);
    }

    // 4. Pergamum-owned / protected locations. `isProtectedPergamumDataFilePath`
    //    only inspects the trailing name, so it also has to be applied per
    //    path segment - otherwise `.pergamum/secret.png` or
    //    `.pergamum-wal/secret.png` would slip through (a `.pergamum*` dir is
    //    just as off-limits as a `.pergamum*` file). This mirrors the
    //    segment-wise protected checks in projectIpc.ts /
    //    fileExplorerDeleteCollect.ts / projectFileQuickOpen.ts.
    try {
      if (
        isProjectWriteLockDirectoryTarget(
          resolved,
          projectRootAbsolute,
          deps.platform
        ) ||
        isProtectedPergamumDataFilePath(resolved) ||
        parsed.segments.some((segment) =>
          isProtectedPergamumDataFilePath(segment)
        )
      ) {
        return errorResponse(403);
      }
    } catch {
      return errorResponse(403);
    }

    // 5. Supported extension.
    const extensionFormat = supportedImageAttachmentFormatForFileName(resolved);
    if (extensionFormat === null) {
      return errorResponse(415);
    }

    // 6. Realpath containment (symlink / junction escape).
    let projectRootReal: string;
    try {
      projectRootReal = await deps.fileSystem.realpath(projectRootAbsolute);
    } catch {
      return errorResponse(404);
    }

    let resolvedReal: string;
    try {
      resolvedReal = await deps.fileSystem.realpath(resolved);
    } catch {
      return errorResponse(404);
    }

    try {
      if (
        !isPathEqualOrInsideDirectory(
          resolvedReal,
          projectRootReal,
          deps.platform
        )
      ) {
        return errorResponse(403);
      }
    } catch {
      return errorResponse(403);
    }

    // 7. Regular file, under the size cap.
    let stats: { isFile(): boolean; isDirectory(): boolean; size: number };
    try {
      stats = await deps.fileSystem.stat(resolvedReal);
    } catch {
      return errorResponse(404);
    }
    if (stats.isDirectory() || !stats.isFile()) {
      return errorResponse(404);
    }
    if (stats.size > deps.maxBytes) {
      return errorResponse(413);
    }

    // 8. Magic bytes must confirm the supported format the extension claimed.
    let bytes: Uint8Array;
    try {
      bytes = await deps.fileSystem.readFile(resolvedReal);
    } catch {
      return errorResponse(404);
    }

    // Copy into a fresh, non-shared-backed buffer for the response body.
    const body = Uint8Array.from(bytes);

    const magic = resolveImageAttachmentFormat({
      bytes: body.subarray(0, IMAGE_ATTACHMENT_MAGIC_PREFIX_LENGTH),
      reportedMimeType: ""
    });
    if (!magic.ok || magic.format !== extensionFormat) {
      return errorResponse(415);
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": imageAttachmentMimeType(magic.format),
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
    fileSystem: deps.fileSystem ?? defaultFileSystem,
    platform:
      deps.platform ?? nodePlatformToAppPlatform(process.platform),
    maxBytes: deps.maxBytes ?? IMAGE_ATTACHMENT_MAX_BYTES
  };

  protocol.handle(PERGAMUM_ASSET_SCHEME, (request) =>
    handlePergamumAssetRequest(request, resolvedDeps)
  );
}

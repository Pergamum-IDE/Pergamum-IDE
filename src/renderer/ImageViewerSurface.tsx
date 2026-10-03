import { useMemo, useState, type CSSProperties } from "react";
import type { Translate } from "../shared/i18n";
import { buildPergamumAssetUrl } from "../shared/pergamumAssetUrl";

/**
 * Read-only viewer surface for a project image tab. It keeps the regular
 * Editor | Preview split so an image tab feels like any other tab:
 *
 *   - Editor side: a fixed, localized notice. It is NOT the image's content
 *     and not a document: there is no CodeMirror instance, no text buffer
 *     and nothing to edit, save, recover, search or lint.
 *   - Preview side: the image itself, loaded through the project-local
 *     `pergamum-asset://` protocol (the same path Markdown Preview uses).
 *     The main-process handler re-validates every request, so this surface
 *     never builds a `file://` URL and the Markdown renderer is not involved.
 */
export interface ImageViewerSurfaceProps {
  /** Project-root-relative path as shown by the File Explorer. */
  relativePath: string;
  name: string;
  translate: Translate;
  /** Editor : Preview split ratio (the shared Markdown workspace ratio). */
  ratio: number;
  /** Narrow windows stack the panes (same breakpoint as the Markdown workspace). */
  isNarrow: boolean;
}

function imageSourceUrl(relativePath: string): string | null {
  try {
    return buildPergamumAssetUrl(relativePath);
  } catch {
    // Not a canonical project-relative path: never fall back to anything
    // else — show the load-failure message instead.
    return null;
  }
}

export function ImageViewerSurface({
  relativePath,
  name,
  translate,
  ratio,
  isNarrow
}: ImageViewerSurfaceProps): JSX.Element {
  const sourceUrl = useMemo(() => imageSourceUrl(relativePath), [relativePath]);
  // Keyed by the URL the failure was reported for, so switching to another
  // image (or re-opening after a fix) starts from a clean state.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasLoadFailed = sourceUrl === null || failedUrl === sourceUrl;

  const workspaceStyle: CSSProperties | undefined = isNarrow
    ? undefined
    : { gridTemplateColumns: `minmax(0, ${ratio}fr) minmax(0, ${1 - ratio}fr)` };

  return (
    <section
      className="workspace imageViewerWorkspace"
      aria-label={translate("workspace.markdownWorkspace")}
      style={workspaceStyle}
    >
      <section
        className="pane"
        aria-label={translate("workspace.markdownEditor")}
      >
        <div className="paneHeader">{translate("workspace.editor")}</div>
        <div
          className="imageViewerEditorNotice"
          role="note"
          data-image-viewer-editor="read-only"
        >
          {translate("imageViewer.editorNotice")}
        </div>
      </section>

      <section
        className="pane"
        aria-label={translate("workspace.markdownPreview")}
      >
        <div className="paneHeader">{translate("workspace.preview")}</div>
        <div className="imageViewerPreview" data-image-viewer-preview="true">
          {hasLoadFailed ? (
            <p className="imageViewerLoadFailed" role="status">
              {translate("imageViewer.loadFailed")}
            </p>
          ) : (
            <img
              className="imageViewerImage"
              src={sourceUrl ?? undefined}
              alt={name}
              draggable={false}
              onError={() => setFailedUrl(sourceUrl)}
            />
          )}
        </div>
      </section>
    </section>
  );
}

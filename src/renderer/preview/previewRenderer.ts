import type { ProjectLocalImageResolutionContext } from "../../shared/projectLocalImageLink";

export interface PreviewRenderOptions {
  /**
   * #409 / #412: how project-local image links in the rendered content are
   * resolved to `pergamum-asset://` for display.
   *
   * - `{ kind: "none" }` (the default when omitted) — no rewrite; links
   *   render verbatim. Standalone `.md`, non-project documents.
   * - `{ kind: "sourceFile"; sourceMarkdownProjectRelativePath }` — a project
   *   Markdown *document* Preview; links resolve against that file's folder.
   * - `{ kind: "projectRoot" }` — a Glossary vocabulary Preview; links
   *   resolve against the project root.
   *
   * `null` is deliberately NOT accepted — it previously carried two
   * meanings ("no rewrite" and, implicitly, "root-relative"). The tagged
   * union makes the surface's intent explicit.
   */
  readonly projectLocalImageResolution?: ProjectLocalImageResolutionContext;
}

export interface PreviewRenderer {
  render: (content: string, options?: PreviewRenderOptions) => string;
}

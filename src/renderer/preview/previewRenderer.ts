export interface PreviewRenderOptions {
  /**
   * #409: project-root-relative path of the Markdown file being previewed
   * (e.g. `chapters/chapter01.md`). When provided, project-local image links
   * are rewritten to `pergamum-asset://` so the Preview can display them.
   * When `null` / omitted (a standalone `.md` file, or a non-project
   * document), image links are rendered verbatim - the pre-#409 behavior.
   */
  readonly sourceMarkdownProjectRelativePath?: string | null;
}

export interface PreviewRenderer {
  render: (content: string, options?: PreviewRenderOptions) => string;
}

import MarkdownIt from "markdown-it";
import type { PreviewRenderer } from "./previewRenderer";
import { resolveProjectLocalImageSrc } from "../../shared/projectLocalImageLink";

const markdown = new MarkdownIt({
  html: false,
  linkify: true
});

// #409: rewrite project-local image `src` to `pergamum-asset://` so the
// Preview can display images that live in the project (e.g. the ones #407's
// clipboard paste saves). Runs only when the caller supplies the previewed
// document's project-root-relative path via `env`; external URLs / data: /
// blob: links and non-project documents are untouched. The main-process
// protocol handler re-validates every request.
const renderImageToken =
  markdown.renderer.rules.image ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const sourcePath =
    env &&
    typeof (env as { sourceMarkdownProjectRelativePath?: unknown })
      .sourceMarkdownProjectRelativePath === "string"
      ? (env as { sourceMarkdownProjectRelativePath: string })
          .sourceMarkdownProjectRelativePath
      : null;

  if (sourcePath) {
    const token = tokens[idx];
    const srcIndex = token.attrIndex("src");
    if (srcIndex >= 0 && token.attrs) {
      // markdown-it has already run its link normalization on the `src`
      // (`\` -> `%5C`, spaces -> `%20`, ...). Decode it back so the resolver
      // sees the same shape the author wrote and its backslash / `..` /
      // control-character guards still fire.
      const rawSrc = String(token.attrs[srcIndex][1]);
      let authoredSrc = rawSrc;
      try {
        authoredSrc = decodeURI(rawSrc);
      } catch {
        // Malformed percent-encoding: fall back to the raw value; the shape
        // validator + the main-process handler still gate it.
      }
      const resolution = resolveProjectLocalImageSrc(authoredSrc, sourcePath);
      if (resolution.kind === "rewrite") {
        token.attrs[srcIndex][1] = resolution.url;
      } else if (resolution.kind === "blocked") {
        // Neutralize: an empty data URL never hits the network and is
        // CSP-clean (`data:` is already allowed by `img-src`).
        token.attrs[srcIndex][1] = "data:,";
      }
    }
  }

  return renderImageToken(tokens, idx, options, env, self);
};

export const markdownPreviewRenderer: PreviewRenderer = {
  render: (content, options) =>
    markdown.render(content, {
      sourceMarkdownProjectRelativePath:
        options?.sourceMarkdownProjectRelativePath ?? null
    })
};

import MarkdownIt from "markdown-it";
import type { PreviewRenderer } from "./previewRenderer";
import {
  resolveProjectLocalImageSrc,
  type ProjectLocalImageResolutionContext
} from "../../shared/projectLocalImageLink";

const markdown = new MarkdownIt({
  html: false,
  linkify: true
});

const NO_IMAGE_RESOLUTION: ProjectLocalImageResolutionContext = { kind: "none" };

/**
 * #409 / #412: rewrite project-local image `src` to `pergamum-asset://` so the
 * Preview can display images that live in the project (e.g. the ones #407's
 * clipboard paste saves). Both the Markdown document Preview and the Glossary
 * vocabulary Preview go through this one path — the only difference is the
 * `ProjectLocalImageResolutionContext` the caller passes via `env`
 * (`sourceFile` → resolve against the document's folder; `projectRoot` →
 * resolve against the project root; `none` → no rewrite). External URLs /
 * data: / blob: links are always untouched. The main-process protocol
 * handler re-validates every request.
 */
const renderImageToken =
  markdown.renderer.rules.image ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

function imageResolutionContextFromEnv(
  env: unknown
): ProjectLocalImageResolutionContext {
  const candidate = (
    env as { projectLocalImageResolution?: ProjectLocalImageResolutionContext }
  )?.projectLocalImageResolution;
  if (
    candidate &&
    (candidate.kind === "none" ||
      candidate.kind === "projectRoot" ||
      (candidate.kind === "sourceFile" &&
        typeof candidate.sourceMarkdownProjectRelativePath === "string"))
  ) {
    return candidate;
  }
  return NO_IMAGE_RESOLUTION;
}

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const context = imageResolutionContextFromEnv(env);

  if (context.kind !== "none") {
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
      const resolution = resolveProjectLocalImageSrc(authoredSrc, context);
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
      projectLocalImageResolution:
        options?.projectLocalImageResolution ?? NO_IMAGE_RESOLUTION
    })
};

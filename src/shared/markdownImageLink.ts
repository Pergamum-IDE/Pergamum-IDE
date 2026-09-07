/**
 * #407: build the `![](...)` link inserted after a clipboard image is saved
 * (Issue #407 §26 / §27 / §28).
 *
 *   - the destination is the path FROM the current Markdown file's directory
 *     TO the saved image (NOT project-root-relative),
 *   - separators are always `/`, on every OS,
 *   - a destination that is unsafe as a bare CommonMark link destination
 *     (contains a space, parenthesis, angle bracket or backslash) is wrapped
 *     in `<...>`; percent-encoding is deliberately not used so Japanese
 *     paths stay readable.
 *
 * Windows-filesystem-invalid characters (NUL, newline, `< > : " | ? *`, ...)
 * are rejected earlier by the save-destination path validation
 * ({@link ./attachedImageSaveDestination}); this module only decides between
 * a bare and an angle-wrapped destination.
 *
 * Pure string logic — no `node:path`, so `/` behavior is identical in the
 * renderer and the main process.
 */

function toPosixSegments(relativePath: string): string[] {
  return relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

/** Directory portion of a `/`-separated project-relative file path (`""` for a root-level file). */
export function projectRelativeDirname(relativeFilePath: string): string {
  const segments = toPosixSegments(relativeFilePath);
  return segments.slice(0, -1).join("/");
}

/**
 * The `/`-separated path from directory `fromDir` to file `toFile`, both
 * given as project-root-relative paths. Never returns an absolute path and
 * never uses `\`.
 *
 *   projectRelativeLinkPath("novel", "images/x.png")        -> "../images/x.png"
 *   projectRelativeLinkPath("", "images/x.png")             -> "images/x.png"
 *   projectRelativeLinkPath("a/b", "a/b/x.png")             -> "x.png"
 *   projectRelativeLinkPath("a/b/c", "a/x.png")             -> "../../x.png"
 */
export function projectRelativeLinkPath(
  fromDir: string,
  toFile: string
): string {
  const from = toPosixSegments(fromDir);
  const to = toPosixSegments(toFile);

  let common = 0;
  while (
    common < from.length &&
    common < to.length &&
    from[common] === to[common]
  ) {
    common += 1;
  }

  const upward = from.length - common;
  const downward = to.slice(common);
  const parts = [...Array<string>(upward).fill(".."), ...downward];

  // `to` is always a file, so `parts` is never empty for a real image path.
  return parts.join("/");
}

/**
 * True when `destination` cannot appear as a bare CommonMark link
 * destination and must be wrapped in `<...>`: it is empty, or it contains a
 * space / tab / newline, a parenthesis, an angle bracket, or a backslash.
 */
export function markdownDestinationNeedsAngleWrapping(
  destination: string
): boolean {
  return destination.length === 0 || /[\s()<>\\]/.test(destination);
}

/**
 * A softer signal than {@link markdownDestinationNeedsAngleWrapping}: true
 * when a configured save directory contains a space or a character some
 * Markdown toolchains handle poorly, so the save-destination dialog can show
 * an advisory notice (Issue #407 §28). `<...>`-wrapped output still renders
 * correctly in CommonMark.
 */
export function destinationHasMarkdownRiskyCharacters(
  destination: string
): boolean {
  return /[\s()<>[\]{}#?%]/.test(destination);
}

/**
 * Wrap a `/`-separated destination into a CommonMark image link with an
 * empty alt text (alt-text entry is out of scope, §36).
 */
export function buildMarkdownImageLink(destination: string): string {
  const posix = destination.replace(/\\/g, "/");
  return markdownDestinationNeedsAngleWrapping(posix)
    ? `![](<${posix}>)`
    : `![](${posix})`;
}

/**
 * Full pipeline: given the project-relative path of the Markdown file being
 * edited and the project-relative path of the just-saved image, produce the
 * `![](...)` text to insert.
 */
export function markdownImageLinkForAttachment(input: {
  readonly markdownRelativePath: string;
  readonly imageRelativePath: string;
}): string {
  const destination = projectRelativeLinkPath(
    projectRelativeDirname(input.markdownRelativePath),
    input.imageRelativePath
  );
  return buildMarkdownImageLink(destination);
}

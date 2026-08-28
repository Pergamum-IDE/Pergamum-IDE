/**
 * #274: extract the cold-start launch target (a `.pergamum` project or a
 * Markdown file) from `process.argv`.
 *
 * Scope: cold start only. Runtime `second-instance` / macOS `open-file`
 * forwarding to an already-running process is explicitly out of scope for
 * #274.
 */

import path from "node:path";
import { projectFileExtension } from "./projectDatabase";
import {
  startupPositionalArguments,
  type StartupProjectArgvOptions
} from "./startupProjectArgv";

const MARKDOWN_LAUNCH_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdown",
  ".mkd"
]);

export type ColdStartLaunchTarget =
  | { readonly kind: "pergamum"; readonly filePath: string }
  | { readonly kind: "markdown"; readonly filePath: string };

export function extractColdStartLaunchTarget(
  argv: readonly string[],
  options: StartupProjectArgvOptions
): ColdStartLaunchTarget | null {
  const positionalArguments = startupPositionalArguments(argv, options);

  if (positionalArguments.length !== 1) {
    return null;
  }

  const resolved = path.resolve(positionalArguments[0]);
  const extension = path.extname(resolved).toLowerCase();

  if (extension === projectFileExtension) {
    return { kind: "pergamum", filePath: resolved };
  }

  if (MARKDOWN_LAUNCH_EXTENSIONS.has(extension)) {
    return { kind: "markdown", filePath: resolved };
  }

  return null;
}

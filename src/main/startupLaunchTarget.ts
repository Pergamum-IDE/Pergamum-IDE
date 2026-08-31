/**
 * #274: extract the cold-start launch target (a `.pergamum` project or a
 * Markdown file) from `process.argv`.
 *
 * Scope: cold start only. Runtime `second-instance` / macOS `open-file`
 * forwarding to an already-running process is explicitly out of scope for
 * #274.
 *
 * #347: this step is now deliberately permissive for the Markdown side — any
 * single non-`.pergamum`, non-option positional argument becomes a
 * `kind: "markdown"` CANDIDATE. The real extension allowlist, filesystem
 * validation, and enclosing-project discovery all happen in
 * `startupMarkdownRouting.ts`; a Markdown found inside a project is promoted
 * here to a `kind: "pergamum"` target so the existing project-open lifecycle
 * (read-only confirmation for a locked project, cancel, fatal-failure) owns
 * the outcome. URL-like arguments are never treated as `.pergamum` targets
 * (LOCK-STARTUP-5).
 */

import path from "node:path";
import { projectFileExtension } from "./projectDatabase";
import {
  classifyStartupMarkdownTarget,
  defaultStartupMarkdownRoutingDeps,
  isUrlLikeStartupInput,
  type StartupMarkdownClassification,
  type StartupMarkdownRoutingDeps
} from "./startupMarkdownRouting";
import {
  startupPositionalArguments,
  type StartupProjectArgvOptions
} from "./startupProjectArgv";
import type { ColdStartLaunchTarget } from "../shared/sessionRestore";

export type { ColdStartLaunchTarget };

/**
 * The raw, pre-classification launch target. A `kind: "markdown"` result
 * here is only a candidate — `resolveColdStartLaunchTarget` runs the
 * lock-aware classifier and returns the routed target.
 */
export type RawColdStartLaunchTarget =
  | { readonly kind: "pergamum"; readonly filePath: string }
  | {
      readonly kind: "markdown";
      /** The untouched positional argument (URL-like inputs keep their
       *  original text so the classifier can reject them). */
      readonly rawInput: string;
    };

export function extractColdStartLaunchTarget(
  argv: readonly string[],
  options: StartupProjectArgvOptions
): RawColdStartLaunchTarget | null {
  const positionalArguments = startupPositionalArguments(argv, options);

  if (positionalArguments.length !== 1) {
    return null;
  }

  const rawInput = positionalArguments[0];

  if (isUrlLikeStartupInput(rawInput)) {
    return { kind: "markdown", rawInput };
  }

  const resolved = path.resolve(rawInput);
  const extension = path.extname(resolved).toLowerCase();

  if (extension === projectFileExtension) {
    return { kind: "pergamum", filePath: resolved };
  }

  return { kind: "markdown", rawInput };
}

/**
 * #347: map a classifier decision onto the cold-start launch target the
 * renderer consumes.
 *
 *   - `externalFile`     → `kind: "markdown"` + `markdownRoute externalFile`
 *   - `enclosingProject` → `kind: "pergamum"` (the discovered `.pergamum`)
 *                          + `openProjectMarkdownAfter` (the Markdown path)
 *   - `rejected`         → `kind: "markdown"` + `markdownRoute rejected`
 */
export function coldStartLaunchTargetFromClassification(
  classification: StartupMarkdownClassification
): ColdStartLaunchTarget {
  switch (classification.kind) {
    case "externalFile":
      return {
        kind: "markdown",
        filePath: classification.filePath,
        markdownRoute: { kind: "externalFile" }
      };
    case "enclosingProject":
      return {
        kind: "pergamum",
        filePath: classification.projectFilePath,
        openProjectMarkdownAfter: classification.filePath
      };
    case "rejected":
      return {
        kind: "markdown",
        filePath: classification.filePath,
        markdownRoute: { kind: "rejected", reason: classification.reason }
      };
  }
}

/**
 * Full cold-start launch-target resolution: extract from argv, then (for a
 * Markdown candidate) run the lock-aware classifier. A `.pergamum` target
 * passes straight through unchanged.
 */
export async function resolveColdStartLaunchTarget(
  argv: readonly string[],
  options: StartupProjectArgvOptions,
  deps: StartupMarkdownRoutingDeps = defaultStartupMarkdownRoutingDeps
): Promise<ColdStartLaunchTarget | null> {
  const raw = extractColdStartLaunchTarget(argv, options);

  if (raw === null) {
    return null;
  }

  if (raw.kind === "pergamum") {
    return { kind: "pergamum", filePath: raw.filePath };
  }

  const classification = await classifyStartupMarkdownTarget(
    raw.rawInput,
    deps
  );

  return coldStartLaunchTargetFromClassification(classification);
}

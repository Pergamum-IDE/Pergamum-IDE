import path from "node:path";
import { projectFileExtension } from "./projectDatabase";

export interface StartupProjectArgvOptions {
  readonly isPackaged: boolean;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isOptionArgument(value: string): boolean {
  return value.startsWith("-");
}

/**
 * #347 / LOCK-STARTUP-5: a startup file-open target MUST be a local
 * filesystem path, never a URL. `path.resolve("https://x/y.pergamum")`
 * happily produces a `*.pergamum`-suffixed local path, so without this guard
 * a URL-like argument would be accepted as a project / Markdown target.
 *
 * A single-letter drive prefix (`C:\`, `C:/`, bare `C:`), a UNC path
 * (`\\server\...`), and a POSIX-absolute path (`/abs/...`) are local paths,
 * not schemes.
 */
export function isUrlLikeStartupInput(rawInput: string): boolean {
  const trimmed = rawInput.trim();

  if (trimmed.length === 0) {
    return false;
  }

  // Windows drive path: `C:\...`, `C:/...`, or bare `C:`.
  if (/^[a-zA-Z]:([\\/]|$)/.test(trimmed)) {
    return false;
  }

  // Extended-length / UNC / POSIX-absolute prefixes are local paths.
  if (trimmed.startsWith("\\") || trimmed.startsWith("/")) {
    return false;
  }

  // `scheme://authority/...`
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return true;
  }

  // Bare scheme with a payload (`mailto:`, `about:`, custom protocols).
  // Requires at least two characters before the colon so a Windows drive
  // letter is never caught here.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(trimmed)) {
    return true;
  }

  return false;
}

function isPergamumProjectFilePath(value: string): boolean {
  if (isUrlLikeStartupInput(value)) {
    return false;
  }

  return (
    path.extname(path.resolve(value)).toLowerCase() === projectFileExtension
  );
}

function startupRuntimeArguments(
  argv: readonly string[],
  options: StartupProjectArgvOptions
): readonly string[] {
  const runtimeArguments = argv.slice(1);

  if (options.isPackaged || runtimeArguments.length === 0) {
    return runtimeArguments;
  }

  const [firstArgument, ...remainingArguments] = runtimeArguments;

  if (isPergamumProjectFilePath(firstArgument)) {
    return runtimeArguments;
  }

  return remainingArguments;
}

/**
 * The positional (non-option) runtime arguments Pergamum was launched with,
 * with the dev-mode script-path argument already dropped. Shared by
 * `extractStartupProjectFilePathFromArgv` and #274's cold-start launch
 * target extraction so both see the exact same argument set.
 */
export function startupPositionalArguments(
  argv: readonly string[],
  options: StartupProjectArgvOptions
): string[] {
  return startupRuntimeArguments(argv, options).filter(
    (argument) => hasText(argument) && !isOptionArgument(argument)
  );
}

export function extractStartupProjectFilePathFromArgv(
  argv: readonly string[],
  options: StartupProjectArgvOptions
): string | null {
  const positionalArguments = startupPositionalArguments(argv, options);

  if (positionalArguments.length !== 1) {
    return null;
  }

  const [candidatePath] = positionalArguments;

  if (!isPergamumProjectFilePath(candidatePath)) {
    return null;
  }

  return path.resolve(candidatePath);
}

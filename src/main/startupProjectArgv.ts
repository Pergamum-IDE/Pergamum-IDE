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

function isPergamumProjectFilePath(value: string): boolean {
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

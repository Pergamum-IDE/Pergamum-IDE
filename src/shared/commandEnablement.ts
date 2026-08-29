/**
 * Declarative command enablement policy (#128).
 *
 * `when` expresses command enablement as a small JSON-compatible AST rather
 * than an arbitrary predicate function, so the host can validate it at
 * registration time and evaluate it cheaply/safely on every Command Palette
 * keystroke or execution attempt, including for future plugin-owned commands.
 */

export type CommandContextKey =
  | "project.isOpen"
  | "project.access.readWrite"
  | "project.access.readOnly"
  | "editor.hasDocument"
  | "editor.isDirty"
  | "editor.kind.markdown"
  | "editor.kind.glossary"
  | "editor.document.projectOwned"
  | "activeEditor.saveBlockedByReadOnlyProjectRootForUi"
  | "glossary.occurrences.tracking.active"
  | "recovery.owner"
  | "recovery.hasRecoverableCandidates";

export const commandContextKeys: readonly CommandContextKey[] = [
  "project.isOpen",
  "project.access.readWrite",
  "project.access.readOnly",
  "editor.hasDocument",
  "editor.isDirty",
  "editor.kind.markdown",
  "editor.kind.glossary",
  "editor.document.projectOwned",
  "activeEditor.saveBlockedByReadOnlyProjectRootForUi",
  "glossary.occurrences.tracking.active",
  "recovery.owner",
  "recovery.hasRecoverableCandidates"
] as const;

export function isCommandContextKey(
  value: unknown
): value is CommandContextKey {
  return (
    typeof value === "string" &&
    (commandContextKeys as readonly string[]).includes(value)
  );
}

export interface CommandEnablementKeyExpression {
  readonly key: CommandContextKey;
}

export interface CommandEnablementNotExpression {
  readonly not: CommandEnablementExpression;
}

export interface CommandEnablementAllOfExpression {
  readonly allOf: readonly CommandEnablementExpression[];
}

export interface CommandEnablementAnyOfExpression {
  readonly anyOf: readonly CommandEnablementExpression[];
}

export type CommandEnablementExpression =
  | CommandEnablementKeyExpression
  | CommandEnablementNotExpression
  | CommandEnablementAllOfExpression
  | CommandEnablementAnyOfExpression;

export type CommandDisabledReason = "readOnlyProject";

export interface CommandEnablementResult {
  readonly enabled: boolean;
  readonly disabledReason: CommandDisabledReason | null;
}

/**
 * A copied, value-only snapshot of context key booleans. Known keys that are
 * absent evaluate as false (legitimate missing state); values outside this
 * set are not representable, so unknown-key failures can only come from
 * {@link validateCommandEnablementExpression} at registration time.
 */
export type CommandContext = Partial<Record<CommandContextKey, boolean>>;

export class InvalidCommandEnablementExpressionError extends Error {
  constructor(message: string) {
    super(`Invalid command enablement expression: ${message}`);
    this.name = "InvalidCommandEnablementExpressionError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural validation for registration time. Rejects unknown expression
 * shapes/operators, invalid or out-of-catalog keys, and empty `allOf`/`anyOf`
 * groups (mathematically valid as true/false respectively, but far more
 * likely to be an implementation mistake than an intentional edge case).
 */
export function validateCommandEnablementExpression(
  expression: CommandEnablementExpression
): void {
  if (!isPlainObject(expression)) {
    throw new InvalidCommandEnablementExpressionError(
      "expected an expression object"
    );
  }

  const shapeKeys = Object.keys(expression);

  if (shapeKeys.length !== 1) {
    throw new InvalidCommandEnablementExpressionError(
      "expected exactly one of key, not, allOf, or anyOf"
    );
  }

  const [shape] = shapeKeys;

  switch (shape) {
    case "key": {
      const value = (expression as CommandEnablementKeyExpression).key;

      if (!isCommandContextKey(value)) {
        throw new InvalidCommandEnablementExpressionError(
          `unknown context key: ${JSON.stringify(value)}`
        );
      }
      return;
    }
    case "not": {
      validateCommandEnablementExpression(
        (expression as CommandEnablementNotExpression).not
      );
      return;
    }
    case "allOf":
    case "anyOf": {
      const children = (expression as Record<string, unknown>)[shape];

      if (!Array.isArray(children) || children.length === 0) {
        throw new InvalidCommandEnablementExpressionError(
          `${shape} must be a non-empty array`
        );
      }

      for (const child of children) {
        validateCommandEnablementExpression(
          child as CommandEnablementExpression
        );
      }
      return;
    }
    default:
      throw new InvalidCommandEnablementExpressionError(
        `unknown operator: ${shape}`
      );
  }
}

function disabledReasonForFailedKey(
  key: CommandContextKey,
  context: CommandContext
): CommandDisabledReason | null {
  if (
    key === "project.access.readWrite" &&
    context["project.access.readOnly"] === true
  ) {
    return "readOnlyProject";
  }

  return null;
}

function disabledReasonForFailedNot(
  expression: CommandEnablementExpression,
  context: CommandContext
): CommandDisabledReason | null {
  if (
    "key" in expression &&
    expression.key === "activeEditor.saveBlockedByReadOnlyProjectRootForUi" &&
    context["activeEditor.saveBlockedByReadOnlyProjectRootForUi"] === true
  ) {
    return "readOnlyProject";
  }

  return null;
}

/**
 * Omitted `when` means enabled. A known key absent from `context` evaluates
 * as false (legitimate missing state, distinct from a registration bug).
 */
export function evaluateCommandEnablementResult(
  expression: CommandEnablementExpression | undefined,
  context: CommandContext
): CommandEnablementResult {
  if (!expression) {
    return { enabled: true, disabledReason: null };
  }

  if ("key" in expression) {
    const enabled = context[expression.key] === true;

    return {
      enabled,
      disabledReason: enabled
        ? null
        : disabledReasonForFailedKey(expression.key, context)
    };
  }

  if ("not" in expression) {
    const child = evaluateCommandEnablementResult(expression.not, context);

    return {
      enabled: !child.enabled,
      disabledReason: child.enabled
        ? disabledReasonForFailedNot(expression.not, context)
        : null
    };
  }

  if ("allOf" in expression) {
    for (const child of expression.allOf) {
      const result = evaluateCommandEnablementResult(child, context);

      if (!result.enabled) {
        return result;
      }
    }

    return { enabled: true, disabledReason: null };
  }

  let disabledReason: CommandDisabledReason | null = null;

  for (const child of expression.anyOf) {
    const result = evaluateCommandEnablementResult(child, context);

    if (result.enabled) {
      return { enabled: true, disabledReason: null };
    }

    disabledReason ??= result.disabledReason;
  }

  return { enabled: false, disabledReason };
}

export function evaluateCommandEnablement(
  expression: CommandEnablementExpression | undefined,
  context: CommandContext
): boolean {
  return evaluateCommandEnablementResult(expression, context).enabled;
}

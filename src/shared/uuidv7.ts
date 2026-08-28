import { v7 as uuidv7 } from "uuid";
import { validateUuidv7 } from "./glossary";

/**
 * A lowercase UUIDv7 string. Used wherever Pergamum needs a
 * time-ordered, collision-resistant identity it mints itself — glossary
 * entries, project ids, and (#272) Session / instance-run ids.
 */
export function createUuidv7(): string {
  return validateUuidv7(uuidv7().toLowerCase());
}

/**
 * Non-throwing UUIDv7 check. Reuses the single `validateUuidv7`
 * implementation (see src/shared/glossary.ts) rather than duplicating the
 * pattern.
 */
export function isUuidv7(value: unknown): value is string {
  try {
    validateUuidv7(value);
    return true;
  } catch {
    return false;
  }
}

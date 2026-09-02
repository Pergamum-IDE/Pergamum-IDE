/**
 * #375: `GlossaryAtom.matchFlags` is an integer bitmask stored as an integer
 * in the project DB (never a "1011"-style binary string). Callers must go
 * through the helpers below rather than testing raw bit literals
 * (`flags & 4`) at the call site.
 *
 * Bit layout:
 *   bit 0     AllowSingleCharacterMatch (boolean)
 *   bits 1-2  BoundaryStartPolicy       (2-bit {@link GlossaryBoundaryPolicy})
 *   bits 3-4  BoundaryEndPolicy         (2-bit {@link GlossaryBoundaryPolicy})
 *
 * `matchFlags = 0` is the intentional default: single-character matching off,
 * and BOTH boundary policies `None` (no boundary check at all).
 */

export const GlossaryAtomFlags = {
  /** bit 0: match this atom even when its value is a single code point. */
  AllowSingleCharacterMatch: 1 << 0
} as const;

export type GlossaryAtomFlag =
  (typeof GlossaryAtomFlags)[keyof typeof GlossaryAtomFlags];

/**
 * Per-edge boundary acceptance policy, stored 2 bits wide.
 *
 * - `None`     — accept the edge unconditionally (no boundary check).
 * - `Auto`     — the edge must sit on a character-class boundary.
 * - `Strict`   — reserved for a future stricter check; currently identical to
 *   `Auto`.
 * - `Reserved` — unused encoding; normalized to `Auto`-equivalent behaviour by
 *   {@link glossaryBoundaryPolicyChecksBoundary} (any non-`None` value checks).
 */
export const GlossaryBoundaryPolicy = {
  None: 0,
  Auto: 1,
  Strict: 2,
  Reserved: 3
} as const;

export type GlossaryBoundaryPolicyValue =
  (typeof GlossaryBoundaryPolicy)[keyof typeof GlossaryBoundaryPolicy];

const BOUNDARY_START_SHIFT = 1;
const BOUNDARY_END_SHIFT = 3;
/** 2-bit field mask, unshifted. */
const BOUNDARY_POLICY_FIELD = 0b11;

/** Every bit currently defined by this module, OR'd together (`0b11111`). */
export const GLOSSARY_ATOM_FLAGS_MASK: number =
  GlossaryAtomFlags.AllowSingleCharacterMatch |
  (BOUNDARY_POLICY_FIELD << BOUNDARY_START_SHIFT) |
  (BOUNDARY_POLICY_FIELD << BOUNDARY_END_SHIFT);

export function hasGlossaryAtomFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

export function setGlossaryAtomFlag(
  flags: number,
  flag: number,
  enabled: boolean
): number {
  return enabled ? flags | flag : flags & ~flag;
}

function coerceBoundaryPolicy(policy: number): GlossaryBoundaryPolicyValue {
  if (!Number.isInteger(policy) || policy < 0 || policy > BOUNDARY_POLICY_FIELD) {
    return GlossaryBoundaryPolicy.None;
  }

  return policy as GlossaryBoundaryPolicyValue;
}

function readBoundaryPolicy(
  flags: number,
  shift: number
): GlossaryBoundaryPolicyValue {
  return coerceBoundaryPolicy((flags >> shift) & BOUNDARY_POLICY_FIELD);
}

function writeBoundaryPolicy(
  flags: number,
  shift: number,
  policy: number
): number {
  const clamped = coerceBoundaryPolicy(policy);

  return (flags & ~(BOUNDARY_POLICY_FIELD << shift)) | (clamped << shift);
}

export function getGlossaryAtomBoundaryStartPolicy(
  flags: number
): GlossaryBoundaryPolicyValue {
  return readBoundaryPolicy(flags, BOUNDARY_START_SHIFT);
}

export function getGlossaryAtomBoundaryEndPolicy(
  flags: number
): GlossaryBoundaryPolicyValue {
  return readBoundaryPolicy(flags, BOUNDARY_END_SHIFT);
}

export function setGlossaryAtomBoundaryStartPolicy(
  flags: number,
  policy: number
): number {
  return writeBoundaryPolicy(flags, BOUNDARY_START_SHIFT, policy);
}

export function setGlossaryAtomBoundaryEndPolicy(
  flags: number,
  policy: number
): number {
  return writeBoundaryPolicy(flags, BOUNDARY_END_SHIFT, policy);
}

/**
 * Whether a boundary policy requires a concrete character-class boundary
 * check. `None` does not; every other value currently does (`Strict` /
 * `Reserved` behave like `Auto` for now).
 */
export function glossaryBoundaryPolicyChecksBoundary(
  policy: GlossaryBoundaryPolicyValue
): boolean {
  return policy !== GlossaryBoundaryPolicy.None;
}

/**
 * Coerce an arbitrary number to a valid `matchFlags` value: a non-negative
 * safe integer with every bit outside {@link GLOSSARY_ATOM_FLAGS_MASK}
 * dropped. NaN / negative / fractional / unsafe folds to `0`.
 */
export function normalizeGlossaryAtomMatchFlags(flags: number): number {
  if (!Number.isSafeInteger(flags) || flags < 0) {
    return 0;
  }

  return flags & GLOSSARY_ATOM_FLAGS_MASK;
}

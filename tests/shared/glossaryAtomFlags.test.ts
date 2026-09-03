import { describe, expect, it } from "vitest";
import {
  GLOSSARY_ATOM_FLAGS_MASK,
  GlossaryAtomFlags,
  GlossaryBoundaryPolicy,
  getGlossaryAtomBoundaryEndPolicy,
  getGlossaryAtomBoundaryStartPolicy,
  glossaryBoundaryPolicyChecksBoundary,
  hasGlossaryAtomFlag,
  normalizeGlossaryAtomMatchFlags,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy,
  setGlossaryAtomFlag
} from "../../src/shared/glossaryAtomFlags";

describe("GlossaryAtomFlags (#375)", () => {
  it("defines the 2-bit boundary bit layout", () => {
    expect(GlossaryAtomFlags.AllowSingleCharacterMatch).toBe(1);
    // bits 1-2 = start policy, bits 3-4 = end policy.
    expect(GLOSSARY_ATOM_FLAGS_MASK).toBe(0b11111);
    expect(GlossaryBoundaryPolicy).toEqual({
      None: 0,
      Auto: 1,
      Strict: 2,
      Reserved: 3
    });
  });

  it("treats matchFlags = 0 as the intentional all-off default", () => {
    expect(
      hasGlossaryAtomFlag(0, GlossaryAtomFlags.AllowSingleCharacterMatch)
    ).toBe(false);
    expect(getGlossaryAtomBoundaryStartPolicy(0)).toBe(
      GlossaryBoundaryPolicy.None
    );
    expect(getGlossaryAtomBoundaryEndPolicy(0)).toBe(
      GlossaryBoundaryPolicy.None
    );
  });

  it("encodes and decodes the start and end boundary policies independently", () => {
    let flags = 0;

    flags = setGlossaryAtomBoundaryStartPolicy(
      flags,
      GlossaryBoundaryPolicy.Strict
    );
    expect(getGlossaryAtomBoundaryStartPolicy(flags)).toBe(
      GlossaryBoundaryPolicy.Strict
    );
    // Writing the start policy leaves the end policy untouched.
    expect(getGlossaryAtomBoundaryEndPolicy(flags)).toBe(
      GlossaryBoundaryPolicy.None
    );

    flags = setGlossaryAtomBoundaryEndPolicy(
      flags,
      GlossaryBoundaryPolicy.Auto
    );
    expect(getGlossaryAtomBoundaryEndPolicy(flags)).toBe(
      GlossaryBoundaryPolicy.Auto
    );
    expect(getGlossaryAtomBoundaryStartPolicy(flags)).toBe(
      GlossaryBoundaryPolicy.Strict
    );

    // The single-character bit sits below both policy fields and survives.
    flags = setGlossaryAtomFlag(
      flags,
      GlossaryAtomFlags.AllowSingleCharacterMatch,
      true
    );
    expect(
      hasGlossaryAtomFlag(flags, GlossaryAtomFlags.AllowSingleCharacterMatch)
    ).toBe(true);
    expect(getGlossaryAtomBoundaryStartPolicy(flags)).toBe(
      GlossaryBoundaryPolicy.Strict
    );
    expect(getGlossaryAtomBoundaryEndPolicy(flags)).toBe(
      GlossaryBoundaryPolicy.Auto
    );
  });

  it("lowers a boundary policy back to None", () => {
    const flags = setGlossaryAtomBoundaryStartPolicy(
      setGlossaryAtomBoundaryEndPolicy(0, GlossaryBoundaryPolicy.Auto),
      GlossaryBoundaryPolicy.Auto
    );

    const cleared = setGlossaryAtomBoundaryStartPolicy(
      flags,
      GlossaryBoundaryPolicy.None
    );
    expect(getGlossaryAtomBoundaryStartPolicy(cleared)).toBe(
      GlossaryBoundaryPolicy.None
    );
    expect(getGlossaryAtomBoundaryEndPolicy(cleared)).toBe(
      GlossaryBoundaryPolicy.Auto
    );
  });

  it("only None skips the concrete boundary check", () => {
    expect(
      glossaryBoundaryPolicyChecksBoundary(GlossaryBoundaryPolicy.None)
    ).toBe(false);
    expect(
      glossaryBoundaryPolicyChecksBoundary(GlossaryBoundaryPolicy.Auto)
    ).toBe(true);
    expect(
      glossaryBoundaryPolicyChecksBoundary(GlossaryBoundaryPolicy.Strict)
    ).toBe(true);
    expect(
      glossaryBoundaryPolicyChecksBoundary(GlossaryBoundaryPolicy.Reserved)
    ).toBe(true);
  });

  it("hasGlossaryAtomFlag / setGlossaryAtomFlag operate on bit 0 only", () => {
    const flags = setGlossaryAtomFlag(
      0,
      GlossaryAtomFlags.AllowSingleCharacterMatch,
      true
    );
    expect(flags).toBe(1);
    expect(
      setGlossaryAtomFlag(
        flags,
        GlossaryAtomFlags.AllowSingleCharacterMatch,
        false
      )
    ).toBe(0);
  });

  it("normalizeGlossaryAtomMatchFlags folds invalid input to 0 and drops unused bits", () => {
    expect(normalizeGlossaryAtomMatchFlags(0)).toBe(0);
    expect(normalizeGlossaryAtomMatchFlags(0b11111)).toBe(0b11111);
    // bit 5 and above are outside the known layout and are dropped.
    expect(normalizeGlossaryAtomMatchFlags(0b111111)).toBe(0b11111);
    expect(normalizeGlossaryAtomMatchFlags(1 << 20)).toBe(0);
    expect(normalizeGlossaryAtomMatchFlags(-1)).toBe(0);
    expect(normalizeGlossaryAtomMatchFlags(1.5)).toBe(0);
    expect(normalizeGlossaryAtomMatchFlags(Number.NaN)).toBe(0);
    expect(
      normalizeGlossaryAtomMatchFlags(Number.MAX_SAFE_INTEGER + 2)
    ).toBe(0);
  });
});

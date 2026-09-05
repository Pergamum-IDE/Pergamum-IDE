import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #400: the primary-tag flag/shadow presentation must live in one shared
 * place (`GlossaryTagChip`) and never be reimplemented per screen. Verified
 * here the same way as other App-wiring specs in this repo (e.g.
 * `documentTabActionWiring.test.ts`): by asserting the source text itself,
 * since the actual visual behavior is already covered by
 * `GlossaryTagChip.test.tsx`, `GlossaryEntryManager.test.tsx`,
 * `GlossaryEntryTagAssignmentEditor.test.tsx` and `glossaryEditor.test.tsx`.
 */
const chipSource = readFileSync("src/renderer/GlossaryTagChip.tsx", "utf8");
const managerSource = readFileSync(
  "src/renderer/GlossaryEntryManager.tsx",
  "utf8"
);
const editorSource = readFileSync(
  "src/renderer/GlossaryEntryTagAssignmentEditor.tsx",
  "utf8"
);

describe("#400: primary tag flag/shadow presentation is shared via GlossaryTagChip, not duplicated per screen", () => {
  it("GlossaryTagChip is the only place that imports the flag asset and renders the flag/shadow markup", () => {
    expect(chipSource).toContain(
      'import flagIcon from "../../assets/icons/feather/tag/flag.svg?raw"'
    );
    expect(chipSource).toContain("glossaryTagChipFlag");
    expect(chipSource).toContain('data-primary={isPrimary || undefined}');

    expect(managerSource).not.toMatch(/flag\.svg/);
    expect(editorSource).not.toMatch(/flag\.svg/);
    expect(managerSource).not.toContain("glossaryTagChipFlag");
    expect(editorSource).not.toContain("glossaryTagChipFlag");
  });

  it("Glossary Entry Manager and the Entry Editor's tag assignment list both delegate to GlossaryTagChip's isPrimary prop instead of a per-screen flag/badge branch", () => {
    expect(managerSource).toContain("isPrimary={tagIndex === 0}");
    expect(editorSource).toContain("isPrimary={index === 0}");

    // The old per-screen "Primary Tag" text badges are gone from both.
    expect(managerSource).not.toContain("glossaryEntryManagerPrimaryBadge");
    expect(editorSource).not.toContain("glossaryEntryTagAssignmentPrimaryBadge");
  });
});

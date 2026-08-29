import { describe, expect, it } from "vitest";
import {
  evaluateCommandEnablement,
  type CommandContext
} from "../../src/shared/commandEnablement";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import type { Translate } from "../../src/shared/i18n";
import {
  recoveryCommandIds,
  registerRecoveryCommands,
  showRecoveryDocumentsCommandWhen
} from "../../src/renderer/recovery/recoveryCommands";

const translate: Translate = (key) => key;

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    "recovery.owner": false,
    "recovery.hasRecoverableCandidates": false,
    ...overrides
  };
}

describe("recovery command enablement (#288 follow-up)", () => {
  it("registers exactly the show-documents command", () => {
    const registry = new CommandRegistry();
    registerRecoveryCommands(
      registry,
      { showRecoveryDocuments: () => undefined },
      {
        showRecoveryDocuments: "Recover Unsaved Changes...",
        showRecoveryDocumentsDescription: "…"
      }
    );
    expect(registry.list().map((command) => command.id)).toEqual([
      recoveryCommandIds.showDocuments
    ]);
    expect(registry.list()[0].when).toBe(showRecoveryDocumentsCommandWhen);
  });

  it("is disabled for a Recovery owner with no previous-run candidates", () => {
    expect(
      evaluateCommandEnablement(
        showRecoveryDocumentsCommandWhen,
        context({ "recovery.owner": true })
      )
    ).toBe(false);
  });

  it("is disabled for a Recovery owner whose only rows are current-run backups", () => {
    // `recovery.hasRecoverableCandidates` is derived main-side from
    // previous-run rows only, so a run that has merely persisted its own
    // live dirty document still resolves it to false.
    expect(
      evaluateCommandEnablement(
        showRecoveryDocumentsCommandWhen,
        context({
          "recovery.owner": true,
          "recovery.hasRecoverableCandidates": false
        })
      )
    ).toBe(false);
  });

  it("is enabled only for a Recovery owner WITH a previous-run candidate", () => {
    expect(
      evaluateCommandEnablement(
        showRecoveryDocumentsCommandWhen,
        context({
          "recovery.owner": true,
          "recovery.hasRecoverableCandidates": true
        })
      )
    ).toBe(true);
  });

  it("is disabled for a non-owner / unavailable instance regardless of candidates", () => {
    expect(
      evaluateCommandEnablement(
        showRecoveryDocumentsCommandWhen,
        context({
          "recovery.owner": false,
          "recovery.hasRecoverableCandidates": true
        })
      )
    ).toBe(false);
  });
});

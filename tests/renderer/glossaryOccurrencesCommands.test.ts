import { describe, expect, it } from "vitest";
import {
  CommandDisabledError,
  CommandRegistry
} from "../../src/shared/commandRegistry";
import type { Translate } from "../../src/shared/i18n";
import {
  createGlossaryOccurrencesCommandTitles,
  glossaryOccurrenceTrackingCommandWhen,
  glossaryOccurrencesCommandIds,
  registerGlossaryOccurrencesCommands
} from "../../src/renderer/glossaryOccurrencesCommands";

const translate: Translate = (key) => key;
const executionOptions = { source: "utilityWindow" } as const;

describe("glossary occurrences commands", () => {
  const titles = {
    previous: "Previous occurrence",
    previousDescription: "Not implemented.",
    next: "Next occurrence",
    nextDescription: "Not implemented.",
    openEntry: "Open entry",
    openEntryDescription: "Not implemented.",
    closeTracking: "Close tracking",
    closeTrackingDescription: "Not implemented."
  };

  it("registers previous, next, openEntry, and closeTracking commands", () => {
    const registry = new CommandRegistry();

    registerGlossaryOccurrencesCommands(
      registry,
      {
        navigateToPreviousOccurrence: () => false,
        navigateToNextOccurrence: () => false,
        openTrackedGlossaryEntry: () => false,
        closeGlossaryOccurrenceTracking: () => false
      },
      titles
    );

    expect(registry.list().map((command) => command.id)).toEqual([
      "glossary.occurrences.previous",
      "glossary.occurrences.next",
      "glossary.occurrences.entry.open",
      "glossary.occurrences.tracking.close"
    ]);
  });

  it("routes each command to its controller method", async () => {
    const registry = new CommandRegistry();
    const calls: string[] = [];

    registerGlossaryOccurrencesCommands(
      registry,
      {
        navigateToPreviousOccurrence: () => {
          calls.push("previous");
          return true;
        },
        navigateToNextOccurrence: () => {
          calls.push("next");
          return true;
        },
        openTrackedGlossaryEntry: () => {
          calls.push("openEntry");
          return true;
        },
        closeGlossaryOccurrenceTracking: () => {
          calls.push("closeTracking");
          return true;
        }
      },
      titles
    );
    registry.setCommandContextProvider(() => ({
      "glossary.occurrences.tracking.active": true
    }));

    await registry.execute(
      glossaryOccurrencesCommandIds.previous,
      executionOptions
    );
    await registry.execute(glossaryOccurrencesCommandIds.next, executionOptions);
    await registry.execute(
      glossaryOccurrencesCommandIds.openEntry,
      executionOptions
    );
    await registry.execute(
      glossaryOccurrencesCommandIds.closeTracking,
      executionOptions
    );

    expect(calls).toEqual(["previous", "next", "openEntry", "closeTracking"]);
  });

  it("returns false as a no-op instead of throwing when the controller reports no active session", async () => {
    const registry = new CommandRegistry();

    registerGlossaryOccurrencesCommands(
      registry,
      {
        navigateToPreviousOccurrence: () => false,
        navigateToNextOccurrence: () => false,
        openTrackedGlossaryEntry: () => false,
        closeGlossaryOccurrenceTracking: () => false
      },
      titles
    );
    // Registry-level `when` (#128) gates on live tracking state; this test
    // exercises the controller's own graceful no-op handling, so keep the
    // live context permissive and let the controller report the no-op.
    registry.setCommandContextProvider(() => ({
      "glossary.occurrences.tracking.active": true
    }));

    await expect(
      registry.execute(glossaryOccurrencesCommandIds.previous, executionOptions)
    ).resolves.toBe(false);
    await expect(
      registry.execute(glossaryOccurrencesCommandIds.next, executionOptions)
    ).resolves.toBe(false);
    await expect(
      registry.execute(glossaryOccurrencesCommandIds.openEntry, executionOptions)
    ).resolves.toBe(false);
    await expect(
      registry.execute(
        glossaryOccurrencesCommandIds.closeTracking,
        executionOptions
      )
    ).resolves.toBe(false);
  });

  it("declares previous/next/tracking.close's when as tracking.active, but leaves openEntry ungated (#128 initial scope)", () => {
    expect(glossaryOccurrenceTrackingCommandWhen).toEqual({
      key: "glossary.occurrences.tracking.active"
    });
  });

  it("blocks previous/next/closeTracking execution via the registry when tracking is inactive", async () => {
    const registry = new CommandRegistry();
    const calls: string[] = [];

    registerGlossaryOccurrencesCommands(
      registry,
      {
        navigateToPreviousOccurrence: () => {
          calls.push("previous");
          return true;
        },
        navigateToNextOccurrence: () => {
          calls.push("next");
          return true;
        },
        openTrackedGlossaryEntry: () => {
          calls.push("openEntry");
          return true;
        },
        closeGlossaryOccurrenceTracking: () => {
          calls.push("closeTracking");
          return true;
        }
      },
      titles
    );
    registry.setCommandContextProvider(() => ({
      "glossary.occurrences.tracking.active": false
    }));

    await expect(
      registry.execute(glossaryOccurrencesCommandIds.previous, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    await expect(
      registry.execute(glossaryOccurrencesCommandIds.next, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    await expect(
      registry.execute(
        glossaryOccurrencesCommandIds.closeTracking,
        executionOptions
      )
    ).rejects.toBeInstanceOf(CommandDisabledError);

    // openEntry has no `when` in this issue's initial scope, so it still runs.
    await registry.execute(
      glossaryOccurrencesCommandIds.openEntry,
      executionOptions
    );

    expect(calls).toEqual(["openEntry"]);
  });

  it("derives command titles through translate", () => {
    expect(createGlossaryOccurrencesCommandTitles(translate)).toEqual({
      previous: "command.glossary.occurrences.previous",
      previousDescription:
        "command.glossary.occurrences.previous.description",
      next: "command.glossary.occurrences.next",
      nextDescription: "command.glossary.occurrences.next.description",
      openEntry: "command.glossary.occurrences.entry.open",
      openEntryDescription:
        "command.glossary.occurrences.entry.open.description",
      closeTracking: "command.glossary.occurrences.tracking.close",
      closeTrackingDescription:
        "command.glossary.occurrences.tracking.close.description"
    });
  });
});

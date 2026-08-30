import {
  CommandRegistry,
  defineCommandId,
  type Command
} from "./commandRegistry";

const openGlossaryEntryCommandId = defineCommandId<
  readonly [entryId: string],
  string
>("glossary.entry.open");
const toggleFilesCommandId = defineCommandId("workspace.files.toggle");

const registry = new CommandRegistry();
const executionOptions = { source: "commandPalette" } as const;

const openGlossaryEntryCommand: Command<
  readonly [entryId: string],
  string
> = {
  id: openGlossaryEntryCommandId,
  title: "Open glossary entry",
  execute: (entryId) => entryId,
  isEnabled: (entryId) => entryId.length > 0
};

registry.register(openGlossaryEntryCommand);
registry.register({
  id: toggleFilesCommandId,
  title: "Focus files",
  execute: () => undefined
});

void registry.execute(openGlossaryEntryCommandId, executionOptions, "entry-1");
void registry.isEnabled(openGlossaryEntryCommandId, "entry-1");
void registry.execute(toggleFilesCommandId, executionOptions);

// @ts-expect-error Command execution options are required.
void registry.execute(toggleFilesCommandId);

// @ts-expect-error Command arguments are required by each CommandId.
void registry.execute(openGlossaryEntryCommandId, executionOptions);

// @ts-expect-error Command argument types are checked by each CommandId.
void registry.execute(openGlossaryEntryCommandId, executionOptions, 1);

// @ts-expect-error Enablement arguments share the CommandId argument type.
void registry.isEnabled(openGlossaryEntryCommandId, 1);

// @ts-expect-error No-argument commands cannot receive arguments.
void registry.execute(toggleFilesCommandId, executionOptions, "entry-1");

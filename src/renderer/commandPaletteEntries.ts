import type {
  CommandContext,
  CommandDisabledReason
} from "../shared/commandEnablement";
import type { CommandId, CommandRegistry } from "../shared/commandRegistry";
import type { Translate, TranslationKey } from "../shared/i18n";

export type CommandPaletteMatchField =
  | "title"
  | "description"
  | "canonicalLabel"
  | "commandId";

export interface CommandPaletteMatchRange {
  readonly start: number;
  readonly end: number;
}

export interface CommandPaletteFieldMatch {
  readonly field: CommandPaletteMatchField;
  readonly ranges: readonly CommandPaletteMatchRange[];
}

export interface CommandPaletteDisplayLine {
  readonly field: CommandPaletteMatchField;
  readonly text: string;
  readonly ranges: readonly CommandPaletteMatchRange[];
}

export interface CommandPaletteEntry {
  readonly id: CommandId<readonly unknown[], unknown>;
  readonly title: string;
  readonly description?: string;
  readonly canonicalLabel?: string;
  readonly enabled: boolean;
  readonly disabledReason?: CommandDisabledReason | null;
}

export interface CommandPaletteFilteredEntry extends CommandPaletteEntry {
  readonly matches: readonly CommandPaletteFieldMatch[];
  readonly primary: CommandPaletteDisplayLine;
  readonly secondary: CommandPaletteDisplayLine;
}

interface NormalizedSearchText {
  readonly text: string;
  readonly offsets: readonly CommandPaletteMatchRange[];
}

const searchableCommandPaletteFields = [
  "title",
  "description",
  "canonicalLabel",
  "commandId"
] as const satisfies readonly CommandPaletteMatchField[];

/**
 * Palette visibility is opt-out: a command is listed unless its definition
 * sets `palette.visible = false`. Commands that require arguments must set
 * this explicitly at the definition site, since arity information is erased
 * once commands are type-erased into the registry.
 *
 * `context` is the eager, copied value snapshot taken when the Palette
 * opened. It governs `when`-based enablement display only; legacy
 * `Command.isEnabled` is still evaluated live (unchanged pre-#128 behavior).
 */
export function listCommandPaletteEntries(
  registry: CommandRegistry,
  context: CommandContext = {}
): CommandPaletteEntry[] {
  return registry
    .list()
    .filter((command) => command.palette?.visible !== false)
    .map((command) => {
      const enablement = registry.enablementForContext(command.id, context);

      return {
        id: command.id,
        title: command.title,
        description: command.description,
        canonicalLabel: command.canonicalLabel,
        enabled: enablement.enabled,
        disabledReason: enablement.disabledReason
      };
    });
}

function commandPaletteFieldText(
  entry: CommandPaletteEntry,
  field: CommandPaletteMatchField
): string | null {
  switch (field) {
    case "title":
      return entry.title;
    case "description":
      return entry.description ?? null;
    case "canonicalLabel":
      return entry.canonicalLabel ?? null;
    case "commandId":
      return String(entry.id);
  }
}

function normalizeCommandPaletteSearchText(
  text: string
): NormalizedSearchText {
  let normalized = "";
  const offsets: CommandPaletteMatchRange[] = [];

  for (let index = 0; index < text.length; ) {
    const codePoint = text.codePointAt(index);

    if (codePoint === undefined) {
      break;
    }

    const original = String.fromCodePoint(codePoint);
    const start = index;
    const end = start + original.length;
    const lowered = original.toLowerCase();

    normalized += lowered;

    for (let offset = 0; offset < lowered.length; offset += 1) {
      offsets.push({ start, end });
    }

    index = end;
  }

  return { text: normalized, offsets };
}

export function mergeCommandPaletteMatchRanges(
  ranges: readonly CommandPaletteMatchRange[]
): CommandPaletteMatchRange[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .slice()
    .sort((left, right) =>
      left.start === right.start ? left.end - right.end : left.start - right.start
    );
  const merged: CommandPaletteMatchRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];

    if (last && range.start <= last.end) {
      merged[merged.length - 1] = {
        start: last.start,
        end: Math.max(last.end, range.end)
      };
      continue;
    }

    merged.push(range);
  }

  return merged;
}

function findCommandPaletteFieldMatchRanges(
  text: string,
  needle: string
): CommandPaletteMatchRange[] {
  if (needle.length === 0) {
    return [];
  }

  const normalized = normalizeCommandPaletteSearchText(text);
  const ranges: CommandPaletteMatchRange[] = [];

  for (
    let index = normalized.text.indexOf(needle);
    index !== -1;
    index = normalized.text.indexOf(needle, index + needle.length)
  ) {
    const start = normalized.offsets[index]?.start;
    const end = normalized.offsets[index + needle.length - 1]?.end;

    if (start !== undefined && end !== undefined) {
      ranges.push({ start, end });
    }
  }

  return mergeCommandPaletteMatchRanges(ranges);
}

function commandPaletteEntryMatches(
  entry: CommandPaletteEntry,
  needle: string
): CommandPaletteFieldMatch[] {
  return searchableCommandPaletteFields.flatMap((field) => {
    const text = commandPaletteFieldText(entry, field);

    if (text === null) {
      return [];
    }

    const ranges = findCommandPaletteFieldMatchRanges(text, needle);

    return ranges.length > 0 ? [{ field, ranges }] : [];
  });
}

function commandPaletteMatchRangesForField(
  matches: readonly CommandPaletteFieldMatch[],
  field: CommandPaletteMatchField
): readonly CommandPaletteMatchRange[] {
  return matches.find((match) => match.field === field)?.ranges ?? [];
}

function hasCommandPaletteFieldMatch(
  matches: readonly CommandPaletteFieldMatch[],
  field: CommandPaletteMatchField
): boolean {
  return commandPaletteMatchRangesForField(matches, field).length > 0;
}

function commandPaletteDisplayLine(
  entry: CommandPaletteEntry,
  matches: readonly CommandPaletteFieldMatch[],
  field: CommandPaletteMatchField
): CommandPaletteDisplayLine {
  return {
    field,
    text: commandPaletteFieldText(entry, field) ?? String(entry.id),
    ranges: commandPaletteMatchRangesForField(matches, field)
  };
}

function commandPalettePrimaryField(
  entry: CommandPaletteEntry
): CommandPaletteMatchField {
  if (entry.canonicalLabel) {
    return "canonicalLabel";
  }

  return entry.title ? "title" : "commandId";
}

function commandPaletteSecondaryField(
  entry: CommandPaletteEntry,
  matches: readonly CommandPaletteFieldMatch[],
  primaryField: CommandPaletteMatchField
): CommandPaletteMatchField {
  if (entry.description && hasCommandPaletteFieldMatch(matches, "description")) {
    return "description";
  }

  if (
    primaryField === "canonicalLabel" &&
    hasCommandPaletteFieldMatch(matches, "title")
  ) {
    return "title";
  }

  if (hasCommandPaletteFieldMatch(matches, "commandId")) {
    return "commandId";
  }

  return entry.description ? "description" : "commandId";
}

function commandPaletteFilteredEntry(
  entry: CommandPaletteEntry,
  matches: readonly CommandPaletteFieldMatch[]
): CommandPaletteFilteredEntry {
  const primaryField = commandPalettePrimaryField(entry);
  const secondaryField = commandPaletteSecondaryField(
    entry,
    matches,
    primaryField
  );

  return {
    ...entry,
    matches,
    primary: commandPaletteDisplayLine(entry, matches, primaryField),
    secondary: commandPaletteDisplayLine(entry, matches, secondaryField)
  };
}

export function filterCommandPaletteEntries(
  entries: readonly CommandPaletteEntry[],
  query: string
): CommandPaletteFilteredEntry[] {
  const needle = query.trim().toLowerCase();

  if (needle.length === 0) {
    return entries.map((entry) => commandPaletteFilteredEntry(entry, []));
  }

  return entries.flatMap((entry) => {
    const matches = commandPaletteEntryMatches(entry, needle);

    return matches.length > 0
      ? [commandPaletteFilteredEntry(entry, matches)]
      : [];
  });
}

/**
 * Selects the one/other i18n form for the Command Palette result count
 * footer. `one` applies only to an exact count of 1; `other` covers 0 and
 * every other count, matching standard one/other plural category usage
 * without pulling in a full pluralization framework or Intl.PluralRules.
 */
export function commandPaletteResultCountKey(count: number): TranslationKey {
  return count === 1
    ? "commandPalette.footer.results.one"
    : "commandPalette.footer.results.other";
}

export function formatCommandPaletteResultCount(
  translate: Translate,
  count: number
): string {
  return translate(commandPaletteResultCountKey(count), { count });
}

export function firstEnabledCommandPaletteIndex(
  entries: readonly Pick<CommandPaletteEntry, "enabled">[]
): number | null {
  const index = entries.findIndex((entry) => entry.enabled);

  return index === -1 ? null : index;
}

export function moveCommandPaletteSelection(
  entriesLength: number,
  currentIndex: number | null,
  delta: 1 | -1
): number | null {
  if (entriesLength === 0) {
    return null;
  }

  const base = currentIndex ?? (delta > 0 ? -1 : entriesLength);
  const next = base + delta;

  return Math.min(Math.max(next, 0), entriesLength - 1);
}

/**
 * Resolves which entry (if any) Enter would act on, regardless of its
 * enabled state — the caller decides whether that means executing the
 * command or reporting a UI-level block (#128).
 */
export function resolveCommandPaletteEnterSelection(
  entries: readonly CommandPaletteEntry[],
  selectedIndex: number | null
): CommandPaletteEntry | null {
  if (selectedIndex === null) {
    return null;
  }

  return entries[selectedIndex] ?? null;
}

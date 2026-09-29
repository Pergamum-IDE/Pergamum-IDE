export const COMMAND_PALETTE_CATEGORIES = [
  "file",
  "edit",
  "formatting",
  "navigation",
  "search",
  "view",
  "assist",
  "glossary",
  "recovery",
  "help"
] as const;

export type CommandCategory = (typeof COMMAND_PALETTE_CATEGORIES)[number];

export const COMMAND_CATEGORY_ORDER: Record<CommandCategory, number> = {
  file: 1,
  edit: 2,
  formatting: 3,
  navigation: 4,
  search: 5,
  view: 6,
  assist: 7,
  glossary: 8,
  recovery: 9,
  help: 10
};

export function resolveCommandCategoryOrder(
  category?: CommandCategory | null
): number {
  if (!category) {
    return Number.POSITIVE_INFINITY;
  }

  return COMMAND_CATEGORY_ORDER[category] ?? Number.POSITIVE_INFINITY;
}

export const CORE_COMMAND_DOMAINS = [
  "editor",
  "viewer",
  "workbench",
  "workspace",
  "glossary",
  "settings",
  "search",
  "import",
  "export",
  "app",
  // #252: read-only editor diagnostics/assistance (line-ending
  // distribution today; paragraph indentation, invisible characters, and
  // other document diagnostics are expected to join this domain later).
  "assist"
] as const;

export type CoreCommandDomain = (typeof CORE_COMMAND_DOMAINS)[number];

export const RESERVED_COMMAND_NAMESPACE_ROOTS = ["plugin"] as const;

export type ReservedCommandNamespaceRoot =
  (typeof RESERVED_COMMAND_NAMESPACE_ROOTS)[number];

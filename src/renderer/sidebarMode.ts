export type SidebarMode =
  | "files"
  | "search"
  | "glossary"
  | "documentMap"
  | "documentMetrics";

export const defaultSidebarMode: SidebarMode = "files";
export const sidebarModes: readonly SidebarMode[] = [
  "files",
  "search",
  "glossary",
  "documentMap",
  "documentMetrics"
];

export function selectSidebarMode(mode: SidebarMode): SidebarMode {
  return mode;
}

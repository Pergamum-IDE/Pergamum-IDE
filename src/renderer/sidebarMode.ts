export type SidebarMode =
  | "files"
  | "search"
  | "glossary"
  | "textMap"
  | "documentMetrics";

export const defaultSidebarMode: SidebarMode = "files";
export const sidebarModes: readonly SidebarMode[] = [
  "files",
  "search",
  "glossary",
  "textMap",
  "documentMetrics"
];

export function selectSidebarMode(mode: SidebarMode): SidebarMode {
  return mode;
}

export type SidebarMode = "files" | "search" | "glossary" | "textMap";

export const defaultSidebarMode: SidebarMode = "files";
export const sidebarModes: readonly SidebarMode[] = [
  "files",
  "search",
  "glossary",
  "textMap"
];

export function selectSidebarMode(mode: SidebarMode): SidebarMode {
  return mode;
}

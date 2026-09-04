export type SidebarMode =
  | "files"
  | "search"
  | "glossary"
  | "textMap"
  | "documentNavigation";

export const defaultSidebarMode: SidebarMode = "files";
export const sidebarModes: readonly SidebarMode[] = [
  "files",
  "search",
  "glossary",
  "textMap",
  "documentNavigation"
];

export function selectSidebarMode(mode: SidebarMode): SidebarMode {
  return mode;
}

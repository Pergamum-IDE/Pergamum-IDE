import type {
  GlossaryEntry,
  GlossaryEntryId,
  GlossaryTag
} from "../shared/glossary";
import {
  GLOSSARY_TAG_FILTER_ALL,
  type GlossaryTagFilter
} from "./glossaryNavigatorSearch";

export { representativeGlossarySurface } from "./glossaryPresentation";

export type GlossarySidebarStatus =
  | "noProject"
  | "loading"
  | "loaded"
  | "error";

export interface GlossarySidebarState {
  status: GlossarySidebarStatus;
  entries: GlossaryEntry[];
  tags: GlossaryTag[];
  selectedEntryId: GlossaryEntryId | null;
}

const emptyGlossary = {
  entries: [] as GlossaryEntry[],
  tags: [] as GlossaryTag[]
};

export function createNoProjectGlossarySidebarState(): GlossarySidebarState {
  return { status: "noProject", ...emptyGlossary, selectedEntryId: null };
}

export function createLoadingGlossarySidebarState(
  selectedEntryId: GlossaryEntryId | null
): GlossarySidebarState {
  return { status: "loading", ...emptyGlossary, selectedEntryId };
}

export function createLoadedGlossarySidebarState(
  entries: GlossaryEntry[],
  tags: GlossaryTag[],
  selectedEntryId: GlossaryEntryId | null
): GlossarySidebarState {
  return {
    status: "loaded",
    entries,
    tags,
    selectedEntryId: preserveGlossarySelection(entries, selectedEntryId)
  };
}

export function createErrorGlossarySidebarState(
  selectedEntryId: GlossaryEntryId | null
): GlossarySidebarState {
  return { status: "error", ...emptyGlossary, selectedEntryId };
}

export function preserveGlossarySelection(
  entries: GlossaryEntry[],
  selectedEntryId: GlossaryEntryId | null
): GlossaryEntryId | null {
  if (!selectedEntryId) {
    return null;
  }

  return entries.some((entry) => entry.id === selectedEntryId)
    ? selectedEntryId
    : null;
}

/**
 * Drop a `tag` filter whose tag no longer exists (falls back to `all`). The
 * `all` / `none` pseudo-filters always survive a reload.
 */
export function preserveGlossaryTagFilter(
  tags: readonly GlossaryTag[],
  filter: GlossaryTagFilter
): GlossaryTagFilter {
  if (filter.kind !== "tag") {
    return filter;
  }

  return tags.some((tag) => tag.id === filter.tagId)
    ? filter
    : GLOSSARY_TAG_FILTER_ALL;
}

export function shouldApplyGlossaryLoadResult(
  currentRequestId: number,
  requestId: number
): boolean {
  return currentRequestId === requestId;
}

export interface LoadedGlossary {
  entries: GlossaryEntry[];
  tags: GlossaryTag[];
}

export async function loadGlossary(): Promise<LoadedGlossary> {
  const [entries, tags] = await Promise.all([
    window.pergamum.glossary.list(),
    window.pergamum.glossary.listTags()
  ]);

  return { entries, tags };
}

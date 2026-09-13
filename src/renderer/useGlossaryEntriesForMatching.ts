import { useEffect, useMemo, useRef, useState } from "react";
import type { GlossaryEntry } from "../shared/glossary";
import {
  buildGlossarySurfaceIndex,
  type GlossarySurfaceIndex,
  type GlossarySurfaceMatchingOptions
} from "../shared/glossarySurfaceMatching";

export type GlossaryEntriesForMatchingStatus =
  | "noProject"
  | "loading"
  | "loaded"
  | "error";

interface GlossaryEntriesForMatchingState {
  status: GlossaryEntriesForMatchingStatus;
  projectRootPath: string | null;
  entries: readonly GlossaryEntry[];
}

export interface GlossaryEntriesForMatchingResult {
  status: GlossaryEntriesForMatchingStatus;
  entries: readonly GlossaryEntry[];
  surfaceIndex: GlossarySurfaceIndex;
}

const emptyGlossaryEntries: readonly GlossaryEntry[] = [];

function initialGlossaryEntriesForMatchingState(
  projectRootPath: string | null
): GlossaryEntriesForMatchingState {
  return {
    status: projectRootPath ? "loading" : "noProject",
    projectRootPath,
    entries: emptyGlossaryEntries
  };
}

export function useGlossaryEntriesForMatching(
  projectRootPath: string | null,
  refreshToken: number,
  options?: GlossarySurfaceMatchingOptions
): GlossaryEntriesForMatchingResult {
  const [state, setState] = useState<GlossaryEntriesForMatchingState>(() =>
    initialGlossaryEntriesForMatchingState(projectRootPath)
  );
  const loadRequestIdRef = useRef(0);
  const isCurrentProjectState = state.projectRootPath === projectRootPath;
  const entries = isCurrentProjectState
    ? state.entries
    : emptyGlossaryEntries;
  const status: GlossaryEntriesForMatchingStatus = isCurrentProjectState
    ? state.status
    : projectRootPath
      ? "loading"
      : "noProject";
  const normalizeUnicodeToNfc = options?.normalizeUnicodeToNfc ?? false;
  const surfaceIndex = useMemo(
    () => buildGlossarySurfaceIndex(entries, options),
    [entries, normalizeUnicodeToNfc]
  );

  useEffect(() => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (!projectRootPath) {
      setState({
        status: "noProject",
        projectRootPath: null,
        entries: emptyGlossaryEntries
      });
      return;
    }

    setState({
      status: "loading",
      projectRootPath,
      entries: emptyGlossaryEntries
    });

    let isActive = true;

    void window.pergamum.glossary
      .list()
      .then((entries) => {
        if (!isActive || loadRequestIdRef.current !== requestId) {
          return;
        }

        setState({
          status: "loaded",
          projectRootPath,
          entries
        });
      })
      .catch(() => {
        if (!isActive || loadRequestIdRef.current !== requestId) {
          return;
        }

        setState({
          status: "error",
          projectRootPath,
          entries: emptyGlossaryEntries
        });
      });

    return () => {
      isActive = false;
    };
  }, [projectRootPath, refreshToken]);

  return {
    status,
    entries,
    surfaceIndex
  };
}

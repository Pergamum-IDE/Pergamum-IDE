import { describe, expect, it } from "vitest";
import type { FileExplorerEntry } from "../../src/shared/api";
import {
  FILE_EXPLORER_MOVE_ROOT_DESTINATION,
  collectFileExplorerMoveDestinationFolders,
  isValidFileExplorerDropTarget,
  resolveFileExplorerDragSources,
  resolveFileExplorerDropDestination,
  resolveFileExplorerMoveDisabledReason,
  resolveFileExplorerMoveSources,
  resolveFileExplorerPasteDestination,
  resolveFileExplorerPasteDisabledReason
} from "../../src/renderer/fileExplorerMoveDestinations";

const file = (relativePath: string): FileExplorerEntry => ({
  kind: "file",
  name: relativePath.split("/").pop() ?? relativePath,
  relativePath
});
const folder = (relativePath: string): FileExplorerEntry => ({
  kind: "folder",
  name: relativePath.split("/").pop() ?? relativePath,
  relativePath
});

describe("collectFileExplorerMoveDestinationFolders (#327)", () => {
  it("lists the project root first, then every known folder sorted", () => {
    const entriesByDirectoryPath = {
      "": [folder("Drafts"), folder("Archive"), file("a.md")],
      Drafts: [folder("Drafts/Old"), file("Drafts/x.md")]
    };

    expect(
      collectFileExplorerMoveDestinationFolders(entriesByDirectoryPath)
    ).toEqual([
      FILE_EXPLORER_MOVE_ROOT_DESTINATION,
      "Archive",
      "Drafts",
      "Drafts/Old"
    ]);
  });

  it("returns just the project root when there are no folders", () => {
    expect(
      collectFileExplorerMoveDestinationFolders({ "": [file("a.md")] })
    ).toEqual([FILE_EXPLORER_MOVE_ROOT_DESTINATION]);
  });
});

describe("resolveFileExplorerMoveSources (#327)", () => {
  const entriesByDirectoryPath = {
    "": [folder("Drafts"), file("a.md"), file("b.md")],
    Drafts: [file("Drafts/x.md")]
  };

  it("collects selected files in path order and allows the move", () => {
    const result = resolveFileExplorerMoveSources(
      new Set(["b.md", "a.md"]),
      entriesByDirectoryPath
    );
    expect(result.relativePaths).toEqual(["a.md", "b.md"]);
    expect(result.hasFolder).toBe(false);
    expect(result.canMove).toBe(true);
  });

  it("blocks the move when a folder is selected", () => {
    const result = resolveFileExplorerMoveSources(
      new Set(["a.md", "Drafts"]),
      entriesByDirectoryPath
    );
    expect(result.relativePaths).toEqual(["a.md"]);
    expect(result.hasFolder).toBe(true);
    expect(result.canMove).toBe(false);
  });

  it("blocks the move for an empty selection", () => {
    expect(
      resolveFileExplorerMoveSources(new Set(), entriesByDirectoryPath).canMove
    ).toBe(false);
  });

  it("treats an unknown selected path conservatively as not movable", () => {
    const result = resolveFileExplorerMoveSources(
      new Set(["mystery.md"]),
      entriesByDirectoryPath
    );
    expect(result.relativePaths).toEqual([]);
    expect(result.hasFolder).toBe(true);
    expect(result.canMove).toBe(false);
  });
});

describe("resolveFileExplorerMoveDisabledReason (#327/#328)", () => {
  const eligible = {
    moveInFlight: false,
    hasProject: true,
    readOnly: false,
    hasFolder: false,
    fileCount: 2,
    hasOpenDocument: false
  };

  it("returns null when a files-only selection is fully eligible", () => {
    expect(resolveFileExplorerMoveDisabledReason(eligible)).toBeNull();
  });

  it("prefers the most-explanatory reason in priority order", () => {
    expect(
      resolveFileExplorerMoveDisabledReason({
        ...eligible,
        moveInFlight: true,
        hasProject: false
      })
    ).toBe("move-in-progress");
    expect(
      resolveFileExplorerMoveDisabledReason({ ...eligible, hasProject: false })
    ).toBe("no-project");
    expect(
      resolveFileExplorerMoveDisabledReason({ ...eligible, readOnly: true })
    ).toBe("read-only-project");
    expect(
      resolveFileExplorerMoveDisabledReason({ ...eligible, hasFolder: true })
    ).toBe("contains-folder");
    expect(
      resolveFileExplorerMoveDisabledReason({ ...eligible, fileCount: 0 })
    ).toBe("empty-selection");
    expect(
      resolveFileExplorerMoveDisabledReason({
        ...eligible,
        hasOpenDocument: true
      })
    ).toBe("contains-open-document");
  });
});

describe("resolveFileExplorerPasteDisabledReason (#328)", () => {
  const ready = {
    moveInFlight: false,
    hasProject: true,
    readOnly: false,
    cutSourceCount: 1,
    cutHasOpenDocument: false
  };

  it("returns null when a pending Cut can be pasted", () => {
    expect(resolveFileExplorerPasteDisabledReason(ready)).toBeNull();
  });

  it("reports no-cut-sources when nothing has been cut", () => {
    expect(
      resolveFileExplorerPasteDisabledReason({ ...ready, cutSourceCount: 0 })
    ).toBe("no-cut-sources");
  });

  it("reports an open document among the cut sources", () => {
    expect(
      resolveFileExplorerPasteDisabledReason({
        ...ready,
        cutHasOpenDocument: true
      })
    ).toBe("contains-open-document");
  });

  it("still gates on project / read-only / in-flight first", () => {
    expect(
      resolveFileExplorerPasteDisabledReason({ ...ready, moveInFlight: true })
    ).toBe("move-in-progress");
    expect(
      resolveFileExplorerPasteDisabledReason({ ...ready, hasProject: false })
    ).toBe("no-project");
    expect(
      resolveFileExplorerPasteDisabledReason({ ...ready, readOnly: true })
    ).toBe("read-only-project");
  });
});

describe("resolveFileExplorerPasteDestination (#328)", () => {
  const entriesByDirectoryPath = {
    "": [folder("Drafts"), file("a.md")],
    Drafts: [folder("Drafts/Old"), file("Drafts/x.md")]
  };

  it("uses the project root for a root selection", () => {
    expect(
      resolveFileExplorerPasteDestination({ kind: "root" }, entriesByDirectoryPath)
    ).toBe(FILE_EXPLORER_MOVE_ROOT_DESTINATION);
  });

  it("uses the project root when nothing is selected", () => {
    expect(
      resolveFileExplorerPasteDestination(null, entriesByDirectoryPath)
    ).toBe(FILE_EXPLORER_MOVE_ROOT_DESTINATION);
  });

  it("uses a selected folder's own path", () => {
    expect(
      resolveFileExplorerPasteDestination(
        { kind: "entry", relativePath: "Drafts/Old" },
        entriesByDirectoryPath
      )
    ).toBe("Drafts/Old");
  });

  it("uses the parent folder of a selected file", () => {
    expect(
      resolveFileExplorerPasteDestination(
        { kind: "entry", relativePath: "Drafts/x.md" },
        entriesByDirectoryPath
      )
    ).toBe("Drafts");
    expect(
      resolveFileExplorerPasteDestination(
        { kind: "entry", relativePath: "a.md" },
        entriesByDirectoryPath
      )
    ).toBe(FILE_EXPLORER_MOVE_ROOT_DESTINATION);
  });

  it("falls back to the parent path for an unknown selected entry", () => {
    expect(
      resolveFileExplorerPasteDestination(
        { kind: "entry", relativePath: "Drafts/ghost.md" },
        entriesByDirectoryPath
      )
    ).toBe("Drafts");
  });
});

describe("resolveFileExplorerDragSources (#329 spike)", () => {
  const entriesByDirectoryPath = {
    "": [folder("Drafts"), file("a.md"), file("b.md"), file("c.md")]
  };

  it("uses the whole multi-selection when dragging a selected file", () => {
    const result = resolveFileExplorerDragSources(
      { relativePath: "a.md", kind: "file", isSelected: true },
      new Set(["b.md", "a.md"]),
      entriesByDirectoryPath
    );
    expect(result.sourceRelativePaths).toEqual(["a.md", "b.md"]);
    expect(result.canDrag).toBe(true);
  });

  it("uses only the dragged file when it is not part of the selection", () => {
    const result = resolveFileExplorerDragSources(
      { relativePath: "c.md", kind: "file", isSelected: false },
      new Set(["a.md", "b.md"]),
      entriesByDirectoryPath
    );
    expect(result.sourceRelativePaths).toEqual(["c.md"]);
    expect(result.canDrag).toBe(true);
  });

  it("never starts a movable drag from a folder row", () => {
    const result = resolveFileExplorerDragSources(
      { relativePath: "Drafts", kind: "folder", isSelected: true },
      new Set(["Drafts"]),
      entriesByDirectoryPath
    );
    expect(result.canDrag).toBe(false);
    expect(result.sourceRelativePaths).toEqual([]);
  });

  it("is not draggable when the selection mixes in a folder", () => {
    const result = resolveFileExplorerDragSources(
      { relativePath: "a.md", kind: "file", isSelected: true },
      new Set(["a.md", "Drafts"]),
      entriesByDirectoryPath
    );
    expect(result.canDrag).toBe(false);
  });
});

describe("resolveFileExplorerDropDestination (#329 spike)", () => {
  it("maps the project root row to the empty destination", () => {
    expect(resolveFileExplorerDropDestination({ kind: "root" })).toBe(
      FILE_EXPLORER_MOVE_ROOT_DESTINATION
    );
  });

  it("maps a folder row to its own path", () => {
    expect(
      resolveFileExplorerDropDestination({
        kind: "entry",
        relativePath: "Drafts/Old",
        entryKind: "folder"
      })
    ).toBe("Drafts/Old");
  });

  it("rejects a file row and the empty area", () => {
    expect(
      resolveFileExplorerDropDestination({
        kind: "entry",
        relativePath: "a.md",
        entryKind: "file"
      })
    ).toBeNull();
    expect(resolveFileExplorerDropDestination({ kind: "none" })).toBeNull();
  });
});

describe("isValidFileExplorerDropTarget (#329 spike)", () => {
  it("accepts a real move into a different folder", () => {
    expect(
      isValidFileExplorerDropTarget({
        dragSourceRelativePaths: ["a.md", "b.md"],
        destinationFolderRelativePath: "Drafts"
      })
    ).toBe(true);
  });

  it("rejects a null destination and an empty source list", () => {
    expect(
      isValidFileExplorerDropTarget({
        dragSourceRelativePaths: ["a.md"],
        destinationFolderRelativePath: null
      })
    ).toBe(false);
    expect(
      isValidFileExplorerDropTarget({
        dragSourceRelativePaths: [],
        destinationFolderRelativePath: "Drafts"
      })
    ).toBe(false);
  });

  it("rejects a drop where every source is already in the destination", () => {
    expect(
      isValidFileExplorerDropTarget({
        dragSourceRelativePaths: ["Drafts/a.md", "Drafts/b.md"],
        destinationFolderRelativePath: "Drafts"
      })
    ).toBe(false);
    // Root-level files dropped back on the project root.
    expect(
      isValidFileExplorerDropTarget({
        dragSourceRelativePaths: ["a.md"],
        destinationFolderRelativePath: ""
      })
    ).toBe(false);
  });

  it("still accepts a mixed batch where at least one source moves", () => {
    expect(
      isValidFileExplorerDropTarget({
        dragSourceRelativePaths: ["Drafts/a.md", "b.md"],
        destinationFolderRelativePath: "Drafts"
      })
    ).toBe(true);
  });
});

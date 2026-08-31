import { describe, expect, it } from "vitest";
import type { FileExplorerEntry } from "../../src/shared/api";
import {
  FILE_EXPLORER_MOVE_ROOT_DESTINATION,
  collectFileExplorerMoveDestinationFolders,
  resolveFileExplorerMoveSources
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

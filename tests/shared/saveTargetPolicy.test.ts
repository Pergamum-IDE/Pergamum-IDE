import { describe, expect, it } from "vitest";
import {
  isPathEqualOrInsideDirectory,
  isProjectWriteLockDirectoryTarget,
  isProtectedPergamumDataFilePath,
  projectWriteLockDirectoryName,
  projectWriteLockDirectoryPathForProjectRoot,
  protectedPergamumFileSuffixes
} from "../../src/shared/saveTargetPolicy";

describe("save target policy (#223)", () => {
  it("matches protected Pergamum file suffixes case-insensitively", () => {
    expect(protectedPergamumFileSuffixes).toEqual([
      ".pergamum",
      ".pergamum-journal",
      ".pergamum-wal",
      ".pergamum-shm"
    ]);
    expect(isProtectedPergamumDataFilePath("C:\\Novel\\Project.PERGAMUM")).toBe(
      true
    );
    expect(isProtectedPergamumDataFilePath("/novel/project.pergamum-wal")).toBe(
      true
    );
    expect(isProtectedPergamumDataFilePath("/novel/chapter.md")).toBe(false);
  });

  it("uses segment-boundary containment instead of string prefix matching", () => {
    expect(
      isPathEqualOrInsideDirectory("/a/project/file.md", "/a/project", "linux")
    ).toBe(true);
    expect(
      isPathEqualOrInsideDirectory(
        "/a/project-backup/file.md",
        "/a/project",
        "linux"
      )
    ).toBe(false);
  });

  it("resolves dot segments before comparison", () => {
    expect(
      isPathEqualOrInsideDirectory(
        "/a/project/drafts/../file.md",
        "/a/project",
        "linux"
      )
    ).toBe(true);
  });

  it("uses Windows and macOS case-insensitive comparison", () => {
    expect(
      isPathEqualOrInsideDirectory(
        "C:\\Novel\\Chapter.md",
        "c:\\novel",
        "windows"
      )
    ).toBe(true);
    expect(
      isPathEqualOrInsideDirectory(
        "/Users/me/Novel/Chapter.md",
        "/users/me/novel",
        "macos"
      )
    ).toBe(true);
  });

  it("uses Linux case-sensitive comparison", () => {
    expect(
      isPathEqualOrInsideDirectory(
        "/home/me/Novel/chapter.md",
        "/home/me/novel",
        "linux"
      )
    ).toBe(false);
  });

  it("handles UNC and Windows namespace paths where feasible", () => {
    expect(
      isPathEqualOrInsideDirectory(
        "\\\\server\\share\\Novel\\chapter.md",
        "\\\\server\\share\\novel",
        "windows"
      )
    ).toBe(true);
    expect(
      isPathEqualOrInsideDirectory(
        "\\\\?\\C:\\Novel\\chapter.md",
        "C:\\Novel",
        "windows"
      )
    ).toBe(true);
  });

  it("normalizes Unicode only for comparison", () => {
    const nfcDirectory = "/a/cafe\u0301".normalize("NFC");
    const nfdTarget = "/a/cafe\u0301/chapter.md".normalize("NFD");

    expect(nfcDirectory).not.toBe(nfdTarget.slice(0, nfcDirectory.length));
    expect(isPathEqualOrInsideDirectory(nfdTarget, nfcDirectory, "macos")).toBe(
      true
    );
  });

  it("derives the project write lock directory from the project root", () => {
    expect(projectWriteLockDirectoryName).toBe(".pergamum.lock");
    expect(projectWriteLockDirectoryPathForProjectRoot("C:\\Novel")).toBe(
      "C:\\Novel\\.pergamum.lock"
    );
    expect(projectWriteLockDirectoryPathForProjectRoot("C:\\Novel\\")).toBe(
      "C:\\Novel\\.pergamum.lock"
    );
    expect(projectWriteLockDirectoryPathForProjectRoot("/home/me/Novel")).toBe(
      "/home/me/Novel/.pergamum.lock"
    );
    expect(projectWriteLockDirectoryPathForProjectRoot("/home/me/Novel/")).toBe(
      "/home/me/Novel/.pergamum.lock"
    );
  });

  it("matches the project write lock directory itself and paths under it", () => {
    const projectRootPath = "C:\\Novel\\ProjectUnderTest";
    const lockDirectoryPath =
      projectWriteLockDirectoryPathForProjectRoot(projectRootPath);

    expect(
      isProjectWriteLockDirectoryTarget(
        lockDirectoryPath,
        projectRootPath,
        "windows"
      )
    ).toBe(true);
    expect(
      isProjectWriteLockDirectoryTarget(
        `${lockDirectoryPath}\\anything.md`,
        projectRootPath,
        "windows"
      )
    ).toBe(true);
    expect(
      isProjectWriteLockDirectoryTarget(
        `${projectRootPath}\\.pergamum.lock-sibling\\anything.md`,
        projectRootPath,
        "windows"
      )
    ).toBe(false);
  });

  it("uses segment boundaries and dot-segment resolution for lock directory containment", () => {
    expect(
      isProjectWriteLockDirectoryTarget(
        "C:\\Novel\\drafts\\..\\.pergamum.lock\\state.md",
        "C:\\Novel",
        "windows"
      )
    ).toBe(true);
    expect(
      isProjectWriteLockDirectoryTarget(
        "C:\\Novel\\.pergamum.locked\\state.md",
        "C:\\Novel",
        "windows"
      )
    ).toBe(false);
  });

  it("uses platform-specific case and Unicode comparison for lock directory containment", () => {
    expect(
      isProjectWriteLockDirectoryTarget(
        "C:\\NOVEL\\.PERGAMUM.LOCK\\state.md",
        "c:\\novel",
        "windows"
      )
    ).toBe(true);
    expect(
      isProjectWriteLockDirectoryTarget(
        "/Users/me/NOVEL/.PERGAMUM.LOCK/state.md",
        "/users/me/novel",
        "macos"
      )
    ).toBe(true);
    expect(
      isProjectWriteLockDirectoryTarget(
        "/home/me/Novel/.PERGAMUM.LOCK/state.md",
        "/home/me/Novel",
        "linux"
      )
    ).toBe(false);

    const nfcRoot = "/a/cafe\u0301".normalize("NFC");
    const nfdTarget = "/a/cafe\u0301/.pergamum.lock/state.md".normalize("NFD");

    expect(isProjectWriteLockDirectoryTarget(nfdTarget, nfcRoot, "macos")).toBe(
      true
    );
  });
});

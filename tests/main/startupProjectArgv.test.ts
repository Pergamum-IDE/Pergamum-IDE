import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractStartupProjectFilePathFromArgv } from "../../src/main/startupProjectArgv";

describe("extractStartupProjectFilePathFromArgv", () => {
  it("extracts a packaged .pergamum startup argument", () => {
    const projectFilePath = path.join("C:\\Novel", "MyProject.pergamum");

    expect(
      extractStartupProjectFilePathFromArgv(
        ["Pergamum.exe", projectFilePath],
        { isPackaged: true }
      )
    ).toBe(path.resolve(projectFilePath));
  });

  it("extracts a dev .pergamum startup argument after the Electron app path", () => {
    const appPath = path.resolve(".");
    const projectFilePath = path.join("C:\\Novel", "DevProject.pergamum");

    expect(
      extractStartupProjectFilePathFromArgv(
        ["electron.exe", appPath, projectFilePath],
        { isPackaged: false }
      )
    ).toBe(path.resolve(projectFilePath));
  });

  it("ignores option arguments while finding a single project file argument", () => {
    const projectFilePath = path.join("C:\\Novel", "DebugProject.PERGAMUM");

    expect(
      extractStartupProjectFilePathFromArgv(
        ["Pergamum.exe", "--pergamum-debug", projectFilePath],
        { isPackaged: true }
      )
    ).toBe(path.resolve(projectFilePath));
  });

  it("returns null when argv does not contain a .pergamum argument", () => {
    expect(
      extractStartupProjectFilePathFromArgv(["Pergamum.exe"], {
        isPackaged: true
      })
    ).toBeNull();
  });

  it.each([".md", ".markdown", ".txt", ".json"])(
    "does not extract unsupported %s startup files",
    (extension) => {
      expect(
        extractStartupProjectFilePathFromArgv(
          ["Pergamum.exe", path.join("C:\\Novel", `Draft${extension}`)],
          { isPackaged: true }
        )
      ).toBeNull();
    }
  );

  it.each([
    "https://example.com/Book.pergamum",
    "http://host/Book.pergamum",
    "file:///C:/Users/me/Book.pergamum",
    "ftp://host/Book.pergamum"
  ])(
    "does not treat a URL-like .pergamum argument as a startup project (%s) (#347 / LOCK-STARTUP-5)",
    (url) => {
      expect(
        extractStartupProjectFilePathFromArgv(["Pergamum.exe", url], {
          isPackaged: true
        })
      ).toBeNull();
    }
  );

  it("still accepts a Windows drive-letter .pergamum path (not URL-like)", () => {
    expect(
      extractStartupProjectFilePathFromArgv(
        ["Pergamum.exe", "C:\\Novel\\Book.pergamum"],
        { isPackaged: true }
      )
    ).toBe(path.resolve("C:\\Novel\\Book.pergamum"));
  });

  it("does not extract a startup project when multiple positional file arguments are present", () => {
    expect(
      extractStartupProjectFilePathFromArgv(
        [
          "Pergamum.exe",
          path.join("C:\\Novel", "First.pergamum"),
          path.join("C:\\Novel", "Second.pergamum")
        ],
        { isPackaged: true }
      )
    ).toBeNull();

    expect(
      extractStartupProjectFilePathFromArgv(
        [
          "Pergamum.exe",
          path.join("C:\\Novel", "Project.pergamum"),
          path.join("C:\\Novel", "Draft.md")
        ],
        { isPackaged: true }
      )
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  projectDocumentAbsolutePath,
  tabFileNameFromPath
} from "../../src/shared/tabPathDisplay";

describe("tabFileNameFromPath (#354)", () => {
  it("returns the last segment for POSIX and Windows separators", () => {
    expect(tabFileNameFromPath("Drafts/Chapter1/scene-03.md")).toBe(
      "scene-03.md"
    );
    expect(tabFileNameFromPath("C:\\Novel\\Drafts\\a.md")).toBe("a.md");
  });

  it("returns the value itself when there is no separator", () => {
    expect(tabFileNameFromPath("solo.md")).toBe("solo.md");
    expect(tabFileNameFromPath("Untitled-1")).toBe("Untitled-1");
  });

  it("ignores trailing separators", () => {
    expect(tabFileNameFromPath("Drafts/Chapter1/")).toBe("Chapter1");
  });
});

describe("projectDocumentAbsolutePath (#354)", () => {
  it("joins a Windows root with a forward-slash relative path using backslashes", () => {
    expect(
      projectDocumentAbsolutePath("C:\\Novel", "Drafts/Chapter1/scene-03.md")
    ).toBe("C:\\Novel\\Drafts\\Chapter1\\scene-03.md");
  });

  it("joins a POSIX root with forward slashes", () => {
    expect(projectDocumentAbsolutePath("/home/me/novel", "drafts/a.md")).toBe(
      "/home/me/novel/drafts/a.md"
    );
  });

  it("tolerates a trailing separator on the root", () => {
    expect(projectDocumentAbsolutePath("C:\\Novel\\", "a.md")).toBe(
      "C:\\Novel\\a.md"
    );
  });

  it("returns the bare root for an empty relative path", () => {
    expect(projectDocumentAbsolutePath("C:\\Novel", "")).toBe("C:\\Novel");
  });
});

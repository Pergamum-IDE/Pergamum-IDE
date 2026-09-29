import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RecentProject } from "../../src/shared/api";
import { WelcomeScreen } from "../../src/renderer/WelcomeScreen";

describe("WelcomeScreen", () => {
  const dummyRecentProjects: RecentProject[] = [
    {
      projectId: "proj-1",
      projectName: "Project One",
      projectFilePath: "/path/to/project1.pergamum",
      projectRootPath: "/path/to/project1",
      schemaVersion: 1,
      lastOpenedAt: "2026-09-29T12:00:00Z"
    },
    {
      projectId: "proj-2",
      projectName: "Project Two",
      projectFilePath: "/path/to/project2.pergamum",
      projectRootPath: "/path/to/project2",
      schemaVersion: 1,
      lastOpenedAt: "2026-09-29T13:00:00Z"
    }
  ];

  const dummyTranslate = (key: string) => key;

  it("renders Create Project, Open Project, and Recent Projects list", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WelcomeScreen, {
        recentProjects: dummyRecentProjects,
        translate: dummyTranslate,
        onCreateProject: () => {},
        onOpenProject: () => {},
        onOpenRecentProject: () => {}
      })
    );

    expect(markup).toContain("welcome.createProject");
    expect(markup).toContain("welcome.openProject");
    expect(markup).toContain("welcomeLogo");
    expect(markup).toContain("alt=\"welcome.title\"");
    expect(markup).toContain("Project One");
    expect(markup).toContain("Project Two");
  });

  it("renders Recent Projects remove buttons when onRemoveRecentProject is provided", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WelcomeScreen, {
        recentProjects: dummyRecentProjects,
        translate: dummyTranslate,
        onCreateProject: () => {},
        onOpenProject: () => {},
        onOpenRecentProject: () => {},
        onRemoveRecentProject: () => {}
      })
    );

    expect(markup).toContain("welcome.recentRemove");
    expect(markup).toContain("welcomeRecentRemove");
  });

  it("renders Welcome Tips card and tip navigation buttons", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WelcomeScreen, {
        recentProjects: [],
        translate: dummyTranslate,
        onCreateProject: () => {},
        onOpenProject: () => {},
        onOpenRecentProject: () => {}
      })
    );

    expect(markup).toContain("welcomeTipCard");
    expect(markup).toContain("welcome.previousTip");
    expect(markup).toContain("welcome.nextTip");
  });
});

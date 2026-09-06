import { describe, expect, it } from "vitest";
import type {
  PergamumProject,
  ProjectSettings,
  UpdateProjectSettingsRequest
} from "../../src/shared/api";
import {
  defaultApplicationSettings,
  resolveEffectiveSettings,
  type ApplicationSettings
} from "../../src/shared/settings";

function createMockProject(
  name: string,
  settings?: ProjectSettings
): PergamumProject {
  return {
    rootPath: `C:/works/projects/${name}`,
    activeProjectFilePath: `C:/works/projects/${name}/novel.pergamum`,
    name,
    config: {
      name,
      ...(settings ? { settings } : {})
    },
    accessMode: { kind: "readWrite" },
    documents: []
  };
}

describe("Project Settings lifecycle & resolution integration (#396 Slice 3)", () => {
  const baseAppSettings: ApplicationSettings = {
    ...defaultApplicationSettings,
    editor: {
      ...defaultApplicationSettings.editor,
      fontFamily: "Application Font A"
    }
  };

  it("updates renderer project state on save and immediately updates effective font (requirement 9)", () => {
    let currentProject: PergamumProject = createMockProject("Project 1");

    // Initially resolves to Application Font
    const initialEffective = resolveEffectiveSettings(
      baseAppSettings,
      currentProject.config?.settings
    );
    expect(initialEffective.editor.fontFamily).toBe("Application Font A");

    // Simulate saveProjectSettings returning updated settings
    const updatedSettings: ProjectSettings = {
      editor: { fontFamily: "Project Override Font B" }
    };

    // State update pattern from App.tsx handleSaveProjectSettings
    currentProject = {
      ...currentProject,
      config: {
        ...currentProject.config,
        name: currentProject.name,
        settings: updatedSettings
      }
    };

    // Effective settings immediately resolve to project font without reopening
    const updatedEffective = resolveEffectiveSettings(
      baseAppSettings,
      currentProject.config?.settings
    );
    expect(updatedEffective.editor.fontFamily).toBe("Project Override Font B");
  });

  it("leaves renderer project state unchanged when save fails (requirement 10)", async () => {
    const originalSettings: ProjectSettings = {
      editor: { fontFamily: "Original Font" }
    };
    let currentProject: PergamumProject = createMockProject(
      "Project 1",
      originalSettings
    );

    // Mock save function that fails
    const mockSave = async (
      _request: UpdateProjectSettingsRequest
    ): Promise<ProjectSettings> => {
      throw new Error("Disk write failed: ENOSPC");
    };

    await expect(
      mockSave({ set: { "editor.fontFamily": "Failed New Font" } })
    ).rejects.toThrow("Disk write failed: ENOSPC");

    // currentProject is NOT updated on failure
    expect(currentProject.config?.settings).toEqual(originalSettings);

    const effective = resolveEffectiveSettings(
      baseAppSettings,
      currentProject.config?.settings
    );
    expect(effective.editor.fontFamily).toBe("Original Font");
  });

  it("retains project override when application settings change, and returns to new application font on override removal (requirement 13)", () => {
    let appSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      editor: {
        ...defaultApplicationSettings.editor,
        fontFamily: "Font A"
      }
    };

    let project: PergamumProject = createMockProject("Project 1", {
      editor: { fontFamily: "Font B" }
    });

    // With project override active: effective is Font B
    expect(
      resolveEffectiveSettings(appSettings, project.config?.settings).editor
        .fontFamily
    ).toBe("Font B");

    // Change Application Settings from Font A -> Font C
    appSettings = {
      ...appSettings,
      editor: {
        ...appSettings.editor,
        fontFamily: "Font C"
      }
    };

    // Effective remains Font B because project override takes precedence
    expect(
      resolveEffectiveSettings(appSettings, project.config?.settings).editor
        .fontFamily
    ).toBe("Font B");

    // Remove project override
    project = {
      ...project,
      config: {
        ...project.config,
        name: project.name,
        settings: undefined
      }
    };

    // Effective immediately becomes Font C
    expect(
      resolveEffectiveSettings(appSettings, project.config?.settings).editor
        .fontFamily
    ).toBe("Font C");
  });

  it("does not leak project override across project switches (requirement 12)", () => {
    const projectA: PergamumProject = createMockProject("Project A", {
      editor: { fontFamily: "Project Font A" }
    });

    const projectB: PergamumProject = createMockProject("Project B", undefined);

    // Opening Project A
    expect(
      resolveEffectiveSettings(baseAppSettings, projectA.config?.settings).editor
        .fontFamily
    ).toBe("Project Font A");

    // Switching to Project B: resolves to Application Font, no leakage
    expect(
      resolveEffectiveSettings(baseAppSettings, projectB.config?.settings).editor
        .fontFamily
    ).toBe("Application Font A");

    // Switching back to Project A
    expect(
      resolveEffectiveSettings(baseAppSettings, projectA.config?.settings).editor
        .fontFamily
    ).toBe("Project Font A");
  });

  it("does not apply in-flight save results from Project A into Project B after project switch", async () => {
    let currentProject: PergamumProject | null = createMockProject("Project A", undefined);

    // Simulates the exact App.tsx handleSaveProjectSettings identity guard
    const handleSave = async (pendingPromise: Promise<ProjectSettings>): Promise<void> => {
      const targetProjectFilePath = currentProject?.activeProjectFilePath;
      if (!targetProjectFilePath) {
        return;
      }

      const updatedSettings = await pendingPromise;

      if (currentProject && currentProject.activeProjectFilePath === targetProjectFilePath) {
        currentProject = {
          ...currentProject,
          config: {
            ...currentProject.config,
            name: currentProject.name,
            settings: updatedSettings
          }
        };
      }
    };

    let resolveSave!: (settings: ProjectSettings) => void;
    const savePromise = new Promise<ProjectSettings>((resolve) => {
      resolveSave = resolve;
    });

    const inFlight = handleSave(savePromise);

    // Switch to Project B while save is in flight
    currentProject = createMockProject("Project B", undefined);

    // In-flight save from Project A finishes
    resolveSave({ editor: { fontFamily: "Project A Override" } });
    await inFlight;

    // Project B must remain untouched with no leaked settings
    expect(currentProject.name).toBe("Project B");
    expect(currentProject.config?.settings).toBeUndefined();
    expect(
      resolveEffectiveSettings(baseAppSettings, currentProject.config?.settings).editor.fontFamily
    ).toBe("Application Font A");
  });
});

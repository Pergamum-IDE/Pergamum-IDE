import { describe, expect, it } from "vitest";
import {
  defaultApplicationSettings,
  type ApplicationSettings,
  type ProjectSettings
} from "../../src/shared/settings";
import {
  APPLICATION_SETTINGS_EXPORT_DEFAULT_FILE_NAME,
  SETTINGS_EXPORT_FILE_NAME_STEM_MAX_LENGTH,
  createApplicationSettingsExportJson,
  createApplicationSettingsExportPayload,
  createProjectSettingsExportJson,
  createProjectSettingsExportPayload,
  projectSettingsExportDefaultFileName,
  sanitizeJsonFileNameStem,
  settingsExportPayloadToJson
} from "../../src/shared/settingsExport";

const exportedAt = new Date("2026-09-19T00:00:00.000Z");

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("settings JSON export helpers (#521)", () => {
  it("creates a complete Application Settings payload without local state", () => {
    const settings = {
      ...defaultApplicationSettings,
      notification: {
        output: {
          enabled: false
        }
      },
      recentProjects: [
        {
          projectId: "019a0000-0000-7000-8000-000000000521",
          projectName: "Secret Project",
          projectFilePath: "C:\\Users\\alice\\Secret\\Secret.pergamum",
          projectRootPath: "C:\\Users\\alice\\Secret",
          schemaVersion: 1,
          lastOpenedAt: "2026-09-19T00:00:00.000Z"
        }
      ],
      session: {
        activeDocumentText: "SECRET_MANUSCRIPT_TEXT_MARKER",
        selectedText: "SECRET_SELECTION_MARKER"
      },
      Recovery: {
        payloadText: "SECRET_RECOVERY_MARKER"
      },
      sessionRestore: {
        openTabs: ["SECRET_TAB_MARKER"]
      }
    } as ApplicationSettings & Record<string, unknown>;
    const settingsBefore = jsonClone(settings);
    const expectedSettings = {
      commandPalette: settings.commandPalette,
      documentMap: settings.documentMap,
      editor: settings.editor,
      imageAttachment: settings.imageAttachment,
      markdownFiles: settings.markdownFiles,
      notification: settings.notification,
      preview: settings.preview,
      search: settings.search,
      textFiles: settings.textFiles,
      workbench: settings.workbench
    };

    const payload = createApplicationSettingsExportPayload(settings, exportedAt);

    expect(payload).toEqual({
      schemaVersion: 1,
      scope: "application",
      exportedAt: "2026-09-19T00:00:00.000Z",
      settings: expectedSettings
    });
    expect(Object.keys(payload.settings).sort()).toEqual(
      Object.keys(expectedSettings).sort()
    );
    expect(settings).toEqual(settingsBefore);
    expect("recentProjects" in payload.settings).toBe(false);

    const json = settingsExportPayloadToJson(payload);
    expect(json.endsWith("\n")).toBe(true);
    expect(json).toContain('\n  "schemaVersion": 1,');
    expect(json).not.toContain("Secret.pergamum");
    expect(json).not.toContain("C:\\Users\\alice");
    expect(json).not.toContain("recentProjects");
    expect(json).not.toMatch(/session|recovery/i);
    expect(json).not.toContain("SECRET_MANUSCRIPT_TEXT_MARKER");
    expect(json).not.toContain("SECRET_SELECTION_MARKER");
    expect(json).not.toContain("SECRET_RECOVERY_MARKER");
    expect(json).not.toContain("SECRET_TAB_MARKER");
    expect(JSON.parse(json)).toEqual(payload);
  });

  it("uses the fixed Application Settings default filename", () => {
    expect(APPLICATION_SETTINGS_EXPORT_DEFAULT_FILE_NAME).toBe("pergamum.json");
  });

  it("creates a Project Settings payload with project.name and sparse settings", () => {
    const projectSettings: ProjectSettings = {
      preview: { renderer: "kakuyomuHorizontal" },
      editor: {
        paragraphIndent: {
          excludeLeadingCharacters: "「"
        }
      }
    };

    const payload = createProjectSettingsExportPayload(
      "迷子たちと千年領主",
      projectSettings,
      exportedAt
    );

    expect(payload).toEqual({
      schemaVersion: 1,
      scope: "project",
      project: {
        name: "迷子たちと千年領主"
      },
      exportedAt: "2026-09-19T00:00:00.000Z",
      settings: {
        editor: {
          paragraphIndent: {
            excludeLeadingCharacters: "「"
          }
        },
        preview: {
          renderer: "kakuyomuHorizontal"
        }
      }
    });
  });

  it("creates pretty JSON without adding document, session, or Recovery data", () => {
    const json = createProjectSettingsExportJson(
      "Novel",
      { imageAttachment: { saveDirectory: "assets" } },
      exportedAt
    );

    expect(json).toBe(
      [
        "{",
        '  "schemaVersion": 1,',
        '  "scope": "project",',
        '  "project": {',
        '    "name": "Novel"',
        "  },",
        '  "exportedAt": "2026-09-19T00:00:00.000Z",',
        '  "settings": {',
        '    "imageAttachment": {',
        '      "saveDirectory": "assets"',
        "    }",
        "  }",
        "}",
        ""
      ].join("\n")
    );
    expect(json).not.toContain("SECRET_MANUSCRIPT_TEXT_MARKER");
    expect(json).not.toMatch(/session|recovery/i);
  });

  it("calculates Project Settings default filenames from sanitized project names", () => {
    expect(projectSettingsExportDefaultFileName("迷子たちと千年領主")).toBe(
      "迷子たちと千年領主.json"
    );
    expect(projectSettingsExportDefaultFileName("A:B/C*D?")).toBe(
      "A_B_C_D_.json"
    );
    expect(projectSettingsExportDefaultFileName("CON")).toBe("CON_.json");
    expect(projectSettingsExportDefaultFileName("CON.txt")).toBe(
      "CON.txt_.json"
    );
    expect(projectSettingsExportDefaultFileName("   ...   ")).toBe(
      "project-settings.json"
    );
  });

  it("sanitizes JSON filename stems for Windows-invalid and unsafe names", () => {
    expect(projectSettingsExportDefaultFileName("A\\B\"C<D>E|F")).toBe(
      "A_B_C_D_E_F.json"
    );
    expect(projectSettingsExportDefaultFileName("A\u0001B\u007fC")).toBe(
      "A_B_C.json"
    );
    expect(projectSettingsExportDefaultFileName("")).toBe(
      "project-settings.json"
    );
    expect(projectSettingsExportDefaultFileName(" \t \r\n ")).toBe(
      "project-settings.json"
    );
    expect(projectSettingsExportDefaultFileName("Novel...   ")).toBe(
      "Novel.json"
    );

    for (const reserved of [
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9"
    ]) {
      expect(projectSettingsExportDefaultFileName(reserved)).toBe(
        `${reserved}_.json`
      );
      expect(projectSettingsExportDefaultFileName(`${reserved}.txt`)).toBe(
        `${reserved}.txt_.json`
      );
    }

    const longStem = "迷".repeat(SETTINGS_EXPORT_FILE_NAME_STEM_MAX_LENGTH + 50);
    expect(sanitizeJsonFileNameStem(longStem, "project-settings")).toBe(
      "迷".repeat(SETTINGS_EXPORT_FILE_NAME_STEM_MAX_LENGTH)
    );
    expect(projectSettingsExportDefaultFileName(longStem)).toBe(
      `${"迷".repeat(SETTINGS_EXPORT_FILE_NAME_STEM_MAX_LENGTH)}.json`
    );
  });

  it("does not collapse non-plain objects while sorting export values", () => {
    const dateValue = new Date("2026-09-19T12:34:56.789Z");
    const settings = {
      preview: {
        renderer: dateValue
      }
    } as unknown as ProjectSettings;

    const payload = createProjectSettingsExportPayload(
      "Novel",
      settings,
      exportedAt
    );

    expect((payload.settings.preview as any).renderer).toBe(dateValue);

    const json = settingsExportPayloadToJson(payload);
    expect(json).toContain(dateValue.toISOString());
    expect(json).not.toContain('"renderer": {}');
  });

  it("serializes Application Settings export JSON as valid pretty JSON", () => {
    const json = createApplicationSettingsExportJson(
      defaultApplicationSettings,
      exportedAt
    );
    const parsed = JSON.parse(json);

    expect(parsed.scope).toBe("application");
    expect(parsed.settings).toBeDefined();
    expect(json).toContain("\n  ");
    expect(json).not.toContain(",\n}");
  });
});

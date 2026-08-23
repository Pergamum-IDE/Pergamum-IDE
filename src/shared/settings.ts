import type { Language } from "./i18n";
import {
  getCatalogDefaultValue,
  validateCatalogValue,
  type SettingValueOf
} from "./settingsCatalog";

export type SettingsCategory =
  | "general"
  | "appearance"
  | "editor"
  | "preview"
  | "project";

export type PreviewRendererId = "markdown";

export interface RecentProject {
  /**
   * Stable project identity from metadata.project_id.
   */
  projectId: string;
  /**
   * Display name from metadata.project_name.
   * This is not derived from the folder name or .pergamum filename after creation.
   */
  projectName: string;
  /**
   * Absolute path to the .pergamum project file.
   * This is the open target for Recent Projects.
   */
  projectFilePath: string;
  /**
   * Absolute path to the project root directory.
   * This is normally the parent directory of projectFilePath.
   */
  projectRootPath: string;
  /**
   * Project database schema version from metadata.schema_version.
   */
  schemaVersion: number;
  /**
   * ISO timestamp updated when the project is successfully opened.
   */
  lastOpenedAt: string;
}

export type RecordRecentProjectInput = Omit<RecentProject, "lastOpenedAt">;

export interface ApplicationPreviewSettings {
  renderer: PreviewRendererId;
}

export interface WorkbenchStatusBarSettings {
  visible: boolean;
}

export interface WorkbenchAdvancedSettings {
  enabled: boolean;
}

export interface WorkbenchSoundToggleSettings {
  enabled: boolean;
}

export interface WorkbenchSoundSettings {
  enabled: boolean;
  dialog: WorkbenchSoundToggleSettings;
  newline: WorkbenchSoundToggleSettings;
  keypress: WorkbenchSoundToggleSettings;
}

export interface CommandPaletteDescriptionMarqueeSettings {
  delay: number;
  speed: number;
}

export interface CommandPaletteDescriptionSettings {
  enable: boolean;
  marquee: CommandPaletteDescriptionMarqueeSettings;
}

export interface ApplicationCommandPaletteSettings {
  description: CommandPaletteDescriptionSettings;
}

export type NewFileLineEnding = SettingValueOf<"files.newFile.lineEnding">;
export type NewFileEncoding = SettingValueOf<"files.newFile.encoding">;

export interface ApplicationEditorSettings {
  fontFamily?: string;
}

export interface ApplicationNewFileSettings {
  lineEnding: NewFileLineEnding;
  encoding: NewFileEncoding;
}

export interface ApplicationFilesSettings {
  newFile: ApplicationNewFileSettings;
}

// #174: language and statusBar.visible moved here from legacy top-level
// ApplicationSettings.language / .showStatusBar — both applicationOnly
// catalog entries, always resolved to a concrete value at read time (not
// sparse). fontFamily stays optional, like ProjectPreviewSettings.renderer:
// absence on disk is distinct from an explicit value, so the write path can
// preserve sparse settings.json storage (#173 D-7) instead of eagerly
// writing back the catalog default.
export interface ApplicationWorkbenchSettings {
  language: Language;
  statusBar: WorkbenchStatusBarSettings;
  advancedSettings: WorkbenchAdvancedSettings;
  sound: WorkbenchSoundSettings;
  fontFamily?: string;
}

export interface ApplicationSettings {
  preview: ApplicationPreviewSettings;
  workbench: ApplicationWorkbenchSettings;
  commandPalette: ApplicationCommandPaletteSettings;
  editor: ApplicationEditorSettings;
  files: ApplicationFilesSettings;
  recentProjects: RecentProject[];
}

// Application Settings saves the currently displayed application-scope
// settings. fontFamily values stay optional here too — omitting them from a
// save request preserves the sparse value (#173 D-7); it does not reset them
// to a catalog default.
export interface SaveApplicationSettingsRequest {
  workbench: ApplicationWorkbenchSettings;
  commandPalette: ApplicationCommandPaletteSettings;
  editor: ApplicationEditorSettings;
  files: ApplicationFilesSettings;
}

export interface ProjectPreviewSettings {
  renderer?: PreviewRendererId;
}

export interface ProjectSettings {
  preview?: ProjectPreviewSettings;
}

export interface EffectivePreviewSettings {
  renderer: PreviewRendererId;
}

export interface EffectiveWorkbenchSettings {
  language: Language;
  statusBar: WorkbenchStatusBarSettings;
  advancedSettings: WorkbenchAdvancedSettings;
  sound: WorkbenchSoundSettings;
  fontFamily: string;
}

export interface EffectiveCommandPaletteSettings {
  description: CommandPaletteDescriptionSettings;
}

export interface EffectiveEditorSettings {
  fontFamily: string;
}

export interface EffectiveFilesSettings {
  newFile: ApplicationNewFileSettings;
}

export interface EffectiveSettings {
  preview: EffectivePreviewSettings;
  workbench: EffectiveWorkbenchSettings;
  commandPalette: EffectiveCommandPaletteSettings;
  editor: EffectiveEditorSettings;
  files: EffectiveFilesSettings;
}

// The settings catalog is the only source of truth for this default —
// derived from it rather than duplicating the literal "markdown" here.
//
// Compatibility wrapper: kept public as the preview renderer default even
// though no production module currently imports it directly (only
// builtInDefaultSettings below, in this same module, consumes it) —
// existing preview settings consumers that need the built-in default go
// through builtInDefaultSettings/defaultApplicationSettings, which are
// seeded from this constant.
export const defaultPreviewRenderer: PreviewRendererId =
  getCatalogDefaultValue("preview.renderer");

export const builtInDefaultSettings: EffectiveSettings = {
  preview: {
    renderer: defaultPreviewRenderer
  },
  workbench: {
    language: getCatalogDefaultValue("workbench.language"),
    statusBar: {
      visible: getCatalogDefaultValue("workbench.statusBar.visible")
    },
    advancedSettings: {
      enabled: getCatalogDefaultValue("workbench.advancedSettings.enabled")
    },
    sound: {
      enabled: getCatalogDefaultValue("workbench.sound.enabled"),
      dialog: {
        enabled: getCatalogDefaultValue("workbench.sound.dialog.enabled")
      },
      newline: {
        enabled: getCatalogDefaultValue("workbench.sound.newline.enabled")
      },
      keypress: {
        enabled: getCatalogDefaultValue("workbench.sound.keypress.enabled")
      }
    },
    fontFamily: getCatalogDefaultValue("workbench.fontFamily")
  },
  commandPalette: {
    description: {
      enable: getCatalogDefaultValue("commandPalette.description.enable"),
      marquee: {
        delay: getCatalogDefaultValue(
          "commandPalette.description.marquee.delay"
        ),
        speed: getCatalogDefaultValue(
          "commandPalette.description.marquee.speed"
        )
      }
    }
  },
  editor: {
    fontFamily: getCatalogDefaultValue("editor.fontFamily")
  },
  files: {
    newFile: {
      lineEnding: getCatalogDefaultValue("files.newFile.lineEnding"),
      encoding: getCatalogDefaultValue("files.newFile.encoding")
    }
  }
};

// fontFamily values are intentionally omitted here, not copied from
// builtInDefaultSettings — this is the "nothing on disk yet" baseline (#173
// D-7), and resolveEffectiveSettings below is what falls through to catalog
// defaults when fontFamily is absent.
// workbench.language / workbench.statusBar.visible are NOT sparse (#174):
// unlike fontFamily, they always carry a concrete value, mirroring the legacy
// top-level language/showStatusBar fields they replace.
export const defaultApplicationSettings: ApplicationSettings = {
  preview: {
    renderer: builtInDefaultSettings.preview.renderer
  },
  workbench: {
    language: builtInDefaultSettings.workbench.language,
    statusBar: {
      visible: builtInDefaultSettings.workbench.statusBar.visible
    },
    advancedSettings: {
      enabled: builtInDefaultSettings.workbench.advancedSettings.enabled
    },
    sound: {
      enabled: builtInDefaultSettings.workbench.sound.enabled,
      dialog: {
        enabled: builtInDefaultSettings.workbench.sound.dialog.enabled
      },
      newline: {
        enabled: builtInDefaultSettings.workbench.sound.newline.enabled
      },
      keypress: {
        enabled: builtInDefaultSettings.workbench.sound.keypress.enabled
      }
    }
  },
  commandPalette: {
    description: {
      enable: builtInDefaultSettings.commandPalette.description.enable,
      marquee: {
        delay:
          builtInDefaultSettings.commandPalette.description.marquee.delay,
        speed:
          builtInDefaultSettings.commandPalette.description.marquee.speed
      }
    }
  },
  editor: {},
  files: {
    newFile: {
      lineEnding: builtInDefaultSettings.files.newFile.lineEnding,
      encoding: builtInDefaultSettings.files.newFile.encoding
    }
  },
  recentProjects: []
};

export function createDefaultApplicationSettings(): ApplicationSettings {
  return {
    preview: {
      renderer: defaultApplicationSettings.preview.renderer
    },
    workbench: {
      language: defaultApplicationSettings.workbench.language,
      statusBar: {
        visible: defaultApplicationSettings.workbench.statusBar.visible
      },
      advancedSettings: {
        enabled:
          defaultApplicationSettings.workbench.advancedSettings.enabled
      },
      sound: {
        enabled: defaultApplicationSettings.workbench.sound.enabled,
        dialog: {
          enabled: defaultApplicationSettings.workbench.sound.dialog.enabled
        },
        newline: {
          enabled: defaultApplicationSettings.workbench.sound.newline.enabled
        },
        keypress: {
          enabled: defaultApplicationSettings.workbench.sound.keypress.enabled
        }
      }
    },
    commandPalette: {
      description: {
        enable: defaultApplicationSettings.commandPalette.description.enable,
        marquee: {
          delay:
            defaultApplicationSettings.commandPalette.description.marquee.delay,
          speed:
            defaultApplicationSettings.commandPalette.description.marquee.speed
        }
      }
    },
    editor: {},
    files: {
      newFile: {
        lineEnding: defaultApplicationSettings.files.newFile.lineEnding,
        encoding: defaultApplicationSettings.files.newFile.encoding
      }
    },
    recentProjects: []
  };
}

// Delegates to the settings catalog's own enum validation instead of a
// hand-rolled `value === defaultPreviewRenderer` check.
export function isPreviewRendererId(
  value: unknown
): value is PreviewRendererId {
  return validateCatalogValue("preview.renderer", value).ok;
}

export function resolveEffectiveSettings(
  applicationSettings: ApplicationSettings,
  projectSettings: ProjectSettings | null | undefined
): EffectiveSettings {
  return {
    preview: {
      renderer:
        projectSettings?.preview?.renderer ??
        applicationSettings.preview.renderer ??
        builtInDefaultSettings.preview.renderer
    },
    // The whole workbench area is applicationOnly (#173, #174): Application
    // > Default only, no project scope in the chain. language and
    // statusBar.visible pass straight through (never sparse); fontFamily
    // still falls through to the catalog default when absent.
    workbench: {
      language: applicationSettings.workbench.language,
      statusBar: {
        visible: applicationSettings.workbench.statusBar.visible
      },
      advancedSettings: {
        enabled: applicationSettings.workbench.advancedSettings.enabled
      },
      sound: {
        enabled: applicationSettings.workbench.sound.enabled,
        dialog: {
          enabled: applicationSettings.workbench.sound.dialog.enabled
        },
        newline: {
          enabled: applicationSettings.workbench.sound.newline.enabled
        },
        keypress: {
          enabled: applicationSettings.workbench.sound.keypress.enabled
        }
      },
      fontFamily:
        applicationSettings.workbench.fontFamily ??
        builtInDefaultSettings.workbench.fontFamily
    },
    commandPalette: {
      description: {
        enable: applicationSettings.commandPalette.description.enable,
        marquee: {
          delay: applicationSettings.commandPalette.description.marquee.delay,
          speed: applicationSettings.commandPalette.description.marquee.speed
        }
      }
    },
    // Project-level editor settings remain out of scope for #195; the
    // project config type intentionally does not carry editor settings yet.
    editor: {
      fontFamily:
        applicationSettings.editor.fontFamily ??
        builtInDefaultSettings.editor.fontFamily
    },
    files: {
      newFile: {
        lineEnding: applicationSettings.files.newFile.lineEnding,
        encoding: applicationSettings.files.newFile.encoding
      }
    }
  };
}

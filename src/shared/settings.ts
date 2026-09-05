import {
  defaultDocumentMapSettings,
  type DocumentMapSettings
} from "./documentMapSettings";
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
  /**
   * #250 follow-up: milliseconds to wait, after editing stops, before
   * updating the preview. applicationOnly scope — no project override
   * (unlike `renderer`), so this is always resolved from
   * ApplicationSettings/the catalog default, never ProjectSettings.
   */
  updateDelayMs: number;
}

export interface WorkbenchStatusBarSettings {
  visible: boolean;
  characterCount: WorkbenchStatusBarCharacterCountSettings;
}

export interface WorkbenchStatusBarCharacterCountSettings {
  visible: boolean;
}

export interface WorkbenchSoundToggleSettings {
  enabled: boolean;
}

// #266: how long an information NotificationToast stays on screen before it
// auto-dismisses, in milliseconds (the unit the NotificationController timer
// consumes directly). Stored sparsely (optional) on
// ApplicationWorkbenchSettings, mirroring workbench.fontFamily (#173 D-7): an
// absent value is not written back as the catalog default, and
// resolveEffectiveSettings is what falls through to the default.
// EffectiveWorkbenchSettings.notification is always concrete.
export interface WorkbenchNotificationSettings {
  durationMs: number;
}

export interface NotificationOutputSettings {
  enabled: boolean;
}

export interface ApplicationNotificationSettings {
  output: NotificationOutputSettings;
}

export interface WorkbenchSoundSettings {
  enabled: boolean;
  dialog: WorkbenchSoundToggleSettings;
  newline: WorkbenchSoundToggleSettings;
  keypress: WorkbenchSoundToggleSettings;
}

export interface CommandPaletteFooterDetailMarqueeSettings {
  delay: number;
  speed: number;
}

export interface CommandPaletteFooterDetailSettings {
  enable: boolean;
  marquee: CommandPaletteFooterDetailMarqueeSettings;
}

export interface ApplicationCommandPaletteSettings {
  footerDetail: CommandPaletteFooterDetailSettings;
}

export type NewFileLineEnding = SettingValueOf<"files.newFile.lineEnding">;
export type NewFileEncoding = SettingValueOf<"files.newFile.encoding">;

// #252: `expected` is a diagnostic-only setting — what marker/distribution
// UI treats as "the line ending you expect to see" — never a save-time
// conversion target. It must stay fully separate from #253's
// files.newFile.lineEnding (which decides a *new* break's kind) and from
// the per-break kinds actually tracked/saved. `markerGlyph` is one glyph
// used for every line-ending kind; expected/unexpected is shown via marker
// variant/styling, not by choosing a different glyph per kind.
export type ExpectedLineEnding = SettingValueOf<"editor.lineEnding.expected">;
export type LineEndingMarkerGlyph = SettingValueOf<
  "editor.lineEnding.markerGlyph"
>;
export type ParagraphIndentExcludeLeadingCharacters = SettingValueOf<
  "editor.paragraphIndent.excludeLeadingCharacters"
>;
// #394 Step 1: CodeMirror `history()`'s `minDepth` for a Markdown document's
// EditorState — see settingsCatalog.ts's own comment on this key for scope
// and rationale.
export type UndoHistoryMinDepth = SettingValueOf<
  "editor.undoHistoryMinDepth"
>;

export interface ApplicationEditorLineEndingSettings {
  expected: ExpectedLineEnding;
  markerGlyph: LineEndingMarkerGlyph;
}

export interface ApplicationEditorWhitespaceSettings {
  renderIdeographicSpace: boolean;
  renderAsciiSpace: boolean;
  renderTab: boolean;
  renderOtherUnicodeSpace: boolean;
}

export interface ApplicationEditorParagraphIndentSettings {
  excludeLeadingCharacters: ParagraphIndentExcludeLeadingCharacters;
}

export interface ApplicationEditorCharacterCountExcludeSettings {
  whitespace: boolean;
  lineBreaks: boolean;
  headings: boolean;
  markdownSyntax: boolean;
  markdownComments: boolean;
}

export interface ApplicationEditorCharacterCountSettings {
  exclude: ApplicationEditorCharacterCountExcludeSettings;
}

export interface ApplicationEditorSettings {
  fontFamily?: string;
  lineEnding: ApplicationEditorLineEndingSettings;
  whitespace: ApplicationEditorWhitespaceSettings;
  paragraphIndent: ApplicationEditorParagraphIndentSettings;
  characterCount: ApplicationEditorCharacterCountSettings;
  undoHistoryMinDepth: UndoHistoryMinDepth;
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
  sound: WorkbenchSoundSettings;
  fontFamily?: string;
  // #266: sparse, like fontFamily — absence means "use the catalog default";
  // it is never eagerly written back as the default.
  notification?: WorkbenchNotificationSettings;
}

export interface ApplicationSettings {
  preview: ApplicationPreviewSettings;
  notification?: ApplicationNotificationSettings;
  workbench: ApplicationWorkbenchSettings;
  commandPalette: ApplicationCommandPaletteSettings;
  editor: ApplicationEditorSettings;
  files: ApplicationFilesSettings;
  // #375: Document Map draw colours + dialogue delimiter pairs.
  // applicationOnly, always concrete (never sparse).
  documentMap: DocumentMapSettings;
  recentProjects: RecentProject[];
}

// Application Settings saves the currently displayed application-scope
// settings. fontFamily values stay optional here too — omitting them from a
// save request preserves the sparse value (#173 D-7); it does not reset them
// to a catalog default.
export interface SaveApplicationSettingsRequest {
  preview: ApplicationPreviewSettings;
  notification?: ApplicationNotificationSettings;
  workbench: ApplicationWorkbenchSettings;
  commandPalette: ApplicationCommandPaletteSettings;
  editor: ApplicationEditorSettings;
  files: ApplicationFilesSettings;
  documentMap: DocumentMapSettings;
}

export interface ProjectPreviewSettings {
  renderer?: PreviewRendererId;
}

export interface ProjectSettings {
  preview?: ProjectPreviewSettings;
}

export interface EffectivePreviewSettings {
  renderer: PreviewRendererId;
  updateDelayMs: number;
}

export interface EffectiveNotificationSettings {
  output: NotificationOutputSettings;
}

export interface EffectiveWorkbenchSettings {
  language: Language;
  statusBar: WorkbenchStatusBarSettings;
  sound: WorkbenchSoundSettings;
  fontFamily: string;
  notification: WorkbenchNotificationSettings;
}

export interface EffectiveCommandPaletteSettings {
  footerDetail: CommandPaletteFooterDetailSettings;
}

export interface EffectiveEditorSettings {
  fontFamily: string;
  lineEnding: ApplicationEditorLineEndingSettings;
  whitespace: ApplicationEditorWhitespaceSettings;
  paragraphIndent: ApplicationEditorParagraphIndentSettings;
  characterCount: ApplicationEditorCharacterCountSettings;
  undoHistoryMinDepth: UndoHistoryMinDepth;
}

export interface EffectiveFilesSettings {
  newFile: ApplicationNewFileSettings;
}

export interface EffectiveSettings {
  preview: EffectivePreviewSettings;
  notification: EffectiveNotificationSettings;
  workbench: EffectiveWorkbenchSettings;
  commandPalette: EffectiveCommandPaletteSettings;
  editor: EffectiveEditorSettings;
  files: EffectiveFilesSettings;
  /** #375: applicationOnly, passes straight through (always concrete). */
  documentMap: DocumentMapSettings;
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

// #250 follow-up: same compatibility-wrapper rationale as
// defaultPreviewRenderer above — the catalog is the only source of truth
// for this default.
export const defaultPreviewUpdateDelayMs: number = getCatalogDefaultValue(
  "preview.updateDelayMs"
);

// #266: same compatibility-wrapper rationale as defaultPreviewUpdateDelayMs —
// the catalog is the only source of truth for this default.
export const defaultNotificationDurationMs: number = getCatalogDefaultValue(
  "workbench.notification.durationMs"
);

export const defaultNotificationOutputEnabled: boolean =
  getCatalogDefaultValue("notification.output.enabled");

export const builtInDefaultSettings: EffectiveSettings = {
  preview: {
    renderer: defaultPreviewRenderer,
    updateDelayMs: defaultPreviewUpdateDelayMs
  },
  notification: {
    output: {
      enabled: defaultNotificationOutputEnabled
    }
  },
  workbench: {
    language: getCatalogDefaultValue("workbench.language"),
    statusBar: {
      visible: getCatalogDefaultValue("workbench.statusBar.visible"),
      characterCount: {
        visible: getCatalogDefaultValue(
          "workbench.statusBar.characterCount.visible"
        )
      }
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
    fontFamily: getCatalogDefaultValue("workbench.fontFamily"),
    notification: {
      durationMs: getCatalogDefaultValue(
        "workbench.notification.durationMs"
      )
    }
  },
  commandPalette: {
    footerDetail: {
      enable: getCatalogDefaultValue("commandPalette.footerDetail.enable"),
      marquee: {
        delay: getCatalogDefaultValue(
          "commandPalette.footerDetail.marquee.delay"
        ),
        speed: getCatalogDefaultValue(
          "commandPalette.footerDetail.marquee.speed"
        )
      }
    }
  },
  editor: {
    fontFamily: getCatalogDefaultValue("editor.fontFamily"),
    lineEnding: {
      expected: getCatalogDefaultValue("editor.lineEnding.expected"),
      markerGlyph: getCatalogDefaultValue("editor.lineEnding.markerGlyph")
    },
    whitespace: {
      renderIdeographicSpace: getCatalogDefaultValue(
        "editor.whitespace.renderIdeographicSpace"
      ),
      renderAsciiSpace: getCatalogDefaultValue(
        "editor.whitespace.renderAsciiSpace"
      ),
      renderTab: getCatalogDefaultValue("editor.whitespace.renderTab"),
      renderOtherUnicodeSpace: getCatalogDefaultValue(
        "editor.whitespace.renderOtherUnicodeSpace"
      )
    },
    paragraphIndent: {
      excludeLeadingCharacters: getCatalogDefaultValue(
        "editor.paragraphIndent.excludeLeadingCharacters"
      )
    },
    characterCount: {
      exclude: {
        whitespace: getCatalogDefaultValue(
          "editor.characterCount.exclude.whitespace"
        ),
        lineBreaks: getCatalogDefaultValue(
          "editor.characterCount.exclude.lineBreaks"
        ),
        headings: getCatalogDefaultValue(
          "editor.characterCount.exclude.headings"
        ),
        markdownSyntax: getCatalogDefaultValue(
          "editor.characterCount.exclude.markdownSyntax"
        ),
        markdownComments: getCatalogDefaultValue(
          "editor.characterCount.exclude.markdownComments"
        )
      }
    },
    undoHistoryMinDepth: getCatalogDefaultValue(
      "editor.undoHistoryMinDepth"
    )
  },
  files: {
    newFile: {
      lineEnding: getCatalogDefaultValue("files.newFile.lineEnding"),
      encoding: getCatalogDefaultValue("files.newFile.encoding")
    }
  },
  documentMap: defaultDocumentMapSettings()
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
    renderer: builtInDefaultSettings.preview.renderer,
    updateDelayMs: builtInDefaultSettings.preview.updateDelayMs
  },
  workbench: {
    language: builtInDefaultSettings.workbench.language,
    statusBar: {
      visible: builtInDefaultSettings.workbench.statusBar.visible,
      characterCount: {
        visible:
          builtInDefaultSettings.workbench.statusBar.characterCount.visible
      }
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
    footerDetail: {
      enable: builtInDefaultSettings.commandPalette.footerDetail.enable,
      marquee: {
        delay:
          builtInDefaultSettings.commandPalette.footerDetail.marquee.delay,
        speed:
          builtInDefaultSettings.commandPalette.footerDetail.marquee.speed
      }
    }
  },
  editor: {
    lineEnding: {
      expected: builtInDefaultSettings.editor.lineEnding.expected,
      markerGlyph: builtInDefaultSettings.editor.lineEnding.markerGlyph
    },
    whitespace: {
      renderIdeographicSpace:
        builtInDefaultSettings.editor.whitespace.renderIdeographicSpace,
      renderAsciiSpace:
        builtInDefaultSettings.editor.whitespace.renderAsciiSpace,
      renderTab: builtInDefaultSettings.editor.whitespace.renderTab,
      renderOtherUnicodeSpace:
        builtInDefaultSettings.editor.whitespace.renderOtherUnicodeSpace
    },
    paragraphIndent: {
      excludeLeadingCharacters:
        builtInDefaultSettings.editor.paragraphIndent.excludeLeadingCharacters
    },
    characterCount: {
      exclude: {
        whitespace:
          builtInDefaultSettings.editor.characterCount.exclude.whitespace,
        lineBreaks:
          builtInDefaultSettings.editor.characterCount.exclude.lineBreaks,
        headings:
          builtInDefaultSettings.editor.characterCount.exclude.headings,
        markdownSyntax:
          builtInDefaultSettings.editor.characterCount.exclude.markdownSyntax,
        markdownComments:
          builtInDefaultSettings.editor.characterCount.exclude.markdownComments
      }
    },
    undoHistoryMinDepth: builtInDefaultSettings.editor.undoHistoryMinDepth
  },
  files: {
    newFile: {
      lineEnding: builtInDefaultSettings.files.newFile.lineEnding,
      encoding: builtInDefaultSettings.files.newFile.encoding
    }
  },
  documentMap: defaultDocumentMapSettings(),
  recentProjects: []
};

export function createDefaultApplicationSettings(): ApplicationSettings {
  return {
    preview: {
      renderer: defaultApplicationSettings.preview.renderer,
      updateDelayMs: defaultApplicationSettings.preview.updateDelayMs
    },
    workbench: {
      language: defaultApplicationSettings.workbench.language,
      statusBar: {
        visible: defaultApplicationSettings.workbench.statusBar.visible,
        characterCount: {
          visible:
            defaultApplicationSettings.workbench.statusBar.characterCount.visible
        }
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
      footerDetail: {
        enable: defaultApplicationSettings.commandPalette.footerDetail.enable,
        marquee: {
          delay:
            defaultApplicationSettings.commandPalette.footerDetail.marquee.delay,
          speed:
            defaultApplicationSettings.commandPalette.footerDetail.marquee.speed
        }
      }
    },
    editor: {
      lineEnding: {
        expected: defaultApplicationSettings.editor.lineEnding.expected,
        markerGlyph: defaultApplicationSettings.editor.lineEnding.markerGlyph
      },
      whitespace: {
        renderIdeographicSpace:
          defaultApplicationSettings.editor.whitespace.renderIdeographicSpace,
        renderAsciiSpace:
          defaultApplicationSettings.editor.whitespace.renderAsciiSpace,
        renderTab: defaultApplicationSettings.editor.whitespace.renderTab,
        renderOtherUnicodeSpace:
          defaultApplicationSettings.editor.whitespace.renderOtherUnicodeSpace
      },
      paragraphIndent: {
        excludeLeadingCharacters:
          defaultApplicationSettings.editor.paragraphIndent
            .excludeLeadingCharacters
      },
      characterCount: {
        exclude: {
          whitespace:
            defaultApplicationSettings.editor.characterCount.exclude.whitespace,
          lineBreaks:
            defaultApplicationSettings.editor.characterCount.exclude.lineBreaks,
          headings:
            defaultApplicationSettings.editor.characterCount.exclude.headings,
          markdownSyntax:
            defaultApplicationSettings.editor.characterCount.exclude
              .markdownSyntax,
          markdownComments:
            defaultApplicationSettings.editor.characterCount.exclude
              .markdownComments
        }
      },
      undoHistoryMinDepth:
        defaultApplicationSettings.editor.undoHistoryMinDepth
    },
    files: {
      newFile: {
        lineEnding: defaultApplicationSettings.files.newFile.lineEnding,
        encoding: defaultApplicationSettings.files.newFile.encoding
      }
    },
    documentMap: defaultDocumentMapSettings(),
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
        builtInDefaultSettings.preview.renderer,
      // applicationOnly (#250 follow-up): no project override, unlike
      // renderer above. Always a concrete value already (resolved through
      // the catalog at settings.json read time), so no fallback needed here.
      updateDelayMs: applicationSettings.preview.updateDelayMs
    },
    notification: {
      output: {
        enabled:
          applicationSettings.notification?.output.enabled ??
          builtInDefaultSettings.notification.output.enabled
      }
    },
    // The whole workbench area is applicationOnly (#173, #174): Application
    // > Default only, no project scope in the chain. language and
    // statusBar.visible pass straight through (never sparse); fontFamily
    // still falls through to the catalog default when absent.
    workbench: {
      language: applicationSettings.workbench.language,
      statusBar: {
        visible: applicationSettings.workbench.statusBar.visible,
        characterCount: {
          visible:
            applicationSettings.workbench.statusBar.characterCount.visible
        }
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
        builtInDefaultSettings.workbench.fontFamily,
      // #266: applicationOnly, and sparse like fontFamily — fall through to
      // the catalog-backed default when settings.json omits it (or when the
      // read path rejected an invalid on-disk value).
      notification: {
        durationMs:
          applicationSettings.workbench.notification?.durationMs ??
          builtInDefaultSettings.workbench.notification.durationMs
      }
    },
    commandPalette: {
      footerDetail: {
        enable: applicationSettings.commandPalette.footerDetail.enable,
        marquee: {
          delay: applicationSettings.commandPalette.footerDetail.marquee.delay,
          speed: applicationSettings.commandPalette.footerDetail.marquee.speed
        }
      }
    },
    // Project-level editor settings remain out of scope for #195; the
    // project config type intentionally does not carry editor settings yet.
    editor: {
      fontFamily:
        applicationSettings.editor.fontFamily ??
        builtInDefaultSettings.editor.fontFamily,
      // applicationOnly (#252), like files.newFile.lineEnding: always a
      // concrete value already (resolved through the catalog at
      // settings.json read time), so no fallback needed here.
      lineEnding: applicationSettings.editor.lineEnding,
      whitespace: applicationSettings.editor.whitespace,
      paragraphIndent: applicationSettings.editor.paragraphIndent,
      characterCount: applicationSettings.editor.characterCount,
      // #394 Step 1: applicationOnly, always concrete already — same
      // fallback-free pass-through as lineEnding/whitespace above.
      undoHistoryMinDepth: applicationSettings.editor.undoHistoryMinDepth
    },
    files: {
      newFile: {
        lineEnding: applicationSettings.files.newFile.lineEnding,
        encoding: applicationSettings.files.newFile.encoding
      }
    },
    // #375: applicationOnly, no project override — passes straight through
    // (already concrete, resolved at settings.json read time).
    documentMap: applicationSettings.documentMap
  };
}

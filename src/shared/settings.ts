import {
  defaultDocumentMapSettings,
  type DocumentMapDialogueDelimiterPair,
  type DocumentMapSettings
} from "./documentMapSettings";
import type { FontFamilySetting } from "./fontSettings";
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

export type PreviewRendererId =
  | "markdown"
  | "narouHorizontal"
  | "kakuyomuHorizontal";

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
  updateDelayMs: number;
  fontFamilyList?: FontFamilySetting[];
  /** #505 Phase 1: applicationOnly, defaults true, applied live. */
  syncScrollEditorToPreview: boolean;
  syncScrollPreviewToEditor: boolean;
  doubleClickJumpToEditor: boolean;
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

export type MarkdownFilesEncoding = SettingValueOf<"markdownFiles.encoding">;
export type MarkdownFilesLineEnding = SettingValueOf<"markdownFiles.lineEnding">;
export type TextFilesEncoding = SettingValueOf<"textFiles.encoding">;
export type TextFilesLineEnding = SettingValueOf<"textFiles.lineEnding">;
export type MarkdownFileEncoding = MarkdownFilesEncoding;
export type MarkdownFileLineEnding = MarkdownFilesLineEnding;
export type TextFileEncoding = TextFilesEncoding;
export type TextFileLineEnding = TextFilesLineEnding;
export type NewFileEncoding = TextFileEncoding;
export type NewFileLineEnding = MarkdownFilesLineEnding;

// #252: `expected` is a diagnostic-only setting — what marker/distribution
// UI treats as "the line ending you expect to see" — never a save-time
// conversion target. It must stay fully separate from #253's
// markdownFiles.lineEnding/textFiles.lineEnding (which decide a *new* break's kind) and from
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
export type SelectionHighlightMode = SettingValueOf<
  "editor.selectionHighlightMode"
>;
export type CaptureTabInEditor = SettingValueOf<"editor.captureTabInEditor">;
export type FencedCodeIndentUnit =
  | "spaces2"
  | "spaces4"
  | "spaces6"
  | "spaces8"
  | "tab";

export function resolveFencedCodeIndentText(
  unit: FencedCodeIndentUnit
): string {
  switch (unit) {
    case "spaces2":
      return "  ";
    case "spaces4":
      return "    ";
    case "spaces6":
      return "      ";
    case "spaces8":
      return "        ";
    case "tab":
      return "\t";
  }
}

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

export type EmphasisMarkRule = "aozora" | "kakuyomu" | "narou";

export type AozoraEmphasisMark =
  | "sesame"
  | "whiteSesame"
  | "circle"
  | "whiteCircle"
  | "blackTriangle"
  | "whiteTriangle"
  | "doubleCircle"
  | "fisheye"
  | "saltire";

export interface ApplicationEditorEmphasisMarkSettings {
  rule: EmphasisMarkRule;
  aozoraMark: AozoraEmphasisMark;
  narouMarkText: string;
}

export type RubyMarkupRule = "aozora";

export interface ApplicationEditorRubyMarkupSettings {
  rule: RubyMarkupRule;
}

export interface ApplicationEditorSettings {
  fontFamily?: string;
  fontFamilyList?: FontFamilySetting[];
  lineEnding: ApplicationEditorLineEndingSettings;
  whitespace: ApplicationEditorWhitespaceSettings;
  paragraphIndent: ApplicationEditorParagraphIndentSettings;
  characterCount: ApplicationEditorCharacterCountSettings;
  undoHistoryMinDepth: UndoHistoryMinDepth;
  selectionHighlightMode: SelectionHighlightMode;
  findGutterMarkers: boolean;
  captureTabInEditor: boolean;
  fencedCodeIndentUnit: FencedCodeIndentUnit;
  emphasisMark?: ApplicationEditorEmphasisMarkSettings;
  ruby?: ApplicationEditorRubyMarkupSettings;
}

export type ImageAttachmentSaveDirectory = SettingValueOf<
  "imageAttachment.saveDirectory"
>;

// #407: clipboard image attachment. `saveDirectory` is a project-root-
// relative path (empty = not configured yet); `insertMarkdownLink` toggles
// whether a successful save is followed by a Markdown image link at the
// paste position. applicationWithProjectOverride: both are always concrete
// here (never sparse), and resolveEffectiveSettings applies the
// Project > Application > Built-in chain.
export interface ApplicationImageAttachmentSettings {
  saveDirectory: ImageAttachmentSaveDirectory;
  insertMarkdownLink: boolean;
}

// #424 Slice 7: glossary "近傍" (Nearby) relation search range.
// applicationWithProjectOverride — always concrete here (never sparse);
// resolveEffectiveSettings applies the Project > Application > Built-in chain.
export type SearchNearbyUnit = "characters" | "paragraphs";

export interface SearchNearbySettings {
  unit: SearchNearbyUnit;
  characterDistance: number;
  paragraphDistance: number;
}

export interface ApplicationSearchSettings {
  nearby: SearchNearbySettings;
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
  uiFontFamilyList?: FontFamilySetting[];
  // #266: sparse, like fontFamily — absence means "use the catalog default";
  // it is never eagerly written back as the default.
  notification?: WorkbenchNotificationSettings;
  // #446: sparse, like fontFamily/notification — absence means "use the
  // catalog default (true)"; it is never eagerly written back as the default.
  normalizeUnicodeToNfc?: boolean;
}

export interface ApplicationMarkdownFilesSettings {
  encoding: MarkdownFilesEncoding;
  lineEnding: MarkdownFilesLineEnding;
}

export interface ApplicationTextFilesSettings {
  enablePlainTextDocuments?: boolean;
  encoding: TextFilesEncoding;
  lineEnding: TextFilesLineEnding;
}

export interface ApplicationSettings {
  preview: ApplicationPreviewSettings;
  notification?: ApplicationNotificationSettings;
  workbench: ApplicationWorkbenchSettings;
  commandPalette: ApplicationCommandPaletteSettings;
  editor: ApplicationEditorSettings;
  search: ApplicationSearchSettings;
  markdownFiles: ApplicationMarkdownFilesSettings;
  textFiles: ApplicationTextFilesSettings;
  imageAttachment: ApplicationImageAttachmentSettings;
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
  search: ApplicationSearchSettings;
  markdownFiles: ApplicationMarkdownFilesSettings;
  textFiles: ApplicationTextFilesSettings;
  imageAttachment: ApplicationImageAttachmentSettings;
  documentMap: DocumentMapSettings;
}

export interface ProjectPreviewSettings {
  renderer?: PreviewRendererId;
  fontFamilyList?: FontFamilySetting[];
}

export interface ProjectWorkbenchSettings {
  uiFontFamilyList?: FontFamilySetting[];
}

export interface ProjectEditorParagraphIndentSettings {
  excludeLeadingCharacters?: ParagraphIndentExcludeLeadingCharacters;
}

export interface ProjectEditorCharacterCountExcludeSettings {
  whitespace?: boolean;
  lineBreaks?: boolean;
  headings?: boolean;
  markdownSyntax?: boolean;
  markdownComments?: boolean;
}

export interface ProjectEditorCharacterCountSettings {
  exclude?: ProjectEditorCharacterCountExcludeSettings;
}

export interface ProjectEditorLineEndingSettings {
  expected?: ExpectedLineEnding;
}

export interface ProjectEditorEmphasisMarkSettings {
  rule?: EmphasisMarkRule;
  aozoraMark?: AozoraEmphasisMark;
  narouMarkText?: string;
}

export interface ProjectEditorRubySettings {
  rule?: RubyMarkupRule;
}

export interface ProjectEditorSettings {
  fontFamily?: string;
  fontFamilyList?: FontFamilySetting[];
  paragraphIndent?: ProjectEditorParagraphIndentSettings;
  characterCount?: ProjectEditorCharacterCountSettings;
  lineEnding?: ProjectEditorLineEndingSettings;
  emphasisMark?: ProjectEditorEmphasisMarkSettings;
  ruby?: ProjectEditorRubySettings;
}

export interface ProjectMarkdownFilesSettings {
  lineEnding?: MarkdownFilesLineEnding;
}

export interface ProjectTextFilesSettings {
  lineEnding?: TextFilesLineEnding;
}

export interface ProjectDocumentMapSettings {
  dialogueDelimiterPairs?: readonly DocumentMapDialogueDelimiterPair[];
}

// #407: sparse project override — only the keys the project actually
// overrides are present, mirroring ProjectEditorSettings etc.
export interface ProjectImageAttachmentSettings {
  saveDirectory?: ImageAttachmentSaveDirectory;
  insertMarkdownLink?: boolean;
}

// #424 Slice 7: sparse project override — only the keys the project actually
// overrides are present, mirroring ProjectEditorSettings etc.
export interface ProjectSearchNearbySettings {
  unit?: SearchNearbyUnit;
  characterDistance?: number;
  paragraphDistance?: number;
}

export interface ProjectSearchSettings {
  nearby?: ProjectSearchNearbySettings;
}

export interface ProjectSettings {
  workbench?: ProjectWorkbenchSettings;
  editor?: ProjectEditorSettings;
  preview?: ProjectPreviewSettings;
  search?: ProjectSearchSettings;
  markdownFiles?: ProjectMarkdownFilesSettings;
  textFiles?: ProjectTextFilesSettings;
  imageAttachment?: ProjectImageAttachmentSettings;
  documentMap?: ProjectDocumentMapSettings;
}

export interface EffectivePreviewSettings {
  renderer: PreviewRendererId;
  updateDelayMs: number;
  fontFamilyList: FontFamilySetting[];
  syncScrollEditorToPreview: boolean;
  syncScrollPreviewToEditor: boolean;
  doubleClickJumpToEditor: boolean;
}

export interface EffectiveNotificationSettings {
  output: NotificationOutputSettings;
}

export interface EffectiveWorkbenchSettings {
  language: Language;
  statusBar: WorkbenchStatusBarSettings;
  sound: WorkbenchSoundSettings;
  fontFamily: string;
  uiFontFamilyList: FontFamilySetting[];
  notification: WorkbenchNotificationSettings;
  normalizeUnicodeToNfc: boolean;
}

export interface EffectiveCommandPaletteSettings {
  footerDetail: CommandPaletteFooterDetailSettings;
}

export interface EffectiveEditorSettings {
  fontFamily: string;
  fontFamilyList: FontFamilySetting[];
  lineEnding: ApplicationEditorLineEndingSettings;
  whitespace: ApplicationEditorWhitespaceSettings;
  paragraphIndent: ApplicationEditorParagraphIndentSettings;
  characterCount: ApplicationEditorCharacterCountSettings;
  undoHistoryMinDepth: UndoHistoryMinDepth;
  selectionHighlightMode: SelectionHighlightMode;
  findGutterMarkers: boolean;
  captureTabInEditor: boolean;
  fencedCodeIndentUnit: FencedCodeIndentUnit;
  emphasisMark: ApplicationEditorEmphasisMarkSettings;
  ruby: ApplicationEditorRubyMarkupSettings;
}

export interface EffectiveMarkdownFilesSettings {
  encoding: MarkdownFilesEncoding;
  lineEnding: MarkdownFilesLineEnding;
}

export interface EffectiveTextFilesSettings {
  enablePlainTextDocuments: boolean;
  encoding: TextFilesEncoding;
  lineEnding: TextFilesLineEnding;
}

// #407: always concrete after the Project > Application > Built-in chain.
export interface EffectiveImageAttachmentSettings {
  saveDirectory: ImageAttachmentSaveDirectory;
  insertMarkdownLink: boolean;
}

export interface EffectiveSettings {
  preview: EffectivePreviewSettings;
  notification: EffectiveNotificationSettings;
  workbench: EffectiveWorkbenchSettings;
  commandPalette: EffectiveCommandPaletteSettings;
  editor: EffectiveEditorSettings;
  /** #424 Slice 7: concrete after Project > Application > Built-in. */
  search: ApplicationSearchSettings;
  markdownFiles: EffectiveMarkdownFilesSettings;
  textFiles: EffectiveTextFilesSettings;
  imageAttachment: EffectiveImageAttachmentSettings;
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

// #424 Slice 7: catalog is the only source of truth for these defaults.
export const defaultSearchNearbySettings: SearchNearbySettings = {
  unit: getCatalogDefaultValue("search.nearby.unit"),
  characterDistance: getCatalogDefaultValue("search.nearby.characterDistance"),
  paragraphDistance: getCatalogDefaultValue("search.nearby.paragraphDistance")
};

export function cloneDefaultSearchSettings(): ApplicationSearchSettings {
  return { nearby: { ...defaultSearchNearbySettings } };
}

export const builtInDefaultSettings: EffectiveSettings = {
  preview: {
    renderer: defaultPreviewRenderer,
    updateDelayMs: defaultPreviewUpdateDelayMs,
    fontFamilyList: getCatalogDefaultValue("preview.fontFamilyList"),
    syncScrollEditorToPreview: getCatalogDefaultValue(
      "preview.syncScrollEditorToPreview"
    ),
    syncScrollPreviewToEditor: getCatalogDefaultValue(
      "preview.syncScrollPreviewToEditor"
    ),
    doubleClickJumpToEditor: getCatalogDefaultValue(
      "preview.doubleClickJumpToEditor"
    )
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
    uiFontFamilyList: getCatalogDefaultValue("workbench.uiFontFamilyList"),
    notification: {
      durationMs: getCatalogDefaultValue(
        "workbench.notification.durationMs"
      )
    },
    normalizeUnicodeToNfc: getCatalogDefaultValue(
      "workbench.normalizeUnicodeToNfc"
    )
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
    fontFamilyList: getCatalogDefaultValue("editor.fontFamilyList"),
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
    ),
    selectionHighlightMode: getCatalogDefaultValue(
      "editor.selectionHighlightMode"
    ),
    findGutterMarkers: getCatalogDefaultValue("editor.findGutterMarkers"),
    captureTabInEditor: getCatalogDefaultValue("editor.captureTabInEditor"),
    fencedCodeIndentUnit: getCatalogDefaultValue("editor.fencedCodeIndentUnit"),
    emphasisMark: {
      rule: getCatalogDefaultValue("editor.emphasisMark.rule"),
      aozoraMark: getCatalogDefaultValue("editor.emphasisMark.aozoraMark"),
      narouMarkText: getCatalogDefaultValue("editor.emphasisMark.narouMarkText")
    },
    ruby: {
      rule: getCatalogDefaultValue("editor.ruby.rule")
    }
  },
  search: cloneDefaultSearchSettings(),
  markdownFiles: {
    encoding: getCatalogDefaultValue("markdownFiles.encoding"),
    lineEnding: getCatalogDefaultValue("markdownFiles.lineEnding")
  },
  textFiles: {
    enablePlainTextDocuments: getCatalogDefaultValue(
      "textFiles.enablePlainTextDocuments"
    ),
    encoding: getCatalogDefaultValue("textFiles.encoding"),
    lineEnding: getCatalogDefaultValue("textFiles.lineEnding")
  },
  imageAttachment: {
    saveDirectory: getCatalogDefaultValue("imageAttachment.saveDirectory"),
    insertMarkdownLink: getCatalogDefaultValue(
      "imageAttachment.insertMarkdownLink"
    )
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
    updateDelayMs: builtInDefaultSettings.preview.updateDelayMs,
    syncScrollEditorToPreview:
      builtInDefaultSettings.preview.syncScrollEditorToPreview,
    syncScrollPreviewToEditor:
      builtInDefaultSettings.preview.syncScrollPreviewToEditor,
    doubleClickJumpToEditor:
      builtInDefaultSettings.preview.doubleClickJumpToEditor
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
    undoHistoryMinDepth: builtInDefaultSettings.editor.undoHistoryMinDepth,
    selectionHighlightMode:
      builtInDefaultSettings.editor.selectionHighlightMode,
    findGutterMarkers: builtInDefaultSettings.editor.findGutterMarkers,
    captureTabInEditor: builtInDefaultSettings.editor.captureTabInEditor,
    fencedCodeIndentUnit: builtInDefaultSettings.editor.fencedCodeIndentUnit,
    emphasisMark: {
      rule: builtInDefaultSettings.editor.emphasisMark.rule,
      aozoraMark: builtInDefaultSettings.editor.emphasisMark.aozoraMark,
      narouMarkText: builtInDefaultSettings.editor.emphasisMark.narouMarkText
    },
    ruby: {
      rule: builtInDefaultSettings.editor.ruby.rule
    }
  },
  search: cloneDefaultSearchSettings(),
  markdownFiles: {
    encoding: builtInDefaultSettings.markdownFiles.encoding,
    lineEnding: builtInDefaultSettings.markdownFiles.lineEnding
  },
  textFiles: {
    enablePlainTextDocuments:
      builtInDefaultSettings.textFiles.enablePlainTextDocuments,
    encoding: builtInDefaultSettings.textFiles.encoding,
    lineEnding: builtInDefaultSettings.textFiles.lineEnding
  },
  imageAttachment: {
    saveDirectory: builtInDefaultSettings.imageAttachment.saveDirectory,
    insertMarkdownLink:
      builtInDefaultSettings.imageAttachment.insertMarkdownLink
  },
  documentMap: defaultDocumentMapSettings(),
  recentProjects: []
};

export function createDefaultApplicationSettings(): ApplicationSettings {
  return {
    preview: {
      renderer: defaultApplicationSettings.preview.renderer,
      updateDelayMs: defaultApplicationSettings.preview.updateDelayMs,
      syncScrollEditorToPreview:
        defaultApplicationSettings.preview.syncScrollEditorToPreview,
      syncScrollPreviewToEditor:
        defaultApplicationSettings.preview.syncScrollPreviewToEditor,
      doubleClickJumpToEditor:
        defaultApplicationSettings.preview.doubleClickJumpToEditor
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
        defaultApplicationSettings.editor.undoHistoryMinDepth,
      selectionHighlightMode:
        defaultApplicationSettings.editor.selectionHighlightMode,
      findGutterMarkers: defaultApplicationSettings.editor.findGutterMarkers,
      captureTabInEditor: defaultApplicationSettings.editor.captureTabInEditor,
      fencedCodeIndentUnit:
        defaultApplicationSettings.editor.fencedCodeIndentUnit,
      emphasisMark: {
        rule:
          defaultApplicationSettings.editor.emphasisMark?.rule ?? "aozora",
        aozoraMark:
          defaultApplicationSettings.editor.emphasisMark?.aozoraMark ??
          "sesame",
        narouMarkText:
          defaultApplicationSettings.editor.emphasisMark?.narouMarkText ?? "・"
      }
    },
    search: cloneDefaultSearchSettings(),
    markdownFiles: {
      encoding: defaultApplicationSettings.markdownFiles.encoding,
      lineEnding: defaultApplicationSettings.markdownFiles.lineEnding
    },
    textFiles: {
      enablePlainTextDocuments:
        defaultApplicationSettings.textFiles.enablePlainTextDocuments,
      encoding: defaultApplicationSettings.textFiles.encoding,
      lineEnding: defaultApplicationSettings.textFiles.lineEnding
    },
    imageAttachment: {
      saveDirectory:
        defaultApplicationSettings.imageAttachment.saveDirectory,
      insertMarkdownLink:
        defaultApplicationSettings.imageAttachment.insertMarkdownLink
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
      updateDelayMs: applicationSettings.preview.updateDelayMs,
      fontFamilyList:
        projectSettings?.preview?.fontFamilyList ??
        applicationSettings.preview.fontFamilyList ??
        builtInDefaultSettings.preview.fontFamilyList,
      // #505 Phase 1: applicationOnly, like updateDelayMs above — no
      // project override.
      syncScrollEditorToPreview:
        applicationSettings.preview.syncScrollEditorToPreview,
      syncScrollPreviewToEditor:
        applicationSettings.preview.syncScrollPreviewToEditor,
      doubleClickJumpToEditor:
        applicationSettings.preview.doubleClickJumpToEditor
    },
    notification: {
      output: {
        enabled:
          applicationSettings.notification?.output.enabled ??
          builtInDefaultSettings.notification.output.enabled
      }
    },
    // Most workbench settings are applicationOnly (#173, #174). The
    // ADR-0015 UI font list is intentionally project-overridable, matching
    // the editor/preview list slots.
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
      uiFontFamilyList:
        projectSettings?.workbench?.uiFontFamilyList ??
        applicationSettings.workbench.uiFontFamilyList ??
        builtInDefaultSettings.workbench.uiFontFamilyList,
      // #266: applicationOnly, and sparse like fontFamily — fall through to
      // the catalog-backed default when settings.json omits it (or when the
      // read path rejected an invalid on-disk value).
      notification: {
        durationMs:
          applicationSettings.workbench.notification?.durationMs ??
          builtInDefaultSettings.workbench.notification.durationMs
      },
      // #446: applicationOnly, sparse like fontFamily/notification — fall
      // through to the catalog-backed default (true) when settings.json
      // omits it.
      normalizeUnicodeToNfc:
        applicationSettings.workbench.normalizeUnicodeToNfc ??
        builtInDefaultSettings.workbench.normalizeUnicodeToNfc
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
    // #396 Slice 3: editor.fontFamily resolution precedence:
    // Project override > Application Settings > Built-in default
    editor: {
      fontFamily:
        projectSettings?.editor?.fontFamily ??
        applicationSettings.editor.fontFamily ??
        builtInDefaultSettings.editor.fontFamily,
      fontFamilyList:
        projectSettings?.editor?.fontFamilyList ??
        applicationSettings.editor.fontFamilyList ??
        builtInDefaultSettings.editor.fontFamilyList,
      lineEnding: {
        expected:
          projectSettings?.editor?.lineEnding?.expected ??
          applicationSettings.editor.lineEnding.expected ??
          builtInDefaultSettings.editor.lineEnding.expected,
        markerGlyph: applicationSettings.editor.lineEnding.markerGlyph
      },
      whitespace: applicationSettings.editor.whitespace,
      paragraphIndent: {
        excludeLeadingCharacters:
          projectSettings?.editor?.paragraphIndent?.excludeLeadingCharacters ??
          applicationSettings.editor.paragraphIndent.excludeLeadingCharacters ??
          builtInDefaultSettings.editor.paragraphIndent.excludeLeadingCharacters
      },
      characterCount: {
        exclude: {
          whitespace:
            projectSettings?.editor?.characterCount?.exclude?.whitespace ??
            applicationSettings.editor.characterCount.exclude.whitespace ??
            builtInDefaultSettings.editor.characterCount.exclude.whitespace,
          lineBreaks:
            projectSettings?.editor?.characterCount?.exclude?.lineBreaks ??
            applicationSettings.editor.characterCount.exclude.lineBreaks ??
            builtInDefaultSettings.editor.characterCount.exclude.lineBreaks,
          headings:
            projectSettings?.editor?.characterCount?.exclude?.headings ??
            applicationSettings.editor.characterCount.exclude.headings ??
            builtInDefaultSettings.editor.characterCount.exclude.headings,
          markdownSyntax:
            projectSettings?.editor?.characterCount?.exclude?.markdownSyntax ??
            applicationSettings.editor.characterCount.exclude.markdownSyntax ??
            builtInDefaultSettings.editor.characterCount.exclude.markdownSyntax,
          markdownComments:
            projectSettings?.editor?.characterCount?.exclude?.markdownComments ??
            applicationSettings.editor.characterCount.exclude.markdownComments ??
            builtInDefaultSettings.editor.characterCount.exclude.markdownComments
        }
      },
      // #394 Step 1: applicationOnly, always concrete already — same
      // fallback-free pass-through as lineEnding/whitespace above.
      undoHistoryMinDepth: applicationSettings.editor.undoHistoryMinDepth,
      selectionHighlightMode: applicationSettings.editor.selectionHighlightMode,
      findGutterMarkers: applicationSettings.editor.findGutterMarkers,
      captureTabInEditor: applicationSettings.editor.captureTabInEditor,
      fencedCodeIndentUnit: applicationSettings.editor.fencedCodeIndentUnit,
      emphasisMark: {
        rule:
          projectSettings?.editor?.emphasisMark?.rule ??
          applicationSettings.editor.emphasisMark?.rule ??
          builtInDefaultSettings.editor.emphasisMark.rule,
        aozoraMark:
          projectSettings?.editor?.emphasisMark?.aozoraMark ??
          applicationSettings.editor.emphasisMark?.aozoraMark ??
          builtInDefaultSettings.editor.emphasisMark.aozoraMark,
        narouMarkText:
          projectSettings?.editor?.emphasisMark?.narouMarkText ??
          applicationSettings.editor.emphasisMark?.narouMarkText ??
          builtInDefaultSettings.editor.emphasisMark.narouMarkText
      },
      ruby: {
        rule:
          projectSettings?.editor?.ruby?.rule ??
          applicationSettings.editor.ruby?.rule ??
          builtInDefaultSettings.editor.ruby.rule
      }
    },
    // #424 Slice 7: nearby search range — Project override > Application >
    // Built-in, per key (the project override is sparse).
    search: {
      nearby: {
        unit:
          projectSettings?.search?.nearby?.unit ??
          applicationSettings.search.nearby.unit ??
          builtInDefaultSettings.search.nearby.unit,
        characterDistance:
          projectSettings?.search?.nearby?.characterDistance ??
          applicationSettings.search.nearby.characterDistance ??
          builtInDefaultSettings.search.nearby.characterDistance,
        paragraphDistance:
          projectSettings?.search?.nearby?.paragraphDistance ??
          applicationSettings.search.nearby.paragraphDistance ??
          builtInDefaultSettings.search.nearby.paragraphDistance
      }
    },
    markdownFiles: {
      encoding: applicationSettings.markdownFiles.encoding,
      lineEnding:
        projectSettings?.markdownFiles?.lineEnding ??
        applicationSettings.markdownFiles.lineEnding ??
        builtInDefaultSettings.markdownFiles.lineEnding
    },
    textFiles: {
      enablePlainTextDocuments:
        applicationSettings.textFiles?.enablePlainTextDocuments ??
        builtInDefaultSettings.textFiles.enablePlainTextDocuments,
      encoding: applicationSettings.textFiles.encoding,
      lineEnding:
        projectSettings?.textFiles?.lineEnding ??
        applicationSettings.textFiles.lineEnding ??
        builtInDefaultSettings.textFiles.lineEnding
    },
    // #407: both keys support the whole Project > Application > Built-in
    // override chain. `saveDirectory`'s built-in default is the empty string
    // (nullish-coalescing leaves an explicit "" from a lower layer intact —
    // an empty override is still "not configured").
    imageAttachment: {
      saveDirectory:
        projectSettings?.imageAttachment?.saveDirectory ??
        applicationSettings.imageAttachment.saveDirectory ??
        builtInDefaultSettings.imageAttachment.saveDirectory,
      insertMarkdownLink:
        projectSettings?.imageAttachment?.insertMarkdownLink ??
        applicationSettings.imageAttachment.insertMarkdownLink ??
        builtInDefaultSettings.imageAttachment.insertMarkdownLink
    },
    // #375 / #396: dialogueDelimiterPairs supports whole-array Project override
    // (no element-level merge; Project array > Application array > default).
    // The other 4 documentMap settings remain applicationOnly.
    documentMap: {
      ...applicationSettings.documentMap,
      dialogueDelimiterPairs:
        projectSettings?.documentMap?.dialogueDelimiterPairs !== undefined
          ? [...projectSettings.documentMap.dialogueDelimiterPairs]
          : applicationSettings.documentMap.dialogueDelimiterPairs
    }
  };
}

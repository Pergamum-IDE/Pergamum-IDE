import type { TranslationKey } from "../../shared/i18n";

export const USAGE_TOUR_TARGETS = {
  activityFiles: "activity-files",
  activitySearch: "activity-search",
  activityGlossary: "activity-glossary",
  activityDocumentMap: "activity-document-map",
  activityDocumentMetrics: "activity-document-metrics",
  toolbarCommandPalette: "toolbar-command-palette",
  toolbarImage: "toolbar-image",
  toolbarCallout: "toolbar-callout",
  toolbarMarkdownLinter: "toolbar-markdown-linter",
  toolbarJapaneseLinter: "toolbar-japanese-linter",
  toolbarPreview: "toolbar-preview",
  editorSurface: "editor-surface",
  previewSurface: "preview-surface"
} as const;

export type UsageTourTargetId =
  (typeof USAGE_TOUR_TARGETS)[keyof typeof USAGE_TOUR_TARGETS];

export type PreferredPlacement = "top" | "bottom" | "left" | "right";

export interface UsageTourStep {
  readonly id: string;
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  readonly targetId?: UsageTourTargetId;
  readonly preferredPlacement?: PreferredPlacement;
}

export interface RectLike {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface SizeLike {
  readonly width: number;
  readonly height: number;
}

export interface UsageTourPlacementResult {
  readonly balloonPosition: {
    readonly top: number;
    readonly left: number;
  };
  readonly arrowPlacement: "top" | "bottom" | "left" | "right" | "none";
  readonly spotlightRect: RectLike | null;
}

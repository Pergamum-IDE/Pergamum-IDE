import { USAGE_TOUR_TARGETS, type UsageTourStep } from "./usageTourTypes";

export const USAGE_TOUR_STEPS: readonly UsageTourStep[] = [
  {
    id: "welcome",
    titleKey: "usageTour.step.welcome.title",
    bodyKey: "usageTour.step.welcome.body"
  },
  {
    id: "fileExplorer",
    titleKey: "usageTour.step.fileExplorer.title",
    bodyKey: "usageTour.step.fileExplorer.body",
    targetId: USAGE_TOUR_TARGETS.activityFiles,
    preferredPlacement: "right"
  },
  {
    id: "search",
    titleKey: "usageTour.step.search.title",
    bodyKey: "usageTour.step.search.body",
    targetId: USAGE_TOUR_TARGETS.activitySearch,
    preferredPlacement: "right"
  },
  {
    id: "glossary",
    titleKey: "usageTour.step.glossary.title",
    bodyKey: "usageTour.step.glossary.body",
    targetId: USAGE_TOUR_TARGETS.activityGlossary,
    preferredPlacement: "right"
  },
  {
    id: "documentMap",
    titleKey: "usageTour.step.documentMap.title",
    bodyKey: "usageTour.step.documentMap.body",
    targetId: USAGE_TOUR_TARGETS.activityDocumentMap,
    preferredPlacement: "right"
  },
  {
    id: "documentMetrics",
    titleKey: "usageTour.step.documentMetrics.title",
    bodyKey: "usageTour.step.documentMetrics.body",
    targetId: USAGE_TOUR_TARGETS.activityDocumentMetrics,
    preferredPlacement: "right"
  },
  {
    id: "commandPalette",
    titleKey: "usageTour.step.commandPalette.title",
    bodyKey: "usageTour.step.commandPalette.body",
    targetId: USAGE_TOUR_TARGETS.toolbarCommandPalette,
    preferredPlacement: "bottom"
  },
  {
    id: "insertImage",
    titleKey: "usageTour.step.insertImage.title",
    bodyKey: "usageTour.step.insertImage.body",
    targetId: USAGE_TOUR_TARGETS.toolbarImage,
    preferredPlacement: "bottom"
  },
  {
    id: "callout",
    titleKey: "usageTour.step.callout.title",
    bodyKey: "usageTour.step.callout.body",
    targetId: USAGE_TOUR_TARGETS.toolbarCallout,
    preferredPlacement: "bottom"
  },
  {
    id: "markdownLinter",
    titleKey: "usageTour.step.markdownLinter.title",
    bodyKey: "usageTour.step.markdownLinter.body",
    targetId: USAGE_TOUR_TARGETS.toolbarMarkdownLinter,
    preferredPlacement: "bottom"
  },
  {
    id: "japaneseLinter",
    titleKey: "usageTour.step.japaneseLinter.title",
    bodyKey: "usageTour.step.japaneseLinter.body",
    targetId: USAGE_TOUR_TARGETS.toolbarJapaneseLinter,
    preferredPlacement: "bottom"
  },
  {
    id: "preview",
    titleKey: "usageTour.step.preview.title",
    bodyKey: "usageTour.step.preview.body",
    targetId: USAGE_TOUR_TARGETS.toolbarPreview,
    preferredPlacement: "bottom"
  },
  {
    id: "completed",
    titleKey: "usageTour.step.completed.title",
    bodyKey: "usageTour.step.completed.body"
  }
];

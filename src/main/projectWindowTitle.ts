import type { ProjectAccessMode } from "../shared/api";
import {
  defaultLanguage,
  t,
  type Language,
  type TranslationKey
} from "../shared/i18n";

export type ProjectWindowTitleStatus = { kind: "readOnly" };

export interface ProjectWindowTitleInput {
  readonly projectName: string | null;
  readonly titleStatus: ProjectWindowTitleStatus | null;
  readonly language?: Language;
}

export interface ProjectWindowTitleTarget {
  setTitle(title: string): void;
}

type ProjectWindowTitleSubject =
  | {
      kind: "projectName";
      text: string;
    }
  | {
      kind: "defaultSuffix";
      text: string;
    };

function titleTranslation(
  language: Language,
  key: TranslationKey
): string {
  return t(language, key);
}

export function projectWindowTitleDefaultSuffix(
  language: Language = defaultLanguage
): string {
  return titleTranslation(language, "windowTitle.defaultSuffix");
}

export function projectWindowTitleStatusFromAccessMode(
  accessMode: ProjectAccessMode
): ProjectWindowTitleStatus | null {
  if (accessMode.kind === "readOnly") {
    return { kind: "readOnly" };
  }

  return null;
}

export function projectWindowTitleStatusText(
  titleStatus: ProjectWindowTitleStatus,
  language: Language = defaultLanguage
): string {
  switch (titleStatus.kind) {
    case "readOnly":
      return titleTranslation(language, "windowTitle.status.readOnly");
  }
}

function projectWindowTitleSubject(
  projectName: string | null,
  language: Language
): ProjectWindowTitleSubject {
  const displayProjectName =
    typeof projectName === "string" && projectName.trim().length > 0
      ? projectName
      : null;

  if (displayProjectName) {
    return {
      kind: "projectName",
      text: displayProjectName
    };
  }

  return {
    kind: "defaultSuffix",
    text: projectWindowTitleDefaultSuffix(language)
  };
}

export function createProjectWindowTitle({
  projectName,
  titleStatus,
  language = defaultLanguage
}: ProjectWindowTitleInput): string {
  const subject = projectWindowTitleSubject(projectName, language);

  if (!titleStatus) {
    const trailingSeparator =
      subject.kind === "defaultSuffix" ? "-" : " -";
    return `Pergamum - ${subject.text}${trailingSeparator}`;
  }

  const statusText = projectWindowTitleStatusText(titleStatus, language);
  return `Pergamum - ${subject.text} - [${statusText}]`;
}

export const defaultProjectWindowTitle = createProjectWindowTitle({
  projectName: null,
  titleStatus: null,
  language: defaultLanguage
});

import projectIconRaw from "../../assets/icons/codicons/tips/project.svg?raw";
import fileIconRaw from "../../assets/icons/codicons/tips/file.svg?raw";
import commandIconRaw from "../../assets/icons/codicons/tips/terminal.svg?raw";
import editorIconRaw from "../../assets/icons/codicons/tips/edit-sparkle.svg?raw";
import viewIconRaw from "../../assets/icons/codicons/tips/layout-sidebar-left-off.svg?raw";
import searchIconRaw from "../../assets/icons/codicons/tips/search.svg?raw";
import glossaryIconRaw from "../../assets/icons/codicons/tips/book.svg?raw";
import exportIconRaw from "../../assets/icons/codicons/tips/export.svg?raw";
import recoveryIconRaw from "../../assets/icons/svgrepo/tips/recovery.svg?raw";
import helpIconRaw from "../../assets/icons/codicons/tips/question.svg?raw";
import externalIconRaw from "../../assets/icons/codicons/tips/open-in-window.svg?raw";

import closeIconRaw from "../../assets/icons/codicons/tips/close.svg?raw";
import arrowLeftIconRaw from "../../assets/icons/codicons/tips/arrow-left.svg?raw";
import arrowRightIconRaw from "../../assets/icons/codicons/tips/arrow-right.svg?raw";

export const WELCOME_TIP_ICONS: Record<string, string> = {
  project: projectIconRaw,
  file: fileIconRaw,
  command: commandIconRaw,
  editor: editorIconRaw,
  view: viewIconRaw,
  search: searchIconRaw,
  glossary: glossaryIconRaw,
  export: exportIconRaw,
  recovery: recoveryIconRaw,
  help: helpIconRaw,
  external: externalIconRaw
};

export const FALLBACK_TIP_ICON_RAW = helpIconRaw;

export function getWelcomeTipIconRaw(iconName: string): string {
  return WELCOME_TIP_ICONS[iconName] ?? FALLBACK_TIP_ICON_RAW;
}

export { closeIconRaw, arrowLeftIconRaw, arrowRightIconRaw };

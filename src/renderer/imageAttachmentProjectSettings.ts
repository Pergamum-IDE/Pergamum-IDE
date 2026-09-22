import type { UpdateProjectSettingsRequest } from "../shared/api";
import {
  builtInDefaultSettings,
  type ApplicationSettings,
  type EffectiveImageAttachmentSettings,
  type ProjectSettings
} from "../shared/settings";

export interface BuildImageAttachmentProjectSettingsRequestInput {
  readonly nextSettings: EffectiveImageAttachmentSettings;
  readonly applicationSettings: ApplicationSettings;
  readonly projectSettings?: ProjectSettings;
}

function inheritedImageAttachmentSettings(
  applicationSettings: ApplicationSettings
): EffectiveImageAttachmentSettings {
  return {
    saveDirectory:
      applicationSettings.imageAttachment.saveDirectory ??
      builtInDefaultSettings.imageAttachment.saveDirectory
  };
}

export function buildImageAttachmentPasteProjectSettingsRequest({
  nextSettings,
  applicationSettings,
  projectSettings
}: BuildImageAttachmentProjectSettingsRequestInput): UpdateProjectSettingsRequest | null {
  if (nextSettings.saveDirectory.trim().length === 0) {
    return null;
  }

  const inherited = inheritedImageAttachmentSettings(applicationSettings);
  const committedSaveDirectory =
    projectSettings?.imageAttachment?.saveDirectory;

  const set: Record<string, unknown> = {};
  const remove: string[] = [];

  if (nextSettings.saveDirectory === inherited.saveDirectory) {
    if (committedSaveDirectory !== undefined) {
      remove.push("imageAttachment.saveDirectory");
    }
  } else if (nextSettings.saveDirectory !== committedSaveDirectory) {
    set["imageAttachment.saveDirectory"] = nextSettings.saveDirectory;
  }

  if (Object.keys(set).length === 0 && remove.length === 0) {
    return null;
  }

  return {
    ...(Object.keys(set).length > 0 ? { set } : {}),
    ...(remove.length > 0 ? { remove } : {})
  };
}

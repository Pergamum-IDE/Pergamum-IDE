import { describe, expect, it } from "vitest";
import { defaultApplicationSettings } from "../../src/shared/settings";
import { buildImageAttachmentPasteProjectSettingsRequest } from "../../src/renderer/imageAttachmentProjectSettings";

describe("image attachment paste Project Settings override request (#407 B4)", () => {
  it("sets saveDirectory when it differs from inherited application settings", () => {
    const request = buildImageAttachmentPasteProjectSettingsRequest({
      nextSettings: {
        saveDirectory: "assets/images"
      },
      applicationSettings: defaultApplicationSettings,
      projectSettings: undefined
    });

    expect(request).toEqual({
      set: {
        "imageAttachment.saveDirectory": "assets/images"
      }
    });
  });

  it("removes project overrides when prompt values match inherited settings", () => {
    const request = buildImageAttachmentPasteProjectSettingsRequest({
      nextSettings: {
        saveDirectory: "assets/images"
      },
      applicationSettings: {
        ...defaultApplicationSettings,
        imageAttachment: {
          saveDirectory: "assets/images"
        }
      },
      projectSettings: {
        imageAttachment: {
          saveDirectory: "old"
        }
      }
    });

    expect(request).toEqual({
      remove: ["imageAttachment.saveDirectory"]
    });
  });

  it("returns null when the normalized prompt values are already committed", () => {
    const request = buildImageAttachmentPasteProjectSettingsRequest({
      nextSettings: {
        saveDirectory: "assets/images"
      },
      applicationSettings: defaultApplicationSettings,
      projectSettings: {
        imageAttachment: {
          saveDirectory: "assets/images"
        }
      }
    });

    expect(request).toBeNull();
  });

  it("does not create an override request for an empty PastePrompt save directory", () => {
    const request = buildImageAttachmentPasteProjectSettingsRequest({
      nextSettings: {
        saveDirectory: ""
      },
      applicationSettings: defaultApplicationSettings,
      projectSettings: undefined
    });

    expect(request).toBeNull();
  });
});

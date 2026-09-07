import { describe, expect, it } from "vitest";
import { defaultApplicationSettings } from "../../src/shared/settings";
import { buildImageAttachmentPasteProjectSettingsRequest } from "../../src/renderer/imageAttachmentProjectSettings";

describe("image attachment paste Project Settings override request (#407 B4)", () => {
  it("sets saveDirectory and insertMarkdownLink when they differ from inherited application settings", () => {
    const request = buildImageAttachmentPasteProjectSettingsRequest({
      nextSettings: {
        saveDirectory: "assets/images",
        insertMarkdownLink: false
      },
      applicationSettings: defaultApplicationSettings,
      projectSettings: undefined
    });

    expect(request).toEqual({
      set: {
        "imageAttachment.saveDirectory": "assets/images",
        "imageAttachment.insertMarkdownLink": false
      }
    });
  });

  it("removes project overrides when prompt values match inherited settings", () => {
    const request = buildImageAttachmentPasteProjectSettingsRequest({
      nextSettings: {
        saveDirectory: "assets/images",
        insertMarkdownLink: false
      },
      applicationSettings: {
        ...defaultApplicationSettings,
        imageAttachment: {
          saveDirectory: "assets/images",
          insertMarkdownLink: false
        }
      },
      projectSettings: {
        imageAttachment: {
          saveDirectory: "old",
          insertMarkdownLink: true
        }
      }
    });

    expect(request).toEqual({
      remove: [
        "imageAttachment.saveDirectory",
        "imageAttachment.insertMarkdownLink"
      ]
    });
  });

  it("returns null when the normalized prompt values are already committed", () => {
    const request = buildImageAttachmentPasteProjectSettingsRequest({
      nextSettings: {
        saveDirectory: "assets/images",
        insertMarkdownLink: false
      },
      applicationSettings: defaultApplicationSettings,
      projectSettings: {
        imageAttachment: {
          saveDirectory: "assets/images",
          insertMarkdownLink: false
        }
      }
    });

    expect(request).toBeNull();
  });

  it("does not create an override request for an empty PastePrompt save directory", () => {
    const request = buildImageAttachmentPasteProjectSettingsRequest({
      nextSettings: {
        saveDirectory: "",
        insertMarkdownLink: true
      },
      applicationSettings: defaultApplicationSettings,
      projectSettings: undefined
    });

    expect(request).toBeNull();
  });
});

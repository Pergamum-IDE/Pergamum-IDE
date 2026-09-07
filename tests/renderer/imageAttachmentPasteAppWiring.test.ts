import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/renderer/App.tsx", "utf8");
const editorSurfaceSource = readFileSync(
  "src/renderer/EditorSurface.tsx",
  "utf8"
);

describe("image attachment paste App wiring (#407 B4)", () => {
  it("connects MarkdownEditor paste results to App orchestration and the save IPC", () => {
    expect(appSource).toContain("runImageAttachmentPasteOrchestration");
    expect(appSource).toContain("handleImageAttachmentPaste");
    expect(appSource).toContain("window.pergamum.imageAttachment.save");
    expect(appSource).toContain("buildImageAttachmentWarningDialogOptions");
    expect(appSource).toContain(
      "buildImageAttachmentSettingsSaveFailedWarningDialogOptions"
    );
    expect(appSource).toContain("applyChangesToCachedMarkdownEditorDocumentState");
    expect(appSource).toContain("clearPendingImageAttachmentPosition");
    expect(appSource).toContain("<SaveDestinationDialog");
    expect(appSource).toContain('mode="pastePrompt"');
    expect(appSource).toContain("saveImageAttachmentProjectSettingsFromPrompt");
  });

  it("threads the B3 paste callback and position controller through EditorSurface to MarkdownEditor", () => {
    expect(appSource).toContain("onImageAttachmentPaste={");
    expect(appSource).toContain("onImageAttachmentPositionControllerChange={");
    expect(appSource).toContain("imageAttachmentSourceDocumentId={");
    expect(appSource).toContain("imageAttachmentSourceEditorId={");

    expect(editorSurfaceSource).toContain(
      "onImageAttachmentPaste?: MarkdownImageAttachmentPasteHandler"
    );
    expect(editorSurfaceSource).toContain(
      "onImageAttachmentPositionControllerChange?:"
    );
    expect(editorSurfaceSource).toContain(
      "onImageAttachmentPaste={onImageAttachmentPaste}"
    );
    expect(editorSurfaceSource).toContain(
      "imageAttachmentSourceDocumentId={imageAttachmentSourceDocumentId}"
    );
  });
});

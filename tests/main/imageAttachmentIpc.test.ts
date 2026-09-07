import { describe, expect, it, vi } from "vitest";
import {
  IMAGE_ATTACHMENT_CHANNELS,
  type SaveImageAttachmentPayload,
  type SaveImageAttachmentResult
} from "../../src/shared/api";
import type { SaveImageAttachmentStorageResult } from "../../src/shared/imageAttachmentSaveResult";
import {
  registerImageAttachmentIpc,
  type ImageAttachmentIpcDeps
} from "../../src/main/imageAttachmentIpc";

describe("registerImageAttachmentIpc (#407 B2)", () => {
  function createHarness(overrides: ImageAttachmentIpcDeps = {}) {
    const handlers = new Map<string, (event: any, payload: unknown) => Promise<SaveImageAttachmentResult>>();
    const mockIpcMain = {
      handle: vi.fn((channel: string, listener: any) => {
        handlers.set(channel, listener);
      })
    };
    const mockProjectRoot = vi.fn<() => string | null>(() => "/projects/my-novel");
    const mockSaveImageAttachment = vi.fn<
      (req: any) => Promise<SaveImageAttachmentStorageResult>
    >(async (req) => ({
      ok: true,
      fileName: "image.png",
      relativePath: `${req.saveDirectory}/image.png`,
      format: "png",
      byteLength: req.bytes.length
    }));

    registerImageAttachmentIpc({
      ipcMain: mockIpcMain,
      currentProjectRootPath: overrides.currentProjectRootPath ?? mockProjectRoot,
      saveImageAttachment: overrides.saveImageAttachment ?? mockSaveImageAttachment
    });

    const handler = handlers.get(IMAGE_ATTACHMENT_CHANNELS.save);
    expect(handler).toBeDefined();

    return {
      handler: handler!,
      mockProjectRoot,
      mockSaveImageAttachment,
      mockIpcMain
    };
  }

  it("registers on IMAGE_ATTACHMENT_CHANNELS.save", () => {
    const { mockIpcMain } = createHarness();
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      IMAGE_ATTACHMENT_CHANNELS.save,
      expect.any(Function)
    );
  });

  it("returns projectNotOpen when currentProjectRootPath returns null", async () => {
    const { handler } = createHarness({
      currentProjectRootPath: () => null
    });

    const result = await handler({} as any, {
      saveDirectory: "assets",
      bytes: new Uint8Array([1, 2, 3]),
      reportedMimeType: "image/png"
    });

    expect(result).toEqual({ ok: false, reason: "projectNotOpen" });
  });

  it("rejects malformed payloads with invalidPath", async () => {
    const { handler, mockSaveImageAttachment } = createHarness();

    const invalidPayloads = [
      null,
      undefined,
      "not an object",
      123,
      {},
      { saveDirectory: "assets" },
      { saveDirectory: "assets", bytes: [1, 2, 3], reportedMimeType: "image/png" }, // not Uint8Array
      { saveDirectory: 123, bytes: new Uint8Array([1]), reportedMimeType: "image/png" },
      { saveDirectory: "assets", bytes: new Uint8Array([1]), reportedMimeType: 123 }
    ];

    for (const payload of invalidPayloads) {
      const result = await handler({} as any, payload);
      expect(result).toEqual({ ok: false, reason: "invalidPath" });
    }

    expect(mockSaveImageAttachment).not.toHaveBeenCalled();
  });

  it("resolves project root authoritatively and ignores renderer-supplied projectRootPath", async () => {
    const { handler, mockSaveImageAttachment } = createHarness({
      currentProjectRootPath: () => "/authoritative/project"
    });

    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const payloadWithSpoofedRoot = {
      projectRootPath: "/attacker/spoofed/path",
      saveDirectory: "attachments",
      bytes,
      reportedMimeType: "image/png"
    };

    const result = await handler({} as any, payloadWithSpoofedRoot);

    expect(result.ok).toBe(true);
    expect(mockSaveImageAttachment).toHaveBeenCalledWith({
      projectRootPath: "/authoritative/project",
      saveDirectory: "attachments",
      bytes,
      reportedMimeType: "image/png"
    });
  });

  it("propagates failure reasons from saveImageAttachment (e.g. protectedLocation, diskFull)", async () => {
    const { handler } = createHarness({
      saveImageAttachment: async () => ({
        ok: false,
        reason: "protectedLocation"
      })
    });

    const result = await handler({} as any, {
      saveDirectory: ".pergamum",
      bytes: new Uint8Array([1, 2, 3]),
      reportedMimeType: "image/png"
    });

    expect(result).toEqual({
      ok: false,
      reason: "protectedLocation"
    });
  });
});

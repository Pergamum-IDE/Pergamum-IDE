import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOSSARY_CHANNELS } from "../../src/shared/api";
import { GlossaryValidationError } from "../../src/shared/glossary";
import { projectDatabaseFileName } from "../../src/main/projectDatabase";

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  showMessageBox: vi.fn()
}));

vi.mock("electron", () => ({
  // #375: the delete confirmation is a Pergamum renderer dialog now — the
  // main process must never open a native message box. `dialog` is still
  // stubbed here purely so an accidental regression is caught.
  dialog: { showMessageBox: electronMock.showMessageBox },
  ipcMain: { handle: electronMock.handle }
}));

import {
  createGlossaryIpcHandlers,
  registerGlossaryIpc
} from "../../src/main/glossaryIpc";

const missingEntryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abc";

describe("glossary IPC (#375)", () => {
  let projectRootPath: string;
  let activeProjectFilePath: string;

  beforeEach(async () => {
    electronMock.handle.mockClear();
    electronMock.showMessageBox.mockReset();
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-glossary-ipc-")
    );
    activeProjectFilePath = path.join(projectRootPath, projectDatabaseFileName);
  });

  afterEach(async () => {
    await fs.rm(projectRootPath, { recursive: true, force: true });
  });

  function handlers() {
    return createGlossaryIpcHandlers(() => activeProjectFilePath);
  }

  it("registers every glossary IPC channel including the tag layer", () => {
    registerGlossaryIpc();

    expect(
      electronMock.handle.mock.calls.map(([channel]) => channel)
    ).toEqual([
      GLOSSARY_CHANNELS.create,
      GLOSSARY_CHANNELS.getById,
      GLOSSARY_CHANNELS.list,
      GLOSSARY_CHANNELS.update,
      GLOSSARY_CHANNELS.delete,
      GLOSSARY_CHANNELS.listTags,
      GLOSSARY_CHANNELS.createTag,
      GLOSSARY_CHANNELS.updateTag,
      GLOSSARY_CHANNELS.deleteTag
    ]);
  });

  it("runs entry + atom + tag operations against the current project database", async () => {
    const api = handlers();

    const tag = await api.createTag({
      label: "地名",
      description: null,
      backgroundRgb: "#123456",
      foregroundRgb: "#ffffff"
    });
    expect(await api.listTags()).toEqual([tag]);

    const created = await api.create({
      description: "王国の首都",
      atoms: [
        { value: "王都アルセリア", matchFlags: 0 },
        { value: "アルセリア", matchFlags: 2 }
      ],
      tagIds: [tag.id]
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(created.atoms.map((a) => a.value)).toEqual([
      "王都アルセリア",
      "アルセリア"
    ]);
    expect(created.tags.map((t) => t.id)).toEqual([tag.id]);

    await expect(api.getById({ id: created.id })).resolves.toEqual(created);
    await expect(api.list()).resolves.toEqual([created]);

    const updated = await api.update({
      id: created.id,
      description: "改稿後",
      atoms: [{ value: "王都アルセリア", matchFlags: 0 }],
      tagIds: []
    });
    expect(updated).toMatchObject({ id: created.id, description: "改稿後" });
    expect(updated.tags).toEqual([]);

    await expect(api.delete({ id: created.id })).resolves.toEqual({
      deleted: true
    });
    await expect(api.getById({ id: created.id })).resolves.toBeNull();
    expect(electronMock.showMessageBox).not.toHaveBeenCalled();
  });

  it("requires an active project before accessing glossary data", async () => {
    const api = createGlossaryIpcHandlers(() => {
      throw new Error("No project is currently open.");
    });

    await expect(api.list()).rejects.toThrow("No project is currently open.");
    await expect(api.listTags()).rejects.toThrow(
      "No project is currently open."
    );
  });

  it("rejects invalid input through the shared validation model", async () => {
    const api = handlers();

    await expect(
      api.create({ description: "", atoms: [], tagIds: [] })
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    await expect(
      api.createTag({
        label: " ",
        description: null,
        backgroundRgb: "#123456",
        foregroundRgb: "#ffffff"
      })
    ).rejects.toBeInstanceOf(GlossaryValidationError);
  });

  it("hard-deletes a tag without opening any native dialog", async () => {
    const api = handlers();
    const tag = await api.createTag({
      label: "武将",
      description: null,
      backgroundRgb: "#123456",
      foregroundRgb: "#ffffff"
    });

    await expect(api.deleteTag({ id: tag.id })).resolves.toEqual({
      deleted: true
    });
    expect(await api.listTags()).toEqual([]);
    expect(electronMock.showMessageBox).not.toHaveBeenCalled();
  });

  it("treats deleting an already-missing entry / tag as idempotent success", async () => {
    const api = handlers();

    await expect(api.delete({ id: missingEntryId })).resolves.toEqual({
      deleted: true
    });
    await expect(api.deleteTag({ id: missingEntryId })).resolves.toEqual({
      deleted: true
    });
    expect(electronMock.showMessageBox).not.toHaveBeenCalled();
  });

  it("rejects a delete request with a malformed id", async () => {
    const api = handlers();

    await expect(api.delete({ id: 123 })).rejects.toThrow();
    await expect(api.deleteTag({})).rejects.toThrow();
  });
});

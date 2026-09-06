import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as atomicWriteModule from "../../src/main/atomicFileWrite";
import {
  loadProjectConfig,
  readProjectConfig,
  saveProjectSettings,
  projectConfigFileName
} from "../../src/main/projectConfigStore";
import {
  currentProjectConfig,
  currentProjectRawConfigSnapshot,
  currentProjectAccessMode,
  saveCurrentProjectSettings,
  closeCurrentProject,
  openProjectByFilePath,
  confirmReadOnlyProjectOpen,
  type ProjectWriteOwnershipManager
} from "../../src/main/projectIpc";
import {
  createProjectDatabase,
  readProjectMetadata
} from "../../src/main/projectDatabase";

describe("Project Settings persistence foundation (#396 Slice 2)", () => {
  let workDir = "";

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-settings-test-"));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  describe("projectConfigStore load/read", () => {
    it("returns null when pergamum.json is missing", async () => {
      const result = await loadProjectConfig(workDir);
      expect(result).toBeNull();

      const config = await readProjectConfig(workDir);
      expect(config).toBeNull();
    });

    it("throws when pergamum.json is malformed JSON", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      await fs.writeFile(configPath, "{ not-valid-json", "utf8");

      await expect(loadProjectConfig(workDir)).rejects.toThrow(
        /Invalid pergamum\.json/
      );
    });

    it("throws when pergamum.json is not an object", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      await fs.writeFile(configPath, '"hello"', "utf8");

      await expect(loadProjectConfig(workDir)).rejects.toThrow(
        /Invalid pergamum\.json: expected a JSON object/
      );
    });

    it("loads flat dotted keys and preserves unknown root fields in rawSnapshot", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      const raw = {
        name: "Test Novel",
        customProp: 42,
        extraSection: { foo: "bar" },
        settings: {
          "preview.renderer": "markdown"
        }
      };
      await fs.writeFile(configPath, JSON.stringify(raw, null, 2), "utf8");

      const loaded = await loadProjectConfig(workDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.config.name).toBe("Test Novel");
      expect(loaded?.config.settings?.preview?.renderer).toBe("markdown");

      // Verify rawSnapshot preserves unknown fields
      expect(loaded?.rawSnapshot.name).toBe("Test Novel");
      expect(loaded?.rawSnapshot.customProp).toBe(42);
      expect(loaded?.rawSnapshot.extraSection).toEqual({ foo: "bar" });
    });

    it("omits applicationOnly keys from parsed config without failing project open (S-23)", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      const raw = {
        name: "Test Novel",
        settings: {
          "preview.renderer": "markdown",
          "workbench.fontFamily": "Courier",
          "preview.updateDelayMs": 500
        }
      };
      await fs.writeFile(configPath, JSON.stringify(raw, null, 2), "utf8");

      const loaded = await loadProjectConfig(workDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.config.settings?.preview?.renderer).toBe("markdown");
      expect(
        (loaded?.config.settings as Record<string, unknown>)[
          "workbench.fontFamily"
        ]
      ).toBeUndefined();
      expect(
        (loaded?.config.settings as Record<string, unknown>)[
          "preview.updateDelayMs"
        ]
      ).toBeUndefined();
    });

    it("loads editor.fontFamily from pergamum.json into parsed ProjectSettings", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      const raw = {
        name: "Font Test Novel",
        settings: {
          "editor.fontFamily": "Yu Mincho"
        }
      };
      await fs.writeFile(configPath, JSON.stringify(raw, null, 2), "utf8");

      const loaded = await loadProjectConfig(workDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.config.settings?.editor?.fontFamily).toBe("Yu Mincho");
      expect(loaded?.rawSnapshot.settings).toEqual({
        "editor.fontFamily": "Yu Mincho"
      });
    });

    it("omits invalid editor.fontFamily value without failing project open (S-23)", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      const raw = {
        name: "Invalid Font Novel",
        settings: {
          "editor.fontFamily": 12345
        }
      };
      await fs.writeFile(configPath, JSON.stringify(raw, null, 2), "utf8");

      const loaded = await loadProjectConfig(workDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.config.settings).toBeUndefined();
    });

    it("loads falsy overrides (empty string and boolean false) and enum values from pergamum.json without dropping them", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      const raw = {
        name: "Falsy Test Novel",
        settings: {
          "editor.paragraphIndent.excludeLeadingCharacters": "",
          "editor.characterCount.exclude.whitespace": false,
          "editor.characterCount.exclude.lineBreaks": false,
          "editor.characterCount.exclude.headings": false,
          "editor.characterCount.exclude.markdownSyntax": false,
          "editor.characterCount.exclude.markdownComments": false,
          "editor.lineEnding.expected": "crlf",
          "files.newFile.lineEnding": "lf"
        }
      };
      await fs.writeFile(configPath, JSON.stringify(raw, null, 2), "utf8");

      const loaded = await loadProjectConfig(workDir);
      expect(loaded).not.toBeNull();
      expect(
        loaded?.config.settings?.editor?.paragraphIndent
          ?.excludeLeadingCharacters
      ).toBe("");
      expect(
        loaded?.config.settings?.editor?.characterCount?.exclude?.whitespace
      ).toBe(false);
      expect(
        loaded?.config.settings?.editor?.characterCount?.exclude?.lineBreaks
      ).toBe(false);
      expect(
        loaded?.config.settings?.editor?.characterCount?.exclude?.headings
      ).toBe(false);
      expect(
        loaded?.config.settings?.editor?.characterCount?.exclude?.markdownSyntax
      ).toBe(false);
      expect(
        loaded?.config.settings?.editor?.characterCount?.exclude
          ?.markdownComments
      ).toBe(false);
      expect(loaded?.config.settings?.editor?.lineEnding?.expected).toBe(
        "crlf"
      );
      expect(loaded?.config.settings?.files?.newFile?.lineEnding).toBe("lf");
    });

    it("loads documentMap.dialogueDelimiterPairs (including empty array []) from pergamum.json", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      const raw = {
        name: "Dialogue Pairs Test",
        settings: {
          "documentMap.dialogueDelimiterPairs": [
            { open: "“", close: "”", color: "#61afef" }
          ]
        }
      };
      await fs.writeFile(configPath, JSON.stringify(raw, null, 2), "utf8");

      const loaded = await loadProjectConfig(workDir);
      expect(loaded).not.toBeNull();
      expect(
        loaded?.config.settings?.documentMap?.dialogueDelimiterPairs
      ).toEqual([{ open: "“", close: "”", color: "#61afef" }]);

      // Test empty array []
      const rawEmpty = {
        name: "Empty Pairs Test",
        settings: {
          "documentMap.dialogueDelimiterPairs": []
        }
      };
      await fs.writeFile(configPath, JSON.stringify(rawEmpty, null, 2), "utf8");

      const loadedEmpty = await loadProjectConfig(workDir);
      expect(loadedEmpty).not.toBeNull();
      expect(
        loadedEmpty?.config.settings?.documentMap?.dialogueDelimiterPairs
      ).toEqual([]);
    });

    it("ignores invalid documentMap.dialogueDelimiterPairs (ADR-0006 S-23) without failing project load", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      const raw = {
        name: "Corrupt Dialogue Pairs",
        settings: {
          "editor.fontFamily": "Valid Font",
          "documentMap.dialogueDelimiterPairs": "not an array"
        }
      };
      await fs.writeFile(configPath, JSON.stringify(raw, null, 2), "utf8");

      const loaded = await loadProjectConfig(workDir);
      expect(loaded).not.toBeNull();
      // Valid setting is loaded:
      expect(loaded?.config.settings?.editor?.fontFamily).toBe("Valid Font");
      // Corrupted setting is ignored:
      expect(
        loaded?.config.settings?.documentMap?.dialogueDelimiterPairs
      ).toBeUndefined();
    });
  });

  describe("projectConfigStore saveProjectSettings", () => {
    it("saves editor.fontFamily override and removes it cleanly with absence", async () => {
      const saveResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: null,
        request: {
          set: { "editor.fontFamily": "Yu Mincho" }
        }
      });

      expect(saveResult.updatedSettings?.editor?.fontFamily).toBe("Yu Mincho");
      expect(saveResult.config.settings?.editor?.fontFamily).toBe("Yu Mincho");

      const configPath = path.join(workDir, projectConfigFileName);
      const savedDisk = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(savedDisk.settings).toEqual({
        "editor.fontFamily": "Yu Mincho"
      });

      // Remove override
      const removeResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: saveResult.rawSnapshot,
        request: {
          remove: ["editor.fontFamily"]
        }
      });

      expect(removeResult.updatedSettings).toBeUndefined();
      expect(removeResult.config.settings).toBeUndefined();

      const removedDisk = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(removedDisk.settings).toBeUndefined();
    });

    it("saves and updates falsy overrides (false, empty string) and enum settings, preserving other overrides", async () => {
      const initialSave = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: null,
        request: {
          set: {
            "editor.paragraphIndent.excludeLeadingCharacters": "",
            "editor.characterCount.exclude.whitespace": false,
            "editor.lineEnding.expected": "crlf",
            "files.newFile.lineEnding": "lf"
          }
        }
      });

      expect(
        initialSave.updatedSettings?.editor?.paragraphIndent
          ?.excludeLeadingCharacters
      ).toBe("");
      expect(
        initialSave.updatedSettings?.editor?.characterCount?.exclude?.whitespace
      ).toBe(false);
      expect(initialSave.updatedSettings?.editor?.lineEnding?.expected).toBe(
        "crlf"
      );
      expect(initialSave.updatedSettings?.files?.newFile?.lineEnding).toBe("lf");

      const configPath = path.join(workDir, projectConfigFileName);
      const onDisk = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(onDisk.settings).toEqual({
        "editor.paragraphIndent.excludeLeadingCharacters": "",
        "editor.characterCount.exclude.whitespace": false,
        "editor.lineEnding.expected": "crlf",
        "files.newFile.lineEnding": "lf"
      });

      // Now remove one key, update another
      const secondSave = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: initialSave.rawSnapshot,
        request: {
          set: {
            "editor.characterCount.exclude.whitespace": true
          },
          remove: ["editor.lineEnding.expected"]
        }
      });

      expect(
        secondSave.updatedSettings?.editor?.paragraphIndent
          ?.excludeLeadingCharacters
      ).toBe("");
      expect(
        secondSave.updatedSettings?.editor?.characterCount?.exclude?.whitespace
      ).toBe(true);
      expect(
        secondSave.updatedSettings?.editor?.lineEnding?.expected
      ).toBeUndefined();
      expect(secondSave.updatedSettings?.files?.newFile?.lineEnding).toBe("lf");

      const onDiskAfter = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(onDiskAfter.settings).toEqual({
        "editor.paragraphIndent.excludeLeadingCharacters": "",
        "editor.characterCount.exclude.whitespace": true,
        "files.newFile.lineEnding": "lf"
      });
    });

    it("saves and removes documentMap.dialogueDelimiterPairs array override", async () => {
      const pairs = [{ open: "「", close: "」", color: "#e06c75" }];
      const saveResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: null,
        request: {
          set: { "documentMap.dialogueDelimiterPairs": pairs }
        }
      });

      expect(
        saveResult.updatedSettings?.documentMap?.dialogueDelimiterPairs
      ).toEqual(pairs);

      const configPath = path.join(workDir, projectConfigFileName);
      const savedDisk = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(savedDisk.settings).toEqual({
        "documentMap.dialogueDelimiterPairs": pairs
      });

      // Remove override
      const removeResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: saveResult.rawSnapshot,
        request: {
          remove: ["documentMap.dialogueDelimiterPairs"]
        }
      });

      expect(removeResult.updatedSettings).toBeUndefined();
      const removedDisk = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(removedDisk.settings).toBeUndefined();
    });

    it("creates pergamum.json from null rawSnapshot with sparse flat dotted keys", async () => {
      const saveResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: null,
        request: {
          set: { "preview.renderer": "markdown" }
        }
      });

      expect(saveResult.updatedSettings?.preview?.renderer).toBe("markdown");
      expect(saveResult.config.settings?.preview?.renderer).toBe("markdown");

      const configPath = path.join(workDir, projectConfigFileName);
      const content = await fs.readFile(configPath, "utf8");
      expect(content.endsWith("\n")).toBe(true);

      const parsed = JSON.parse(content);
      expect(parsed).toEqual({
        settings: {
          "preview.renderer": "markdown"
        }
      });
    });

    it("preserves existing unknown root fields and updates settings atomically", async () => {
      const initialSnapshot = {
        name: "My Project",
        customRootField: 123,
        settings: {
          "preview.renderer": "markdown"
        }
      };

      const saveResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: initialSnapshot,
        request: {
          set: { "preview.renderer": "markdown" }
        }
      });

      expect(saveResult.rawSnapshot.name).toBe("My Project");
      expect(saveResult.rawSnapshot.customRootField).toBe(123);

      const configPath = path.join(workDir, projectConfigFileName);
      const content = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe("My Project");
      expect(parsed.customRootField).toBe(123);
      expect(parsed.settings).toEqual({ "preview.renderer": "markdown" });
    });

    it("removes setting override via property absence and NEVER writes null (property absence = inherit)", async () => {
      const initialSnapshot = {
        name: "My Project",
        settings: {
          "preview.renderer": "markdown"
        }
      };

      const saveResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: initialSnapshot,
        request: {
          remove: ["preview.renderer"]
        }
      });

      expect(saveResult.updatedSettings).toBeUndefined();
      expect(saveResult.config.settings).toBeUndefined();

      const configPath = path.join(workDir, projectConfigFileName);
      const content = await fs.readFile(configPath, "utf8");

      // Verify null is NOT present anywhere
      expect(content).not.toContain("null");
      expect(content).not.toContain("preview.renderer");

      const parsed = JSON.parse(content);
      expect(parsed.name).toBe("My Project");
      expect(parsed.settings).toBeUndefined();
    });

    it("maintains sparsity: does not write untouched or default settings into pergamum.json", async () => {
      const saveResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: { name: "Sparse Project" },
        request: {
          set: { "preview.renderer": "markdown" }
        }
      });

      const configPath = path.join(workDir, projectConfigFileName);
      const parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(Object.keys(parsed.settings)).toEqual(["preview.renderer"]);
    });

    it("persists documentMap.dialogueDelimiterPairs with normalized lowercase #rrggbb hex colors", async () => {
      const saveResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: null,
        request: {
          set: {
            "documentMap.dialogueDelimiterPairs": [
              { open: "「", close: "」", color: "#FFF" },
              { open: "『", close: "』", color: "#ABCDEF" }
            ]
          }
        }
      });

      expect(saveResult.updatedSettings?.documentMap?.dialogueDelimiterPairs).toEqual([
        { open: "「", close: "」", color: "#ffffff" },
        { open: "『", close: "』", color: "#abcdef" }
      ]);

      const configPath = path.join(workDir, projectConfigFileName);
      const content = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.settings["documentMap.dialogueDelimiterPairs"]).toEqual([
        { open: "「", close: "」", color: "#ffffff" },
        { open: "『", close: "』", color: "#abcdef" }
      ]);
    });

    it("persists empty array [] for documentMap.dialogueDelimiterPairs", async () => {
      const saveResult = await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: null,
        request: {
          set: {
            "documentMap.dialogueDelimiterPairs": []
          }
        }
      });

      expect(saveResult.updatedSettings?.documentMap?.dialogueDelimiterPairs).toEqual([]);

      const configPath = path.join(workDir, projectConfigFileName);
      const content = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.settings["documentMap.dialogueDelimiterPairs"]).toEqual([]);
    });

    it("rejects unknown setting key in set", async () => {
      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            set: { "invalid.key.name": "something" }
          }
        })
      ).rejects.toThrow(/Unknown setting key: "invalid\.key\.name"\./);
    });

    it("rejects unknown setting key in remove", async () => {
      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            remove: ["invalid.key.name"]
          }
        })
      ).rejects.toThrow(/Unknown setting key: "invalid\.key\.name"\./);
    });

    it("rejects applicationOnly setting key in set", async () => {
      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            set: { "preview.updateDelayMs": 300 }
          }
        })
      ).rejects.toThrow(
        /Setting "preview\.updateDelayMs" cannot be overridden at project scope\./
      );

      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            set: { "workbench.fontFamily": "Consolas" }
          }
        })
      ).rejects.toThrow(
        /Setting "workbench\.fontFamily" cannot be overridden at project scope\./
      );
    });

    it("rejects applicationOnly setting key in remove", async () => {
      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            remove: ["workbench.fontFamily"]
          }
        })
      ).rejects.toThrow(
        /Setting "workbench\.fontFamily" cannot be overridden at project scope\./
      );
    });

    it("rejects invalid setting values (enum, type mismatch, null) in set", async () => {
      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            set: { "preview.renderer": "unsupported-renderer" }
          }
        })
      ).rejects.toThrow(/Invalid value for setting "preview\.renderer": enumValue\./);

      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            set: { "preview.renderer": 123 }
          }
        })
      ).rejects.toThrow(/Invalid value for setting "preview\.renderer": typeMismatch\./);

      // null must be rejected as invalid value for preview.renderer
      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            set: { "preview.renderer": null }
          }
        })
      ).rejects.toThrow(/Invalid value for setting "preview\.renderer": typeMismatch\./);
    });

    it("rejects ambiguous request when the same key appears in both set and remove", async () => {
      await expect(
        saveProjectSettings({
          rootPath: workDir,
          rawSnapshot: null,
          request: {
            set: { "preview.renderer": "markdown" },
            remove: ["preview.renderer"]
          }
        })
      ).rejects.toThrow(
        /Ambiguous update settings request: key "preview\.renderer" cannot appear in both "set" and "remove"\./
      );
    });

    it("does not re-read or detect external disk changes between open and save", async () => {
      const configPath = path.join(workDir, projectConfigFileName);
      const initialDisk = {
        name: "Initial Name",
        settings: { "preview.renderer": "markdown" }
      };
      await fs.writeFile(configPath, JSON.stringify(initialDisk), "utf8");

      const loaded = await loadProjectConfig(workDir);
      expect(loaded).not.toBeNull();

      // Externally modify pergamum.json on disk (simulating external edit)
      await fs.writeFile(
        configPath,
        JSON.stringify({
          name: "External Modified Name",
          externalField: "surprise"
        }),
        "utf8"
      );

      // Save via in-memory snapshot
      await saveProjectSettings({
        rootPath: workDir,
        rawSnapshot: loaded!.rawSnapshot,
        request: {
          set: { "preview.renderer": "markdown" }
        }
      });

      // Verification: The external change was overwritten by the in-memory snapshot,
      // confirming per PO decision that external edits during session are NOT re-read or merged.
      const savedContent = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(savedContent.name).toBe("Initial Name");
      expect(savedContent.externalField).toBeUndefined();
    });
  });

  describe("projectIpc saveCurrentProjectSettings guards", () => {
    it("rejects when no project is open", async () => {
      await closeCurrentProject();

      await expect(
        saveCurrentProjectSettings({
          set: { "preview.renderer": "markdown" }
        })
      ).rejects.toThrow(/No project is currently open\./);
    });

    it("saves settings and updates in-memory state when project is open in readWrite mode", async () => {
      const projectFilePath = path.join(workDir, "readwrite.pergamum");
      const db = await createProjectDatabase({
        projectFilePath,
        projectName: "Test Novel"
      });
      const metadata = await readProjectMetadata(db);
      await db.close();

      const readWriteOwnershipManager: ProjectWriteOwnershipManager = {
        acquire: async () => ({ kind: "owned" }),
        release: async () => {}
      };

      const openResult = await openProjectByFilePath(
        projectFilePath,
        metadata.projectId,
        undefined,
        readWriteOwnershipManager
      );
      expect(openResult.kind).toBe("opened");

      const saved = await saveCurrentProjectSettings({
        set: { "preview.renderer": "markdown" }
      });
      expect(saved?.preview?.renderer).toBe("markdown");
      expect(currentProjectConfig()?.settings?.preview?.renderer).toBe("markdown");
      expect(currentProjectRawConfigSnapshot()?.settings).toEqual({
        "preview.renderer": "markdown"
      });

      // Remove override: verify property absence in memory and on disk
      const removed = await saveCurrentProjectSettings({
        remove: ["preview.renderer"]
      });
      expect(removed).toBeUndefined();
      expect(currentProjectConfig()?.settings).toBeUndefined();
      expect(currentProjectRawConfigSnapshot()?.settings).toBeUndefined();

      const configPath = path.join(workDir, projectConfigFileName);
      const onDisk = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(onDisk.settings).toBeUndefined();

      await closeCurrentProject();
    });

    it("does not mutate committed in-memory state if writeFileAtomic fails (Invariant A)", async () => {
      const projectFilePath = path.join(workDir, "atomic-fail.pergamum");
      const db = await createProjectDatabase({
        projectFilePath,
        projectName: "Atomic Fail Novel"
      });
      const metadata = await readProjectMetadata(db);
      await db.close();

      const readWriteOwnershipManager: ProjectWriteOwnershipManager = {
        acquire: async () => ({ kind: "owned" }),
        release: async () => {}
      };

      const openResult = await openProjectByFilePath(
        projectFilePath,
        metadata.projectId,
        undefined,
        readWriteOwnershipManager
      );
      expect(openResult.kind).toBe("opened");

      // Set initial settings successfully
      await saveCurrentProjectSettings({
        set: { "preview.renderer": "markdown" }
      });
      const configBefore = currentProjectConfig();
      const snapshotBefore = currentProjectRawConfigSnapshot();
      expect(configBefore?.settings?.preview?.renderer).toBe("markdown");

      // Spy on writeFileAtomic to simulate disk write failure
      const spy = vi
        .spyOn(atomicWriteModule, "writeFileAtomic")
        .mockRejectedValueOnce(new Error("Disk write failed: ENOSPC"));

      await expect(
        saveCurrentProjectSettings({
          remove: ["preview.renderer"]
        })
      ).rejects.toThrow("Disk write failed: ENOSPC");

      // In-memory state must remain untouched
      expect(currentProjectConfig()).toEqual(configBefore);
      expect(currentProjectRawConfigSnapshot()).toEqual(snapshotBefore);
      expect(currentProjectConfig()?.settings?.preview?.renderer).toBe("markdown");

      spy.mockRestore();
      await closeCurrentProject();
    });

    it("rejects when project is opened in readOnly mode", async () => {
      const projectFilePath = path.join(workDir, "readonly.pergamum");
      const db = await createProjectDatabase({
        projectFilePath,
        projectName: "Readonly Novel"
      });
      const metadata = await readProjectMetadata(db);
      await db.close();

      const readonlyOwnershipManager: ProjectWriteOwnershipManager = {
        acquire: async () => ({
          kind: "unavailable",
          reason: "lockUnavailable",
          lockOwner: null
        }),
        release: async () => {}
      };

      const openResult = await openProjectByFilePath(
        projectFilePath,
        metadata.projectId,
        undefined,
        readonlyOwnershipManager
      );
      expect(openResult.kind).toBe("opened");
      if (openResult.kind === "opened" && openResult.result && "token" in openResult.result) {
        await confirmReadOnlyProjectOpen({ token: openResult.result.token });
      }

      expect(currentProjectAccessMode()?.kind).toBe("readOnly");

      await expect(
        saveCurrentProjectSettings({
          set: { "preview.renderer": "markdown" }
        })
      ).rejects.toThrow(/Cannot save settings for a read-only project\./);

      await closeCurrentProject();
    });

    it("serializes concurrent saveCurrentProjectSettings calls without lost updates", async () => {
      const projectFilePath = path.join(workDir, "concurrent.pergamum");
      const db = await createProjectDatabase({
        projectFilePath,
        projectName: "Concurrent Novel"
      });
      const metadata = await readProjectMetadata(db);
      await db.close();

      const readWriteOwnershipManager: ProjectWriteOwnershipManager = {
        acquire: async () => ({ kind: "owned" }),
        release: async () => {}
      };

      const openResult = await openProjectByFilePath(
        projectFilePath,
        metadata.projectId,
        undefined,
        readWriteOwnershipManager
      );
      expect(openResult.kind).toBe("opened");

      // Launch two concurrent save requests without awaiting the first one
      const [res1, res2] = await Promise.all([
        saveCurrentProjectSettings({
          set: { "editor.fontFamily": "Consolas, monospace" }
        }),
        saveCurrentProjectSettings({
          set: { "preview.renderer": "markdown" }
        })
      ]);

      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
      expect(res1?.editor?.fontFamily).toBe("Consolas, monospace");
      expect(res2?.editor?.fontFamily).toBe("Consolas, monospace");
      expect(res2?.preview?.renderer).toBe("markdown");

      const finalConfig = currentProjectConfig();
      expect(finalConfig?.settings?.editor?.fontFamily).toBe("Consolas, monospace");
      expect(finalConfig?.settings?.preview?.renderer).toBe("markdown");

      await closeCurrentProject();
    });

    it("ensures a failed save does not poison the queue for subsequent saves", async () => {
      const projectFilePath = path.join(workDir, "poison-guard.pergamum");
      const db = await createProjectDatabase({
        projectFilePath,
        projectName: "Poison Guard Novel"
      });
      const metadata = await readProjectMetadata(db);
      await db.close();

      const readWriteOwnershipManager: ProjectWriteOwnershipManager = {
        acquire: async () => ({ kind: "owned" }),
        release: async () => {}
      };

      const openResult = await openProjectByFilePath(
        projectFilePath,
        metadata.projectId,
        undefined,
        readWriteOwnershipManager
      );
      expect(openResult.kind).toBe("opened");

      // Spy on atomicWrite to fail the first write
      const spy = vi
        .spyOn(atomicWriteModule, "writeFileAtomic")
        .mockRejectedValueOnce(new Error("Disk error on first save"));

      // First save fails
      await expect(
        saveCurrentProjectSettings({
          set: { "editor.fontFamily": "FaultyFont" }
        })
      ).rejects.toThrow("Disk error on first save");

      // Subsequent save must succeed and not be poisoned by the previous failure
      const subsequentResult = await saveCurrentProjectSettings({
        set: { "preview.renderer": "markdown" }
      });

      expect(subsequentResult).toBeDefined();
      expect(subsequentResult?.preview?.renderer).toBe("markdown");
      expect(subsequentResult?.editor?.fontFamily).toBeUndefined();

      const finalConfig = currentProjectConfig();
      expect(finalConfig?.settings?.preview?.renderer).toBe("markdown");
      expect(finalConfig?.settings?.editor?.fontFamily).toBeUndefined();

      spy.mockRestore();
      await closeCurrentProject();
    });
  });
});

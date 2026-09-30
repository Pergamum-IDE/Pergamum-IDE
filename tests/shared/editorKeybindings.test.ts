import { describe, expect, it } from "vitest";
import {
  keybindingCommands,
  resolveEditorKeybindings,
  normalizeKeybindingKey,
  type PergamumPlatform
} from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

describe("resolveEditorKeybindings (#641)", () => {
  it.each(platforms)("%s: only customizable editor-scope Pergamum keys", (platform) => {
    const bindings = resolveEditorKeybindings(platform);
    expect(bindings.length).toBeGreaterThan(0);
    for (const binding of bindings) {
      expect(binding.scope, binding.command).toBe("editor");
      expect(binding.source, binding.command).toBe("pergamum");
      expect(binding.readonly, binding.command).toBe(false);
      expect(binding.key, binding.command).not.toBeNull();
    }
  });

  it("excludes nativeRole / standard / app / pane commands", () => {
    const commands = new Set(
      resolveEditorKeybindings("win32").map((b) => b.command)
    );
    for (const command of keybindingCommands) {
      if (command.scope !== "editor" || command.source !== "pergamum") {
        expect(commands.has(command.id), command.id).toBe(false);
      }
    }
  });

  it("includes the Markdown / find / glossary / tab capture commands", () => {
    const commands = new Set(
      resolveEditorKeybindings("win32").map((b) => b.command)
    );
    for (const id of [
      "editor.markdown.bold",
      "editor.markdown.italic",
      "editor.markdown.link",
      "editor.markdown.insertRuby",
      "editor.markdown.insertEmphasisMark",
      "editor.find.open",
      "editor.find.replace.open",
      "glossary.entry.openFromSelection",
      "glossary.completion.open",
      "editor.tabCapture.toggle"
    ]) {
      expect(commands.has(id), id).toBe(true);
    }
  });

  it("omits entries whose key is unassigned on the platform", () => {
    // No default key at all for the list commands.
    for (const platform of platforms) {
      const commands = resolveEditorKeybindings(platform).map((b) => b.command);
      expect(commands).not.toContain("editor.markdown.list.ordered");
    }
  });

  it("preserves command metadata", () => {
    const bold = resolveEditorKeybindings("linux").find(
      (b) => b.command === "editor.markdown.bold"
    );
    expect(bold).toMatchObject({
      key: "Mod-b",
      when: "editorFocus && markdownDocument && !readOnly",
      handlerStatus: "registered"
    });
  });

  it.each(platforms)("%s: no duplicate key among editor bindings", (platform) => {
    const seen = new Map<string, string>();
    for (const binding of resolveEditorKeybindings(platform)) {
      const normalized = normalizeKeybindingKey(binding.key as string) as string;
      expect(seen.get(normalized), `${normalized} ${binding.command}`).toBeUndefined();
      seen.set(normalized, binding.command);
    }
  });
});

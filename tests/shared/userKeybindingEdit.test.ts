import { describe, expect, it } from "vitest";
import {
  applyKeybindingEdit,
  resolveEffectiveKeybindings,
  type KeybindingEditRequest,
  type PergamumPlatform,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";

function edit(
  platform: PergamumPlatform,
  entries: UserKeybindingEntry[],
  request: KeybindingEditRequest
) {
  return applyKeybindingEdit({ platform, entries, request });
}

function ok(result: ReturnType<typeof edit>): UserKeybindingEntry[] {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.reason}`);
  }
  return result.entries;
}

function assigned(
  platform: PergamumPlatform,
  entries: UserKeybindingEntry[],
  command: string
): string[] {
  return resolveEffectiveKeybindings({ platform, userEntries: entries })
    .keybindings.filter((row) => row.command === command && row.key !== null)
    .map((row) => row.key as string);
}

describe("change (#647)", () => {
  it("a default binding: appends an unbind of the old key and a positive new key", () => {
    const entries = ok(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "Mod-Alt-9"
      })
    );
    expect(entries).toEqual([
      { key: "Mod-b", command: "-editor.markdown.bold" },
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
    expect(assigned("win32", entries, "editor.markdown.bold")).toEqual(["Mod-Alt-9"]);
  });

  it("only the targeted alias changes (palette F1 -> Mod-Alt-9, Mod-p stays)", () => {
    const entries = ok(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "workbench.commandPalette.open", key: "F1", origin: "default" },
        newKey: "Mod-Alt-9"
      })
    );
    expect(assigned("win32", entries, "workbench.commandPalette.open")).toEqual([
      "Mod-p",
      "Mod-Alt-9"
    ]);
  });

  it("a user binding: rewrites that positive entry in place", () => {
    const start: UserKeybindingEntry[] = [
      { key: "Mod-Alt-8", command: "editor.markdown.bold" },
      { key: "Mod-Alt-7", command: "editor.markdown.italic" }
    ];
    const entries = ok(
      edit("win32", start, {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-Alt-8", origin: "user" },
        newKey: "Mod-Alt-9"
      })
    );
    expect(entries).toEqual([
      { key: "Mod-Alt-9", command: "editor.markdown.bold" },
      { key: "Mod-Alt-7", command: "editor.markdown.italic" }
    ]);
    expect(assigned("win32", entries, "editor.markdown.bold")).toEqual(["Mod-b", "Mod-Alt-9"]);
  });

  it("an unassigned row: adds a positive entry; an unbound default stays unbound", () => {
    const start: UserKeybindingEntry[] = [{ key: "Mod-p", command: "-workbench.commandPalette.open" }];
    const entries = ok(
      edit("win32", start, {
        kind: "change",
        target: {
          commandId: "workbench.commandPalette.open",
          key: null,
          origin: "default",
          defaultKey: "Mod-p"
        },
        newKey: "Mod-Alt-9"
      })
    );
    expect(entries).toEqual([...start, { key: "Mod-Alt-9", command: "workbench.commandPalette.open" }]);
    expect(assigned("win32", entries, "workbench.commandPalette.open")).toEqual(["F1", "Mod-Alt-9"]);
  });

  it("a command with no default at all (unassigned) gets the key", () => {
    const entries = ok(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "workspace.keyboardShortcuts.open", key: null, origin: "default" },
        newKey: "Mod-Alt-9"
      })
    );
    expect(assigned("win32", entries, "workspace.keyboardShortcuts.open")).toEqual(["Mod-Alt-9"]);
  });

  it("normalizes an uppercase letter and rejects unsupported notation", () => {
    const entries = ok(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "Mod-Alt-F"
      })
    );
    expect(entries.at(-1)).toEqual({ key: "Mod-Alt-f", command: "editor.markdown.bold" });
    const bad = edit("win32", [], {
      kind: "change",
      target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
      newKey: "Ctrl+Space"
    });
    expect(bad).toMatchObject({ ok: false, reason: "unsupported" });
  });

  it("changing to the same key is a no-op", () => {
    expect(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "Mod-b"
      })
    ).toMatchObject({ ok: false, reason: "noop" });
  });
});

describe("conflicts (#647)", () => {
  it("rejects a key already used in the same scope, with the conflicting command's details", () => {
    const result = edit("win32", [], {
      kind: "change",
      target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
      newKey: "Mod-i"
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: {
        key: "Mod-i",
        keyLabel: "Ctrl+I",
        commandId: "editor.markdown.italic",
        title: "Italic",
        category: "Markdown",
        scope: "editor"
      }
    });
  });

  it("rejects a key used by a native role or a standard behavior, even in another scope (Undo, Copy)", () => {
    for (const key of ["Mod-z", "Mod-c", "Mod-/"]) {
      const result = edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: key
      });
      expect(result, key).toMatchObject({ ok: false, reason: "conflict" });
    }
    const undo = edit("win32", [], {
      kind: "change",
      target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
      newKey: "Mod-z"
    });
    expect(undo.ok === false && undo.conflict?.commandId).toBe("editor.undo");
  });

  it("an app-scope command conflicts with any scope; an editor command conflicts with app scope", () => {
    // editor.document.rename owns F2 (editor scope); an app command cannot take it.
    expect(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.saveAll", key: "Mod-Alt-s", origin: "default" },
        newKey: "F2"
      })
    ).toMatchObject({ ok: false, reason: "conflict" });
    // Mod-s is Save (app scope): an editor command cannot take it.
    expect(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "Mod-s"
      })
    ).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("pane and editor scopes may share a key (context separated by focus)", () => {
    // Mod-b is Bold (editor scope); a pane command may use it too.
    const result = edit("win32", [], {
      kind: "change",
      target: { commandId: "workspace.files.delete", key: "Delete", origin: "default" },
      newKey: "Mod-b"
    });
    expect(result.ok).toBe(true);
  });

  it("an editor-scope command cannot be bound to a bare typing key", () => {
    for (const key of ["b", "Delete", "Enter", "Shift-ArrowLeft"]) {
      expect(
        edit("win32", [], {
          kind: "change",
          target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
          newKey: key
        }),
        key
      ).toMatchObject({ ok: false, reason: "unsupported" });
    }
    // An F-key is fine.
    expect(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "F9"
      }).ok
    ).toBe(true);
  });

  it("the old key of the row being changed is free for the new key's check (swap-safe)", () => {
    // Move bold from Mod-b to Mod-Alt-9, then italic onto the now-free Mod-b.
    const first = ok(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "Mod-Alt-9"
      })
    );
    const second = edit("win32", first, {
      kind: "change",
      target: { commandId: "editor.markdown.italic", key: "Mod-i", origin: "default" },
      newKey: "Mod-b"
    });
    expect(second.ok).toBe(true);
  });

  it("Ctrl and Mod are the same physical key off macOS", () => {
    expect(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "Ctrl-i"
      })
    ).toMatchObject({ ok: false, reason: "conflict" });
  });
});

describe("reserved keys (#647)", () => {
  it.each(["F5", "Mod-Shift-r", "Mod-F5", "Shift-F5"])("rejects %s", (key) => {
    const result = edit("win32", [], {
      kind: "change",
      target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
      newKey: key
    });
    expect(result).toMatchObject({ ok: false, reason: "reserved" });
  });

  it("rejects Mod-r for any command but Ruby, allows it for Ruby", () => {
    // A pane command: nothing in its scope owns Mod-r, so the reserved rule decides.
    expect(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "workspace.files.cut", key: "Mod-x", origin: "default" },
        newKey: "Mod-r"
      })
    ).toMatchObject({ ok: false, reason: "reserved" });

    // Ruby may move away and come back to Mod-r.
    const away = applyKeybindingEdit({
      platform: "win32",
      entries: [],
      request: {
        kind: "change",
        target: { commandId: "editor.markdown.insertRuby", key: "Mod-r", origin: "default" },
        newKey: "Mod-Alt-9"
      }
    });
    expect(away.ok).toBe(true);
    if (away.ok) {
      const back = applyKeybindingEdit({
        platform: "win32",
        entries: away.entries,
        request: {
          kind: "change",
          target: { commandId: "editor.markdown.insertRuby", key: "Mod-Alt-9", origin: "user" },
          newKey: "Mod-r"
        }
      });
      expect(back.ok).toBe(true);
    }
  });

  it("rejects darwin forbidden and native-only keys", () => {
    for (const key of ["Mod-Shift-3", "Mod-Tab", "Mod-q", "Mod-h"]) {
      const result = edit("darwin", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: key
      });
      expect(result.ok, key).toBe(false);
    }
  });
});

describe("unbind (#647)", () => {
  it("a default binding: appends an unbind entry; only that alias goes", () => {
    const entries = ok(
      edit("win32", [], {
        kind: "unbind",
        target: { commandId: "workbench.commandPalette.open", key: "F1", origin: "default" }
      })
    );
    expect(entries).toEqual([{ key: "F1", command: "-workbench.commandPalette.open" }]);
    expect(assigned("win32", entries, "workbench.commandPalette.open")).toEqual(["Mod-p"]);
  });

  it("a user binding: removes its positive entry", () => {
    const start: UserKeybindingEntry[] = [
      { key: "Mod-Alt-9", command: "editor.markdown.bold" },
      { key: "Mod-Alt-8", command: "editor.markdown.italic" }
    ];
    const entries = ok(
      edit("win32", start, {
        kind: "unbind",
        target: { commandId: "editor.markdown.bold", key: "Mod-Alt-9", origin: "user" }
      })
    );
    expect(entries).toEqual([{ key: "Mod-Alt-8", command: "editor.markdown.italic" }]);
  });

  it("does not duplicate an existing unbind entry", () => {
    const start: UserKeybindingEntry[] = [{ key: "F1", command: "-workbench.commandPalette.open" }];
    const again = edit("win32", start, {
      kind: "unbind",
      target: { commandId: "workbench.commandPalette.open", key: "F1", origin: "default" }
    });
    // F1 is already unbound, so the row no longer exists.
    expect(again).toMatchObject({ ok: false, reason: "stale" });
  });

  it("an unassigned row has nothing to unbind", () => {
    expect(
      edit("win32", [], {
        kind: "unbind",
        target: { commandId: "workspace.keyboardShortcuts.open", key: null, origin: "default" }
      })
    ).toMatchObject({ ok: false, reason: "noop" });
  });
});

describe("reset (#647)", () => {
  it("a user binding: removes that positive entry, nothing else", () => {
    const start: UserKeybindingEntry[] = [
      { key: "Mod-b", command: "-editor.markdown.bold" },
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ];
    const entries = ok(
      edit("win32", start, {
        kind: "reset",
        target: { commandId: "editor.markdown.bold", key: "Mod-Alt-9", origin: "user" }
      })
    );
    expect(entries).toEqual([{ key: "Mod-b", command: "-editor.markdown.bold" }]);
  });

  it("an unbound default row: removes the matching unbind so the default comes back", () => {
    const start: UserKeybindingEntry[] = [
      { key: "F1", command: "-workbench.commandPalette.open" },
      { key: "Mod-k", command: "-editor.markdown.link" }
    ];
    const entries = ok(
      edit("win32", start, {
        kind: "reset",
        target: {
          commandId: "workbench.commandPalette.open",
          key: null,
          origin: "default",
          defaultKey: "F1"
        }
      })
    );
    expect(entries).toEqual([{ key: "Mod-k", command: "-editor.markdown.link" }]);
    expect(assigned("win32", entries, "workbench.commandPalette.open")).toEqual(["Mod-p", "F1"]);
  });

  it("only the targeted alias is reset when several are unbound", () => {
    const start: UserKeybindingEntry[] = [
      { key: "Mod-p", command: "-workbench.commandPalette.open" },
      { key: "F1", command: "-workbench.commandPalette.open" }
    ];
    const entries = ok(
      edit("win32", start, {
        kind: "reset",
        target: {
          commandId: "workbench.commandPalette.open",
          key: null,
          origin: "default",
          defaultKey: "F1"
        }
      })
    );
    expect(assigned("win32", entries, "workbench.commandPalette.open")).toEqual(["F1"]);
  });

  it("change then reset both rows restores the default (P -> N: reset N, reset P)", () => {
    let entries = ok(
      edit("win32", [], {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "Mod-Alt-9"
      })
    );
    entries = ok(
      edit("win32", entries, {
        kind: "reset",
        target: { commandId: "editor.markdown.bold", key: "Mod-Alt-9", origin: "user" }
      })
    );
    entries = ok(
      edit("win32", entries, {
        kind: "reset",
        target: {
          commandId: "editor.markdown.bold",
          key: null,
          origin: "default",
          defaultKey: "Mod-b"
        }
      })
    );
    expect(entries).toEqual([]);
    expect(assigned("win32", entries, "editor.markdown.bold")).toEqual(["Mod-b"]);
  });

  it("an untouched default row has nothing to reset", () => {
    expect(
      edit("win32", [], {
        kind: "reset",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" }
      })
    ).toMatchObject({ ok: false, reason: "noop" });
  });
});

describe("guards (#647)", () => {
  it("readonly / native / standard commands cannot be edited", () => {
    for (const commandId of ["editor.selection.copy", "editor.undo", "editor.comment.toggle", "window.minimize"]) {
      expect(
        edit("win32", [], {
          kind: "unbind",
          target: { commandId, key: "Mod-c", origin: "default" }
        }),
        commandId
      ).toMatchObject({ ok: false, reason: "readonly" });
    }
  });

  it("an unknown command is invalid; a row that is not there is stale", () => {
    expect(
      edit("win32", [], {
        kind: "unbind",
        target: { commandId: "no.such.command", key: "Mod-k", origin: "default" }
      })
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      edit("win32", [], {
        kind: "unbind",
        target: { commandId: "editor.markdown.bold", key: "Mod-Alt-q", origin: "default" }
      })
    ).toMatchObject({ ok: false, reason: "stale" });
  });

  it("does not touch entries it does not target, and is pure", () => {
    const start: UserKeybindingEntry[] = [{ key: "Mod-Alt-8", command: "editor.markdown.italic" }];
    const snapshot = JSON.stringify(start);
    ok(
      edit("win32", start, {
        kind: "change",
        target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
        newKey: "Mod-Alt-9"
      })
    );
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

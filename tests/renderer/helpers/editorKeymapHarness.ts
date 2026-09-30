import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  createPergamumEditorKeymapExtension,
  type EditorKeybindingHandlers
} from "../../../src/renderer/keybindings/codeMirrorKeymap";
import type { PergamumPlatform } from "../../../src/shared/keybindings";

/**
 * #641: the editor keymap for one command family, with handlers bound to an
 * injected config accessor (the production wiring reads module-level slots).
 */
export function keymapFor(input: {
  handlers: EditorKeybindingHandlers;
  commandIds: readonly string[];
  stopPropagationCommandIds?: readonly string[];
  platform?: PergamumPlatform;
}): Extension {
  return createPergamumEditorKeymapExtension({
    handlers: input.handlers,
    commandIds: input.commandIds,
    ...(input.stopPropagationCommandIds === undefined
      ? {}
      : { stopPropagationCommandIds: input.stopPropagationCommandIds }),
    ...(input.platform === undefined ? {} : { platform: input.platform })
  });
}

/**
 * Does the generated keymap run `commandId`'s handler for `event` on
 * `platform`? (The key comes from the catalog, not from the test.)
 */
export function handlerFires(
  commandId: string,
  event: KeyboardEvent,
  platform?: PergamumPlatform
): boolean {
  let fired = false;
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: "text",
      extensions: [
        keymapFor({
          handlers: {
            [commandId]: () => {
              fired = true;
              return true;
            }
          },
          commandIds: [commandId],
          ...(platform === undefined ? {} : { platform })
        })
      ]
    })
  });
  try {
    view.contentDOM.dispatchEvent(event);
  } finally {
    view.destroy();
  }
  return fired;
}

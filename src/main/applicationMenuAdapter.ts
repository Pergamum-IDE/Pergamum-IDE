/**
 * #662: the Electron adapter of the canonical Application Menu model
 * (`shared/applicationMenuModel`).
 *
 * Converts the platform-resolved model into Electron
 * `MenuItemConstructorOptions`. Everything Electron-specific lives here:
 * label resolution for the current language, click dispatch, stable item ids,
 * Electron roles, accelerators (from the effective keybindings) and the hidden
 * accelerator-alias items.
 */

import type { MenuItemConstructorOptions } from "electron";
import {
  getApplicationMenuModel,
  type ApplicationMenuCommandItem,
  type ApplicationMenuItem,
  type ApplicationMenuLabel,
  type ApplicationMenuNativeRoleItem,
  type ApplicationMenuSubmenuItem,
  type NativeMenuRole
} from "../shared/applicationMenuModel";
import {
  applicationCommandIds,
  commandPaletteCommandIds,
  editorCommandIds,
  workspaceCommandIds,
  type ApplicationMenuCommandId
} from "../shared/commandIds";
import { t, type Language } from "../shared/i18n";
import type { PergamumPlatform } from "../shared/keybindings";
import type { MenuAcceleratorLookup } from "./menuAccelerators";

export interface NativeMenuAdapterContext {
  readonly language: Language;
  readonly platform: PergamumPlatform;
  /** #642 / #645: accelerators of Pergamum commands (effective keybindings). */
  readonly accelerators: MenuAcceleratorLookup;
  /**
   * Sends a command to the renderer. Returns whether it was delivered.
   * Click handlers are created here, never stored in the model.
   */
  readonly sendCommand: (commandId: ApplicationMenuCommandId) => boolean;
  /** Fallback for Quit when the renderer could not be reached. */
  readonly requestApplicationQuit?: () => void;
}

/**
 * Accelerators that belong to native roles / the quit lifecycle rather than to
 * a customizable Pergamum command, so they are not in the keybinding catalog.
 */
const NATIVE_ROLE_ACCELERATORS: Partial<
  Record<NativeMenuRole, string>
> = {
  // #636: Cmd+W belongs to `editor.close` (active document tab). The native
  // Close Window role gets Cmd+Shift+W so the two never claim the same
  // accelerator on macOS.
  close: "CommandOrControl+Shift+W",
  // #535 follow-up: `toggleDevTools`' own default (CmdOrCtrl+Shift+I on
  // Windows/Linux) collides with the Insert Image toolbar shortcut.
  toggleDevTools: "CommandOrControl+Shift+D"
};

function quitAccelerator(platform: PergamumPlatform): string {
  return platform === "darwin" ? "Command+Q" : "CommandOrControl+Q";
}

/**
 * Text of the hidden accelerator-alias items. Never displayed (the items are
 * invisible); kept stable for debugging and the menu tests.
 */
const HIDDEN_ACCELERATOR_ITEM_LABELS: Partial<
  Record<ApplicationMenuCommandId, string>
> = {
  [commandPaletteCommandIds.open]: "Command Palette (F1)",
  [applicationCommandIds.zoomIn]: "Zoom In (+)",
  [editorCommandIds.saveAs]: "Save As (F12)",
  [workspaceCommandIds.openApplicationSettings]:
    "Application Settings (Ctrl+,)"
};

function resolveLabel(
  language: Language,
  label: ApplicationMenuLabel
): string {
  return "literal" in label ? label.literal : t(language, label.key, label.values);
}

/**
 * A hidden menu item that only carries an extra accelerator for a command.
 * Electron menu items hold a single accelerator string, so each alias key of a
 * catalog command (#642: the 2nd and later default keys) is bound through its
 * own hidden item rather than a second visible entry. Hidden items still fire
 * their accelerator (acceleratorWorksWhenHidden defaults to true; it is set
 * explicitly to document the intent). With no accelerator (the catalog has no
 * such key on this platform) there is nothing to bind, so no item is created.
 */
function hiddenAcceleratorAliasItems(
  context: NativeMenuAdapterContext,
  commandId: ApplicationMenuCommandId,
  accelerator: string | undefined
): MenuItemConstructorOptions[] {
  if (accelerator === undefined) {
    return [];
  }
  return [
    {
      label: HIDDEN_ACCELERATOR_ITEM_LABELS[commandId] ?? commandId,
      accelerator,
      visible: false,
      acceleratorWorksWhenHidden: true,
      click: () => {
        context.sendCommand(commandId);
      }
    }
  ];
}

function commandItemClick(
  item: ApplicationMenuCommandItem,
  context: NativeMenuAdapterContext
): () => void {
  if (item.commandId === applicationCommandIds.quitApplication) {
    // Quit is NOT Electron's `quit` role: the renderer runs its
    // dirty-document preflight first. Only when it cannot be reached does
    // the main-process fallback quit.
    return () => {
      const sentToRenderer = context.sendCommand(item.commandId);

      if (!sentToRenderer) {
        context.requestApplicationQuit?.();
      }
    };
  }

  return () => {
    context.sendCommand(item.commandId);
  };
}

/**
 * The accelerator of a command item. Only an explicit `nativeAccelerator`
 * (and Quit, whose fixed accelerator is not a customizable key) registers one
 * (#693). On macOS this native menu is also the visible menu, so a command
 * without it shows no key there, by design: a presentation-only key is never
 * turned into an accelerator (nor written into the label) to be displayed.
 */
function commandItemAccelerator(
  item: ApplicationMenuCommandItem,
  context: NativeMenuAdapterContext
): string | undefined {
  if (item.commandId === applicationCommandIds.quitApplication) {
    return quitAccelerator(context.platform);
  }

  // Opt-in (#693): only an item that declares a native accelerator gets one.
  // Having a shortcut label (or a user keybinding) never adds an accelerator.
  return item.nativeAccelerator === "primary"
    ? context.accelerators.get(item.commandId)
    : undefined;
}

function commandMenuItems(
  item: ApplicationMenuCommandItem,
  context: NativeMenuAdapterContext
): MenuItemConstructorOptions[] {
  const primary: MenuItemConstructorOptions = {
    // #252 follow-up: gives applyApplicationMenuEnablement a stable way to
    // find this item later via Menu.getMenuItemById, so `when`-based
    // enablement (e.g. editor.kind.markdown) can be reflected as a real
    // disabled state without rebuilding the whole menu.
    id: item.commandId,
    label: resolveLabel(context.language, item.label),
    accelerator: commandItemAccelerator(item, context),
    click: commandItemClick(item, context)
  };

  return [
    primary,
    ...(item.nativeAccelerator === "hiddenPrimary"
      ? hiddenAcceleratorAliasItems(
          context,
          item.commandId,
          context.accelerators.get(item.commandId)
        )
      : []),
    ...(item.nativeKeyAlias && (item.nativeAccelerator ?? "none") !== "none"
      ? hiddenAcceleratorAliasItems(
          context,
          item.commandId,
          context.accelerators.getAll(item.commandId)[1]
        )
      : [])
  ];
}

function nativeRoleMenuItem(
  item: ApplicationMenuNativeRoleItem,
  context: NativeMenuAdapterContext
): MenuItemConstructorOptions {
  const accelerator = NATIVE_ROLE_ACCELERATORS[item.role];

  return {
    ...(item.commandId ? { id: item.commandId } : {}),
    role: item.role,
    label: resolveLabel(context.language, item.label),
    // Electron assigns each role a built-in default accelerator when this is
    // omitted. Pass one explicitly to override it.
    ...(accelerator ? { accelerator } : {})
  };
}

function submenuMenuItem(
  item: ApplicationMenuSubmenuItem,
  context: NativeMenuAdapterContext
): MenuItemConstructorOptions {
  return {
    ...(item.role ? { role: item.role } : {}),
    label: resolveLabel(context.language, item.label),
    submenu: toMenuItems(item.items, context)
  };
}

function toMenuItems(
  items: readonly ApplicationMenuItem[],
  context: NativeMenuAdapterContext
): MenuItemConstructorOptions[] {
  return items.flatMap((item): MenuItemConstructorOptions[] => {
    switch (item.type) {
      case "separator":
        return [{ type: "separator" }];
      case "command":
        return commandMenuItems(item, context);
      case "nativeRole":
        return [nativeRoleMenuItem(item, context)];
      case "submenu":
        return [submenuMenuItem(item, context)];
    }
  });
}

/** The Electron menu template for `context.platform`, built from the model. */
export function buildNativeMenuTemplate(
  context: NativeMenuAdapterContext
): MenuItemConstructorOptions[] {
  return toMenuItems(getApplicationMenuModel(context.platform), context);
}

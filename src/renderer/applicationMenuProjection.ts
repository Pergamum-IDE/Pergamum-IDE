/**
 * #663: the Renderer's view of the canonical Application Menu model
 * (`shared/applicationMenuModel`, #662).
 *
 * A pure projection, not a second menu definition: the hierarchy, command
 * identity and label keys all come from the model; this only resolves labels
 * for the current language and attaches the optional view state the UI needs
 * (shortcut label, disabled). The real shortcut labels / enablement are
 * supplied by the caller (#664); the model never carries them.
 */

import {
  getApplicationMenuModel,
  type ApplicationMenuItem,
  type ApplicationMenuLabel,
  type NativeMenuRole
} from "../shared/applicationMenuModel";
import type { Translate } from "../shared/i18n";
import type { AppPlatform } from "../shared/platform";
import { appPlatformToPergamumPlatform } from "./platformModifier";

/** What a clicked item hands to the `onInvoke` boundary (#664 connects it). */
export type RendererMenuInvokeTarget =
  | { readonly type: "command"; readonly commandId: string }
  | {
      readonly type: "nativeRole";
      readonly role: NativeMenuRole;
      readonly commandId?: string;
    };

export type RendererMenuEntry =
  | { readonly kind: "separator"; readonly key: string }
  | {
      readonly kind: "item";
      readonly key: string;
      readonly label: string;
      readonly target: RendererMenuInvokeTarget;
      readonly disabled: boolean;
      readonly shortcutLabel?: string;
    }
  | {
      readonly kind: "submenu";
      readonly key: string;
      /** What is drawn; for a top-level menu this may carry "(F)" (#668). */
      readonly label: string;
      /** The canonical access key (#668); Alt activation is #665. */
      readonly mnemonic?: string;
      readonly items: readonly RendererMenuEntry[];
    };

/**
 * Which keybinding row an item's shortcut label comes from (#664).
 *   - `customizable`: an app-scope Pergamum command; its effective primary
 *     key (presentation only: it is not necessarily a native accelerator, #693)
 *   - `nativeRole`: a readonly native-role row (Electron role / quit
 *     lifecycle) that documents the shortcut the native backend binds
 */
export interface RendererMenuShortcutRequest {
  readonly id: string;
  readonly kind: "customizable" | "nativeRole";
}

export interface RendererMenuProjectionOptions {
  readonly translate: Translate;
  /** Display text of a shortcut (e.g. "Ctrl+S"); from the effective keybindings. */
  readonly getShortcutLabel?: (
    request: RendererMenuShortcutRequest
  ) => string | undefined;
  /** Whether a command is currently disabled (CommandRegistry enablement). */
  readonly isDisabled?: (commandId: string) => boolean;
}

/**
 * The Renderer menu bar replaces the visible native menu bar on Windows and
 * Linux only. macOS keeps its native global menu.
 *
 * #693 consequence: shortcut labels are a Renderer-menu feature. On macOS the
 * OS draws the menu, and the only way to show a key there is a native
 * accelerator, which would make Electron handle the keystroke. A key that is
 * shown only for presentation (no `nativeAccelerator`) is therefore NOT shown
 * on macOS: no accelerator is registered, and no key text is put into the
 * label, just to display it.
 */
export function shouldShowRendererMenuBar(platform: AppPlatform): boolean {
  return platform === "windows" || platform === "linux";
}

function resolveLabel(label: ApplicationMenuLabel, translate: Translate): string {
  return "literal" in label ? label.literal : translate(label.key, label.values);
}

/**
 * #664 / #693: the keybinding row an item shows, decided by the model's
 * metadata: an explicit `shortcutDisplayId` wins (display-only native rows);
 * otherwise a command item follows its `shortcutDisplay` policy (`primary`,
 * the default, requests its effective primary shortcut; `none` shows
 * nothing) and a native role with a commandId shows that command's native
 * row. How the key is bound (native accelerator or not) plays no part.
 */
function shortcutRequestFor(
  item: ApplicationMenuItem
): RendererMenuShortcutRequest | undefined {
  if (item.type === "command") {
    if (item.shortcutDisplayId !== undefined) {
      return { id: item.shortcutDisplayId, kind: "nativeRole" };
    }

    return (item.shortcutDisplay ?? "primary") === "primary"
      ? { id: item.commandId, kind: "customizable" }
      : undefined;
  }

  if (item.type === "nativeRole") {
    const id = item.shortcutDisplayId ?? item.commandId;

    return id === undefined ? undefined : { id, kind: "nativeRole" };
  }

  return undefined;
}

/**
 * #668: how a menu's canonical mnemonic is shown in the Renderer menu.
 *
 * The letter itself comes from the model (never guessed from the label). Only
 * the presentation is decided here: when the translated label already contains
 * the letter (English "File" for F) it is shown as is; a label without it
 * (Japanese "ファイル") gets an explicit "(F)" suffix so the access key is
 * visible. No underline is drawn, and translations carry no mnemonic syntax.
 */
export function presentMnemonicLabel(
  label: string,
  mnemonic: string | undefined
): string {
  if (
    mnemonic === undefined ||
    label.toLocaleUpperCase("en-US").includes(mnemonic.toLocaleUpperCase("en-US"))
  ) {
    return label;
  }

  return `${label}(${mnemonic})`;
}

function projectItems(
  items: readonly ApplicationMenuItem[],
  options: RendererMenuProjectionOptions,
  keyPrefix: string
): RendererMenuEntry[] {
  return items.map((item, index): RendererMenuEntry => {
    const key = `${keyPrefix}/${index}`;

    switch (item.type) {
      case "separator":
        return { kind: "separator", key };
      case "submenu":
        return {
          kind: "submenu",
          key,
          label: resolveLabel(item.label, options.translate),
          items: projectItems(item.items, options, key)
        };
      case "command":
      case "nativeRole": {
        const commandId = item.commandId;
        const shortcutRequest = shortcutRequestFor(item);
        const shortcutLabel =
          shortcutRequest === undefined
            ? undefined
            : options.getShortcutLabel?.(shortcutRequest);

        return {
          kind: "item",
          key,
          label: resolveLabel(item.label, options.translate),
          target:
            item.type === "command"
              ? { type: "command", commandId: item.commandId }
              : {
                  type: "nativeRole",
                  role: item.role,
                  ...(commandId === undefined ? {} : { commandId })
                },
          disabled:
            commandId === undefined
              ? false
              : (options.isDisabled?.(commandId) ?? false),
          ...(shortcutLabel === undefined ? {} : { shortcutLabel })
        };
      }
    }
  });
}

/** The top-level menus (File, Edit, ...) for `platform`, from the model. */
export function projectApplicationMenu(
  platform: AppPlatform,
  options: RendererMenuProjectionOptions
): readonly Extract<RendererMenuEntry, { kind: "submenu" }>[] {
  return getApplicationMenuModel(appPlatformToPergamumPlatform(platform)).map(
    (menu, index) => ({
      kind: "submenu" as const,
      key: String(index),
      label: presentMnemonicLabel(
        resolveLabel(menu.label, options.translate),
        menu.mnemonic
      ),
      ...(menu.mnemonic === undefined ? {} : { mnemonic: menu.mnemonic }),
      items: projectItems(menu.items, options, String(index))
    })
  );
}

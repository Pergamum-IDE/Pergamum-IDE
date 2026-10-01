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
      readonly label: string;
      readonly items: readonly RendererMenuEntry[];
    };

export interface RendererMenuProjectionOptions {
  readonly translate: Translate;
  /** Display text of a command's shortcut (e.g. "Ctrl+S"); #664 supplies it. */
  readonly getShortcutLabel?: (commandId: string) => string | undefined;
  /** Whether a command is currently disabled; #664 supplies it. */
  readonly isDisabled?: (commandId: string) => boolean;
}

/**
 * The Renderer menu bar replaces the visible native menu bar on Windows and
 * Linux only. macOS keeps its native global menu.
 */
export function shouldShowRendererMenuBar(platform: AppPlatform): boolean {
  return platform === "windows" || platform === "linux";
}

function resolveLabel(label: ApplicationMenuLabel, translate: Translate): string {
  return "literal" in label ? label.literal : translate(label.key, label.values);
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
        const shortcutLabel =
          commandId === undefined
            ? undefined
            : options.getShortcutLabel?.(commandId);

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
      label: resolveLabel(menu.label, options.translate),
      items: projectItems(menu.items, options, String(index))
    })
  );
}

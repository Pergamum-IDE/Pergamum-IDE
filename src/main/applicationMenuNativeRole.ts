/**
 * #664: runs a native role for the Renderer application menu.
 *
 * The visible Renderer menu replaces the native menu bar on Windows / Linux,
 * but a native menu item with `role: "copy"` does exactly
 * `webContents.copy()` on the focused web contents. This performs the same
 * calls for the Renderer menu, for an allowlisted set of roles only. The
 * Renderer never touches Electron objects and cannot name an arbitrary role.
 */

import { ipcMain } from "electron";
import {
  APPLICATION_MENU_CHANNELS,
  isRendererMenuNativeRole,
  type RendererMenuNativeRole
} from "../shared/api";

export interface NativeRoleWebContents {
  isDestroyed(): boolean;
  undo(): void;
  redo(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  selectAll(): void;
  toggleDevTools(): void;
}

export function invokeRendererMenuNativeRole(
  webContents: NativeRoleWebContents,
  role: unknown
): boolean {
  if (!isRendererMenuNativeRole(role) || webContents.isDestroyed()) {
    return false;
  }

  runRole(webContents, role);
  return true;
}

function runRole(
  webContents: NativeRoleWebContents,
  role: RendererMenuNativeRole
): void {
  switch (role) {
    case "undo":
      webContents.undo();
      return;
    case "redo":
      webContents.redo();
      return;
    case "cut":
      webContents.cut();
      return;
    case "copy":
      webContents.copy();
      return;
    case "paste":
      webContents.paste();
      return;
    case "selectAll":
      webContents.selectAll();
      return;
    case "toggleDevTools":
      webContents.toggleDevTools();
      return;
  }
}

export function registerApplicationMenuNativeRoleIpc(): void {
  ipcMain.handle(
    APPLICATION_MENU_CHANNELS.invokeNativeRole,
    (event, role: unknown): boolean =>
      invokeRendererMenuNativeRole(event.sender, role)
  );
}

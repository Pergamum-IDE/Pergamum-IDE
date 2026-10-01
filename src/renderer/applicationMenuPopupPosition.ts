/**
 * #663: placement of Renderer menu popups. Pure; the final viewport
 * containment reuses `clampContextMenuPosition` (#629).
 */

import { clampContextMenuPosition } from "./contextMenuPosition";

export interface MenuRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MenuPopupSize {
  readonly width: number;
  readonly height: number;
}

export interface MenuViewport {
  readonly width: number;
  readonly height: number;
}

const popupMargin = 4;
/** Popup padding (4px) + border (1px): aligns the first submenu row with its parent item. */
const submenuAlignmentOffset = 5;

/** Top-level popup: below its trigger, shifted left when it would overflow. */
export function computeTopLevelPopupPosition(input: {
  readonly trigger: MenuRect;
  readonly popup: MenuPopupSize;
  readonly viewport: MenuViewport;
}): { x: number; y: number } {
  return clampContextMenuPosition({
    clickX: input.trigger.left,
    clickY: input.trigger.bottom,
    menuWidth: input.popup.width,
    menuHeight: input.popup.height,
    viewportWidth: input.viewport.width,
    viewportHeight: input.viewport.height,
    margin: popupMargin
  });
}

/**
 * Submenu popup: to the right of its parent popup, flipped to the left when
 * the right side does not fit, then clamped vertically / horizontally.
 */
export function computeSubmenuPopupPosition(input: {
  readonly parentPopup: MenuRect;
  readonly item: MenuRect;
  readonly popup: MenuPopupSize;
  readonly viewport: MenuViewport;
}): { x: number; y: number } {
  const fitsRight =
    input.parentPopup.right + input.popup.width <=
    input.viewport.width - popupMargin;
  const x = fitsRight
    ? input.parentPopup.right
    : input.parentPopup.left - input.popup.width;

  return clampContextMenuPosition({
    clickX: x,
    clickY: input.item.top - submenuAlignmentOffset,
    menuWidth: input.popup.width,
    menuHeight: input.popup.height,
    viewportWidth: input.viewport.width,
    viewportHeight: input.viewport.height,
    margin: popupMargin
  });
}

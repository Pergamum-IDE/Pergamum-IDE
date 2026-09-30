/**
 * #629: Helper to clamp a context menu's position within the viewport so it never
 * spills past the right or bottom edges or hides off-screen.
 */

export interface ContextMenuPositionInput {
  clickX: number;
  clickY: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export function clampContextMenuPosition(
  input: ContextMenuPositionInput
): ContextMenuPosition {
  const margin = input.margin ?? 8;

  const maxX = Math.max(margin, input.viewportWidth - input.menuWidth - margin);
  const maxY = Math.max(margin, input.viewportHeight - input.menuHeight - margin);

  return {
    x: Math.max(margin, Math.min(input.clickX, maxX)),
    y: Math.max(margin, Math.min(input.clickY, maxY))
  };
}

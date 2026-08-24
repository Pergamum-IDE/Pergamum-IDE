export interface InfoDialogKeyboardEvent {
  key: string;
}

export function handleInfoDialogKeyDown(
  event: InfoDialogKeyboardEvent,
  onClose: () => void
): boolean {
  if (event.key !== "Escape") {
    return false;
  }

  onClose();
  return true;
}

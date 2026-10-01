import { useEffect, useState } from "react";

/**
 * The safety delay shared by Pergamum's destructive confirmations (File
 * Explorer delete, Recovery discard, project Replace): the destructive button
 * stays disabled until this many milliseconds after the dialog mounted.
 */
export const DESTRUCTIVE_ARM_DELAY_MS = 5000;

/**
 * Returns false until `delayMs` has passed since mount, then true. Every
 * mount starts the wait again and the timer is cleared on unmount, so closing
 * and re-opening a dialog never inherits an earlier "armed" state.
 */
export function useArmDelay(delayMs: number = DESTRUCTIVE_ARM_DELAY_MS): boolean {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return armed;
}

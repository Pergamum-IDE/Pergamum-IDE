import type { CommandDisabledReason } from "../shared/commandEnablement";
import shieldIcon from "../../assets/icons/feather/global/shield.svg?raw";
import banIcon from "../../assets/icons/ionicons/command-palette/ban-outline.svg?raw";
import constructIcon from "../../assets/icons/ionicons/command-palette/construct-outline.svg?raw";

export type CommandPaletteStatusIndicatorKind =
  | "readOnlyProject"
  | "conditionUnavailable"
  | "notImplemented";

export interface CommandPaletteStatusIndicator {
  readonly kind: CommandPaletteStatusIndicatorKind;
  readonly iconSvg: string;
}

export function commandPaletteStatusIndicatorForReason(
  reason: CommandPaletteStatusIndicatorKind
): CommandPaletteStatusIndicator {
  switch (reason) {
    case "readOnlyProject":
      return {
        kind: "readOnlyProject",
        iconSvg: shieldIcon
      };
    case "conditionUnavailable":
      return {
        kind: "conditionUnavailable",
        iconSvg: banIcon
      };
    case "notImplemented":
      return {
        kind: "notImplemented",
        iconSvg: constructIcon
      };
  }
}

export function resolveDisabledCommandPaletteStatusIndicator(
  input: {
    readonly enabled: boolean;
    readonly disabledReason?: CommandDisabledReason | null;
  }
): CommandPaletteStatusIndicator | null {
  if (input.enabled) {
    return null;
  }

  if (input.disabledReason === "readOnlyProject") {
    return commandPaletteStatusIndicatorForReason("readOnlyProject");
  }

  return commandPaletteStatusIndicatorForReason("conditionUnavailable");
}

export function commandPaletteNotImplementedStatusIndicator(): CommandPaletteStatusIndicator {
  return commandPaletteStatusIndicatorForReason("notImplemented");
}

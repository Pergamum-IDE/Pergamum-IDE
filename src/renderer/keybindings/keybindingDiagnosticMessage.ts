import type { Language, Translate, TranslationKey } from "../../shared/i18n";
import type {
  KeybindingDiagnostic,
  KeybindingDiagnosticCode
} from "../../shared/keybindings";

/**
 * #651: the localized, user-facing message of a keybinding diagnostic, built
 * from its stable `code` and context fields. `diagnostic.message` is an
 * English developer detail and is never shown in the Japanese UI.
 *
 * Codes that mean the same thing share one message with the shortcut-change
 * dialog (conflict, reserved, duplicate, save failure).
 */
const messageKeys: Partial<Record<KeybindingDiagnosticCode, TranslationKey>> = {
  jsonParseError: "keybindings.diagnostic.jsonParseError",
  rootMustBeArray: "keybindings.diagnostic.rootMustBeArray",
  entryMustBeObject: "keybindings.diagnostic.entryMustBeObject",
  missingKey: "keybindings.diagnostic.missingKey",
  missingCommand: "keybindings.diagnostic.missingCommand",
  invalidKeyType: "keybindings.diagnostic.invalidKeyType",
  invalidCommandType: "keybindings.diagnostic.invalidCommandType",
  invalidWhenType: "keybindings.diagnostic.invalidWhenType",
  unknownField: "keybindings.diagnostic.unknownField",
  invalidKeyNotation: "keybindings.diagnostic.invalidKeyNotation",
  unknownCommand: "keybindings.diagnostic.unknownCommand",
  readonlyCommand: "keybindings.diagnostic.readonlyCommand",
  unsupportedWhen: "keybindings.diagnostic.unsupportedWhen",
  duplicateUserEntry: "keybindings.diagnostic.duplicateUserEntry",
  conflictingKey: "keybindings.diagnostic.conflictingKey",
  unbindTargetNotFound: "keybindings.diagnostic.unbindTargetNotFound",
  reservedForbiddenKey: "keybindings.diagnostic.reservedKey",
  reservedReloadKey: "keybindings.diagnostic.reservedKey",
  reservedNativeOnlyKey: "keybindings.diagnostic.reservedKey",
  reservedDiscouragedKey: "keybindings.diagnostic.reservedDiscouragedKey",
  fileReadError: "keybindings.diagnostic.fileReadError",
  fileWriteError: "keybindings.diagnostic.fileWriteError"
};

export function keybindingDiagnosticMessageKey(
  code: string
): TranslationKey | undefined {
  return (messageKeys as Record<string, TranslationKey | undefined>)[code];
}

export function keybindingDiagnosticMessage(
  diagnostic: Pick<
    KeybindingDiagnostic,
    "code" | "message" | "field" | "command" | "key" | "when"
  >,
  translate: Translate,
  language: Language
): string {
  const key = keybindingDiagnosticMessageKey(diagnostic.code);
  if (key !== undefined) {
    return translate(key, {
      field: diagnostic.field ?? "",
      command: diagnostic.command ?? "",
      key: diagnostic.key ?? "",
      when: diagnostic.when ?? ""
    });
  }
  // No translation for this code: the Japanese UI never shows the raw
  // English developer message; the English UI may.
  return language === "en"
    ? diagnostic.message
    : translate("keybindings.diagnostic.generic", { code: diagnostic.code });
}

import { useEffect, useState } from "react";
import type {
  ApplicationSettings,
  SaveApplicationSettingsRequest
} from "../shared/api";
import type { Translate, TranslationKey } from "../shared/i18n";
import {
  japaneseLintRuleCatalog,
  japaneseLintRuleCategories,
  japaneseLintRuleDisplayPath,
  japaneseLintRuntimeOptionCatalog,
  resolveJapaneseLintSettings,
  type JapaneseLintRuleDefinition,
  type JapaneseLintRuntimeOptionKey,
  type JapaneseLintSettings
} from "../shared/japaneseLintRules";

interface JapaneseLintSettingsSectionProps {
  settings: ApplicationSettings;
  isLoading: boolean;
  translate: Translate;
  onChangeSettings: (settings: SaveApplicationSettingsRequest) => void;
}

/** A full save request from the current settings, `japaneseLint` replaced. */
function saveRequestWithJapaneseLint(
  settings: ApplicationSettings,
  japaneseLint: JapaneseLintSettings
): SaveApplicationSettingsRequest {
  const request: SaveApplicationSettingsRequest = {
    preview: settings.preview,
    workbench: settings.workbench,
    commandPalette: settings.commandPalette,
    editor: settings.editor,
    search: settings.search,
    markdownFiles: settings.markdownFiles,
    textFiles: settings.textFiles,
    imageAttachment: settings.imageAttachment,
    documentMap: settings.documentMap,
    japaneseLint
  };

  if (settings.notification !== undefined) {
    request.notification = settings.notification;
  }

  return request;
}

/** Parses a typed threshold; null when it is not a whole number. */
export function parseThresholdInput(text: string): number | null {
  const trimmed = text.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

/** The parts of a numeric option definition the input needs. */
interface ThresholdOption {
  readonly key: string;
  readonly labelKey: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

interface ThresholdInputProps {
  readonly option: ThresholdOption;
  /** Makes the input id unique (a rule id, or "runtime"). */
  readonly ownerId: string;
  readonly value: number;
  readonly translate: Translate;
  /** Text after the input, e.g. "ms", "件", "回", "個", "文字". */
  readonly unit?: string;
  readonly onCommit: (value: number) => void;
}

/**
 * A numeric threshold. The text is a local draft so a half-typed value ("1"
 * on the way to "100" with a minimum of 20) is never clamped mid-typing; it
 * is committed - clamped into [min, max] - on blur / Enter. It stays editable
 * while the rule is OFF, so a threshold can be set before turning it ON.
 */
function ThresholdInput({
  option,
  ownerId,
  value,
  unit,
  onCommit
}: ThresholdInputProps): JSX.Element {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (): void => {
    const parsed = parseThresholdInput(text);

    if (parsed === null) {
      setText(String(value));

      return;
    }

    const clamped = Math.min(option.max, Math.max(option.min, parsed));

    setText(String(clamped));

    if (clamped !== value) {
      onCommit(clamped);
    }
  };
  const inputId = `japaneseLintOption-${ownerId}-${option.key}`;

  return (
    <div className="settingsNumberInputGroup">
      <input
        id={inputId}
        className="settingsNumberInput"
        type="number"
        min={option.min}
        max={option.max}
        step={option.step}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
      />
      {unit ? <span className="settingsUnit">{unit}</span> : null}
    </div>
  );
}

/**
 * #625/#632: the "日本語表現チェック" section of the Settings page. One switch per
 * textlint rule (in catalog order, grouped) and a numeric threshold for the
 * rules that have one. Immediate-save like the rest of the Settings page. The
 * same settings drive the instant check and the future formal check.
 */
export function JapaneseLintSettingsSection({
  settings,
  isLoading,
  translate,
  onChangeSettings
}: JapaneseLintSettingsSectionProps): JSX.Element {
  const resolved = resolveJapaneseLintSettings(settings.japaneseLint);

  const save = (next: JapaneseLintSettings): void => {
    onChangeSettings(saveRequestWithJapaneseLint(settings, next));
  };

  const withRule = (
    definition: JapaneseLintRuleDefinition,
    change: { enabled?: boolean; option?: { key: string; value: number } }
  ): JapaneseLintSettings => {
    const current = resolved.rules[definition.id];
    const options =
      change.option !== undefined
        ? { ...(current.options ?? {}), [change.option.key]: change.option.value }
        : current.options;

    return {
      ...resolved,
      rules: {
        ...resolved.rules,
        [definition.id]: {
          enabled: change.enabled ?? current.enabled,
          ...(options ? { options } : {})
        }
      }
    };
  };

  const withRuntime = (
    key: JapaneseLintRuntimeOptionKey,
    value: number
  ): JapaneseLintSettings => ({ ...resolved, [key]: value });

  return (
    <div className="japaneseLintSettings">
      <p className="settingsDescription">
        {translate("japaneseLint.settings.description")}
      </p>
      <section
        className="japaneseLintRuleGroup"
        aria-labelledby="japaneseLintGroup-runtime"
      >
        <h3
          id="japaneseLintGroup-runtime"
          className="japaneseLintRuleGroupHeading"
        >
          {translate("japaneseLint.category.runtime")}
        </h3>
        <div className="settingsItemList">
          {japaneseLintRuntimeOptionCatalog.map((option) => {
            const runtimeInputId = `japaneseLintOption-runtime-${option.key}`;
            const runtimeUnit = translate(option.unitKey as TranslationKey);

            return (
              <div
                key={option.key}
                className="settingsItemRow"
                data-japanese-lint-runtime={option.key}
              >
                <div className="settingsItemHeader">
                  <label htmlFor={runtimeInputId} className="settingsItemLabel">
                    {translate(option.labelKey as TranslationKey)}
                  </label>
                  <div className="settingsItemControl">
                    <ThresholdInput
                      option={option}
                      ownerId="runtime"
                      value={resolved[option.key]}
                      translate={translate}
                      unit={runtimeUnit}
                      onCommit={(value) => save(withRuntime(option.key, value))}
                    />
                  </div>
                </div>
                <p className="settingsDescription">
                  {translate(option.descriptionKey as TranslationKey)}{" "}
                  {translate("japaneseLint.settings.rangeHint", {
                    min: String(option.min),
                    max: String(option.max),
                    unit: runtimeUnit
                  })}
                </p>
                <code className="settingsItemKey">
                  {"JapaneseLinter." + option.key}
                </code>
              </div>
            );
          })}
        </div>
      </section>
      {japaneseLintRuleCategories.map((category) => (
        <section
          key={category.id}
          className="japaneseLintRuleGroup"
          aria-labelledby={`japaneseLintGroup-${category.id}`}
        >
          <h3
            id={`japaneseLintGroup-${category.id}`}
            className="japaneseLintRuleGroupHeading"
          >
            {translate(category.labelKey as TranslationKey)}
          </h3>
          <div className="settingsItemList">
            {japaneseLintRuleCatalog
              .filter((definition) => definition.category === category.id)
              .map((definition) => {
                const setting = resolved.rules[definition.id];
                const labelId = `japaneseLintRule-${definition.id}`;

                return (
                  <div
                    key={definition.id}
                    className="settingsItemRow"
                    data-japanese-lint-rule={definition.id}
                  >
                    <label className="settingsItemHeader">
                      <span id={labelId} className="settingsItemLabel">
                        {translate(definition.labelKey as TranslationKey)}
                      </span>
                      <div className="settingsItemControl">
                        <input
                          className="settingsSwitchInput"
                          type="checkbox"
                          checked={setting.enabled}
                          disabled={isLoading}
                          aria-labelledby={labelId}
                          onChange={(event) =>
                            save(
                              withRule(definition, {
                                enabled: event.target.checked
                              })
                            )
                          }
                        />
                      </div>
                    </label>
                    <p className="settingsDescription">
                      {translate(definition.descriptionKey as TranslationKey)}
                    </p>
                    {definition.options?.map((option) => {
                      const optionInputId = `japaneseLintOption-${definition.id}-${option.key}`;
                      const optionUnit = option.unitKey
                        ? translate(option.unitKey as TranslationKey)
                        : undefined;

                      return (
                        <div
                          key={option.key}
                          className="japaneseLintRuleOptionGroup"
                        >
                          <div className="settingsItemHeader">
                            <label
                              htmlFor={optionInputId}
                              className="settingsItemLabel"
                            >
                              {translate(option.labelKey as TranslationKey)}
                            </label>
                            <div className="settingsItemControl">
                              <ThresholdInput
                                option={option}
                                ownerId={definition.id}
                                value={
                                  setting.options?.[option.key] ??
                                  option.defaultValue
                                }
                                translate={translate}
                                unit={optionUnit}
                                onCommit={(value) =>
                                  save(
                                    withRule(definition, {
                                      option: { key: option.key, value }
                                    })
                                  )
                                }
                              />
                            </div>
                          </div>
                          <p className="settingsDescription">
                            {translate(option.descriptionKey as TranslationKey)}{" "}
                            {translate("japaneseLint.settings.rangeHint", {
                              min: String(option.min),
                              max: String(option.max),
                              unit: optionUnit ?? ""
                            })}
                          </p>
                        </div>
                      );
                    })}
                    <code className="settingsItemKey">
                      {japaneseLintRuleDisplayPath(definition.id)}
                    </code>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

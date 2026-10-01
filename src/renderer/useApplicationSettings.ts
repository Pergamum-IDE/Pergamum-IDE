import { useEffect, useState } from "react";
import {
  createDefaultApplicationSettings,
  type ApplicationSettings,
  type SaveApplicationSettingsRequest
} from "../shared/settings";
import { defaultLanguage, type Language } from "../shared/i18n";

export const defaultApplicationSettings: ApplicationSettings =
  createDefaultApplicationSettings();

interface UseApplicationSettingsResult {
  settings: ApplicationSettings;
  displayLanguage: Language;
  isLoading: boolean;
  error: string | null;
  reloadSettings: () => Promise<void>;
  saveSettings: (settings: SaveApplicationSettingsRequest) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

export function useApplicationSettings(): UseApplicationSettingsResult {
  const [settings, setSettings] = useState<ApplicationSettings>(
    defaultApplicationSettings
  );
  const [displayLanguage, setDisplayLanguage] =
    useState<Language>(defaultLanguage);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reloadSettings(): Promise<void> {
    try {
      const loadedSettings = await window.pergamum.settings.getSettings();

      setSettings(loadedSettings);
      setError(null);
    } catch (reloadError) {
      setError(errorMessage(reloadError));
      throw reloadError;
    }
  }

  useEffect(() => {
    let isMounted = true;

    window.pergamum.settings
      .getSettings()
      .then((loadedSettings) => {
        if (!isMounted) {
          return;
        }

        setSettings(loadedSettings);
        setDisplayLanguage(loadedSettings.workbench.language);
        setError(null);
        // #659: same synchronous block as `setSettings`, so a render never
        // sees `isLoading === false` with the pre-load settings.
        setIsLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!isMounted) {
          return;
        }

        setError(errorMessage(loadError));
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function saveSettings(
    nextSettings: SaveApplicationSettingsRequest
  ): Promise<void> {
    const savedSettings = await window.pergamum.settings.saveSettings(
      nextSettings
    );

    setSettings(savedSettings);
    setError(null);
  }

  return {
    settings,
    displayLanguage,
    isLoading,
    error,
    reloadSettings,
    saveSettings
  };
}

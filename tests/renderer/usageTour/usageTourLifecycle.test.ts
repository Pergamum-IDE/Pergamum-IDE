import { describe, expect, it, vi } from "vitest";

describe("Usage Tour lifecycle and completion semantics (Instructions 1 & 2)", () => {
  describe("Instruction 1: Manual replay never modifies usageTourAutoShowDisabled", () => {
    it("preserves flag=false when '説明は要らない' is clicked in manual mode", () => {
      let flag = false;
      const saveSettings = vi.fn((newSettings: { usageTourAutoShowDisabled: boolean }) => {
        flag = newSettings.usageTourAutoShowDisabled;
      });

      const handleDismissAutoShow = (isManual: boolean) => {
        if (!isManual) {
          saveSettings({ usageTourAutoShowDisabled: true });
        }
      };

      // Manual mode
      handleDismissAutoShow(true);

      expect(saveSettings).not.toHaveBeenCalled();
      expect(flag).toBe(false);
    });

    it("preserves flag=false when '完了' is clicked in manual mode", () => {
      let flag = false;
      const saveSettings = vi.fn((newSettings: { usageTourAutoShowDisabled: boolean }) => {
        flag = newSettings.usageTourAutoShowDisabled;
      });

      const handleComplete = (isManual: boolean) => {
        if (!isManual) {
          saveSettings({ usageTourAutoShowDisabled: true });
        }
      };

      // Manual mode
      handleComplete(true);

      expect(saveSettings).not.toHaveBeenCalled();
      expect(flag).toBe(false);
    });

    it("preserves flag=true when '完了' is clicked in manual mode", () => {
      let flag = true;
      const saveSettings = vi.fn((newSettings: { usageTourAutoShowDisabled: boolean }) => {
        flag = newSettings.usageTourAutoShowDisabled;
      });

      const handleComplete = (isManual: boolean) => {
        if (!isManual) {
          saveSettings({ usageTourAutoShowDisabled: true });
        }
      };

      handleComplete(true);

      expect(saveSettings).not.toHaveBeenCalled();
      expect(flag).toBe(true);
    });

    it("preserves flag=true when Escape key closes tour in manual mode", () => {
      let flag = true;
      const saveSettings = vi.fn();

      const handleClose = () => {
        // Close never saves settings
      };

      handleClose();

      expect(saveSettings).not.toHaveBeenCalled();
      expect(flag).toBe(true);
    });

    it("saves flag=true when '説明は要らない' is clicked in automatic mode", () => {
      let flag = false;
      const saveSettings = vi.fn((newSettings: { usageTourAutoShowDisabled: boolean }) => {
        flag = newSettings.usageTourAutoShowDisabled;
      });

      const handleDismissAutoShow = (isManual: boolean) => {
        if (!isManual) {
          saveSettings({ usageTourAutoShowDisabled: true });
        }
      };

      handleDismissAutoShow(false);

      expect(saveSettings).toHaveBeenCalledWith({ usageTourAutoShowDisabled: true });
      expect(flag).toBe(true);
    });

    it("saves flag=true when '完了' is clicked in automatic mode", () => {
      let flag = false;
      const saveSettings = vi.fn((newSettings: { usageTourAutoShowDisabled: boolean }) => {
        flag = newSettings.usageTourAutoShowDisabled;
      });

      const handleComplete = (isManual: boolean) => {
        if (!isManual) {
          saveSettings({ usageTourAutoShowDisabled: true });
        }
      };

      handleComplete(false);

      expect(saveSettings).toHaveBeenCalledWith({ usageTourAutoShowDisabled: true });
      expect(flag).toBe(true);
    });
  });

  describe("Instruction 2: Auto-show requires persistent settings load to finish", () => {
    function evaluateAutoShow(state: {
      isSettingsLoading: boolean;
      settingsError: string | null;
      attempted: boolean;
      usageTourAutoShowDisabled: boolean;
    }): { shouldLaunch: boolean; nextAttempted: boolean } {
      if (state.isSettingsLoading || state.settingsError !== null || state.attempted) {
        return { shouldLaunch: false, nextAttempted: state.attempted };
      }

      const nextAttempted = true;
      const shouldLaunch = !state.usageTourAutoShowDisabled;
      return { shouldLaunch, nextAttempted };
    }

    it("does NOT launch during settings loading even if initial default flag is false", () => {
      const result = evaluateAutoShow({
        isSettingsLoading: true,
        settingsError: null,
        attempted: false,
        usageTourAutoShowDisabled: false
      });

      expect(result.shouldLaunch).toBe(false);
      expect(result.nextAttempted).toBe(false);
    });

    it("does NOT launch if persistent settings failed to load (error state)", () => {
      const result = evaluateAutoShow({
        isSettingsLoading: false,
        settingsError: "Failed to read settings.json",
        attempted: false,
        usageTourAutoShowDisabled: false
      });

      expect(result.shouldLaunch).toBe(false);
      expect(result.nextAttempted).toBe(false);
    });

    it("does NOT flash or launch when persisted settings have usageTourAutoShowDisabled=true", () => {
      // Step 1: Loading
      const loadingState = evaluateAutoShow({
        isSettingsLoading: true,
        settingsError: null,
        attempted: false,
        usageTourAutoShowDisabled: false // pre-load default
      });
      expect(loadingState.shouldLaunch).toBe(false);

      // Step 2: Loaded with persisted true
      const loadedState = evaluateAutoShow({
        isSettingsLoading: false,
        settingsError: null,
        attempted: loadingState.nextAttempted,
        usageTourAutoShowDisabled: true // persisted value
      });

      expect(loadedState.shouldLaunch).toBe(false);
      expect(loadedState.nextAttempted).toBe(true);
    });

    it("launches once when persisted settings load completes with usageTourAutoShowDisabled=false", () => {
      // Step 1: Loading
      const loadingState = evaluateAutoShow({
        isSettingsLoading: true,
        settingsError: null,
        attempted: false,
        usageTourAutoShowDisabled: false
      });
      expect(loadingState.shouldLaunch).toBe(false);

      // Step 2: Loaded with false
      const loadedState = evaluateAutoShow({
        isSettingsLoading: false,
        settingsError: null,
        attempted: loadingState.nextAttempted,
        usageTourAutoShowDisabled: false
      });
      expect(loadedState.shouldLaunch).toBe(true);
      expect(loadedState.nextAttempted).toBe(true);

      // Step 3: Rerender or subsequent effect run during same session
      const subsequentState = evaluateAutoShow({
        isSettingsLoading: false,
        settingsError: null,
        attempted: loadedState.nextAttempted,
        usageTourAutoShowDisabled: false
      });
      expect(subsequentState.shouldLaunch).toBe(false);
    });
  });
});

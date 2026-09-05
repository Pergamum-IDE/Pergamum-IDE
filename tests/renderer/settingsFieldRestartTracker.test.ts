import { describe, expect, it, vi } from "vitest";

import { createSettingsFieldRestartTracker } from "../../src/renderer/settingsFieldRestartTracker";
import type {
  ApplicationSettings,
  SaveApplicationSettingsRequest
} from "../../src/shared/settings";
import { defaultDocumentMapSettings } from "../../src/shared/documentMapSettings";
import { getCatalogDefaultValue } from "../../src/shared/settingsCatalog";

function baseApplicationSettings(
  overrides: Partial<ApplicationSettings> = {}
): ApplicationSettings {
  return {
    preview: {
      renderer: getCatalogDefaultValue("preview.renderer"),
      updateDelayMs: getCatalogDefaultValue("preview.updateDelayMs")
    },
    workbench: {
      language: getCatalogDefaultValue("workbench.language"),
      statusBar: {
        visible: getCatalogDefaultValue("workbench.statusBar.visible"),
        characterCount: {
          visible: getCatalogDefaultValue(
            "workbench.statusBar.characterCount.visible"
          )
        }
      },
      sound: {
        enabled: getCatalogDefaultValue("workbench.sound.enabled"),
        dialog: { enabled: getCatalogDefaultValue("workbench.sound.dialog.enabled") },
        newline: { enabled: getCatalogDefaultValue("workbench.sound.newline.enabled") },
        keypress: { enabled: getCatalogDefaultValue("workbench.sound.keypress.enabled") }
      }
    },
    commandPalette: {
      footerDetail: {
        enable: getCatalogDefaultValue("commandPalette.footerDetail.enable"),
        marquee: {
          delay: getCatalogDefaultValue(
            "commandPalette.footerDetail.marquee.delay"
          ),
          speed: getCatalogDefaultValue(
            "commandPalette.footerDetail.marquee.speed"
          )
        }
      }
    },
    editor: {
      lineEnding: {
        expected: getCatalogDefaultValue("editor.lineEnding.expected"),
        markerGlyph: getCatalogDefaultValue("editor.lineEnding.markerGlyph")
      },
      whitespace: {
        renderIdeographicSpace: getCatalogDefaultValue(
          "editor.whitespace.renderIdeographicSpace"
        ),
        renderAsciiSpace: getCatalogDefaultValue(
          "editor.whitespace.renderAsciiSpace"
        ),
        renderTab: getCatalogDefaultValue("editor.whitespace.renderTab"),
        renderOtherUnicodeSpace: getCatalogDefaultValue(
          "editor.whitespace.renderOtherUnicodeSpace"
        )
      },
      paragraphIndent: {
        excludeLeadingCharacters: getCatalogDefaultValue(
          "editor.paragraphIndent.excludeLeadingCharacters"
        )
      },
      characterCount: {
        exclude: {
          whitespace: getCatalogDefaultValue(
            "editor.characterCount.exclude.whitespace"
          ),
          lineBreaks: getCatalogDefaultValue(
            "editor.characterCount.exclude.lineBreaks"
          ),
          headings: getCatalogDefaultValue(
            "editor.characterCount.exclude.headings"
          ),
          markdownSyntax: getCatalogDefaultValue(
            "editor.characterCount.exclude.markdownSyntax"
          ),
          markdownComments: getCatalogDefaultValue(
            "editor.characterCount.exclude.markdownComments"
          )
        }
      },
      undoHistoryMinDepth: getCatalogDefaultValue("editor.undoHistoryMinDepth")
    },
    files: {
      newFile: {
        lineEnding: getCatalogDefaultValue("files.newFile.lineEnding"),
        encoding: getCatalogDefaultValue("files.newFile.encoding")
      }
    },
    documentMap: defaultDocumentMapSettings(),
    recentProjects: [],
    ...overrides
  };
}

function toSaveRequest(
  settings: ApplicationSettings
): SaveApplicationSettingsRequest {
  const { recentProjects: _recentProjects, ...saveRequest } = settings;
  return saveRequest;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createSettingsFieldRestartTracker (#394 Step 2 follow-up)", () => {
  it("does nothing on blur when no field ever gained focus", async () => {
    const tracker = createSettingsFieldRestartTracker();
    const confirmRestart = vi.fn().mockResolvedValue("confirm");
    const onRestartRequested = vi.fn();

    await tracker.handleBlur(confirmRestart, onRestartRequested);

    expect(confirmRestart).not.toHaveBeenCalled();
    expect(onRestartRequested).not.toHaveBeenCalled();
  });

  it("offers the restart dialog on blur when a requiresRestart setting changed and the save succeeded", async () => {
    const tracker = createSettingsFieldRestartTracker();
    const baseline = baseApplicationSettings();
    const confirmRestart = vi.fn().mockResolvedValue("confirm");
    const onRestartRequested = vi.fn();

    tracker.handleFocus(baseline);
    tracker.handleChangeRequest(
      toSaveRequest(
        baseApplicationSettings({
          editor: { ...baseline.editor, undoHistoryMinDepth: 1000 }
        })
      ),
      () => Promise.resolve(true)
    );

    await tracker.handleBlur(confirmRestart, onRestartRequested);

    expect(confirmRestart).toHaveBeenCalledTimes(1);
    expect(onRestartRequested).toHaveBeenCalledTimes(1);
  });

  it("does not offer the restart dialog when only a non-restart-required setting changed", async () => {
    const tracker = createSettingsFieldRestartTracker();
    const baseline = baseApplicationSettings();
    const confirmRestart = vi.fn().mockResolvedValue("confirm");
    const onRestartRequested = vi.fn();

    tracker.handleFocus(baseline);
    tracker.handleChangeRequest(
      toSaveRequest(
        baseApplicationSettings({
          workbench: {
            ...baseline.workbench,
            language: baseline.workbench.language === "ja" ? "en" : "ja"
          }
        })
      ),
      () => Promise.resolve(true)
    );

    await tracker.handleBlur(confirmRestart, onRestartRequested);

    expect(confirmRestart).not.toHaveBeenCalled();
    expect(onRestartRequested).not.toHaveBeenCalled();
  });

  it("never offers the restart dialog when the save failed, even if the value changed", async () => {
    const tracker = createSettingsFieldRestartTracker();
    const baseline = baseApplicationSettings();
    const confirmRestart = vi.fn().mockResolvedValue("confirm");
    const onRestartRequested = vi.fn();

    tracker.handleFocus(baseline);
    tracker.handleChangeRequest(
      toSaveRequest(
        baseApplicationSettings({
          editor: { ...baseline.editor, undoHistoryMinDepth: 1000 }
        })
      ),
      () => Promise.resolve(false)
    );

    await tracker.handleBlur(confirmRestart, onRestartRequested);

    expect(confirmRestart).not.toHaveBeenCalled();
    expect(onRestartRequested).not.toHaveBeenCalled();
  });

  it('does not request a restart when the dialog result is "cancel" (Later)', async () => {
    const tracker = createSettingsFieldRestartTracker();
    const baseline = baseApplicationSettings();
    const confirmRestart = vi.fn().mockResolvedValue("cancel");
    const onRestartRequested = vi.fn();

    tracker.handleFocus(baseline);
    tracker.handleChangeRequest(
      toSaveRequest(
        baseApplicationSettings({
          editor: { ...baseline.editor, undoHistoryMinDepth: 1000 }
        })
      ),
      () => Promise.resolve(true)
    );

    await tracker.handleBlur(confirmRestart, onRestartRequested);

    expect(confirmRestart).toHaveBeenCalledTimes(1);
    expect(onRestartRequested).not.toHaveBeenCalled();
  });

  it("does not re-baseline mid-edit: a second handleFocus before blur keeps the ORIGINAL pre-edit baseline", async () => {
    const tracker = createSettingsFieldRestartTracker();
    const baseline = baseApplicationSettings();
    const confirmRestart = vi.fn().mockResolvedValue("confirm");
    const onRestartRequested = vi.fn();

    tracker.handleFocus(baseline);
    tracker.handleChangeRequest(
      toSaveRequest(
        baseApplicationSettings({
          editor: { ...baseline.editor, undoHistoryMinDepth: 500 }
        })
      ),
      () => Promise.resolve(true)
    );
    // A second focus event on the same still-focused field (defensive case)
    // must not overwrite the baseline with the already-changed value.
    tracker.handleFocus(
      baseApplicationSettings({
        editor: { ...baseline.editor, undoHistoryMinDepth: 500 }
      })
    );
    tracker.handleChangeRequest(
      toSaveRequest(
        baseApplicationSettings({
          editor: { ...baseline.editor, undoHistoryMinDepth: 1000 }
        })
      ),
      () => Promise.resolve(true)
    );

    await tracker.handleBlur(confirmRestart, onRestartRequested);

    expect(confirmRestart).toHaveBeenCalledTimes(1);
  });

  it(
    "regression: pairs each blur with its OWN in-flight save and request, " +
      "even when a different field's change interleaves before that save " +
      "resolves — reading the pending request only AFTER awaiting the save " +
      "(instead of snapshotting both together beforehand) would pair this " +
      "field's baseline with the OTHER field's value instead of its own",
    async () => {
      const tracker = createSettingsFieldRestartTracker();
      const baseline = baseApplicationSettings();
      const confirmRestart = vi.fn().mockResolvedValue("cancel");
      const onRestartRequested = vi.fn();

      tracker.handleFocus(baseline);

      // Field A changes editor.undoHistoryMinDepth (requiresRestart) — its
      // save does NOT resolve immediately.
      const deferredA = createDeferred<boolean>();
      const nextA = toSaveRequest(
        baseApplicationSettings({
          editor: { ...baseline.editor, undoHistoryMinDepth: 1000 }
        })
      );
      tracker.handleChangeRequest(nextA, () => deferredA.promise);

      // Field A loses focus (e.g. the user tabs away) WHILE its save is
      // still pending.
      const blurPromise = tracker.handleBlur(
        confirmRestart,
        onRestartRequested
      );

      // Before A's save settles, a DIFFERENT field (B) is edited — a
      // non-restart-required change whose save resolves right away. This
      // overwrites the tracker's "latest request"/"latest save" state.
      // undoHistoryMinDepth is left at the baseline value here on purpose:
      // if A's blur ends up diffing against THIS request instead of its
      // own, it would find no requiresRestart change at all.
      const nextB = toSaveRequest(
        baseApplicationSettings({
          workbench: {
            ...baseline.workbench,
            language: baseline.workbench.language === "ja" ? "en" : "ja"
          }
        })
      );
      tracker.handleChangeRequest(nextB, () => Promise.resolve(true));

      // Now let A's own save resolve, and let A's blur finish.
      deferredA.resolve(true);
      await blurPromise;

      // A's blur must have diffed baseline vs nextA (its own pair), so the
      // restart dialog is still offered — not silently skipped because B's
      // unrelated request overwrote the shared "latest request" ref during
      // the await.
      expect(confirmRestart).toHaveBeenCalledTimes(1);
    }
  );
});

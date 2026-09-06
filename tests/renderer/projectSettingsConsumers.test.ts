import { describe, expect, it } from "vitest";
import {
  defaultApplicationSettings,
  resolveEffectiveSettings,
  type ApplicationSettings,
  type ProjectSettings
} from "../../src/shared/settings";
import {
  countMarkdownDocumentCharacters
} from "../../src/renderer/characterCount";
import {
  computeParagraphIndentInsertTransform
} from "../../src/renderer/paragraphIndentTransform";
import {
  buildGlossaryDocumentMapPlan
} from "../../src/renderer/glossaryDocumentMap";

describe("Project Settings consumers integration (#396 Slice 7)", () => {
  describe("editor.paragraphIndent.excludeLeadingCharacters consumer", () => {
    it("respects project override when overriding application leading-character exclusions with empty string ''", () => {
      const appSettings: ApplicationSettings = {
        ...defaultApplicationSettings,
        editor: {
          ...defaultApplicationSettings.editor,
          paragraphIndent: {
            excludeLeadingCharacters: "「『（【"
          }
        }
      };

      // Project overrides to empty string (no excluded leading characters)
      const projectSettings: ProjectSettings = {
        editor: {
          paragraphIndent: {
            excludeLeadingCharacters: ""
          }
        }
      };

      const line = "「吾輩は猫である";

      // With project override (""), line starting with 「 is NOT excluded -> indented
      const effectiveWithProject = resolveEffectiveSettings(
        appSettings,
        projectSettings
      );
      const resultWithProject = computeParagraphIndentInsertTransform(
        line,
        effectiveWithProject.editor.paragraphIndent.excludeLeadingCharacters
      );
      expect(resultWithProject.counts.changedLineCount).toBe(1);
      expect(resultWithProject.counts.skippedLineCount).toBe(0);

      // Without project override, application setting ("「『（【") applies -> skipped
      const effectiveAppOnly = resolveEffectiveSettings(appSettings, undefined);
      const resultAppOnly = computeParagraphIndentInsertTransform(
        line,
        effectiveAppOnly.editor.paragraphIndent.excludeLeadingCharacters
      );
      expect(resultAppOnly.counts.changedLineCount).toBe(0);
      expect(resultAppOnly.counts.skippedLineCount).toBe(1);
    });

    it("respects project override with custom characters including full-width space", () => {
      const appSettings: ApplicationSettings = {
        ...defaultApplicationSettings,
        editor: {
          ...defaultApplicationSettings.editor,
          paragraphIndent: {
            excludeLeadingCharacters: ""
          }
        }
      };

      const projectSettings: ProjectSettings = {
        editor: {
          paragraphIndent: {
            excludeLeadingCharacters: "　「"
          }
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      const bracketLine = "「吾輩は猫である";
      const regularLine = "吾輩は猫である";

      const bracketResult = computeParagraphIndentInsertTransform(
        bracketLine,
        effective.editor.paragraphIndent.excludeLeadingCharacters
      );
      expect(bracketResult.counts.skippedLineCount).toBe(1);

      const regularResult = computeParagraphIndentInsertTransform(
        regularLine,
        effective.editor.paragraphIndent.excludeLeadingCharacters
      );
      expect(regularResult.counts.changedLineCount).toBe(1);
    });
  });

  describe("editor.characterCount.exclude.* consumers", () => {
    it("uses project override to count whitespace when application setting excludes whitespace", () => {
      const appSettings: ApplicationSettings = {
        ...defaultApplicationSettings,
        editor: {
          ...defaultApplicationSettings.editor,
          characterCount: {
            exclude: {
              whitespace: true, // App excludes whitespace
              lineBreaks: true,
              headings: false,
              markdownSyntax: true,
              markdownComments: true
            }
          }
        }
      };

      const projectSettings: ProjectSettings = {
        editor: {
          characterCount: {
            exclude: {
              whitespace: false // Project counts whitespace
            }
          }
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      const text = "A B";

      // With project override (whitespace: false), whitespace is counted
      const countWithProject = countMarkdownDocumentCharacters(text, {
        exclude: effective.editor.characterCount.exclude
      });
      expect(countWithProject).toBe(3); // 'A', ' ', 'B'

      // Without project override, application exclusion applies
      const effectiveApp = resolveEffectiveSettings(appSettings, undefined);
      const countAppOnly = countMarkdownDocumentCharacters(text, {
        exclude: effectiveApp.editor.characterCount.exclude
      });
      expect(countAppOnly).toBe(2); // 'A', 'B'
    });

    it("uses project override for line breaks and markdown syntax exclusions independently", () => {
      const appSettings: ApplicationSettings = {
        ...defaultApplicationSettings,
        editor: {
          ...defaultApplicationSettings.editor,
          characterCount: {
            exclude: {
              whitespace: true,
              lineBreaks: true,
              headings: false,
              markdownSyntax: true,
              markdownComments: true
            }
          }
        }
      };

      const projectSettings: ProjectSettings = {
        editor: {
          characterCount: {
            exclude: {
              markdownSyntax: false // Project counts **bold** asterisks
            }
          }
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      const text = "**A**";

      // With markdownSyntax: false, asterisks are counted: 5 characters
      expect(
        countMarkdownDocumentCharacters(text, {
          exclude: effective.editor.characterCount.exclude
        })
      ).toBe(5);

      // Without project override, syntax is excluded: only 'A' (1 character)
      const effectiveApp = resolveEffectiveSettings(appSettings, undefined);
      expect(
        countMarkdownDocumentCharacters(text, {
          exclude: effectiveApp.editor.characterCount.exclude
        })
      ).toBe(1);
    });
  });

  describe("line ending settings consumers (files.newFile.lineEnding and editor.lineEnding.expected)", () => {
    it("resolves files.newFile.lineEnding and editor.lineEnding.expected through effective settings", () => {
      const appSettings: ApplicationSettings = {
        ...defaultApplicationSettings,
        files: {
          newFile: {
            lineEnding: "lf",
            encoding: "utf8"
          }
        },
        editor: {
          ...defaultApplicationSettings.editor,
          lineEnding: {
            ...defaultApplicationSettings.editor.lineEnding,
            expected: "lf"
          }
        }
      };

      const projectSettings: ProjectSettings = {
        files: {
          newFile: {
            lineEnding: "crlf"
          }
        },
        editor: {
          lineEnding: {
            expected: "crlf"
          }
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      expect(effective.files.newFile.lineEnding).toBe("crlf");
      expect(effective.editor.lineEnding.expected).toBe("crlf");

      // When project settings are cleared / undefined, returns to application settings
      const cleared = resolveEffectiveSettings(appSettings, undefined);
      expect(cleared.files.newFile.lineEnding).toBe("lf");
      expect(cleared.editor.lineEnding.expected).toBe("lf");
    });
  });

  describe("documentMap.dialogueDelimiterPairs consumer (buildGlossaryDocumentMapPlan) (#396 Slice 7 Addendum)", () => {
    it("uses Project dialogue pairs override to classify dialogue spans and colors in document map", () => {
      const appSettings: ApplicationSettings = {
        ...defaultApplicationSettings,
        documentMap: {
          ...defaultApplicationSettings.documentMap,
          narrationColor: "#111111",
          dialogueDelimiterPairs: [
            { open: "「", close: "」", color: "#e06c75" }
          ]
        }
      };

      const projectSettings: ProjectSettings = {
        documentMap: {
          dialogueDelimiterPairs: [
            { open: "“", close: "”", color: "#61afef" }
          ]
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      const text = "地の文 “会話文” 地の文 「非会話文」";

      const plan = buildGlossaryDocumentMapPlan({
        text,
        wrapColumns: 40,
        entries: [],
        narrationColor: effective.documentMap.narrationColor,
        glossaryFallbackColor: effective.documentMap.glossaryFallbackColor,
        dialogueDelimiterPairs: effective.documentMap.dialogueDelimiterPairs
      });

      // The project delimiter “ ... ” should be recognized as dialogue
      expect(plan.dialogues).toHaveLength(1);
      expect(plan.dialogues[0].color).toBe("#61afef");
      expect(text.slice(plan.dialogues[0].startOffset, plan.dialogues[0].endOffset)).toBe("“会話文”");

      // The Japanese brackets 「 ... 」 should NOT be treated as dialogue because Project override replaced Application pairs
      const japaneseBracketOffset = text.indexOf("「");
      const bracketPixel = plan.pixels.find((p) => p.offset === japaneseBracketOffset);
      expect(bracketPixel?.dialogue).toBe(false);
      expect(bracketPixel?.color).toBe("#111111"); // narration color
    });

    it("respects empty array [] project override by treating all text as narration", () => {
      const appSettings: ApplicationSettings = {
        ...defaultApplicationSettings,
        documentMap: {
          ...defaultApplicationSettings.documentMap,
          narrationColor: "#111111",
          dialogueDelimiterPairs: [
            { open: "「", close: "」", color: "#e06c75" }
          ]
        }
      };

      const projectSettings: ProjectSettings = {
        documentMap: {
          dialogueDelimiterPairs: []
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      expect(effective.documentMap.dialogueDelimiterPairs).toEqual([]);

      const text = "「会話文に見えるテキスト」";
      const plan = buildGlossaryDocumentMapPlan({
        text,
        wrapColumns: 40,
        entries: [],
        narrationColor: effective.documentMap.narrationColor,
        glossaryFallbackColor: effective.documentMap.glossaryFallbackColor,
        dialogueDelimiterPairs: effective.documentMap.dialogueDelimiterPairs
      });

      expect(plan.dialogues).toHaveLength(0);
      expect(plan.pixels.every((p) => !p.dialogue)).toBe(true);
    });
  });
});

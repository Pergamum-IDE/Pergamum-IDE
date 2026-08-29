import { describe, expect, it } from "vitest";
import { buildRecoveryReport } from "../../src/main/recoveryReport";
import type { RecoveryCandidate } from "../../src/shared/recoveryCandidate";

const MANUSCRIPT_MARKER = "SECRET_MANUSCRIPT_BODY_REPORT_MARKER";

const EN_HEADING = "Pergamum Recovery Report";
const EN_DISCLAIMER =
  "This report describes Recovery candidates found by Pergamum. " +
  "It does not identify the cause of the previous shutdown or failure.";
const JA_HEADING = "Pergamum 復旧レポート";
const JA_DISCLAIMER =
  "このレポートは Pergamum が検出した復旧候補の情報です。" +
  "前回終了または障害の原因を特定するものではありません。";

function candidate(
  overrides: Partial<RecoveryCandidate> = {}
): RecoveryCandidate {
  return {
    recoveryId: "0198d95f-97d8-7000-8000-0000000000a1",
    documentType: "markdown.file",
    displayName: "chapter-03.md",
    documentEncoding: "utf-8",
    documentLineend: "lf",
    updatedAt: "2026-08-29T12:41:00.000Z",
    characterCount: 4210,
    previewSnippet: `${MANUSCRIPT_MARKER} preview…`,
    hasFilePath: true,
    hasProjectFilePath: true,
    ...overrides
  };
}

describe("buildRecoveryReport", () => {
  it("includes the allowed candidate metadata and the store summary", () => {
    const report = buildRecoveryReport({
      statusKind: "owner",
      appVersion: "0.60.0",
      generatedAt: "2026-08-29T12:41:00.000Z",
      language: "en",
      candidates: [
        candidate(),
        candidate({
          recoveryId: "0198d95f-97d8-7000-8000-0000000000b2",
          documentType: "markdown.untitled",
          displayName: "Untitled.md",
          documentEncoding: null,
          documentLineend: null,
          characterCount: 87,
          hasFilePath: false,
          hasProjectFilePath: false
        })
      ]
    });

    expect(report).toContain("generatedAt: 2026-08-29T12:41:00.000Z");
    expect(report).toContain("appVersion: 0.60.0");
    expect(report).toContain("recoveryStore: owner");
    expect(report).toContain("candidates: 2");
    expect(report).toContain("id: 0198d95f-97d8-7000-8000-0000000000a1");
    expect(report).toContain("type: markdown.file");
    expect(report).toContain("name: chapter-03.md");
    expect(report).toContain("updatedAt: 2026-08-29T12:41:00.000Z");
    expect(report).toContain("characterCount: 4210");
    expect(report).toContain("encoding: utf-8");
    expect(report).toContain("lineend: lf");
    expect(report).toContain("hasFilePath: true");
    expect(report).toContain("hasProjectFilePath: false");
    expect(report).toContain("encoding: -");
    expect(report).toContain("lineend: -");
  });

  it("keeps full updatedAt timestamps in the report (never date-only)", () => {
    const report = buildRecoveryReport({
      statusKind: "owner",
      appVersion: "0.60.0",
      generatedAt: "2026-08-29T12:41:00.000Z",
      language: "en",
      candidates: [candidate()]
    });

    expect(report).toContain("updatedAt: 2026-08-29T12:41:00.000Z");
    expect(report).not.toContain("updatedAt: 2026-08-29\n");
  });

  describe("language selection (#288 follow-up)", () => {
    it("English UI → English heading/disclaimer only, no Japanese disclaimer", () => {
      const report = buildRecoveryReport({
        statusKind: "owner",
        appVersion: null,
        generatedAt: "2026-08-29T00:00:00.000Z",
        language: "en",
        candidates: []
      });

      expect(report).toContain(EN_HEADING);
      expect(report).toContain(EN_DISCLAIMER);
      expect(report).not.toContain(JA_HEADING);
      expect(report).not.toContain(JA_DISCLAIMER);
      expect(report).not.toContain(
        "前回終了または障害の原因を特定するものではありません"
      );
    });

    it("Japanese UI → Japanese heading/disclaimer only, no English disclaimer", () => {
      const report = buildRecoveryReport({
        statusKind: "owner",
        appVersion: null,
        generatedAt: "2026-08-29T00:00:00.000Z",
        language: "ja",
        candidates: []
      });

      expect(report).toContain(JA_HEADING);
      expect(report).toContain(JA_DISCLAIMER);
      expect(report).not.toContain(EN_DISCLAIMER);
      expect(report).not.toContain(
        "It does not identify the cause of the previous shutdown or failure."
      );
    });

    it("keeps the stable ASCII technical field keys in both languages", () => {
      for (const language of ["en", "ja"] as const) {
        const report = buildRecoveryReport({
          statusKind: "owner",
          appVersion: null,
          generatedAt: "2026-08-29T00:00:00.000Z",
          language,
          candidates: []
        });
        expect(report).toContain("generatedAt: 2026-08-29T00:00:00.000Z");
        expect(report).toContain("appVersion: unknown");
        expect(report).toContain("recoveryStore: owner");
        expect(report).toContain("candidates: 0");
      }
    });
  });

  it("never contains body text, preview snippets, or raw absolute paths", () => {
    for (const language of ["en", "ja"] as const) {
      const report = buildRecoveryReport({
        statusKind: "owner",
        appVersion: "0.60.0",
        generatedAt: "2026-08-29T12:41:00.000Z",
        language,
        candidates: [candidate()]
      });

      expect(report).not.toContain(MANUSCRIPT_MARKER);
      expect(report).not.toContain("preview…");
      expect(report).not.toContain("C:/Novel");
      expect(report).not.toContain("secret-dir");
      expect(report).not.toContain("file://");
      expect(report).not.toContain("payload_text");
      expect(report).not.toContain("document_key");
      expect(report).not.toContain("source_uri");
    }
  });
});

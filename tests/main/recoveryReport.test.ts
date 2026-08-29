import { describe, expect, it } from "vitest";
import { buildRecoveryReport } from "../../src/main/recoveryReport";
import type { RecoveryCandidate } from "../../src/shared/recoveryCandidate";

const MANUSCRIPT_MARKER = "SECRET_MANUSCRIPT_BODY_REPORT_MARKER";

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

  it("states it does not identify the previous shutdown / failure cause (JA + EN)", () => {
    const report = buildRecoveryReport({
      statusKind: "owner",
      appVersion: null,
      generatedAt: "2026-08-29T00:00:00.000Z",
      candidates: []
    });
    expect(report).toContain(
      "It does not identify the cause of the previous shutdown or failure."
    );
    expect(report).toContain(
      "前回終了または障害の原因を特定するものではありません。"
    );
    expect(report).toContain("appVersion: unknown");
    expect(report).toContain("candidates: 0");
  });

  it("never contains body text, preview snippets, or raw absolute paths", () => {
    const report = buildRecoveryReport({
      statusKind: "owner",
      appVersion: "0.60.0",
      generatedAt: "2026-08-29T12:41:00.000Z",
      candidates: [candidate()]
    });

    expect(report).not.toContain(MANUSCRIPT_MARKER);
    expect(report).not.toContain("preview…");
    expect(report).not.toContain("C:/Novel");
    expect(report).not.toContain("secret-dir");
    expect(report).not.toContain("file://");
    expect(report).not.toContain("payload_text");
  });
});

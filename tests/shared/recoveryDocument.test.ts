import { describe, expect, it } from "vitest";
import {
  parseRecoveryDocumentDeleteRequest,
  parseRecoveryDocumentPayload,
  recoveryFileDocumentKey,
  recoveryFileSourceUri,
  recoveryUntitledDocumentKey,
  recoveryUntitledSourceUri,
  type RecoveryDocumentPayload
} from "../../src/shared/recoveryDocument";

const SHA = "a".repeat(64);

function filePayload(
  overrides: Partial<RecoveryDocumentPayload> = {}
): Record<string, unknown> {
  return {
    documentKey: "file:C:/Novel/chapter.md",
    documentType: "markdown.file",
    sourceUri: "file://C:/Novel/chapter.md",
    displayName: "chapter.md",
    filePath: "C:/Novel/chapter.md",
    documentEncoding: "utf-8",
    documentLineend: "crlf",
    baseMtimeMs: null,
    baseSize: 42,
    baseSha256: SHA,
    payloadText: "# Chapter\r\nSECRET_MANUSCRIPT_BODY",
    ...overrides
  };
}

describe("recoveryDocument key / uri formats", () => {
  it("builds file / untitled document keys and source URIs", () => {
    expect(recoveryFileDocumentKey("C:/Novel/chapter.md")).toBe(
      "file:C:/Novel/chapter.md"
    );
    expect(recoveryFileSourceUri("C:/Novel/chapter.md")).toBe(
      "file://C:/Novel/chapter.md"
    );
    expect(
      recoveryUntitledDocumentKey("0198d95f-97d8-7000-8000-000000000001")
    ).toBe("untitled:0198d95f-97d8-7000-8000-000000000001");
    expect(
      recoveryUntitledSourceUri("0198d95f-97d8-7000-8000-000000000001")
    ).toBe("untitled://0198d95f-97d8-7000-8000-000000000001");
  });
});

describe("parseRecoveryDocumentPayload", () => {
  it("accepts a well-formed Markdown file payload verbatim", () => {
    const parsed = parseRecoveryDocumentPayload(filePayload());
    expect(parsed).toEqual({
      documentKey: "file:C:/Novel/chapter.md",
      documentType: "markdown.file",
      sourceUri: "file://C:/Novel/chapter.md",
      displayName: "chapter.md",
      projectId: null,
      projectFilePath: null,
      filePath: "C:/Novel/chapter.md",
      documentEncoding: "utf-8",
      documentLineend: "crlf",
      baseMtimeMs: null,
      baseSize: 42,
      baseSha256: SHA,
      payloadText: "# Chapter\r\nSECRET_MANUSCRIPT_BODY"
    });
  });

  it("keeps an arbitrarily large payloadText untouched", () => {
    const huge = "x".repeat(5_000_000);
    const parsed = parseRecoveryDocumentPayload(
      filePayload({ payloadText: huge })
    );
    expect(parsed?.payloadText).toBe(huge);
  });

  it("nulls a malformed encoding / lineend / sha256 rather than rejecting", () => {
    const parsed = parseRecoveryDocumentPayload(
      filePayload({
        documentEncoding: "latin1",
        documentLineend: "mixed",
        baseSha256: "not-hex"
      })
    );
    expect(parsed?.documentEncoding).toBeNull();
    expect(parsed?.documentLineend).toBeNull();
    expect(parsed?.baseSha256).toBeNull();
  });

  it("accepts an Untitled payload with null base fingerprint + null attrs", () => {
    const parsed = parseRecoveryDocumentPayload({
      documentKey: "untitled:0198d95f-97d8-7000-8000-000000000001",
      documentType: "markdown.untitled",
      sourceUri: "untitled://0198d95f-97d8-7000-8000-000000000001",
      displayName: "Untitled.md",
      documentEncoding: null,
      documentLineend: null,
      baseMtimeMs: null,
      baseSize: null,
      baseSha256: null,
      payloadText: "typed but never saved"
    });
    expect(parsed).toMatchObject({
      documentType: "markdown.untitled",
      documentEncoding: null,
      documentLineend: null,
      baseMtimeMs: null,
      baseSize: null,
      baseSha256: null
    });
  });

  it("rejects when the key prefix disagrees with the document type", () => {
    expect(
      parseRecoveryDocumentPayload(
        filePayload({ documentType: "markdown.untitled" })
      )
    ).toBeNull();
  });

  it("rejects a missing payloadText, key, or type", () => {
    expect(
      parseRecoveryDocumentPayload(filePayload({ payloadText: undefined }))
    ).toBeNull();
    expect(
      parseRecoveryDocumentPayload(filePayload({ documentKey: "" }))
    ).toBeNull();
    expect(
      parseRecoveryDocumentPayload(filePayload({ documentType: "markdown" }))
    ).toBeNull();
    expect(parseRecoveryDocumentPayload(null)).toBeNull();
    expect(parseRecoveryDocumentPayload("nope")).toBeNull();
  });
});

describe("parseRecoveryDocumentDeleteRequest", () => {
  it("accepts a documentKey and rejects everything else", () => {
    expect(
      parseRecoveryDocumentDeleteRequest({ documentKey: "file:C:/a.md" })
    ).toEqual({ documentKey: "file:C:/a.md" });
    expect(parseRecoveryDocumentDeleteRequest({ documentKey: "" })).toBeNull();
    expect(parseRecoveryDocumentDeleteRequest({})).toBeNull();
    expect(parseRecoveryDocumentDeleteRequest(null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  decideMarkdownScope,
  fallbackFilenameForSessionEditor,
  resolveRestoredActiveEditor,
  samePergamumProjectLocator,
  selectRestoreSession,
  shouldSurfaceRestoreUnavailable,
  type RestoredEditorLike
} from "../../src/shared/sessionRestore";
import {
  SESSION_SCHEMA_VERSION,
  type SessionEditor,
  type SessionRecord
} from "../../src/shared/session";
import { PROJECT_ID, RUN_ID, sid } from "./sessionTestFixtures";

function record(
  label: string,
  overrides: Partial<SessionRecord> = {}
): SessionRecord {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: sid(label),
    instanceRunId: RUN_ID,
    updatedAt: "2026-08-28T00:00:00.000Z",
    projectContext: null,
    window: null,
    editors: [],
    activeEditor: null,
    ...overrides
  };
}

describe("selectRestoreSession (#274)", () => {
  it("selects the single valid Session", () => {
    const only = record("a");
    const result = selectRestoreSession({
      candidates: [only],
      launchTarget: null,
      platform: "linux"
    });

    expect(result).toEqual({
      kind: "selected",
      session: only,
      matchedLaunchTarget: false
    });
  });

  it("with no launch target, picks the latest updatedAt", () => {
    const older = record("old", { updatedAt: "2026-08-01T00:00:00.000Z" });
    const newer = record("new", { updatedAt: "2026-08-28T12:00:00.000Z" });

    const result = selectRestoreSession({
      candidates: [older, newer],
      launchTarget: null,
      platform: "linux"
    });

    expect(result).toMatchObject({ kind: "selected", session: newer });
  });

  it("tie on updatedAt is broken deterministically by manifest order", () => {
    const first = record("first");
    const second = record("second");

    expect(
      selectRestoreSession({
        candidates: [first, second],
        launchTarget: null,
        platform: "linux"
      })
    ).toMatchObject({ session: first });
    expect(
      selectRestoreSession({
        candidates: [second, first],
        launchTarget: null,
        platform: "linux"
      })
    ).toMatchObject({ session: second });
  });

  it("`.pergamum` target selects the Session whose Project locator matches", () => {
    const match = record("match", {
      projectContext: {
        projectId: PROJECT_ID,
        projectFilePath: "/home/w/BookA/BookA.pergamum",
        rootPath: "/home/w/BookA"
      }
    });
    const other = record("other", {
      projectContext: {
        projectId: sid("pB"),
        projectFilePath: "/home/w/BookB/BookB.pergamum",
        rootPath: "/home/w/BookB"
      }
    });

    const result = selectRestoreSession({
      candidates: [other, match],
      launchTarget: {
        kind: "pergamum",
        filePath: "/home/w/BookA/BookA.pergamum"
      },
      platform: "linux"
    });

    expect(result).toEqual({
      kind: "selected",
      session: match,
      matchedLaunchTarget: true
    });
  });

  it("`.pergamum` target with no matching Session restores nothing (open normally)", () => {
    const unrelated = record("unrelated", {
      projectContext: {
        projectId: PROJECT_ID,
        projectFilePath: "/home/w/BookA/BookA.pergamum",
        rootPath: "/home/w/BookA"
      }
    });

    const result = selectRestoreSession({
      candidates: [unrelated],
      launchTarget: {
        kind: "pergamum",
        filePath: "/home/w/BookC/BookC.pergamum"
      },
      platform: "linux"
    });

    expect(result).toEqual({
      kind: "none",
      reason: "noMatchingSessionForPergamumTarget"
    });
  });

  it("Markdown target with multiple Sessions still picks the latest", () => {
    const older = record("old", { updatedAt: "2026-08-01T00:00:00.000Z" });
    const newer = record("new", { updatedAt: "2026-08-28T00:00:00.000Z" });

    expect(
      selectRestoreSession({
        candidates: [older, newer],
        launchTarget: { kind: "markdown", filePath: "/x/a.md" },
        platform: "linux"
      })
    ).toMatchObject({ kind: "selected", session: newer });
  });

  it("no candidates → none", () => {
    expect(
      selectRestoreSession({
        candidates: [],
        launchTarget: null,
        platform: "linux"
      })
    ).toEqual({ kind: "none", reason: "noCandidates" });
  });
});

describe("samePergamumProjectLocator", () => {
  it("normalizes separators and is case-insensitive on Windows", () => {
    expect(
      samePergamumProjectLocator(
        "C:\\Users\\w\\Book\\Book.pergamum",
        "c:/users/w/book/book.pergamum",
        "windows"
      )
    ).toBe(true);
  });

  it("is case-sensitive on linux", () => {
    expect(
      samePergamumProjectLocator("/w/Book/B.pergamum", "/w/book/B.pergamum", "linux")
    ).toBe(false);
  });
});

describe("resolveRestoredActiveEditor (#274)", () => {
  const proj: RestoredEditorLike = {
    identity: { kind: "projectMarkdown", relativePath: "b/mid.md" },
    fallbackFilename: "mid.md"
  };
  const standalone: RestoredEditorLike = {
    identity: { kind: "standaloneMarkdown", filePath: "/x/aaa.md" },
    fallbackFilename: "aaa.md"
  };
  const glossary: RestoredEditorLike = {
    identity: { kind: "glossaryEntry", entryId: "e1" },
    fallbackFilename: null
  };

  it("activates the saved active editor when it was restored", () => {
    expect(
      resolveRestoredActiveEditor({
        restored: [proj, standalone],
        savedActive: proj.identity
      })
    ).toEqual(proj.identity);
  });

  it("falls back to the filename-ascending first FILE editor", () => {
    expect(
      resolveRestoredActiveEditor({
        restored: [proj, standalone],
        savedActive: { kind: "untitled", untitledId: "u1" }
      })
    ).toEqual(standalone.identity); // "aaa.md" < "mid.md"
  });

  it("glossary is never selected via the FILE (filename) fallback when a file editor exists", () => {
    expect(
      resolveRestoredActiveEditor({
        restored: [glossary, standalone],
        savedActive: { kind: "untitled", untitledId: "u1" }
      })
    ).toEqual(standalone.identity);
  });

  it("no successful FILE editor but other editors exist → first restored editor (invariant-safe)", () => {
    expect(
      resolveRestoredActiveEditor({
        restored: [glossary],
        savedActive: null
      })
    ).toEqual(glossary.identity);
  });

  it("no successful FILE editor, saved active untitled (skipped) → first restored editor", () => {
    const g2: RestoredEditorLike = {
      identity: { kind: "glossaryEntry", entryId: "e2" },
      fallbackFilename: null
    };
    expect(
      resolveRestoredActiveEditor({
        restored: [glossary, g2],
        savedActive: { kind: "untitled", untitledId: "u-gone" }
      })
    ).toEqual(glossary.identity);
  });

  it("multiple glossary-only editors → deterministic first by saved order", () => {
    const g2: RestoredEditorLike = {
      identity: { kind: "glossaryEntry", entryId: "e2" },
      fallbackFilename: null
    };
    const g3: RestoredEditorLike = {
      identity: { kind: "glossaryEntry", entryId: "e3" },
      fallbackFilename: null
    };
    expect(
      resolveRestoredActiveEditor({
        restored: [g2, glossary, g3],
        savedActive: null
      })
    ).toEqual(g2.identity);
  });

  it("zero restored editors → genuine safe no-active (null)", () => {
    expect(
      resolveRestoredActiveEditor({ restored: [], savedActive: null })
    ).toBeNull();
  });
});

describe("fallbackFilenameForSessionEditor", () => {
  it("returns basenames for file editors, null otherwise", () => {
    const pm: SessionEditor = {
      kind: "projectMarkdown",
      order: 0,
      relativePath: "chapters/one.md",
      viewState: null
    };
    const sm: SessionEditor = {
      kind: "standaloneMarkdown",
      order: 1,
      filePath: "C:\\notes\\two.md",
      viewState: null
    };
    const gl: SessionEditor = {
      kind: "glossaryEntry",
      order: 2,
      entryId: "e",
      viewState: null
    };

    expect(fallbackFilenameForSessionEditor(pm)).toBe("one.md");
    expect(fallbackFilenameForSessionEditor(sm)).toBe("two.md");
    expect(fallbackFilenameForSessionEditor(gl)).toBeNull();
  });
});

describe("decideMarkdownScope (#274)", () => {
  it("inside the restored project root → insideProject", () => {
    expect(
      decideMarkdownScope({
        markdownPath: "/w/Book/chapters/a.md",
        projectRootPath: "/w/Book",
        platform: "linux"
      })
    ).toBe("insideProject");
  });

  it("outside the root → standalone", () => {
    expect(
      decideMarkdownScope({
        markdownPath: "/w/Other/a.md",
        projectRootPath: "/w/Book",
        platform: "linux"
      })
    ).toBe("standalone");
  });

  it("no restored project → standalone", () => {
    expect(
      decideMarkdownScope({
        markdownPath: "/w/a.md",
        projectRootPath: null,
        platform: "linux"
      })
    ).toBe("standalone");
  });

  it("unparseable path → standalone (never guess)", () => {
    expect(
      decideMarkdownScope({
        markdownPath: "not-absolute",
        projectRootPath: "/w/Book",
        platform: "linux"
      })
    ).toBe("standalone");
  });
});

describe("shouldSurfaceRestoreUnavailable (#274)", () => {
  it("true when the manifest itself was unavailable", () => {
    expect(
      shouldSurfaceRestoreUnavailable({
        manifestUnavailable: "malformed",
        manifestListedSessionCount: 0,
        validCandidateCount: 0
      })
    ).toBe(true);
  });

  it("true when sessions were listed but none validated", () => {
    expect(
      shouldSurfaceRestoreUnavailable({
        manifestUnavailable: null,
        manifestListedSessionCount: 3,
        validCandidateCount: 0
      })
    ).toBe(true);
  });

  it("false for a genuinely empty manifest", () => {
    expect(
      shouldSurfaceRestoreUnavailable({
        manifestUnavailable: null,
        manifestListedSessionCount: 0,
        validCandidateCount: 0
      })
    ).toBe(false);
  });

  it("false when at least one session validated", () => {
    expect(
      shouldSurfaceRestoreUnavailable({
        manifestUnavailable: null,
        manifestListedSessionCount: 3,
        validCandidateCount: 1
      })
    ).toBe(false);
  });
});

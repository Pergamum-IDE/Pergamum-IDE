import { describe, expect, it } from "vitest";
import {
  applyDocumentMapPngExportHeaderToggle,
  buildDocumentMapPngExportRows,
  deriveDefaultDocumentMapPngBaseFileName,
  documentMapPngExportFilePath,
  documentMapPngPageFileName,
  isDocumentMapPngBaseFileNameValid,
  isDocumentMapPngExportButtonEnabled,
  planDocumentMapPngExportTargets,
  resolveDocumentMapPngExportHeaderToggleState,
  toggleDocumentMapPngExportRow,
  validateDocumentMapPngBaseFileName,
  type DocumentMapPngExportRow
} from "../../src/renderer/documentMapPngExportPlan";

describe("documentMapPngPageFileName", () => {
  it("zero-pads to 3 digits", () => {
    expect(documentMapPngPageFileName("chapter01-map", 1)).toBe(
      "chapter01-map_001.png"
    );
    expect(documentMapPngPageFileName("chapter01-map", 12)).toBe(
      "chapter01-map_012.png"
    );
    expect(documentMapPngPageFileName("chapter01-map", 123)).toBe(
      "chapter01-map_123.png"
    );
  });

  it("uses _001.png even for a single-page map", () => {
    expect(documentMapPngPageFileName("solo", 1)).toBe("solo_001.png");
  });
});

describe("deriveDefaultDocumentMapPngBaseFileName", () => {
  it("strips the .md extension from the document title", () => {
    expect(deriveDefaultDocumentMapPngBaseFileName("chapter01.md")).toBe(
      "chapter01"
    );
  });

  it("strips the .markdown extension", () => {
    expect(deriveDefaultDocumentMapPngBaseFileName("notes.markdown")).toBe(
      "notes"
    );
  });

  it("sanitizes forbidden characters", () => {
    expect(deriveDefaultDocumentMapPngBaseFileName("a/b:c.md")).toBe("a_b_c");
  });

  it("falls back to a safe default for null / empty titles", () => {
    expect(isDocumentMapPngBaseFileNameValid(
      deriveDefaultDocumentMapPngBaseFileName(null)
    )).toBe(true);
    expect(isDocumentMapPngBaseFileNameValid(
      deriveDefaultDocumentMapPngBaseFileName("")
    )).toBe(true);
  });

  it("appends a suffix when the title collides with a Windows reserved device name", () => {
    const derived = deriveDefaultDocumentMapPngBaseFileName("CON.md");
    expect(isDocumentMapPngBaseFileNameValid(derived)).toBe(true);
    expect(derived.toLowerCase()).not.toBe("con");
  });

  it("always returns an already-valid name", () => {
    for (const title of ["chapter01.md", "CON.md", null, "", "a<>b.md"]) {
      expect(
        validateDocumentMapPngBaseFileName(
          deriveDefaultDocumentMapPngBaseFileName(title)
        ).ok
      ).toBe(true);
    }
  });
});

describe("validateDocumentMapPngBaseFileName", () => {
  it("accepts an ordinary name", () => {
    expect(validateDocumentMapPngBaseFileName("chapter01-map")).toEqual({
      ok: true
    });
  });

  it("rejects an empty name", () => {
    expect(validateDocumentMapPngBaseFileName("")).toEqual({
      ok: false,
      error: "empty"
    });
  });

  it.each(["<", ">", ":", '"', "/", "\\", "|", "?", "*"])(
    "rejects the forbidden character %s",
    (character) => {
      expect(
        validateDocumentMapPngBaseFileName(`name${character}part`)
      ).toEqual({ ok: false, error: "invalidCharacter" });
    }
  );

  it("rejects control characters", () => {
    expect(validateDocumentMapPngBaseFileName("name\u0007part")).toEqual({
      ok: false,
      error: "controlCharacter"
    });
  });

  it("rejects a name ending with a dot", () => {
    expect(validateDocumentMapPngBaseFileName("name.")).toEqual({
      ok: false,
      error: "trailingDotOrSpace"
    });
  });

  it("rejects a name ending with a trailing space", () => {
    expect(validateDocumentMapPngBaseFileName("name ")).toEqual({
      ok: false,
      error: "trailingDotOrSpace"
    });
  });

  it.each(["CON", "con", "PRN", "AUX", "NUL", "COM1", "com9", "LPT1", "lpt9"])(
    "rejects the Windows reserved device name %s",
    (name) => {
      expect(validateDocumentMapPngBaseFileName(name)).toEqual({
        ok: false,
        error: "reservedName"
      });
    }
  );

  it("does not reject a name that merely contains a reserved word as a substring", () => {
    expect(validateDocumentMapPngBaseFileName("CONtract")).toEqual({
      ok: true
    });
  });
});

describe("buildDocumentMapPngExportRows", () => {
  it("builds one row per page, all enabled by default", () => {
    const rows = buildDocumentMapPngExportRows(3, "base");
    expect(rows).toEqual([
      { pageIndex: 0, pageNumber: 1, fileName: "base_001.png", outputEnabled: true },
      { pageIndex: 1, pageNumber: 2, fileName: "base_002.png", outputEnabled: true },
      { pageIndex: 2, pageNumber: 3, fileName: "base_003.png", outputEnabled: true }
    ]);
  });

  it("regenerates filenames from a new base name while preserving outputEnabled by pageIndex", () => {
    const initial = buildDocumentMapPngExportRows(3, "base");
    const toggled = toggleDocumentMapPngExportRow(initial, 1);

    const rebuilt = buildDocumentMapPngExportRows(3, "renamed", toggled);

    expect(rebuilt.map((row) => row.fileName)).toEqual([
      "renamed_001.png",
      "renamed_002.png",
      "renamed_003.png"
    ]);
    expect(rebuilt.map((row) => row.outputEnabled)).toEqual([true, false, true]);
  });

  it("defaults a newly-added page (page count increased) to enabled", () => {
    const initial = buildDocumentMapPngExportRows(2, "base");
    const toggled = toggleDocumentMapPngExportRow(initial, 0);

    const grown = buildDocumentMapPngExportRows(3, "base", toggled);

    expect(grown.map((row) => row.outputEnabled)).toEqual([false, true, true]);
  });
});

describe("toggleDocumentMapPngExportRow", () => {
  it("flips only the targeted row", () => {
    const rows = buildDocumentMapPngExportRows(2, "base");
    const toggled = toggleDocumentMapPngExportRow(rows, 0);

    expect(toggled[0].outputEnabled).toBe(false);
    expect(toggled[1].outputEnabled).toBe(true);
  });
});

describe("resolveDocumentMapPngExportHeaderToggleState / applyDocumentMapPngExportHeaderToggle", () => {
  function rowsWithEnabled(...enabled: boolean[]): DocumentMapPngExportRow[] {
    return enabled.map((outputEnabled, index) => ({
      pageIndex: index,
      pageNumber: index + 1,
      fileName: `base_${String(index + 1).padStart(3, "0")}.png`,
      outputEnabled
    }));
  }

  it("reports allEnabled when every row is enabled", () => {
    expect(
      resolveDocumentMapPngExportHeaderToggleState(rowsWithEnabled(true, true))
    ).toBe("allEnabled");
  });

  it("reports allDisabled when every row is disabled", () => {
    expect(
      resolveDocumentMapPngExportHeaderToggleState(rowsWithEnabled(false, false))
    ).toBe("allDisabled");
  });

  it("reports mixed when some rows are enabled", () => {
    expect(
      resolveDocumentMapPngExportHeaderToggleState(rowsWithEnabled(true, false))
    ).toBe("mixed");
  });

  it("enables all rows when toggled from allDisabled", () => {
    const result = applyDocumentMapPngExportHeaderToggle(
      rowsWithEnabled(false, false)
    );
    expect(result.every((row) => row.outputEnabled)).toBe(true);
  });

  it("enables all rows when toggled from mixed", () => {
    const result = applyDocumentMapPngExportHeaderToggle(
      rowsWithEnabled(true, false)
    );
    expect(result.every((row) => row.outputEnabled)).toBe(true);
  });

  it("disables all rows when toggled from allEnabled", () => {
    const result = applyDocumentMapPngExportHeaderToggle(
      rowsWithEnabled(true, true)
    );
    expect(result.every((row) => !row.outputEnabled)).toBe(true);
  });
});

describe("isDocumentMapPngExportButtonEnabled", () => {
  const validRows = buildDocumentMapPngExportRows(2, "base");
  const baseInput = {
    outputFolder: "C:\\exports",
    baseFileName: "base",
    rows: validRows,
    isExporting: false,
    hasSucceeded: false
  };

  it("is enabled when everything is valid", () => {
    expect(isDocumentMapPngExportButtonEnabled(baseInput)).toBe(true);
  });

  it("is disabled when the output folder is empty", () => {
    expect(
      isDocumentMapPngExportButtonEnabled({ ...baseInput, outputFolder: "" })
    ).toBe(false);
  });

  it("is disabled when the base filename is invalid", () => {
    expect(
      isDocumentMapPngExportButtonEnabled({ ...baseInput, baseFileName: "" })
    ).toBe(false);
  });

  it("is disabled when every row is disabled", () => {
    const allDisabled = validRows.map((row) => ({
      ...row,
      outputEnabled: false
    }));
    expect(
      isDocumentMapPngExportButtonEnabled({ ...baseInput, rows: allDisabled })
    ).toBe(false);
  });

  it("is disabled while exporting", () => {
    expect(
      isDocumentMapPngExportButtonEnabled({ ...baseInput, isExporting: true })
    ).toBe(false);
  });

  it("is disabled after a successful export", () => {
    expect(
      isDocumentMapPngExportButtonEnabled({ ...baseInput, hasSucceeded: true })
    ).toBe(false);
  });
});

describe("documentMapPngExportFilePath", () => {
  it("joins a Windows-style folder with a backslash", () => {
    expect(documentMapPngExportFilePath("C:\\exports", "a_001.png")).toBe(
      "C:\\exports\\a_001.png"
    );
  });

  it("joins a POSIX-style folder with a forward slash", () => {
    expect(documentMapPngExportFilePath("/home/user/exports", "a_001.png")).toBe(
      "/home/user/exports/a_001.png"
    );
  });

  it("does not double up a trailing separator", () => {
    expect(documentMapPngExportFilePath("C:\\exports\\", "a_001.png")).toBe(
      "C:\\exports\\a_001.png"
    );
  });
});

describe("planDocumentMapPngExportTargets", () => {
  it("includes only output-enabled rows", () => {
    const rows = toggleDocumentMapPngExportRow(
      buildDocumentMapPngExportRows(3, "base"),
      1
    );

    const targets = planDocumentMapPngExportTargets(rows, "/exports");

    expect(targets.map((target) => target.pageIndex)).toEqual([0, 2]);
    expect(targets.map((target) => target.filePath)).toEqual([
      "/exports/base_001.png",
      "/exports/base_003.png"
    ]);
  });

  it("returns an empty list when every row is disabled", () => {
    const allDisabled = buildDocumentMapPngExportRows(2, "base").map((row) => ({
      ...row,
      outputEnabled: false
    }));

    expect(planDocumentMapPngExportTargets(allDisabled, "/exports")).toEqual([]);
  });
});

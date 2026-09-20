import type { PdfFontInspectionResult } from "./api";

export interface PdfBufferLike {
  toString(encoding?: string, start?: number, end?: number): string;
}

export function escapeCssFontFamily(family: string): string {
  return family.replace(/[\r\n\t\\"';{}]/g, "").trim();
}

export function normalizeFontNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[a-z]{6}\+/, "")
    .replace(/[\s_-]+/g, "")
    .replace(/regular|medium|book|roman/gi, "")
    .replace(/bold|italic|oblique/gi, "");
}

export function extractPdfFontNames(buffer: PdfBufferLike): string[] {
  const content = buffer.toString("latin1");
  const fontNames = new Set<string>();

  const baseFontRegex = /\/BaseFont\s*\/([A-Za-z0-9+#_.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = baseFontRegex.exec(content)) !== null) {
    if (match[1]) {
      fontNames.add(match[1]);
    }
  }

  const fontNameRegex = /\/FontName\s*\/([A-Za-z0-9+#_.-]+)/g;
  while ((match = fontNameRegex.exec(content)) !== null) {
    if (match[1]) {
      fontNames.add(match[1]);
    }
  }

  const fontFamilyRegex =
    /\/FontFamily\s*(?:\/([A-Za-z0-9+#_.-]+)|\(([^)]+)\))/g;
  while ((match = fontFamilyRegex.exec(content)) !== null) {
    const val = match[1] || match[2];
    if (val) {
      fontNames.add(val.trim());
    }
  }

  return Array.from(fontNames);
}

export function inspectPdfFonts(
  pdfBuffer: PdfBufferLike,
  requestedFontFamily?: string | null
): PdfFontInspectionResult {
  if (!requestedFontFamily || requestedFontFamily.trim().length === 0) {
    return {
      status: "skipped",
      detectedFonts: extractPdfFontNames(pdfBuffer)
    };
  }

  try {
    const detectedFonts = extractPdfFontNames(pdfBuffer);
    const normReq = normalizeFontNameForMatch(requestedFontFamily);

    if (!normReq) {
      return {
        status: "skipped",
        requestedFontFamily,
        detectedFonts
      };
    }

    const matchedFonts: string[] = [];
    const otherFonts: string[] = [];

    for (const font of detectedFonts) {
      const normDet = normalizeFontNameForMatch(font);
      if (
        normDet === normReq ||
        (normDet.length > 2 &&
          normReq.length > 2 &&
          (normDet.includes(normReq) || normReq.includes(normDet)))
      ) {
        matchedFonts.push(font);
      } else {
        otherFonts.push(font);
      }
    }

    if (matchedFonts.length === 0) {
      return {
        status: "notConfirmed",
        requestedFontFamily,
        detectedFonts,
        matchedFonts: []
      };
    }

    if (otherFonts.length > 0) {
      return {
        status: "partial",
        requestedFontFamily,
        detectedFonts,
        matchedFonts
      };
    }

    return {
      status: "confirmed",
      requestedFontFamily,
      detectedFonts,
      matchedFonts
    };
  } catch (error) {
    return {
      status: "notConfirmed",
      requestedFontFamily,
      detectedFonts: [],
      message:
        error instanceof Error ? error.message : "Font inspection failed"
    };
  }
}

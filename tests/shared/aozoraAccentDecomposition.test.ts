import { describe, expect, it } from "vitest";
import {
  AOZORA_ACCENT_DECOMPOSITION_TABLE,
  decodeAozoraAccentDecomposedBody,
  decodeAozoraAccentDecomposedText
} from "../../src/shared/aozoraAccentDecomposition";

describe("Aozora Accent Decomposition Table (#562)", () => {
  it("is sorted by source length descending, then source ascending", () => {
    for (let i = 0; i < AOZORA_ACCENT_DECOMPOSITION_TABLE.length - 1; i++) {
      const current = AOZORA_ACCENT_DECOMPOSITION_TABLE[i];
      const next = AOZORA_ACCENT_DECOMPOSITION_TABLE[i + 1];

      if (current.source.length === next.source.length) {
        expect(current.source.localeCompare(next.source)).toBeLessThanOrEqual(0);
      } else {
        expect(current.source.length).toBeGreaterThan(next.source.length);
      }
    }
  });

  it("contains representative entries from primary source", () => {
    const tableMap = new Map(
      AOZORA_ACCENT_DECOMPOSITION_TABLE.map((e) => [e.source, e.replacement])
    );

    expect(tableMap.get("!@")).toBe("¡");
    expect(tableMap.get("?@")).toBe("¿");
    expect(tableMap.get("A`")).toBe("À");
    expect(tableMap.get("A'")).toBe("Á");
    expect(tableMap.get("AE&")).toBe("Æ");
    expect(tableMap.get("a`")).toBe("à");
    expect(tableMap.get("a'")).toBe("á");
    expect(tableMap.get("ae&")).toBe("æ");
    expect(tableMap.get("s&")).toBe("ß");
    expect(tableMap.get("OE&")).toBe("Œ");
    expect(tableMap.get("oe&")).toBe("œ");
    expect(tableMap.get("O/")).toBe("Ø");
    expect(tableMap.get("o/")).toBe("ø");
    expect(tableMap.get("u_")).toBe("ū");
  });

  it("has no duplicate source keys", () => {
    const seen = new Set<string>();
    for (const entry of AOZORA_ACCENT_DECOMPOSITION_TABLE) {
      expect(seen.has(entry.source)).toBe(false);
      seen.add(entry.source);
    }
  });

  it("does not include invalid entries like -- or N/A", () => {
    for (const entry of AOZORA_ACCENT_DECOMPOSITION_TABLE) {
      expect(entry.replacement).not.toBe("--");
      expect(entry.replacement).not.toBe("N/A");
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.replacement.length).toBeGreaterThan(0);
    }
  });
});

describe("decodeAozoraAccentDecomposedBody (#562)", () => {
  it("decodes single accent patterns", () => {
    expect(decodeAozoraAccentDecomposedBody("a`")).toBe("à");
    expect(decodeAozoraAccentDecomposedBody("A`")).toBe("À");
    expect(decodeAozoraAccentDecomposedBody("o:")).toBe("ö");
    expect(decodeAozoraAccentDecomposedBody("ae&")).toBe("æ");
    expect(decodeAozoraAccentDecomposedBody("AE&")).toBe("Æ");
    expect(decodeAozoraAccentDecomposedBody("u_")).toBe("ū");
    expect(decodeAozoraAccentDecomposedBody("!@")).toBe("¡");
    expect(decodeAozoraAccentDecomposedBody("?@")).toBe("¿");
  });

  it("decodes multiple accent patterns within a word", () => {
    expect(decodeAozoraAccentDecomposedBody("e'tiquette")).toBe("étiquette");
    expect(decodeAozoraAccentDecomposedBody("R-e'sume'")).toBe("R-ésumé");
  });

  it("performs greedy longest-prefix matching", () => {
    // AE& (length 3) should match before A (if any) or E&
    expect(decodeAozoraAccentDecomposedBody("AE&")).toBe("Æ");
    expect(decodeAozoraAccentDecomposedBody("ae&")).toBe("æ");
    expect(decodeAozoraAccentDecomposedBody("OE&")).toBe("Œ");
    expect(decodeAozoraAccentDecomposedBody("oe&")).toBe("œ");
  });

  it("preserves unknown body content verbatim", () => {
    expect(decodeAozoraAccentDecomposedBody("unknown")).toBe("unknown");
    expect(decodeAozoraAccentDecomposedBody("foo123bar")).toBe("foo123bar");
  });
});

describe("decodeAozoraAccentDecomposedText (#562)", () => {
  it("converts text inside 〔...〕 and removes outer brackets", () => {
    expect(decodeAozoraAccentDecomposedText("これは〔e'tiquette〕です")).toBe(
      "これはétiquetteです"
    );
    expect(
      decodeAozoraAccentDecomposedText("これは〔a`〕〔o:〕〔ae&〕の例です")
    ).toBe("これはàöæの例です");
    expect(
      decodeAozoraAccentDecomposedText("これは〔AE&〕〔OE&〕〔s&〕の例です")
    ).toBe("これはÆŒßの例です");
    expect(
      decodeAozoraAccentDecomposedText("これは〔!@〕Hola〔?@〕の例です")
    ).toBe("これは¡Hola¿の例です");
  });

  it("removes outer brackets even when content is unknown", () => {
    expect(decodeAozoraAccentDecomposedText("これは〔unknown〕です")).toBe(
      "これはunknownです"
    );
  });

  it("leaves text outside 〔...〕 completely untouched", () => {
    const input = "通常のテキスト〔a`〕は変わらない";
    expect(decodeAozoraAccentDecomposedText(input)).toBe(
      "通常のテキストàは変わらない"
    );
  });

  it("handles unclosed/malformed brackets safely without throwing", () => {
    expect(decodeAozoraAccentDecomposedText("これは〔未閉じテキストです")).toBe(
      "これは〔未閉じテキストです"
    );
    expect(decodeAozoraAccentDecomposedText("")).toBe("");
  });

  it("ignores 〔 and 〕 inside Aozora annotations ［＃...］", () => {
    const input =
      "〔Quid aliud est mulier nisi amicitiae&［＃「〔amicitiae&〕」は底本では「amiticiae」］ inimica〕";
    const decoded = decodeAozoraAccentDecomposedText(input);
    expect(decoded).toBe(
      "Quid aliud est mulier nisi amicitiæ［＃「〔amicitiae&〕」は底本では「amiticiae」］ inimica"
    );
  });

  it("produces NFC-normalized string", () => {
    const result = decodeAozoraAccentDecomposedText("〔e'〕");
    expect(result).toBe("é".normalize("NFC"));
  });
});

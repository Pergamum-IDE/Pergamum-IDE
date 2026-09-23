import { describe, expect, it } from "vitest";
import { aozoraPreviewRenderer } from "../../src/renderer/preview/aozoraPreviewRenderer";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";

describe("Aozora Preview Accent Decomposition (#562)", () => {
  it("renders accent-decomposed notation in Aozora horizontal preview", () => {
    const input = [
      "これは〔e'tiquette〕の例です。",
      "これは〔a`〕〔o:〕〔ae&〕の例です。",
      "これは〔AE&〕〔OE&〕〔s&〕の例です。",
      "これは〔!@〕Hola〔?@〕の例です。",
      "これは〔unknown〕の例です。"
    ].join("\n");

    const html = aozoraPreviewRenderer.render(input);

    expect(html).toContain("これはétiquetteの例です。");
    expect(html).toContain("これはàöæの例です。");
    expect(html).toContain("これはÆŒßの例です。");
    expect(html).toContain("これは¡Hola¿の例です。");
    expect(html).toContain("これはunknownの例です。");
    expect(html).not.toContain("〔");
    expect(html).not.toContain("〕");
  });

  it("does not regress existing Aozora ruby and annotation rendering", () => {
    const input = "｜菖苔《わらづと》と〔e'tiquette〕";
    const html = aozoraPreviewRenderer.render(input);

    expect(html).toContain("<ruby>菖苔<rt>わらづと</rt></ruby>");
    expect(html).toContain("étiquette");
    expect(html).not.toContain("〔");
    expect(html).not.toContain("〕");
  });

  it("correctly handles 〔...〕 containing Aozora annotations ［＃...］ (user reproduction)", () => {
    const input =
      "「何だって？　〔Quid aliud est mulier nisi amicitiae&［＃「〔amicitiae&〕」は底本では「amiticiae」］ inimica〕……こりゃ君｜羅甸語《ラテンご》じゃないか」";
    const html = aozoraPreviewRenderer.render(input);

    expect(html).toContain(
      "「何だって？　Quid aliud est mulier nisi amicitiæ inimica……こりゃ君<ruby>羅甸語<rt>ラテンご</rt></ruby>じゃないか」"
    );
    expect(html).not.toContain("〔");
    expect(html).not.toContain("〕");
  });

  it("does not apply accent decomposition to normal Markdown preview", () => {
    const input = "これは〔e'tiquette〕です。";
    const html = markdownPreviewRenderer.render(input);

    expect(html).toContain("これは〔e'tiquette〕です。");
    expect(html).not.toContain("étiquette");
  });
});

import katexCss from "katex/dist/katex.min.css?raw";

/**
 * #574 Slice 6: KaTeX's stylesheet for exported HTML, with its fonts inlined
 * as `data:` URLs so math renders offline without copying font files.
 *
 * Only the woff2 fonts are embedded (every current browser supports them); the
 * woff / ttf fallbacks are dropped. The fonts are separate lazy chunks, loaded
 * only when an export actually contains math.
 */

type FontLoaders = Readonly<Record<string, () => Promise<unknown>>>;

const katexWoff2FontLoaders: FontLoaders = import.meta.glob(
  "../../../node_modules/katex/dist/fonts/*.woff2",
  { query: "?inline", import: "default" }
);

function fontFileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Pure: rewrite `url(fonts/<name>.woff2)` to the loaded data URLs. */
export async function inlineKatexWoff2Fonts(
  css: string,
  loaders: FontLoaders
): Promise<string> {
  const dataUrlByFileName = new Map<string, string>();

  await Promise.all(
    Object.entries(loaders).map(async ([path, load]) => {
      const dataUrl = await load();

      if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
        dataUrlByFileName.set(fontFileName(path), dataUrl);
      }
    })
  );

  return css
    .replace(/,\s*url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, "")
    .replace(/url\(fonts\/([^)]+\.woff2)\)/g, (whole, fileName: string) => {
      const dataUrl = dataUrlByFileName.get(fileName);

      return dataUrl ? `url(${dataUrl})` : whole;
    });
}

export async function loadKatexExportCss(): Promise<string> {
  return inlineKatexWoff2Fonts(katexCss, katexWoff2FontLoaders);
}

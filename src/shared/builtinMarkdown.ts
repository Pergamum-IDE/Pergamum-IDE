import type { Language } from "./i18n";

/**
 * Built-in, read-only Markdown documents shipped with Pergamum (not files:
 * there is no path, no project and no disk copy). They open in the regular
 * Markdown Editor / Preview, read-only, and are identified by `BuiltinMarkdownId`
 * — never by a locale-dependent title.
 */
export const builtinMarkdownIds = ["markdownCheatSheet"] as const;

export type BuiltinMarkdownId = (typeof builtinMarkdownIds)[number];

export function isBuiltinMarkdownId(value: unknown): value is BuiltinMarkdownId {
  return (
    typeof value === "string" &&
    (builtinMarkdownIds as readonly string[]).includes(value)
  );
}

// Written as line arrays so the fenced blocks and the TeX backslash stay
// exact (no template-literal escaping).
const markdownCheatSheetJa: readonly string[] = [
  "# Markdown チートシート",
  "",
  "PergamumではMarkdown形式で文章を書くことができます。",
  "左側の記述と、右側のプレビューを見比べてみてください。",
  "",
  "## 見出し2",
  "",
  "### 見出し3",
  "",
  "この段落は **太字** のサンプルです。",
  "",
  "フォントによっては *イタリック* が反映されません。",
  "",
  "~~取り消し線~~",
  "",
  "---",
  "",
  "## 箇条書き",
  "",
  "- 項目1",
  "- 項目2",
  "- 項目3",
  "",
  "## 引用",
  "",
  "> これは引用文です。",
  "",
  "## 表",
  "",
  "| 名前 | 役割 |",
  "| --- | --- |",
  "| アリス | 主人公 |",
  "| ボブ | 友人 |",
  "",
  "## ハイパーリンク",
  "",
  "[Pergamum-IDE/Pergamum-IDE](https://github.com/Pergamum-IDE/Pergamum-IDE)",
  "",
  "## 数式",
  "",
  "円の面積は次のように記述できます。",
  "",
  "$$",
  "S = \\pi r^2",
  "$$",
  "",
  "## Mermaid",
  "",
  "人物関係などを図で表すこともできます。",
  "",
  "```mermaid",
  "graph LR",
  "    Alice[アリス] -->|友人| Bob[ボブ]",
  "    Alice -->|姉妹| Carol[キャロル]",
  "    Bob -->|知人| Carol",
  "```"
];

const markdownCheatSheetEn: readonly string[] = [
  "# Markdown Cheat Sheet",
  "",
  "Pergamum lets you write documents in Markdown.",
  "Compare the Markdown source on the left with the rendered preview on the right.",
  "",
  "## Heading 2",
  "",
  "### Heading 3",
  "",
  "This paragraph is an example of **Bold** text.",
  "",
  "*Italic* text may not be displayed depending on the font.",
  "",
  "~~Strikethrough~~",
  "",
  "---",
  "",
  "## Bulleted list",
  "",
  "- Item 1",
  "- Item 2",
  "- Item 3",
  "",
  "## Blockquote",
  "",
  "> This is a blockquote.",
  "",
  "## Table",
  "",
  "| Name | Role |",
  "| --- | --- |",
  "| Alice | Protagonist |",
  "| Bob | Friend |",
  "",
  "## Hyperlink",
  "",
  "[Pergamum-IDE/Pergamum-IDE](https://github.com/Pergamum-IDE/Pergamum-IDE)",
  "",
  "## Math",
  "",
  "The area of a circle can be written as follows.",
  "",
  "$$",
  "S = \\pi r^2",
  "$$",
  "",
  "## Mermaid",
  "",
  "You can also use diagrams to describe relationships between characters.",
  "",
  "```mermaid",
  "graph LR",
  "    Alice[Alice] -->|Friend| Bob[Bob]",
  "    Alice -->|Sisters| Carol[Carol]",
  "    Bob -->|Acquaintance| Carol",
  "```"
];

const builtinMarkdownSources: Readonly<
  Record<BuiltinMarkdownId, Readonly<Record<Language, readonly string[]>>>
> = {
  markdownCheatSheet: { ja: markdownCheatSheetJa, en: markdownCheatSheetEn }
};

/** The Markdown source of a built-in document in the given display language. */
export function builtinMarkdownSource(
  id: BuiltinMarkdownId,
  language: Language
): string {
  return builtinMarkdownSources[id][language].join("\n");
}

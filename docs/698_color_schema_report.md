# #698 調査レポート(コード変更なし)

**開始状態**: branch `main`、HEAD `733e9ab`(PR #700 マージ済み)、working tree clean。終了時も clean です。調査用スクリプトはすべて repository 外(`%TEMP%`)に置き、一時的に作った `tests/tmp` は削除しました。

## 1. Executive summary

- 未定義の CSS 変数参照が **62 token / 143 参照**あります(`--pg-color-*` は 0 件)。内訳は、実行時に設定される値が約 24 token、色まわりの要対応が 約 30 token です。
- 色の fallback は 172 参照(`box-shadow` 等を除くと 164)あります。うち **85 参照は token が未定義で fallback しか効いておらず、そのうち約 70 が light 専用値**(白背景・濃い文字)です。
- **最重要**: Markdown editor の syntax highlight は、全 9 theme 共通で CodeMirror の **`defaultHighlightStyle`**(light 用の固定色)です。dark theme(Night Dark の 1 つだけ)では次の状態です。
  - Link URL、`[ref]` ラベル、水平線、コードの info 文字列が `#219`(濃い青): editor 背景 `#1a1e25` に対して **1.28:1**。PO が見ている「青が黒に溶ける」の正体です。
  - Markdown の記号(`#`、`**`、`` ` ``、`>`、`-`、`[ ]`、改行の `HardBreak`)が `#404740`: **1.75:1**。
  - 他に `#a11`(LinkTitle、Entity)2.23:1、`#940`(HTML コメント)2.53:1、`#085`(HTML タグ名)3.70:1。いずれも 4.5:1 未満です。
  - 本文・見出し・強調・リンクのテキストは色が付かず、editor 前景のまま(12.23:1)です。問題になるのは「記号と URL まわり」です。
- テーマの token 定義は完全に揃っています(9 theme すべて 238 token、alias なし、欠落 0)。`--pg-color-*` の未定義参照は既存テストが検出します。
- 既存テストの穴は 3 つです。(1)`--pg-color-*` 以外の token の未定義参照(2)syntax highlight の色(3)`--app-dialog-*`、sidebar、toast、status、lint の contrast。
- follow-up は 5 件を提案します(第 7 節)。#699 でカバーされるのは未定義参照のうち約 41 参照です。
- #698 は調査 Issue として **close 可能**です(第 8 節)。

## 2. Token integrity

**参照**: 1,260 件(CSS 1,249 近辺と TS の文字列)、296 token。うち fallback つきは 215 件です。

**定義**:
- 9 theme(pergamum-light、night-dark、resistance-blue、enlightened-green、banana-yellow、sakura-pink、noble-purple、sky-cyan、parchment-sheep)で、それぞれ 238 token(`.theme-*` の 231 + `:root` の 7 = japanese-lint 3 つ + フォント系など)。
- token → token の alias は **0 件**(すべて literal)。最終色の解決は不要でした。
- `--pg-color-japanese-lint-*` は `:root` のみで定義され、night-dark だけが `:root.theme-night-dark` で上書きします。他の 7 つの light 系 theme は `:root` の light 値を使います。
- 定義済みで参照されていない token が 14 個: `--pg-color-accent-primary` / `-secondary`、`status-info`、`preview-accent`、`preview-code-foreground`、`editor-diagnostic-error` / `-warning` / `-info`、`surface-sunken`、`icon-muted`、`surface-tone-k`、`accent-text-alt-3`、`text-tertiary-alt`、`text-strongest`。
  - `editor-diagnostic-*` は未使用で、lint の色は CodeMirror の固定色(orange / `#d11`)のままです。

**未定義参照の分類**(`A` typo/rename 漏れ、`B` 旧名の残骸、`C` theme 定義の追加が必要、`D` fallback のみで意図的、`E` 実行時設定/誤検知):

| 分類                                        | token(参照数)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E** 実行時設定(TS/inline style/生成 HTML) | `--theme-preview-*`(4 token)、`--markdown-outline-depth`、`--masked-icon-url`、`--bar-width`/`--bar-delay`、`--file-explorer-indent`、`--file-explorer/document-tab/edit-context-menu-x/y`(6)、`--narou-emphasis-mark-symbol`、`--aozora-bouten-mark`/`--aozora-indent`(生成 HTML の style 属性)、`--command-palette-*`(footer marquee 2 + launch duration)、`--about-dialog-copy-feedback-animation-ms`、`--replace-preview-*`/`--recovery-discard-*`/`--file-explorer-delete-*` のアイコン mask、`--document-map-viewport-fill`(`GlossaryTextMinimapCanvas.tsx` で設定) |
| **D** fallback のみで意図的                 | `--app-monospace-font-family`(4、font stack)、`--document-map-viewport-border` / `-halo` / `-edge`(各 2、2 状態の rgba)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **A** typo / rename                         | `--workspace-sidebar-muted`(→`-muted-foreground`)、`-hover-background`(→`-hover`)、`-foreground`(→`-item-foreground`)、`-selected-background`(→`-active-background`)、`--focus-ring`(→`--pg-color-focus-ring`)、`--app-dialog-button-bg` / `-text` / `-hover-bg`(→`-button-background` / `-foreground` / `-button-hover-background` 系)、`--app-dialog-hover`、`--app-dialog-button-hover-background`、`--app-dialog-button-border-hover`、`--app-dialog-warning-foreground`                                                                                              |
| **B** 旧名の残骸                            | `--color-border`(3)、`--color-bg-input`(4)、`--color-text-main`(3)、`--color-text-danger`(4)、`--color-text-muted`(1)、`--border-color`(2)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **C** theme 定義の追加が必要そう            | `--app-dialog-secondary-foreground`(22)、`--app-dialog-inset-background`(8)、`--app-accent`(6)、`--app-success-*` / `--app-warning-*` / `--app-danger-*` の foreground / border / inset-background(合計 11 参照)、`--app-dialog-accent-inset-background`(1)                                                                                                                                                                                                                                                                                                               |
| unresolved                                  | なし                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 3. Undefined / fallback findings

- **Critical**: なし。
- **High**(dark theme で白い面・低 contrast になる):
  - `--color-border` / `-bg-input` / `-text-main` / `-text-danger` / `-text-muted`(旧名の残骸): `.glossaryExportInput`、`.documentMapPngExportInput`、`.exportConfirmationDialogInput` が白背景(`#fff`)+ 文字 `#333` のまま。Mermaid のエラー表示も `#fff`。
  - `--app-dialog-secondary-foreground` の fallback `#52616f`: Night Dark の dialog 背景(`#1e232a`)に対して **2.48:1**(20 参照)。
  - `--app-dialog-text`(`#24292f`)は 1.08:1。`--app-danger-foreground` 2.18:1、`--app-warning-foreground` 2.67:1。
- **Normal**:
  - A 分類の rename(上表)。
  - `--app-accent` と inset 系(Bulk Text Import と FontPicker)。
  - documentMetrics の `--workspace-sidebar-*`。fallback が `rgba(255,255,255,0.05)` なので、light theme では hover がほぼ見えない可能性があります。
- **No action / allowlist 候補**:
  - E 分類の実行時 token と、D 分類の font stack。
  - `box-shadow` や純粋な装飾の rgba(今回は bug 扱いしていません)。
  - defined-in-all-themes の token にある literal fallback(81 件)。実行時には使われませんが、**36 件は light theme の定義値と食い違っており**、将来 token を消すと意図しない色が出ます(advisory)。
- **hard-coded な色**(var 無し)は theme ブロック外に 132 宣言あります(`.preview .hljs-*` が 18、document map が 5、その他の UI が 106)。多くは光量が高い面の border / hover rgba です。個別の Issue 化は不要で、checker の advisory 扱いが妥当です。

## 4. YIQ / WCAG audit

評価は 61 pair × 9 theme(`colorContrast.ts` の `contrastRatio` と `compositeOver` を再利用、YIQ は `glossaryTagColor.ts` の `autoGlossaryTagForegroundRgb` を再利用)。前景が純粋な黒/白の 27 件はすべて `match`、残りの 522 件は `non-binary` で、**YIQ の `mismatch` は 0 件**でした(bug 判定には使っていません)。

4.5:1 未満の pair(代表):

| UI                             | Theme                   | 背景      | 前景      | YIQ 推奨 | YIQ 結果   | WCAG        | 所見                                   |
| ------------------------------ | ----------------------- | --------- | --------- | -------- | ---------- | ----------- | -------------------------------------- |
| Dialog confirm                 | night-dark              | `#3f7fbf` | `#ffffff` | white    | match      | 4.20        | review(ボタン文字。既存テストの対象外) |
| Editor gutter(行番号)          | night-dark              | `#171a20` | `#6f7c8a` | white    | non-binary | 4.09        | review(既存テストの閾値は 3.5)         |
| Text disabled                  | night-dark              | `#1a1e25` | `#6f7c8a` | white    | non-binary | 3.92        | disabled 表示。評価対象外が妥当        |
| Editor gutter                  | parchment-sheep         |           |           |          |            | 3.88        | review                                 |
| Surface faint                  | parchment-sheep         |           |           |          |            | 4.00        | review                                 |
| Sidebar muted                  | parchment-sheep / light |           |           |          |            | 4.04 / 4.36 | review                                 |
| Activity bar                   | pergamum-light          |           |           |          |            | 4.25        | 既存テストは 3:1(アイコン)なので通過   |
| Toolbar button pressed         | pergamum-light          |           |           |          |            | 3.61        | 既存は 3:1                             |
| Japanese lint warning / gutter | light 系                |           |           |          |            | 3.3〜3.8    | 全 light 系で 4.5 未満(マーカー)       |

通常の本文・パネル・ボタン・input・dialog(通常)・preview・editor 本文は、全 theme で 5:1 以上です(Night Dark の editor 本文 12.23:1)。UI context が不明なため、large text や graphical object の基準は適用していません。

## 5. Dark theme の Markdown syntax highlight(独立セクション)

### source of truth

- `src/renderer/markdownEditorCodeMirrorSetup.ts:161` の `syntaxHighlighting(defaultHighlightStyle, { fallback: true })`。CodeMirror 6.12.4 の組み込み light style で、**全 theme 共通**です(色は literal)。
- 言語は `markdownEditorDocumentState.ts:351` の `markdown()` で、既定の **CommonMark**(GFM は未使用)。`codeLanguages` なし。
  - 取り消し線、表、タスクリストは構文として解析されず、色は付きません(実際のパーサーで確認)。
  - フェンスコードの本文も色が付きません。
- `styles.css` にはこの highlight を上書きする CSS はありません。
- `editorThemeExtension.ts` は背景・前景・caret・選択・gutter・tooltip だけを theme 化しています。`EditorView.darkTheme` は設定していないため、CodeMirror の `&light` 既定が dark theme でも残ります。

### 実在する highlight tag と色(実パーサー + 実 style で列挙、サンプル文書を使用)

| Markdown node(tag)                                                                                                   | 色                  | 補足                                       |
| -------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------ |
| HeaderMark / EmphasisMark / CodeMark / LinkMark / QuoteMark / ListMark / HardBreak(`processingInstruction` → `meta`) | `#404740`           | 見出し・強調・太字の記号は +太字/下線/斜体 |
| URL / Autolink(`url`)、LinkLabel / CodeInfo(`labelName`)、HorizontalRule(`contentSeparator`)                         | `#219`              | URL・参照ラベルは下線つき                  |
| LinkTitle、Entity(`&amp;`)、HTML の属性値(`string`)                                                                  | `#a11`              |                                            |
| Escape(`\*`)                                                                                                         | `#e40`              |                                            |
| HTML の TagName(`typeName`)                                                                                          | `#085`              |                                            |
| HTML の Comment                                                                                                      | `#940`              |                                            |
| 見出し、Strong、Emphasis、Link テキスト、Image alt、Blockquote 本文、リスト本文、インラインコード                    | 色なし(editor 前景) | 太字・斜体・下線などの装飾のみ             |

### dark theme(Night Dark)のコントラスト(editor 背景 `#1a1e25`、YIQ 推奨は white、前景は `non-binary`)

| Category                                            | 前景       | 背景   | YIQ 推奨 | YIQ 結果   | WCAG     | 所見             |
| --------------------------------------------------- | ---------- | ------ | -------- | ---------- | -------- | ---------------- |
| (本文: editor 前景)                                 | `#d7dde5`  | editor | white    | non-binary | 12.23    | OK               |
| URL / LinkLabel / HorizontalRule / CodeInfo         | `#219`(青) | editor | white    | non-binary | **1.28** | **沈む。最重要** |
| Markdown の記号(`#` `**` `` ` `` `>` `-` `[]` 改行) | `#404740`  | editor | white    | non-binary | **1.75** | 沈む             |
| LinkTitle / Entity / HTML 属性値                    | `#a11`     | editor | white    | non-binary | 2.23     | 低い             |
| HTML コメント                                       | `#940`     | editor | white    | non-binary | 2.53     | 低い             |
| HTML タグ名                                         | `#085`     | editor | white    | non-binary | 3.70     | 低い             |
| Escape                                              | `#e40`     | editor | white    | non-binary | 4.35     | review           |

editor の背景は組み合わせごとに異なります(rgba は editor 背景に合成した値)。

| 組み合わせ              | 背景                  | `#219`      | `#404740`   | 本文        |
| ----------------------- | --------------------- | ----------- | ----------- | ----------- |
| editor                  | `#1a1e25`             | 1.28        | 1.75        | 12.23       |
| active line             | `#252930`             | 1.12        | 1.52        | 10.68       |
| 選択(focus 時)          | `#2f4f7a`             | 1.57        | 1.15        | 6.10        |
| 選択(非 focus)          | `#2b3340`             | 1.03        | 1.33        | 9.31        |
| selection match         | `#2c4156`             | 1.24        | 1.10        | 7.69        |
| 検索ヒット / アクティブ | `#5f4d37` / `#916e44` | 1.62 / 2.81 | 1.19 / 2.06 | 5.90 / 3.40 |

### 青が沈む症状と source の対応

- **URL の `#219`**: Markdown の `URL` / `Autolink`、`LinkLabel`、`CodeInfo`、`HorizontalRule` で、tag は `tags.url` / `labelName` / `contentSeparator`。`[text](https://...)` の括弧内と `[ref]: https://...` が、ほぼ黒に見えるはずです。
- **記号の `#404740`**(暗い灰緑)も同じ程度に沈みます。
- 他の dark theme はありません(`kind: dark` は Night Dark のみ)。

### 他の theme

light 系 8 theme では、`#e40`(Escape)だけが全 theme で 4.5:1 未満(3.2〜4.4)、`#085` が 7 theme で未満です(4.1〜4.5。Pergamum Light は 4.51)。それ以外は 5.5:1 以上です。light 系に問題は見えません。

### 同じ種類の副次的な発見(editor / preview)

- **preview の言語指定つきフェンスコード**: `.preview pre code.hljs` は `background:#ffffff; color:#24292e` と GitHub light 配色が固定です。dark theme では、暗い `pre`(14px の余白)の中に **白いコードボックス**が出ます(テキスト自体は白地なので読めます)。`--pg-color-preview-code-block-*` を回避している状態です。もし白地を外すと、`#005cc5` は dark の code block 背景(`#11141a`)で 2.93:1、`#032f62` は 1.39:1 になります。
- **CodeMirror の `&light` 既定の漏れ**: 折りたたみプレースホルダーは `#eee` の明るい chip(中の文字 `#888` は 3.06:1)。lint の診断色は固定(error の枠 `#d11` は tooltip 背景で 2.79:1、warning は orange)。`cm-specialChar` は赤固定(4.18:1)。autocomplete の選択行は `#17c` + 白(4.63:1)。
- **document map / minimap の色や glossary tag の色**: canvas 描画やユーザー指定の色で、静的には解決できません(unresolved、第 6 節)。

## 6. Unresolved(推測していません)

- document map / minimap(`GlossaryTextMinimapCanvas.tsx` など)の描画色、glossary tag のユーザー指定色: 実行時の値で決まります。実機で確認が必要です。
- fallback の実際のコントラストは「それが載る背景」に依存します。上の数値は dialog 背景(`--app-dialog-background`)を前提にした見積もりで、surface 上の要素なら別の値になります。dogfood で Bulk Text Import / export 系 dialog を dark で開いて確認すると確実です。
- `rgba` の半透明背景(selection や検索ヒット)は editor 背景に合成した前提です。

## 7. 既存の自動テストの網羅状況

- `tests/shared/themeContrast.test.ts`: 全 theme × 約 40 の semantic pair を検査します(`--pg-color-*` のみ)。閾値は多くが 4.5:1、アイコンなどが 3:1、gutter 文字は 3.5:1。
- `tests/renderer/editorThemeExtension.test.ts`: `var(--pg-color-*)` がすべて定義済みであること、全 theme が light の token を全部上書きしていること、print でも preview の token を固定していること。
- `applicationMenuBarThemeContract`、`contextMenuTheme`、`glossaryExportWizardTheme`: 各 UI の色が token だけで書かれていること。
- **見つかった穴**:
  1. `--pg-color-*` 以外(`--app-*`、`--color-*`、`--workspace-sidebar-*` など)の未定義参照を検出するテストがありません(今回の 62 token はこのため残っていました)。
  2. syntax highlight の色(CodeMirror の style)は何も検査していません。
  3. `--app-dialog-*`、sidebar、toast、status、japanese-lint の contrast pair がテスト対象外です(Dialog confirm 4.20 と Night Dark の Editor gutter 4.09 も未検査/低閾値)。
  4. fallback と token の値の食い違い(36 件)は検出されません。

## 8. Follow-up issue proposals

1. **[新規・最優先] Markdown editor の syntax highlight を theme 対応にする**: `defaultHighlightStyle` をやめて、theme の token から作る `HighlightStyle` にする(7 色相当を各 9 theme に)。`EditorView.darkTheme` も Night Dark で有効にするかを検討します。
   - 対象: `markdownEditorCodeMirrorSetup.ts`、`editorThemeExtension.ts`、`styles.css` の 9 つの theme ブロック。
   - dogfood: Night Dark で URL、参照リンク、見出し記号、引用、リスト、水平線、HTML、`\*`。
   - テスト: 今回の probe(実パーサー + 実 style で色を取り出す方式)を再利用して pair を固定します。
2. **#699 の対象として明記**(新規にしない): Bulk Text Import と `textImportDestinationPicker` の約 41 参照(`--app-dialog-secondary-foreground` 17、`--app-dialog-inset-background` 5、`--app-accent` 4、success / warning / danger 系 11 ほか)。
   - 注意: 同じ token は他でも参照されています(`--app-dialog-secondary-foreground` はあと 5 参照(nameInput、saveDestination、settingsSaveDestination、`rubyGraphemeCounter`)、`--app-dialog-inset-background` は 3、`--app-accent` は FontPicker で 2)。token を theme に定義すればまとめて直るので、#699 でそこまで含めるかを決めてください。
3. **[新規] 旧 `--color-*` token の残骸の整理**: `--color-border` / `-bg-input` / `-text-main` / `-text-danger` / `-text-muted`(14 参照)。対象は glossary export、document map PNG export、export confirmation dialog の input と error、Mermaid のエラー表示。dark で白い入力欄になる。dogfood: Night Dark でこれらの dialog を開く。
4. **[新規] 未定義 token の typo / rename の一括修正**(非 bulk): `--workspace-sidebar-*`(documentMetrics と outline pane)、`--focus-ring`(tab のドロップ位置)、`--app-dialog-button-bg` / `-text` / `-hover-bg`(glossary entry manager の「すべてエクスポート」)、`--app-dialog-hover`、`--app-dialog-button-hover-background` / `-border-hover`、`--app-dialog-warning-foreground`。計約 14 参照。
5. **[新規] preview の hard-coded な色**: 言語指定つきフェンスコードの白い面(`.preview pre code.hljs`)、`--border-color`(aozora の改ページ線)、`glossarySurfaceDecoration` の固定の青。print / export 用の CSS は意図的に light なので対象外。
6. **[新規・低優先] CodeMirror の `&light` 既定の漏れと contrast の底上げ**: 折りたたみ chip、lint の診断色、`--pg-color-editor-diagnostic-*`(未使用)の接続、Night Dark の Dialog confirm(4.20)と editor gutter(4.09)、light の japanese-lint warning(3.3〜3.8)。#1 に含めるか、独立にするかは PO の判断です。

## 9. 自動 checker の提案(実装しない)

- **undefined token check**: CI 化可能。今回のスクリプト(CSS の `var()` 参照を、theme ブロックの定義、局所定義、TS 内の設定箇所と突き合わせる方式)をそのまま vitest にできます。
  - 誤検知の扱い: 実行時設定は、TS の `"--x":` / `setProperty` / 生成 HTML の style 文字列から自動で集められます(今回の約 24 token)。非色の fallback のみの token(font stack、duration)は allowlist。残りの色まわり約 30 token は、follow-up の完了まで baseline として許容し、減らす方向で運用します。
- **theme coverage check**: 既存の「全 theme が light の token を全部上書き」を、`--pg-color-*` から全 token に広げるだけで済みます(安価)。`:root` のみの token(japanese-lint)の扱いは allowlist。
- **semantic pair contrast**: 既存の `requiredPairs` に `--app-dialog-*`、sidebar、toast、status、lint を追加できます。既知の未達(Dialog confirm など)は理由つきの例外にします。syntax highlight は、follow-up #1 で theme 対応の style ができてから、実パーサー + highlight の出力を直接検査する形で追加できます。
- **fallback lint**: advisory に留めます(token の定義値と fallback の食い違い 36 件の検出。機械的に bug にはしない)。
- runtime color(canvas、ユーザー指定色)は対象外とし、実機 dogfood で補います。

## 10. #698 を close できるか

**close 可能です。** 求められていた inventory、分類、YIQ / WCAG の audit、follow-up の提案が揃っています。syntax highlight は、実パーサー + 実 style で列挙し、全 theme の ratio を出しました。未解決の項目(canvas 色など)は第 6 節に理由つきで書いてあります。close の前に、第 8 節の follow-up を PO が起票するかを決めてください(特に #1 と、#699 の範囲)。
# ADR-0014: エディタのTabキー・インデント・アクセシビリティ方針

**Status:** Accepted

**Date:** 2026-09-14

> Status について: 本 ADR は Issue #461 の policy / architecture decision を明文化する。`Mod+]` / `Mod+[` によるインデント/アウトデントコマンド、`editor.captureTabInEditor` Application Setting、Escape → Tab、Ctrl+M、Markdown 文脈ディスパッチ（list sink/lift、blockquote、fenced code block、GFM table cell navigation）、`.txt` read-only 表示・lock icon・import/export は実装しない。これらはすべて後続 Issue で扱う。本 ADR はコード変更を伴わない。

---

## コンテキスト

### CommonMark における Tab / インデントの意味論

Markdown ファイル中の `\t` は、平文の Tab 文字（U+0009）と同じバイト列だが、CommonMark の解釈は文脈に依存する。

```text
CommonMark:
  tabs in lines は space へ展開されない（そのまま tab として残る）
  ただし block structure 判定では tab stop 4 columns として振る舞う
  行頭 4 columns 分のインデントは indented code block になる
  行頭 1〜3 columns のインデントはトップレベル段落では意味を持たない
```

したがって、「Tab キーを押したら何 columns インデントするべきか」という問いに、Markdown ソースの構造上、単一の正しい答えは存在しない。答えは常に「その行が何の一部か（トップレベル段落／リスト項目／blockquote／fenced code block／GFM table）」に依存する。

もう一つの重要な区別として、和文小説の段落頭に使われる全角空白（U+3000、通称「全角スペース」）は、CommonMark の block indentation とは無関係な、本文中の**通常の文字**である。全角スペースが 4 個連続してもインデントされたコードブロックにはならない。

### CodeMirror 6 とアクセシビリティ

```text
CodeMirror 6:
  デフォルトでは Tab キーをエディタが捕捉しない
  Tab を捕捉する indentWithTab は明示的に keymap へ追加する設計になっている
```

Pergamum は Electron 上で動作するが、その内部はブラウザである。ブラウザ標準の Tab キーは、フォーカスを次のフォーカス可能要素へ移動させるキーである。この既定の意味を、単一のテキスト編集領域が無条件に奪うと、キーボードのみで操作するユーザー（スクリーンリーダー利用者、運動機能に制約のあるユーザー、単純にマウスを使わないユーザーを含む）がそのテキスト領域から抜け出せなくなる「キーボードトラップ」を生む。

CodeMirror 6 が Tab を既定で捕捉しないという設計は、この罠を作らないための既定値である。Pergamum はこの既定値を踏襲し、Tab キーをエディタ内操作へ割り当てないことをデフォルトとする。これにより、「キーボードトラップからの脱出手段を用意し、それを利用者へ告知する」という責務を既定構成の外に置く。Tab によるリスト階層化やセル移動を望むユーザーには、脱出手段と告知をセットにした opt-in を提供する。

### 日本語 IME との相互作用

日本語入力（および他言語の IME）では、Escape キーが変換候補のキャンセルや未確定文字列の処理に頻繁に使われる。したがって、「Escape の直後の Tab はフォーカス移動として扱う」という脱出ハッチは、IME と衝突する仕組みである。この仕組みを既定の必須機構にはしない。Tab キーをエディタ操作に割り当てる opt-in（`editor.captureTabInEditor`）を有効にしたユーザーに対してのみ、条件付きで提供する。

### Pergamum 固有の背景

Pergamum は小説を書くための IDE である（ADR-0000, ADR-0004）。執筆はテキスト中心の作業であり、原理的にスクリーンリーダーなどの支援技術と相性がよい領域である。視覚障害を持つ作者にとって、執筆環境のアクセシビリティは配慮事項ではなく、実際に書けるかどうかを左右する要件である。ADR-0000 の P-1（書く意思を軽く扱わない）および P-3（入力方式とキーボード配列を軽く扱わない）は、この ADR が扱う Tab / インデント / read-only 方針の直接の前提である。

同時に、Pergamum は「Markdown を書くためだけのアプリではない」（ADR-0000）。リスト階層化や表セル移動に Tab を使いたいという、一般的なテキストエディタ利用者の期待も無視しない。本 ADR は、この 2 つの要求を「既定値は安全側に置き、明示的な opt-in で高機能側を提供する」という形で両立させる。

### 派生表現からのソース逆引きの限界

複数の `.md` を 1 つの `.txt` へ export した場合、その `.txt` から元の `.md` を一意に特定する手段は存在しない。ファイル名・置き場所・近傍ファイルからの推測によるソース解決は、Pergamum の既存の「フォールバック解決禁止」原則に抵触する。本 ADR はこの限界を前提として、派生表現からソースへ戻る導線を明示的な source mapping がある場合に限定する（決定7、T-11 参照）。

---

## 決定

### 1. Tab キーの基本方針

Pergamum は、デフォルトでは Tab キーをエディタで捕捉しない。

```text
既定動作:
  Tab / Shift+Tab はフォーカス移動に明け渡す
  CodeMirror 6 のデフォルト挙動に従う
```

インデント／アウトデントの正式なキーバインドは `Mod+]` / `Mod+[` とする（`Mod` は macOS で `Cmd`、Windows / Linux で `Ctrl`）。Tab によるエディタ内操作は、Application Setting による明示的な opt-in の場合にのみ有効になる。

### 2. Tab capture setting

Application Setting として以下を採用する。

```ts
editor.captureTabInEditor: boolean
```

既定値:

```ts
false
```

| 値 | Tab / Shift+Tab の意味 | `Mod+]` / `Mod+[` | 脱出ハッチ |
| --- | --- | --- | --- |
| `false`（既定） | フォーカス移動 | 有効（既定状態での正式なキーボード導線） | 不要（Tab が既にフォーカス移動のため） |
| `true` | 文脈別エディタ操作（決定3参照） | 有効（既定状態での正式なキーボード導線） | Escape → Tab（決定9）／ Ctrl+M（決定10） |

`Mod+]` / `Mod+[` に加えて、toolbar / menu / command palette も同一のインデント／アウトデントコマンドを呼び出す導線になりうる。「唯一の導線」ではなく、「既定状態での正式なキーボード導線」である。

設定 UI の表示名・説明文・配置・カテゴリは本 ADR では決定しない。

### 3. 文脈ディスパッチは「キー」ではなく「コマンド」に属する

Tab / Shift+Tab キー自体が Markdown 文脈を判断するのではない。インデント／アウトデントを担う**単一のコマンド**が、対象行の文脈を判断し、その文脈に応じた処理へディスパッチする（T-2）。

```text
責務の所在:
  Tab / Shift+Tab キー         … トリガーの一つ（editor.captureTabInEditor が true の場合のみ）
  Mod+] / Mod+[ キー           … トリガーの一つ（常時）
  toolbar / menu / command palette … トリガーの一つ（常時）
  インデント／アウトデントコマンド … 文脈判断とディスパッチの実体
```

`Mod+]` / `Mod+[` は常にこのコマンドを呼ぶ。`editor.captureTabInEditor` が `true` の場合、エディタフォーカス中の Tab / Shift+Tab も同じコマンドを呼ぶ。この設計は、ADR-0003 の invariant I-15（「同一の操作について同一の Command を実行する。UI ごとに実装を複製してはならない」）に従う。キーごとに別実装を持つことは許されない。

文脈別の方針は以下のとおりとする。

| 文脈 | Indent / Forward | Outdent / Backward |
| --- | --- | --- |
| リスト項目（最外周を除く） | 親の content column に合わせて sink（子リスト項目化） | lift（親の階層へ戻す） |
| リスト項目（最外周） | 親の content column に合わせて sink | no-op（決定6、T-5） |
| GFM table | 次セルへ移動 | 前セルへ移動 |
| fenced code block 内 | コード用インデント（決定5参照） | コード用アウトデント |
| blockquote | `>` の内側をインデント | `>` の内側をアウトデント |
| トップレベル段落 | no-op（決定4参照） | no-op（決定4参照） |
| 上記以外の文脈 | no-op（決定4参照） | no-op（決定4参照） |

「上記以外の文脈」には、見出し行、水平線、HTML block、リスト外の空行、その他本 ADR が文脈ディスパッチを明示定義していない Markdown 構造をすべて含む。対応する文脈ディスパッチが明示的に定義されていない行に対して、インデント／アウトデントコマンドは no-op とする（T-3）。これはコマンドの実行時意味論の規定であり、実装者の判断に委ねない。

メニューやコマンドパレットにおける disabled 表示（実行可能性を事前判定できる場合の表示上の工夫）は、UI の実装詳細として別途扱ってよい。ただし、本 ADR が定めるコマンドの実行時意味論は、いかなる文脈でも no-op であり、UI 上の disabled 表示の有無によって変わらない。

GFM table の端セルについては、以下を明記する。

```text
最後のセルで forward しても no-op（新しい行を自動追加しない）
最初のセルで backward しても no-op
```

表の行を増やす操作は、別の明示的なコマンドの責務であり、GFM table のセル移動コマンドが暗黙に行を追加することはない。

GFM table の forward / backward はセル移動であり、単一カーソルまたは単一セル内選択に対してのみ実行する。複数行選択、複数 selection、または複数セルにまたがる選択では no-op とする（T-4）。

### 3a. プレーンテキスト文書では Markdown 文脈ディスパッチを適用しない

決定3の文脈ディスパッチは、Markdown 文書に対する indent / outdent の実行時意味論を定義する。

プレーンテキスト文書（`.txt`）は Markdown 構造文書ではない。  
そのため、Markdown 固有の構造制約を `.txt` 文書に適用してはならない。

`.txt` 文書では、indent / outdent は plain text editing command として扱う。

```text
Markdown documents:
  Markdown-aware indent / outdent を行う
  決定3・決定4に定める文脈ディスパッチと no-op ルールに従う

Plain text documents:
  Markdown 文脈ディスパッチを行わない
  現在行または選択行に対して自由な行頭インデントを行う
```

`.txt` 文書では以下のとおりとする。

```text
Indent:
  対象行の行頭に indent unit を挿入する

Outdent:
  対象行の行頭から削除可能な indent unit または空白を削除する
  削除可能な空白がない行は no-op とする
```

対象行は T-4 と同じく、選択がある場合は選択範囲が交差するすべての行、選択がない場合はカーソルがある行とする。複数 selection を持つ場合は、全 selection が交差する行の集合を重複排除して対象行とする。

`.txt` 文書では、以下の操作経路が同じ plain text indent / outdent コマンドを呼ぶ。

```text
Mod+] / Mod+[
toolbar indent / outdent
menu / command palette からの indent / outdent
editor.captureTabInEditor=true の場合の Tab / Shift+Tab
```

ただし、Tab キーの捕捉方針そのものは決定1・決定2に従う。  
すなわち、`editor.captureTabInEditor=false` の場合、Tab / Shift+Tab は引き続きフォーカス移動に明け渡す。

この例外は、ADR-0014 の Markdown 側の決定を撤回するものではない。  
Markdown 文書では、引き続き決定3・決定4の Markdown-aware な挙動を維持する。

### 4. トップレベル段落ではインデントしない

本決定は Markdown 文書に適用する。プレーンテキスト文書（`.txt`）については、決定3aに従う。

トップレベル段落（リスト項目・blockquote・fenced code block のいずれにも属さない、文書のトップレベルにある段落）では、インデント／アウトデントコマンドは no-op とする。上記以外の文脈（決定3参照）も同様に no-op とする。

理由:

```text
CommonMark ではトップレベル段落先頭の 1〜3 columns は出力上の意味を持たない
4 columns 以上は indented code block になってしまう
したがってトップレベル段落には「増やして意味のあるインデント量」が存在しない
```

これは実装上の安全策として no-op にしているのではない。トップレベル段落という文脈には、そもそも Markdown 構造としての「インデント属性」が存在しないため、インデントコマンドに実行すべき処理がないという判断である。

### 5. `editor.markdownIndentSize` は一級設定にしない

一般的なコードエディタにおける soft tab 幅の設定（例: `editor.tabSize`）と同じ意味を持つ `editor.markdownIndentSize` のような単一のグローバル設定は採用しない。

理由:

```text
Markdown のインデント量は文書構造の意味論に支配される
リストの子要素として有効な indent 量は、親 marker の content column に依存する
マーカーの種類（- 、1. 、10. など）によって content column が異なる
すべての文脈で正しい単一のグローバル値は存在しない
```

具体例:

| 親マーカー | content column | 子として有効な indent 量 |
| --- | ---: | ---: |
| `- ` | 2 | 2〜5 columns |
| `1. ` | 3 | 3〜6 columns |
| `10. ` | 4 | 4〜7 columns |
| トップレベル段落 | — | 存在しない（決定4参照） |

fenced code block 内のインデントは Markdown 構造インデントとは別スコープで扱う。その設定キーは `editor.codeIndentSize` とする。`editor.codeIndentSize` の値・UI・言語別対応は本 ADR では決定しない。本 ADR が確定するのは、「Markdown 全体を支配する単一のインデント幅設定は持たない」「fenced code block 用の設定は別スコープで扱う」という方針である。

### 6. 最外周リスト項目の outdent

最外周（トップレベル）のリスト項目に対する outdent / lift は no-op とする（T-5）。

理由:

```text
リストから段落への変換は構造変換であり、インデント / アウトデントコマンドの責務ではない
リスト項目を暗黙にトップレベル段落へ変換してはならない
必要な場合は、別の明示的なコマンドで扱う
```

### 7. 日本語本文の字下げは三層で扱う

和文小説の段落頭に使われる字下げ（全角空白 U+3000 による段落頭のインデント）は、Markdown の block indentation とは別概念として扱う。

| 層 | 方針 |
| --- | --- |
| ソース `.md` | 段落頭の字下げを持たない |
| エディタ表示 | CSS のぶら下げインデント等、表示上の装飾として字下げを見せる |
| `.txt` エクスポート | 段落頭に U+3000 を付与する |

以下を明記する。

```text
.md ソースへ段落頭の U+3000 を自動挿入してはならない（T-6）
U+3000 は CommonMark の block indentation ではなく、本文文字として扱う
エクスポート時の U+3000 付与は、派生表現（.txt）の生成であり、ソーステキストの改変ではない
```

この方針は ADR-0004（本文非破壊原則）と整合する。`.md` ソース本文へ暗黙に文字を挿入することは、ADR-0004 が禁じる「便利のための無断改変」に該当する。一方、エクスポート先の `.txt` は派生表現であり、投稿先ごとに字下げの作法が異なることを踏まえ、`.txt` エクスポータのオプションとして U+3000 付与の有無を選択可能にする。オプション UI は本 ADR では決定しない。

### 8. `.txt` の扱い

`.txt` はエクスポート用の派生表現として扱う。

```text
プロジェクト配下の .txt は表示対象にする
編集は read-only とする
read-only は .txt の由来（Pergamum が生成したか、外部で置かれたか）を問わず拡張子で一律に扱う（T-7）
Explorer / Finder 等で外部から置かれた .txt も無視せず表示する
外部由来の .txt を編集したい場合は、明示的な .md 変換インポート操作を使う
```

「特定の置き場所（例: エクスポート出力ディレクトリ配下）だけ read-only」のような、置き場所に依存した意味変更は行わない。

```text
同じ拡張子のファイルが置き場所によって意味を変えると、ユーザーにとって予測不能になる
これは既存の「フォールバック解決禁止」方針と同じく、暗黙の意味変更を避けるという原則に基づく
```

`.txt` → `.md` 変換インポートは、元の `.txt` を削除・移動・改変しない。変換結果は新しい `.md` として生成する（T-11）。

```text
元ファイルの削除・移動・改変は、派生表現を明示的に変換する操作の範囲を超え、本文非破壊原則に抵触する
```

read-only 派生表現から元ソースを開く導線は、明示的な source mapping がある場合に限って提供する。ファイル名・置き場所・近傍ファイルから元ソースを推測してはならない。複数 `.md` から単一 `.txt` を生成した場合、元ソースは一意に定まらない（コンテキスト「派生表現からのソース逆引きの限界」参照）。

`.txt` → `.md` の明示的インポート操作の UI / UX は本 ADR では決定しない。

### 9. Read-only UI

読み取り専用ドキュメントのタブには lock（鍵）アイコンを表示する。

視覚的なアイコンだけには依存しない。

```text
read-only タブには鍵アイコンを表示する
タブの accessible name / title に「読み取り専用」であることを含める
```

read-only text editor はキーボード閲覧性を維持する。そのため、CodeMirror 上の read-only editor で `EditorView.editable.of(false)` を使ってはならない。read-only は `EditorState.readOnly.of(true)` で表現する（T-8）。

```text
EditorView.editable.of(false) は contenteditable を外し、キーボードだけで本文を読み進める操作を阻害する
read-only は編集不能であるべきだが、閲覧不能にしてはならない
```

編集入力がブロックされた場合（read-only な editor へ書き込みを試みた場合）のフィードバック方針は本 ADR では決定しない。

read-only は `.txt` 専用の状態にしない。画像、PDF、エクスポート済み HTML など、「派生表現・非編集対象」全般に使える汎用的な状態として設計する。`.txt` はこの汎用 read-only 状態の最初の適用例と位置づける。

### 10. Escape → Tab

`editor.captureTabInEditor` が既定値の `false` である状態では、Tab は既にフォーカス移動であるため、脱出ハッチは不要である。

`editor.captureTabInEditor` が `true` の場合にのみ、Escape → Tab を one-shot の脱出ハッチとして有効にする。

```text
Escape 押下後、次に押された Tab だけをフォーカス移動として扱う
次に押されたキーが Tab 以外であれば、one-shot 状態を解除する
エディタが blur した場合も one-shot 状態を解除する
3秒のタイムアウトで one-shot 状態を解除する
IME composition 中に押された Escape では one-shot 状態を立てない
```

IME composition 中の Escape は、変換候補のキャンセルや未確定文字列の処理という既存の意味を優先する。one-shot 状態を立てるのは、composition が確定・キャンセルされた後の、素の Escape 単押しに限る。

### 11. Ctrl+M

`editor.captureTabInEditor` が `true` の場合、Ctrl+M を Tab focus mode の一時トグルとして有効にする。

```text
キーバインドは Mod+M ではなく、常に Ctrl+M で固定する
macOS の Cmd+M はウィンドウ最小化と衝突するため使わない
Tab focus mode の状態は永続化しない
アプリ再起動時には常に通常状態（Tab は文脈別エディタ操作）へ戻る
Tab focus mode が ON の間は、Tab / Shift+Tab をフォーカス移動として扱う
もう一度 Ctrl+M を押すと、通常状態（文脈別エディタ操作）へ戻る
```

IME composition 中の Ctrl+M は Tab focus mode をトグルしない（T-10）。

```text
日本語IMEやキーバインド設定によっては Ctrl+M が確定操作として使われる可能性がある
composition 中は IME の意味を優先し、Pergamum の Tab focus mode 状態を変更しない
```

### 12. Escape → Tab と Ctrl+M の相互作用

Escape → Tab one-shot と Ctrl+M による Tab focus mode は、以下のとおり相互作用する。

```text
Escape → Tab one-shot は、editor.captureTabInEditor=true かつ Tab focus mode が OFF のときだけ意味を持つ
Tab focus mode が ON の間は Tab / Shift+Tab が既にフォーカス移動なので、Escape → Tab one-shot は立てない
Ctrl+M で Tab focus mode を ON にした時点で、既存の Escape → Tab one-shot 状態は解除する
Ctrl+M で Tab focus mode を OFF に戻しても、Escape → Tab one-shot 状態は自動では立てない
```

Escape → Tab one-shot は、Tab 以外のキー入力、editor blur、または 3 秒のタイムアウトで解除する（決定10と同一の規定）。

### 13. アクセシビリティ告知

`editor.captureTabInEditor` を有効にした場合、エディタの accessible name / description で、脱出方法を告知する。

告知に含める情報:

```text
Tab がエディタ操作（文脈別ディスパッチ）に使われていること
フォーカス移動には Escape → Tab が使えること
Ctrl+M で Tab focus mode（Tab を常にフォーカス移動にする一時状態）を切り替えられること
```

アクセシビリティ方針は、「エディタから脱出できる」ことだけを保証すれば完了する一回限りの対応ではない。以下を含む継続的なテーマとして扱う。

```text
ARIA landmarks
focus ring（フォーカスの視覚的な表示）
reading order（読み上げ順序）
accessible names（各要素の名前付け）
read-only state の announcement（読み取り専用状態の告知）
```

これは ADR-0000 の P-1 / P-3 が定める原則の、エディタ機能への具体化である。

---

## 不変条件

本 ADR は以下の番号付き不変条件を定義する。参照子 `T-n` は、後続 Issue、PR レビュー、他 ADR から明示的に参照できる。

**番号は本 ADR が Accepted となった時点で凍結する。**以降の追加は末尾への追記とし、廃止された条項は欠番として残す。番号の再利用および全体の振り直しは行わない。

- **T-1** Tab はデフォルトでエディタに捕捉されず、フォーカス移動に使われる。
- **T-2** インデント／アウトデントは単一のコマンドが文脈判断を行う。キーごとに別実装を持ってはならない。
- **T-3** 対応する文脈ディスパッチが明示的に定義されていない行に対するインデント／アウトデントコマンドは no-op とする。トップレベル段落もこの no-op に含める。
- **T-4** 複数行選択または混在文脈では、対象行ごとに文脈を判定する。対応文脈の行だけ処理し、非対応文脈の行は no-op とする。対象行は次のとおり定める。選択がある場合、対象行は選択範囲が交差するすべての行とする。複数 selection を持つ場合、全 selection が交差する行の集合を重複排除して対象行とする。選択がない場合、対象行はカーソルがある行とする。GFM table の forward / backward は単一カーソルまたは単一セル内選択に対してのみ実行し、複数行選択・複数 selection・複数セルにまたがる選択では no-op とする。
- **T-5** 最外周リスト項目に対する outdent / lift は no-op とする。リスト項目を暗黙にトップレベル段落へ変換してはならない。
- **T-6** `.md` ソースへ段落頭の U+3000 を自動挿入してはならない。
- **T-7** read-only は置き場所ではなく文書種別／文書状態で一律に決める。同じファイルが置き場所によって編集可否を変えてはならない。
- **T-8** CodeMirror 上の read-only editor で `EditorView.editable.of(false)` を使ってはならない。本文のキーボード閲覧性を保つため、編集不可状態は `EditorState.readOnly.of(true)` で表現する。
- **T-9** Tab capture を有効にする構成（`editor.captureTabInEditor=true`）では、脱出ハッチ（Escape → Tab、Ctrl+M）と支援技術向け告知を必ずセットで提供する。
- **T-10** IME composition 中の Escape / Ctrl+M は、Tab 脱出状態や Tab focus mode を変更してはならない。
- **T-11** `.txt` → `.md` 変換インポートは元の `.txt` を削除・移動・改変してはならない。変換結果は新しい `.md` として生成する。
- **T-12** プレーンテキスト文書（`.txt`）では、Markdown 文脈ディスパッチおよびトップレベル段落 no-op ルールを適用してはならない。`.txt` のインデント／アウトデントは plain text editing command として、現在行または選択行の行頭空白を増減する。Tab / Shift+Tab からこのコマンドを呼ぶかどうかは `editor.captureTabInEditor` に従う。

---

## 根拠

本 ADR の各決定は、次の 4 つの根拠に基づく。

**CommonMark の意味論**: Markdown の `\t` は平文の Tab（U+0009）と同一バイト列だが、CommonMark の解釈は文脈依存である。tabs in lines はスペースへ展開されないが、block structure 判定では tab stop 4 columns として振る舞い、行頭 4 columns は indented code block になる。この非一様性のため、Tab キーに単一の「正しい」インデント量を割り当てることはできず、文脈別ディスパッチとコマンド中心設計（決定3・決定4・決定5、T-2・T-3）が必然になる。また、U+3000 は CommonMark の block indentation ではなく本文文字であるため、和文段落字下げは Markdown 構造とは独立に扱う（決定7、T-6）。

**CodeMirror 6 とキーボードアクセシビリティ**: CodeMirror 6 は既定で Tab を捕捉せず、`indentWithTab` を明示的に追加する設計を採る。Electron の内部はブラウザであり、Tab は本来フォーカス移動キーである。単一のテキスト編集領域が無条件に Tab を奪うことは、キーボードのみで操作するユーザーに対するキーボードトラップを生む。既定で捕捉しないという方針を採ることで、「トラップと脱出告知の責務」を既定構成の外に置ける（決定1・決定2、T-1）。Tab 操作を望むユーザーには opt-in を提供し、opt-in 時にのみ脱出ハッチとアクセシビリティ告知を必須にする（決定10・決定11・決定12・決定13、T-9）。同じ理由により、read-only editor も閲覧不能にしてはならない（決定9、T-8）。

**日本語 IME との相互作用**: 日本語執筆では Escape が IME の変換キャンセル・未確定文字列処理に頻繁に使われ、Ctrl+M もキーバインド設定によっては IME の確定操作として使われうる。Escape → Tab の脱出ハッチと Ctrl+M の Tab focus mode トグルは、いずれも IME と相互作用しうるため、デフォルトの必須脱出機構にはできず、`editor.captureTabInEditor` の opt-in 時のみの条件付き要件とする。IME composition 中の Escape / Ctrl+M では、いずれも Pergamum 側の状態を変更しない（決定10・決定11、T-10）。

**Pergamum 固有の動機**: Pergamum は小説執筆 IDE である。執筆はテキスト中心の作業であり、スクリーンリーダー等の支援技術と原理的に相性がよい。視覚障害を持つ作者にとって、執筆環境のアクセシビリティは義務であるだけでなく、Pergamum の差別化要素になる。この動機が、Tab キーの既定挙動を「多くのエディタの慣習」より「アクセシビリティの安全側」に置くという判断（決定1・決定2、T-1）を支えている。

本 ADR における `.txt` の自由なインデント／アウトデント例外（決定3a、T-12）は、Markdown 文書の意味論を撤回するものではない。`.txt` は Markdown 構造文書ではないため、CommonMark の block indentation に由来する no-op ルールや文脈ディスパッチを適用しない。プレーンテキスト文書では、行頭空白の増減は素朴なテキスト編集操作であり、Markdown 構造保護のための制約とは別に扱う。

---

## 代替案

### 代替案 A: Tab をデフォルトでインデントに使う

**利点:**

```text
多くのエディタ利用者の期待に合う
リスト操作や表セル移動が直感的
```

**欠点:**

```text
デフォルトでキーボードトラップを作る
Escape → Tab / Ctrl+M / アクセシビリティ告知が必須構成になる
日本語IMEのEscapeキー利用と相互作用する
Markdownトップレベル段落では有効なインデント量が存在しない（決定4）
```

**判断:** 不採用。`editor.captureTabInEditor` による opt-in として提供する（決定2）。

### 代替案 B: Tab を常にフォーカス移動にする（opt-in を提供しない）

**利点:**

```text
キーボードトラップを作らない
アクセシビリティ上もっとも単純
```

**欠点:**

```text
Tab でリスト階層化や表セル移動をしたいユーザーの期待に応えられない
```

**判断:** デフォルト挙動として採用する（決定1）。opt-in 設定（`editor.captureTabInEditor`）を提供するため、常時この挙動に固定するわけではない。代替案 A の欠点と代替案 B の欠点を、デフォルト値と opt-in の組み合わせで両立させる。

### 代替案 C: `editor.markdownIndentSize` のような単一のグローバル設定を持つ

**利点:**

```text
コードエディタ風で分かりやすい
設定UIとして単純
```

**欠点:**

```text
Markdownでは有効なインデント量が文脈で決まる
- 、1. 、10. で正しい量が異なる（決定5の表参照）
トップレベル段落には有効なインデント量が存在しない（決定4）
単一のグローバル設定では文書構造を壊す
```

**判断:** 一級設定としては不採用。fenced code block 用の設定（`editor.codeIndentSize`）を別スコープで扱う（決定5）。

---

## 影響

- 今後のインデント実装は command-first（コマンド中心）になる。Tab キーはそのコマンドを呼び出す入口の一つである（T-2）。
- `Mod+]` / `Mod+[`、toolbar、menu、command palette は、`editor.captureTabInEditor` の設定値に関わらず常に有効な、既定状態での正式なキーボード導線である。
- Markdown 文書では、インデント／アウトデントコマンドは Markdown-aware な文脈ディスパッチに従う。トップレベル段落および未定義文脈は no-op のままとする（T-3）。
- プレーンテキスト文書（`.txt`）では、Markdown 文脈ディスパッチおよびトップレベル段落 no-op ルールを適用しない。`.txt` のインデント／アウトデントは、現在行または選択行の行頭空白を増減する plain text editing command として実装する（T-12）。
- `editor.captureTabInEditor` の実装は、Tab capture 単体では完結しない。Escape → Tab の脱出ハッチ、Ctrl+M の一時トグル、両者の相互作用（決定12）、アクセシビリティ告知を必ずセットで実装する（T-9）。
- `.txt` の read-only 表示には、read-only document state の共通基盤が必要になる。この基盤は `.txt` 専用に閉じず、将来の画像・PDF・エクスポート HTML 等の非編集対象にも再利用できる形で設計する。read-only editor の実装は `EditorState.readOnly.of(true)` を用い、`EditorView.editable.of(false)` を使わない（T-8）。
- read-only UI は lock アイコンだけでなく、accessible name / title への「読み取り専用」明示を含める。
- `.txt` の export / import は、`.md` → `.txt` 変換時の U+3000 付与オプションと、`.txt` → `.md` の明示的インポート（元 `.txt` の削除・移動・改変を伴わない、T-11）に従う。
- read-only 派生表現から元ソースを開く導線は、明示的な source mapping がある場合に限る。ファイル名・置き場所・近傍ファイルからの推測によるソース解決は行わない。
- editor accessibility（ARIA landmarks、focus ring、reading order、accessible names、read-only announcement）は、継続的なテーマとして今後の Issue で扱われ続ける。
- 本 ADR により、後続のインデント、Tab capture、read-only、`.txt` import/export、editor accessibility の実装は、本 ADR の決定と不変条件（T-1〜T-12）に従う。

---

## 関連

```text
ADR-0000: アクセシビリティと包摂的インタラクションの原則
  P-1（書く意思を軽く扱わない）、P-3（入力方式とキーボード配列を軽く扱わない）を
  本 ADR の Tab / IME / アクセシビリティ告知方針の前提として継承する。

ADR-0003: UI Interaction Architecture
  I-15（同一の操作について同一の Command を実行する）に従い、
  Mod+] / Mod+[ と editor.captureTabInEditor=true 時の Tab / Shift+Tab は
  同一のインデント／アウトデントコマンドを呼ぶ（決定3、T-2）。
  プレーンテキスト文書（.txt）でも、各 UI 導線は同一の plain text indent / outdent
  command を呼ぶ（決定3a、T-12）。

ADR-0004: 本文非破壊原則と日本語テキスト処理方針
  .md ソースへ段落頭の U+3000 を自動挿入しないという方針（決定7、T-6）は、
  本文への無断改変を禁じる ADR-0004 の直接の適用である。
  .txt → .md インポートが元ファイルを保護する方針（決定8、T-11）も同様である。
```

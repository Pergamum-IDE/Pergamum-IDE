# Pergamum ロードマップ

## この文書の目的

この文書は、Pergamum の開発ロードマップを整理するための文書である。

実装スコープの正本は GitHub Issue とする。

この文書は、開発の方向性・優先順位・保留事項・今後の候補を見失わないための地図として扱う。

```text
Issue:
  実装スコープの正本

PR:
  実装結果と検証結果の記録

ADR:
  取り返しにくい設計判断の記録

roadmap.md:
  方向性・優先順位・保留事項の整理
```

この文書に記載された項目は、実装を無条件に約束するものではない。

実際に着手する前には、個別の GitHub Issue として以下を定義する。

```text
scope
non-scope
acceptance criteria
test / verification points
```

完了した機能の細かな仕様は roadmap.md に残しすぎず、必要に応じて Issue / PR / ADR / 実装を参照する。

---

## Pergamum の基本方針

Pergamum は、小説を書く人のための open-source IDE である。

中心に置くものは、作者が書いた本文である。

Pergamum は本文を勝手に書き換えない。

```text
本文:
  作者の正本

Glossary:
  作品内の語彙・人物・地名・組織・概念などを管理する構造化データ

Preview / UI:
  本文を読む・確認するための補助表示

Linter / Suggestion:
  本文を変更せず、気づきを提示する補助機能

Command:
  ユーザーが明示した場合だけ変更を行う操作

Export:
  本文正本から提出用・閲覧用の派生物を生成する操作
```

特に日本語テキスト処理では、正規化・表記統一・補完・推測を安易に行わない。

```text
やらないこと:

Unicode 正規化による本文変更
表記揺れの自動修正
中黒の自動挿入・削除
三点リーダーやダッシュの自動整形
Glossary alias の自動追加
曖昧一致の自動解決
改行コードの勝手な変換
文字コードの勝手な変換
space-like character の勝手な置換
```

作者が明示的に選択した場合だけ、補助機能として作用する。

```text
検出する
表示する
警告する
提案する

でも、勝手に変えない
```

---

## 現在地

現在は **`v0.80.0`**。

Phase 4〜Phase 7 は完了済み。

```text
Phase 4 (v0.50.0):  迷わず触れるようにする         … 完了
Phase 5 (v0.51.x):  触りすぎないようにする          … 完了
Phase 6 (v0.60.x):  閉じても戻れるようにする        … 完了
Phase 7 (v0.70.x):  プロジェクトを歩けるようにする  … 完了
v0.80.0:            小説 IDE としての中核機能が概ね揃った段階（現在地）
```

Phase 8「他人の手に渡せるようにする」に相当する release-hardening 作業は一部先行着手済み（About dialog、third-party notices への導線など）だが、正式な完了は宣言していない。未完了分は `v0.90.0` の「ポリッシュ」に統合する。

Phase 5 には upstream 挙動確認待ちで deferred とした項目（invisible-character rendering）が残るが、後続をブロックしない。

次は `v0.90.0` に向けて、合意済みの順序（後述「直近の推奨順」）で進める。

---

## Runtime / packaging baseline

Runtime version details の正本は `package.json` / `package-lock.json` とする。

roadmap.md には、更新漏れしやすい個別 runtime version を固定値として残しすぎない。

### Native module 更新ルール

Dependency 更新では、

```text
npm install success
≠
Electron packaged application success
```

であることを前提とする。

特に native module が含まれる場合は、以下を標準工程とする。

```text
dependency update
        ↓
Electron runtime rebuild
        ↓
package
        ↓
dogfood
```

### CI と dogfood

CI と dogfood は異なる品質確認工程として扱う。

```text
CI:
  コード品質
  type / test / build 等

Dogfood:
  実際のユーザー経路
  packaged application の挙動
```

Native module、file handling、save behavior、packaged exe、installer、file association など、CI だけでは確認しにくい領域は dogfood で確認する。

---

## 実装が終わったもの

完了済みの細かな設計仕様は roadmap.md に残しすぎない。

正本は Issue / PR / ADR / 実装とする。

### Phase 2: Glossary と Preview の接続

完了済み。

主な完了領域:

```text
Glossary と Markdown Preview の接続
Preview 上の Glossary match decoration
Hover Card による Glossary 情報表示
Glossary Editor foundation
Glossary editing foundation
```

### Phase 3: つながりすぎないようにする

完了済み。

主な完了領域:

```text
Glossary match boundary foundation
Glossary occurrence navigation foundation
Workbench / Utility Window foundation
Debug mode JSONL logging foundation
Runtime / native module workflow establishment
```

### Phase 4 / v0.50.0: 迷わず触れるようにする

完了済み。

Phase 4 は、Pergamum が project-file based desktop application として成立するための基盤を整えたフェーズである。

主な完了領域:

```text
Command / Dialog foundation
Settings Catalog / Settings Page foundation
Project file / project identity foundation
Read-only project handling
write lock / owner metadata
startup .pergamum open flow
Windows installer
Windows .pergamum file association
About dialog
shutdown write-lock cleanup
```

これにより Pergamum は `.pergamum` project file を持ち、OS 上の通常のデスクトップアプリとして開ける基盤を得た。

### Phase 5 / v0.51.x: 触りすぎないようにする

主要項目は完了済み。

Phase 5 は Markdown 本文そのものを扱い、本文非破壊原則を Editor / text handling に適用したフェーズである。

主な完了領域:

```text
Editor decoration visibility foundation

Markdown line ending preservation
line ending detection / diagnostics
Line Ending Distribution dialog

Character Count
Unicode code point based user-facing count
Status Bar integration

Japanese paragraph indentation commands
bulk indent insertion / removal
paragraph indentation exclusion settings

user-scope Settings persistence foundation

zero-tab / Welcome state
```

段落字下げなど本文変更を伴う処理は、自動整形ではなくユーザーが明示的に実行する command として扱う。

#### zero-tab state

以下は正式な runtime state とする。

```text
documents = []
activeDocumentId = null
```

存在しない document を UI 都合のために生成しない。

実在する Untitled document は通常の document として扱う。

#### Phase 5 からの deferred item

##### Invisible-character rendering

全角空白などの不可視文字表示については、CodeMirror 6 の decoration geometry と IME の相互作用に未解決点が残っている。

再現・調査用プロジェクト MirrorSchale を用いて検証し、CodeMirror upstream に挙動確認を依頼済み。

```text
Status:
  deferred
  upstream behavior confirmation pending
```

これは failed / abandoned とは扱わない。

後続フェーズをブロックせず、upstream 側の確認または実装方針が固まった時点で再開する（`v0.80.0` 時点でも deferred のまま）。

### Phase 6 / v0.60.x: 閉じても戻れるようにする

完了済み。

アプリを閉じても・予期せず終了しても、執筆へ自然に戻れるようにしたフェーズ。

主な完了領域:

```text
NotificationToast（正常系・情報通知専用。warning / error は流さない）
Session persistence foundation（settings / session / recovery を別責務として分離）
Session restore（project / open tabs / active document / window state / zero-tab）
Session load 失敗時の安全なフォールバック（既存 session data は壊さない）
Document Recovery（未保存本文の payload 保持、復元候補提示、.recovered.md sidecar 復元、明示破棄）
seen-candidate reminder の重複 auto-show 抑制
stale write lock / recovery store lock の回収
```

保持する原則:

```text
zero-tab（documents = [] / activeDocumentId = null）は合法な persisted state。復元のために Untitled を作らない。
未保存本文を settings / session state に埋め込まない。Recovery は別の保存責務を持つ。
前回 project を復元できない場合は Welcome へ移行し、異常理由をユーザーが認識できる UI で伝える（NotificationToast は使わない）。
```

詳細仕様は当時の Issue / PR / 実装を正本とする。

### Phase 7 / v0.70.x: プロジェクトを歩けるようにする

完了済み。

小説プロジェクトのフォルダ構造を自然に扱えるようにしたフェーズ。

主な完了領域:

```text
階層 File Explorer foundation（expand / collapse / open / refresh）
external file change detection（watcher → debounce → re-scan）
file operations: create / rename / delete（確認付き）
file / folder move（context menu / cut & paste / drag & drop、確認付き）
copy / cut / paste
multi-selection、active document reveal
move ↔ Recovery re-key 統合
```

保持する原則:

```text
file operation は明示 command / Main Process API 経由。Renderer が filesystem を直接触らない。
project-root-relative path を基本とし、project root 外への移動は禁止。
watcher は refresh trigger であり filesystem の真実そのものではない。
D&D は filesystem operation ではなく move command の UI の一つ。
```

Phase 7 の当初非スコープだった Project 全文検索は、File Explorer 基盤成立後に着手し、テキスト検索・置換として実装済み（下記「v0.80.0 到達までの追加実装」）。

### v0.80.0 到達までの追加実装

Phase 7 以降、小説 IDE としての中核体験を埋めるための機能を追加した。フェーズ番号は割り当てず、`v0.80.0` milestone に含める。

主な完了領域:

```text
Project 全文テキスト検索（Search pane）/ project-wide replace
Active Document Find / Replace（options、highlights、replace current / all）
Glossary find modes / nearby glossary search（「検索・置換」settings category）
Glossary Completion（Ctrl+Space）
Document Map（configurable rendering、tag selector、click / viewport lens navigation、large-document paging）
Document Metrics（旧 Document Navigation。文字数 / 行数 / 段落数 / 会話文比率）
画像 clipboard paste → assets 保存 → Markdown link 挿入
project-local 画像リンクの Preview / Glossary Preview 表示
壊れた画像リンクの diagnostics（lint 警告）
Markdown / 画像ファイル移動時の画像リンク・参照の追従更新
project settings foundation（project override、検索、category filter、dialogue metrics 設定）
logical project rename
encoding-aware `.txt` → Markdown 一括取り込み（取り込み時変換。生 `.txt` の直接編集ではない）
per-tab editor state、Markdown EditorState の非 Markdown タブ跨ぎ保持
configurable Markdown undo history depth
safe application restart flow / restart-required settings confirmation
selection highlight / find gutter markers、gutter / line number layout 調整
About dialog / third-party notices への導線
```

完了済みの細かな仕様は Issue / PR / ADR / 実装を正本とし、roadmap.md には残しすぎない。

### Debug logging

Debug logging foundation は確定済み。

roadmap.md にはイベント形式やログファイル詳細を残しすぎない。

Debug Log viewer、検索、export、issue report integration などは後続機能として扱う。

---

## マイナーバージョン別ロードマップ

| Version   | Phase          | 合言葉               | 主に積んだ / 積むもの                                                                                                                                                                    | この版では積まないもの                                    |
| --------- | -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `v0.50.0` | Phase 4 完了      | 迷わず触れるようにする       | `.pergamum` project file、Settings foundation、read-only handling、write lock、startup argv open、Windows installer / association                                                    | Phase 5 本文処理、session restore、project explorer  |
| `v0.51.x` | Phase 5 完了      | 触りすぎないようにする       | line ending preservation / diagnostics、Character Count、paragraph indentation commands、zero-tab foundation                                                                       | encoding detection、line ending conversion     |
| `v0.60.x` | Phase 6 完了      | 閉じても戻れるようにする      | Notification foundation、Session persistence / restore、dirty document recovery、stale lock recovery                                                                              | Workbench layout 永続化、階層 File Explorer         |
| `v0.70.x` | Phase 7 完了      | プロジェクトを歩けるようにする   | 階層 File Explorer、file operations（create / rename / delete / move / copy / D&D）、外部変更検知、Project 全文検索・置換、Glossary completion、Document Map / Document Metrics、画像 paste / preview / link 追従 | rich-format export、DB migration               |
| `v0.80.0` | 中核機能が揃った段階      | 小説を書ける状態にする       | Active Document Find / Replace、Glossary find modes / nearby search、project settings foundation、logical project rename、encoding-aware `.txt` 一括取り込み、About / third-party notices | ショートカット体系、raw TXT 編集、ルビ・傍点、ダークテーマ            |
| `v0.90.x` | Release 準備      | 毎日開けるようにする        | ショートカット、TAB、raw TXT、ルビ・傍点、MD ツールバー、Preview 手入れ、TXT export、設定 JSON export、ダークテーマ、ポリッシュ                                                                                            | DB migration、Git 連携、DOCX / EPUB / PDF、任意 CSS テーマ |

### v0.90.x 表記について

`v0.90.x` は、v1.0 前に v0.9x 系を複数回 dogfood 配布できる余地を残すための表記である。

例:

```text
v0.90.x
v0.91.x
v0.92.x
```

`v0.90.x` は「v1.0 直前の完成版」を意味しない。合意済みの機能セット（後述）を積みつつ、日常 dogfood できる状態を目指す系列である。

---

## Phase 6 / v0.60.x: 閉じても戻れるようにする（完了）

Phase 6 は、アプリを閉じても・予期せず終了しても、執筆作業へ自然に戻れるようにするフェーズだった。

完了内容の要点は「実装が終わったもの → Phase 6 / v0.60.x」に整理済み。step-by-step の設計仕様は当時の Issue / PR / 実装を正本とする。

保持する原則（後続でも維持する）:

```text
settings / session state / recovery は別責務。未保存本文を settings / session に埋め込まない。
zero-tab（documents = [] / activeDocumentId = null）は合法な persisted state。復元のために Untitled を作らない。
前回 project を復元できない場合は Welcome へ移行し、異常理由をユーザーが認識できる UI で伝える（NotificationToast は使わない）。
NotificationToast は正常系・情報通知専用。warning / error は Dialog 等の確実に認識できる UI で伝える。
保存済み Markdown が本文の source of truth。Recovery / snapshot は復元用途の派生物であり、正本を曖昧に二重化しない。
```

Project / Glossary の deterministic snapshot / restore path は foundation 方針のみ確定。実装は v1.0 の hardening 候補として「v1.0 に向けた候補」で扱う。

---

## Phase 7 / v0.70.x: プロジェクトを歩けるようにする（完了）

Phase 7 は File Explorer / Project Navigation の版だった。目的は、小説プロジェクトのフォルダ構造を自然に扱えるようにすること。

完了内容の要点は「実装が終わったもの → Phase 7 / v0.70.x」に整理済み。

保持する原則（後続でも維持する）:

```text
file operation は明示 command / Main Process API 経由。Renderer / File Explorer node が filesystem を直接触らない。
project-root-relative path を基本とし、project root 外への移動は禁止。
watcher は refresh trigger であり、filesystem の真実そのものではない（受信 → debounce → re-scan）。
watch event だけで完全な差分更新を成立させない。rename / move を推測しない。dirty editor を勝手に上書きしない。
Navigator selection と active editor highlight を混同しない。
D&D は filesystem operation ではなく move command の UI の一つ。
```

Phase 7 の当初非スコープだった Project 全文検索は、基盤成立後に着手し実装済み。Outline View / Asset Manager / 章構成管理 / external file drop / import は引き続き後続候補。

---

## Phase 8 / v0.80.x: 他人の手に渡せるようにする

Phase 8 は release hardening の版。

目的は、自分以外の人へ packaged application を渡しても、最低限 dogfood できる状態へ近づけることである。

> 更新（`v0.80.0` 到達時点）: `v0.80.0` milestone は、当初 Phase 8 に想定していた release-hardening よりも先に、小説 IDE としての中核機能（Active Document Find / Replace、project 全文検索、Document Map / Metrics、画像サポート、project settings foundation など）を積む形で到達した。ここに挙げた release-hardening 項目のうち未完了分は、`v0.90.0` の「ポリッシュ」（合意済み順序の 10 番）に統合する。About dialog / third-party notices への導線は着手済み。

Project / Glossary recovery の基盤方針は Phase 6 で確定済み。

Phase 8 では新しい recovery architecture を作らず、確定済みの recovery path を packaged application 上で検証・polish する。

### Phase 8 で扱うこと

```text
packaged exe dogfood flow
README / FAQ 整理
UI polish

error state
empty state
loading state

Debug Log 周辺整理
issue report に必要な情報整理

recovery path packaged-app verification

release quality checklist
```

追加候補:

```text
first-run experience
sample project
version display
packaged app smoke test checklist
known limitations draft
```

### 配布品質 / リリース品質の分離

Windows installer と `.pergamum` association は Phase 4 で導入済み。

ただし配布品質として、以下は通常機能とは分けて管理する。

```text
code signing
auto update
GitHub Release artifacts
installer branding polish
macOS file association
Linux MIME integration
release note / changelog
tag / release operation
CI artifact publication
```

### Phase 8 で扱わないこと

```text
DB migration
rich-format export（PDF / DOCX / EPUB / 縦書き）
installer 高度化
```

（プロジェクト全体の TXT エクスポートと設定値 JSON エクスポートは `v0.90.0` スコープ。上記 rich-format export とは別。）

### Phase 8 の終了条件

```text
自分以外の人が packaged application を起動して、
壊さずに最低限の dogfood ができる準備が整う。
```

---

## v0.90.0: 毎日開けるようにする

`v0.90.0` は、`v0.80.0` で揃った中核機能の上に、日常執筆で必要になる操作性・表現・出力を積む系列とする。

以前は「新規大型機能を積まない締めの系列」と位置づけていたが、下記の合意済み項目を `v0.90.0` スコープに含める方針へ更新した。

### v0.90.0 までの合意済み順序

以下の順で進める。各項目は着手前に個別 Issue で scope / non-scope / acceptance criteria / test points を定義する。

```text
1.  ショートカットキー対応
2.  TAB 関連の手入れ
3.  生 TXT 形式サポート（raw .txt の直接編集）
4.  ルビ・傍点対応
5.  Markdown ツールバー
6.  プレビュー機能全般の手入れ
7.  プロジェクト全体の TXT エクスポート
8.  設定値の JSON エクスポート
9.  ダークテーマ（built-in light / dark）
10. ポリッシュ
```

補足:

```text
3 / 7:
  生 TXT サポートと TXT export は、encoding policy・line ending policy・
  本文非破壊原則を Issue 側で明示したうえで扱う。
  既存の encoding-aware .txt 一括取り込み（取り込み時変換）とは別機能。

4:
  ルビ・傍点は本文記法と Preview 表示を扱う。
  PDF / EPUB / 縦書きなど出力側は v1.x 候補のまま。

9:
  built-in light / dark を扱う。任意 CSS テーマ・theme marketplace・
  theme editor は非スコープのまま。

10:
  release notes、README / FAQ final pass、known limitations、
  upgrade / data warning、packaged application 配布 / dogfood checklist、
  Phase 8 の release-hardening 未完了分を含む。
```

### v0.90.0 で積まないもの

```text
DB migration
Git 連携
Integrated Terminal
Plugin API
共同編集 / クラウド同期
DOCX / EPUB 出力
高度な PDF / 縦書き出力
任意 CSS テーマ / theme marketplace
高度な Linter
複雑な fuzzy matching
external file drop / import
Workbench layout 永続化
```

### v0.90.0 の終了条件

```text
作者本人が日常 dogfood できる。

自分以外の人へアプリを渡しても、
何をするアプリか説明できる。

壊れる可能性がある領域と、
未実装領域が明示されている。
```

`v0.90.0` は「全部できる」を目標にしない。使いながら育てられる状態を目指す。

---

## 積み残しと判断時期

ここには、foundation は完了しているが派生作業が残っているもの、または再開条件がまだ満たされていないものを置く。

積み残しは「忘れた仕事」ではなく、**判断時期または再開条件を持つ仕事**として管理する。

---

### Workbench

```text
項目:
  layout 永続化
  sidebar width 永続化
  editor / preview split ratio 永続化
  utility window height 永続化

判断時期:
  Phase 6 の Session Restore 完成後、
  UX 上の必要性を見て再判断する。

  v0.90.x 以降でもよい。
```

---

### Document information pane — #260

候補:

```text
File Explorer 下部の文書情報 pane

文字数
行数
段落数

project Markdown
external Markdown
Untitled
Settings
folder

などの対象ごとの情報表示
```

将来候補:

```text
地の文 / 会話文比率
folder descendant file count
external Markdown warning
```

前提として、

```text
Active Editor
File Explorer selection
information target
```

の関係を先に整理する。

判断時期:

```text
Phase 7 の
File Explorer / navigation model が固まった後
```

dialogue detection 用 project settings 候補:

```text
editor.dialogue.openingCharacter
editor.dialogue.closingCharacter
```

default candidate:

```text
「
」
```

---

### Invisible-character rendering

```text
項目:
  space / full-width space 等の不可視文字表示
  IME と CodeMirror decoration geometry の共存

Status:
  deferred
  CodeMirror upstream behavior confirmation pending

再開条件:
  upstream response
  または MirrorSchale で実装方針を確定できた時点
```

後続作業をブロックしない。`v0.80.0` 時点でも deferred のまま。

---

### Occurrences

```text
項目:
  range anchoring
  文書編集後の occurrence 再計算
  cursor-position-aware navigation
  複数 entry tracking

判断時期:
  v1.0 候補
```

---

### Debug Log

```text
項目:
  検索
  export
  full file viewer
  issue report 連携

判断時期:
  Phase 8 または v1.0 候補
```

---

### Glossary UX

Glossary Completion（Ctrl+Space）と primary tag の視覚的強調は `v0.80.0` で実装済み。

残り候補:

```text
forms management polish
warning policy 説明文の整理
duplicate surface feedback
form 並び順の整理
view-state persistence
```

判断時期:

```text
v1.0 候補
```

Glossary DB は source of truth のまま維持する。

---

### Settings

Settings Catalog / Settings Page / user-scope persistence / project settings foundation（project override、検索、category filter、dialogue metrics 設定）は実装済み。

残り:

```text
user / project / default resolution の拡張
wired settings expansion
workbench.colorTheme wiring（ダークテーマ実装時、v0.90.0）
preview.renderer wiring
Settings dirty / apply flow の拡張
設定値の JSON エクスポート（v0.90.0、合意済み順序の 8 番）
```

判断時期:

```text
必要になった設定から個別に扱う。

Settings 全体を再設計するためだけの
巨大フェーズにはしない。

全面的な完成は v1.0 候補。
```

---

### Project / file operations

残り候補:

```text
Safe filename / default untitled name policy
Existing project DB migration / naming transition policy
second-instance policy
```

判断時期:

```text
second-instance policy:
  Phase 6 / Session Restore 周辺で判断する

Existing project DB migration / naming transition policy:
  v1.0 でデータ互換性を重視する段階で判断する

Safe filename / default untitled name policy:
  file creation workflow が必要になった時点で判断する
```

Untitled Markdown document の存在自体と zero-tab handling は実装済みとし、積み残しから外す。

---

### Text handling policy

Phase 5 により、Markdown line ending preservation / diagnostics と paragraph indentation command の基盤は成立した。

残り候補:

```text
configurable Japanese paragraph indent character
Unicode space-like character linter
明示的 line ending conversion command
より高度な text diagnostics
```

本文変更を伴うものは、自動処理として導入しない。

```text
明示 command
または
Export
```

として扱える場合に検討する。

判断時期:

```text
v1.0 または後続 Phase 候補
```

---

### Search / project-wide navigation

Project 全文テキスト検索（Search pane）と project-wide replace は `v0.80.0` 時点で実装済み。
Active Document Find / Replace（開いている文書内の検索・置換、Glossary find modes、nearby search）も実装済み。

残り候補:

```text
Quick Access @ / ## / no-prefix
Markdown outline search
SQLite FTS5 / trigram / BM25 等のインデックス検索

判断時期:
  v1.0 または v1.x 候補
```

replace の拡張は本文変更を伴うため、明示 command と undo の扱いを含め、別 Issue とする。

---

### Performance / Preview rendering

プレビュー機能全般の手入れは `v0.90.0` スコープ（合意済み順序の 6 番）。表示品質・操作性の改善はそこで扱う。

measurement 由来の最適化候補:

```text
long document open performance follow-up
Preview rendering cost follow-up
content-visibility / containment verification
decoration rendering cost observation
```

測定と対処は分ける。

異常に巨大な paragraph まで常に高速であることを保証するために、Editor の応答性や執筆体験を犠牲にしない。

判断時期:

```text
実際の dogfood で問題が観測されたとき
```

---

## v1.0 に向けた候補

v1.0 は、ユーザーのデータを壊さず日常的に使える安定版を目指す。

候補:

```text
DB migration

Project settings の安定化
Glossary 管理 UI の安定化

Session Restore / Recovery hardening
Recovery format compatibility
Recovery migration policy

基本的な Linter

Export / output（rich format: PDF / DOCX / EPUB / 縦書き）

FAQ / Help
```

Session Restore / Document Recovery の foundation は Phase 6 で実装済み。Project / Glossary Recovery（deterministic snapshot / restore path）は方針のみ確定で未実装。

したがって v1.0 では、Session Restore / Document Recovery を初めて作るのではなく、

```text
compatibility
hardening
migration
failure handling
UX stabilization
```

を扱う。

上記に加え、「積み残しと判断時期」で v1.0 候補とした項目を含む。

```text
v0.90.x:
  dogfood 可能な配布系列

v1.0:
  データを壊さず日常運用できる安定版
```

---

## v1.x 以降の候補

v1.x 以降では、v1.0 までに固めた本文正本・Glossary・Workbench・Recovery 基盤の上へ、より大きな補助機能を載せる。

候補:

```text
Git status / diff / commit UI

Integrated Terminal
optional / experimental

Plugin API
Trusted UI Extension

高度な Linter

Export / output の拡張
縦書き出力
EPUB / PDF / DOCX 出力

internal drag and drop move
external file / folder import

advanced theme customization（任意 CSS テーマ、theme marketplace、theme editor）
```

Terminal は Git integration と組み合わせて考える。

```text
Git UI:
  よく使う操作を安全に提供する

Terminal:
  UI で覆いきれない操作の escape hatch
```

ただし Terminal は実装コストが高いため後回しにする。

主な理由:

```text
OS dependency
shell selection
PTY control
native module の可能性
packaging complexity
CI complexity
security boundary
```

---

## 当面やらないこと

以下は `v0.90.0` までの必須スコープに入れない。

```text
Git integration
Integrated Terminal

Plugin API

複雑な Linter
高度な fuzzy matching

DOCX / EPUB 出力
高度な PDF / 縦書き出力

共同編集
クラウド同期

Workbench layout 永続化

DB migration

任意 CSS テーマ / Color theme full customization
theme marketplace / theme editor

external file drop / import
```

「当面やらない」は永久にやらないという意味ではない。

以下は `v0.90.0` スコープへ移動したため、ここには含めない（詳細は「v0.90.0: 毎日開けるようにする」を参照）。

```text
生 .txt 形式サポート（raw .txt の直接編集）
プロジェクト全体の TXT エクスポート
built-in light / dark theme（ダークテーマ）
```

Phase 6 で方針確定した recovery / snapshot restore 系も、ここには置かない。

---

## 保留・駐車場

### Plugin API

初期リリースでは外す可能性が高い。

将来候補:

```text
Command registration
Linter registration
Renderer extension
Trusted UI Extension
```

注意点:

```text
Plugin に本文編集権限を渡すか

Renderer をどこまで触らせるか

security boundary

signing / trust model
```

---

### Git integration

初期リリースでは外す方向。

理由:

```text
Git は外部ツールで扱える
小説 IDE としてのコアではない
初期実装に含めると複雑化する
```

将来的な候補:

```text
change detection
commit helper
history viewer
diff viewer
```

---

### Custom Glossary kind

Glossary entry の `kind` をユーザー定義可能にする案。

現状は built-in kind を使用する。

将来案:

```text
glossary_kinds table

id
display_name
sort_order
is_builtin
```

注意点:

```text
kind key をどう扱うか

表示名変更と内部 ID の関係

既存 entry との互換性
```

---

### Glossary tags

Glossary entry に tags を付ける案。

用途候補:

```text
章
勢力
時代
登場頻度
視点人物
ネタバレ管理
```

現時点では Future Work。

---

### Plain text document support

生 `.txt` の直接編集は **`v0.90.0` スコープ**（合意済み順序の 3 番）。

一見単純だが、以下が絡むため、着手前に Issue 側で方針を明示する。

```text
encoding policy
line ending policy
本文非破壊原則
```

encoding-aware な `.txt` → Markdown 一括取り込みは `v0.80.0` 時点で実装済み。これは「取り込み時に変換する」機能であり、生 `.txt` を UTF-8 前提を外して直接開いて編集する話とは別。

---

### Export / output

Markdown 本文から提出用・閲覧用の派生物を生成する機能。段階を分ける。

```text
v0.90.0 スコープ（合意済み順序）:
  プロジェクト全体の TXT エクスポート（7 番）
  設定値の JSON エクスポート（8 番）
  ルビ・傍点の本文記法と Preview 表示（4 番）

v1.x 以降候補:
  PDF / DOCX / EPUB 出力
  縦書き出力
  章単位出力
  Word / 一太郎納品を意識した形式変換
```

文字数カウント自体は Editor / Status Bar 機能として Phase 5 で実装済み。

Export 側では、必要に応じて提出形式に対応した独自の文字数定義を将来的に扱う可能性がある。

本文正本を Markdown とする方針は維持する。

```text
Markdown source:
  作者の正本

Export:
  提出用・納品用の派生物
```

機械置換や体裁調整が必要な場合、本文保存処理ではなく Export 側へ閉じ込めることを優先して検討する。

---

### Color theme foundation

長時間執筆・編集するため、カラーテーマを切り替えられるようにする。

built-in light / dark theme は **`v0.90.0` スコープ**（合意済み順序の 9 番）。

対象:

```text
built-in themes:
  light
  dark
```

ユーザー定義テーマを導入する場合、任意 CSS を直接読み込ませるより、許可された theme token を設定として受け取る方式を優先して検討する。

非スコープ候補:

```text
任意 CSS の直接読み込み
theme marketplace
theme synchronization
Plugin による theme 配布
高度な theme editor
```

---

## 直近の推奨順

`v0.80.0` 到達後、次は `v0.90.0` に向けて以下の合意済み順序で進める。

```text
1.  ショートカットキー対応          ← 次のタスク
2.  TAB 関連の手入れ
3.  生 TXT 形式サポート
4.  ルビ・傍点対応
5.  Markdown ツールバー
6.  プレビュー機能全般の手入れ
7.  プロジェクト全体の TXT エクスポート
8.  設定値の JSON エクスポート
9.  ダークテーマ
10. ポリッシュ
```

並行保留:

```text
Invisible-character rendering:
  CodeMirror upstream confirmation pending

#260 Document information pane:
  File Explorer navigation model は Phase 7 で成立済み。
  Active Editor / File Explorer selection / information target の
  関係整理を前提に、必要時に判断する。
```

Issue 化待ちは先頭 1〜3 件を目安にする。

各 Issue の詳細な scope / non-scope / acceptance criteria / test points は Issue 側で定義する。

---

## ロードマップ運用

この文書を完璧な仕様書にはしない。

大きな方針、近い候補、保留事項、再開条件を忘れないために更新する。

### 非スコープ記述の扱い

```text
各 Phase の「扱わないこと」:
  その Phase で読者が期待しやすい誤解を書く

当面やらないこと:
  v0.90.x までの全体非スコープを一元管理する

積み残しと判断時期:
  行き先・判断時期・再開条件を管理する
```

同じ非スコープ項目を複数箇所へ過剰に重複させない。

方針変更時の更新箇所を増やしすぎないためである。

### 運用ルール

```text
Issue を作る前:
  roadmap.md から候補を拾う

Issue を作った後:
  必要なら Issue 番号を追記する

Issue が完了した後:
  完了済みに整理する
  詳細は Issue / PR / 実装へ寄せる

方針が変わった場合:
  古い記述を削除する
  または deferred / rejected として明示する

積み残した場合:
  理由と再開条件または判断時期を残す

直近の推奨順:
  先頭 1〜3 Issue 程度を目安にする

古い設計詳細:
  roadmap.md に残しすぎない
```

roadmap.md は Pergamum の「開発の地図」であり、法律ではない。

実装時の正本は GitHub Issue とする。

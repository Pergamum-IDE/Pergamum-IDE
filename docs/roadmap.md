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

この文書に書かれている項目は、必ずしも実装を約束するものではない。
実際に着手する前には、個別の GitHub Issue として、スコープ・非スコープ・受け入れ条件・テスト観点を定義する。

古くなった設計詳細は残しすぎず、必要なら Issue / PR / ADR / 実装を参照する。

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

作者が明示的に選んだ場合だけ、補助機能として作用する。

```text
検出する
表示する
警告する
提案する

でも、勝手に変えない
```

---

## 現在地

Phase 4 は v0.50.0 で完了済み。

```text
Phase 4:
  迷わず触れるようにする
```

v0.50.0 は、Phase 4 完了を示す milestone version とする。

次は Phase 5 に進む。

```text
Phase 5:
  触りすぎないようにする
```

---

## Runtime / packaging baseline

Runtime version details の正本は `package.json` / `package-lock.json` とする。
この文書には、更新漏れしやすい個別バージョン番号を詳細に残さない。

### Native module 更新ルール

Dependency 更新では、以下を標準的な確認観点として扱う。

```text
npm install success
≠
Electron packaged application success
```

特に native module を含む更新では、以下を必須工程として扱う。

```text
dependency update
        ↓
electron runtime rebuild
        ↓
package
        ↓
dogfood
```

### CI と dogfood

CI と dogfood は別の品質確認工程として扱う。

```text
CI:
  コード品質

Dogfood:
  実際のユーザー経路
```

Native module / file handling / save behavior / packaged exe / installer / file association など、CI だけでは拾いにくい領域は dogfood で確認する。

---

## 実装が終わったもの

完了済みの詳細な設計仕様は roadmap.md に残しすぎない。
正本は Issue / PR / ADR / 実装とする。

### Phase 2: Glossary と Preview の接続

完了済み。

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
Settings foundation
Project file / project identity foundation
Read-only / write-lock access management
Startup .pergamum open flow
Windows installer / .pergamum file association
```

これにより Pergamum は、`.pergamum` project file を持ち、Windows 上でダブルクリック起動できるデスクトップアプリとしての形を得た。

### Debug logging

Debug logging foundation は確定済み。

roadmap.md には、イベント形式・出力項目・ログファイル仕様などの詳細を残さない。
Debug logging の正本は該当 Issue / PR / 実装とする。

将来の Debug Log viewer / issue report export は、確定済みの privacy-safe logging model を前提に別 Issue として扱う。

---

## マイナーバージョン別ロードマップ

| Version | Phase | 合言葉 | 主に積んだ / 積むもの | この版では積まないもの |
| --- | ---: | --- | --- | --- |
| v0.50.0 | Phase 4 完了 | 迷わず触れるようにする | `.pergamum` project file、Settings foundation、read-only handling、write lock、startup argv open、Windows installer / association | Phase 5 本文処理、session restore、project explorer |
| v0.51.x | Phase 5 | 触りすぎないようにする | Editor decoration visibility、line ending marker、paragraph indentation support | `.txt` support、encoding detection、line ending 変換 |
| v0.60.x | Phase 6 | 閉じても戻れるようにする | Session restore、recent projects、continuity settings | layout 永続化、project convention 本格実装 |
| v0.70.x | Phase 7 | プロジェクトを歩けるようにする | 階層 File Explorer、expand/collapse、open、refresh、外部変更検知 | D&D、external drop/import、Project 全文検索 |
| v0.80.x | Phase 8 | 他人の手に渡せるようにする | DB snapshot generation、UI polish、packaged dogfood、README/FAQ、release quality 整理 | DB restore、migration、Export |
| v0.90.x | Release | 毎日開けるようにする | 締め、release notes、known limitations、配布準備 | 新規大型機能 |

### v0.90.x 表記について

`v0.90.x` は、v1.0 前に v0.9x 系で複数回 dogfood 配布する余地を残すための表記である。

候補:

```text
v0.90.x
v0.91.x
v0.92.x
```

v0.90.x は「初回 dogfood 配布系列」であり、「v1.0 直前の完成版」ではない。

---

## Phase 5 / v0.51.x: 触りすぎないようにする

Phase 5 は、本文そのものを扱う。

対象:

```text
Markdown 本文
行末
段落字下げ
補助表示
```

Pergamum は本文を勝手に変更しない。
Phase 5 では、この基本方針を editor / text handling に適用する。

### Phase 5 の焦点

Phase 5 は、次の巨大インフラフェーズにしない。
Markdown 本文を勝手に変更せず、まず「見える」「明示 command でだけ変える」ための基盤に絞る。

主な対象:

```text
Phase 5-1:
  Editor decoration visibility foundation

Phase 5-2:
  Text line ending detection and editor marker display foundation

Phase 5-3:
  Japanese paragraph indentation support
```

### Phase 5 で扱うこと

```text
本文を変更しない補助表示
line ending の可視化
段落字下げの可視化
段落字下げを明示 command で扱うための基盤
```

### Phase 5 で扱わないこと

```text
.txt support
encoding detection
line ending 変換
自動整形
自動修正
Settings persistence / resolution の全面実装
```

`.txt` support は Phase 5 に含めない。
詳細は保留・駐車場を参照する。

### Phase 5 の終了条件

```text
Markdown 本文を勝手に変えずに、
行末（改行コード種別）と段落字下げが見える。

段落字下げは、
明示 command でだけ変更できる。
```

---

## Phase 6 / v0.60.x: 閉じても戻れるようにする

Phase 6 は、dogfood 摩擦を下げる。

目的は、アプリを閉じて再起動しても、前回の作業状態へ戻れるようにすることである。

### Phase 6 で扱うこと

```text
Session restore foundation
recent projects foundation
last opened project restore
open documents restore
active editor restore
起動時に前回プロジェクトを開くかどうか
continuity settings
```

### Settings と session state の区別

`settings` と `session state` は分ける。

```text
settings:
  ユーザーが意味を理解して変更する設定

session state:
  アプリが前回状態を復元するための状態
```

例:

```text
settings:
  editor font
  preview font
  UI language
  起動時に前回プロジェクトを開くか
  line ending marker preset

session state:
  last opened project
  open documents
  active editor
```

### Phase 6 における Settings の扱い

Settings Catalog / Settings Page foundation は Phase 4 で完了済みとする。

Phase 6 では、Settings foundation の作り直しではなく、session restore / recent projects / continuity に必要な範囲の persistence / resolution のみを扱う。

```text
Phase 6 で扱う:
  session restore に必要な最小限の settings persistence / resolution
  起動時動作に関わる continuity settings

Phase 6 で扱わない:
  wired settings の全面拡張
  workbench.colorTheme wiring
  preview.renderer wiring
  Settings dirty / apply flow
  project-specific settings の本格実装
```

### Session restore の欠損ファイル扱い

Session restore は best-effort とする。

```text
復元対象の file が存在しない、または読めない場合:
  その document は復元しない
  アプリ起動を妨げない
  必要に応じて軽い status message に留める
```

外部変更検知は Phase 7 で扱う。
Phase 6 では、復元時点で開けない document を安全にスキップできればよい。

### Phase 6 で扱わないこと

```text
layout 永続化
pane width restore
editor / preview split ratio restore
utility window height restore
```

### Phase 6 の終了条件

```text
アプリを閉じて再起動しても、
前回のプロジェクト・タブ・アクティブエディタへ戻れる。

復元できない document があっても、
アプリ起動や他の復元を妨げない。
```

---

## Phase 7 / v0.70.x: プロジェクトを歩けるようにする

Phase 7 は、File Explorer / Project Navigation の版。

目的は、小説プロジェクトのフォルダ構造を自然に扱えるようにすることである。

### Phase 7 で扱うこと

```text
Hierarchical file explorer foundation
folder expand / collapse
Markdown file open
refresh
external file change detection
missing / unreadable file state
```

### フォルダ内変更検知

Phase 7 では、フォルダ内変更検知を入れる価値が高い。

方針:

```text
watcher は真実ではない
watcher は refresh trigger
真実は再スキャン結果
```

想定:

```text
Main Process:
  project root を watch
  change / rename event を受ける
  debounce する
  directory tree を再スキャンする

Renderer:
  更新通知を受ける
  File Explorer 表示を更新する
```

やらないこと:

```text
event だけを見て完全な差分更新をする
rename / move を推測する
dirty editor を勝手に上書きする
```

### v0.70.x 追加候補

```text
create file
create folder
rename
delete with confirmation
move command
```

これらは明示 command / main process API 経由にする。

### D&D の扱い

D&D は Phase 7 では入れない。

理由:

```text
D&D は基礎機能ではなく、
move command の UI である。
```

必要な順序:

```text
1. 階層 File Explorer で見える
2. 明示 command で create / rename / delete ができる
3. 明示 command で move ができる
4. その move command の UI として D&D を追加する
```

Phase 7 では、後で D&D を載せられるように以下を守る。

```text
File Explorer node が直接 fs 操作しない
Renderer が filesystem を直接触らない
file operation は command / main process API 経由にする
project-root-relative path を基本にする
project root 外への移動は禁止する
Navigator selection と active editor highlight を混ぜない
```

### Phase 7 で扱わないこと

```text
internal drag and drop move
external file drop / import
Project 全体検索
Outline View
Asset Manager
章構成管理
```

Project 全体検索は重要だが、Phase 7 の初期には含めない。
File Explorer / Project Navigation の基盤ができた後、v1.0 候補または後続 Phase として判断する。

### Phase 7 の終了条件

```text
小説プロジェクトの chapters / notes / worldbuilding / drafts を
階層として見て、開ける。

外部で追加・削除されたファイルを、
File Explorer が refresh によって追える。
```

---

## Phase 8 / v0.80.x: 他人の手に渡せるようにする

Phase 8 は、release hardening の版。

目的は、自分以外の人に exe を渡しても、最低限 dogfood できる状態へ近づけることである。

### Phase 8 で扱うこと

```text
DB snapshot generation
snapshot JSON generation
packaged exe dogfood flow
README / FAQ 整理
UI polish
error / empty / loading state 整理
Debug log 周辺整理
issue report に必要な情報整理
release quality checklist
```

DB snapshot の位置づけ:

```text
pergamum.db:
  構造化データの正本

snapshot JSON:
  DB から生成される派生データ
  正本ではない
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

Windows installer と `.pergamum` association は Phase 4 で入った。
ただし、配布品質としてはまだ別途整理すべき作業がある。

以下は通常の機能開発とは分けて管理する。

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
DB snapshot restore
DB migration
Crash recovery 本格実装
Export / output foundation
installer 高度化
```

### Phase 8 の終了条件

```text
自分以外の人が exe を起動して、
壊さずに最低限の dogfood ができる準備が整う。
```

---

## v0.90.x: 初回 dogfood 配布系列

v0.90.x は新規大型機能追加系列ではなく、締めの系列とする。

```text
v0.90.x:
  毎日開けるようにする
```

### v0.90.x でやること

```text
v0.51.x〜v0.80.x の未完了項目の剪定
release notes
README / FAQ final pass
packaged exe 配布
dogfood checklist
known limitations
upgrade / data warning
```

### v0.90.x で積まないもの

```text
新規大型機能
```

その他の全体非スコープは「当面やらないこと」にまとめる。

### v0.90.x の終了条件

```text
作者本人が日常 dogfood できる。
他人に exe を渡しても、何をするアプリか説明できる。
壊れる可能性がある領域と、未実装領域が明示されている。
```

v0.90.x は「全部できる」ではない。
ここから使いながら育てられる状態を目指す。

---

## 積み残しと判断時期

ここには、foundation は完了したが、完成品としてはまだ残っている派生作業や、どの Phase に入れるか未確定の作業を置く。
すぐにやるとは限らない。

### Workbench

```text
項目:
  layout 永続化
  sidebar width 永続化
  editor / preview split ratio 永続化
  utility window height 永続化

判断時期:
  v0.90.x 以降の UX 改善候補
```

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

### Glossary

```text
項目:
  forms management polish
  warning policy 説明文の整理
  duplicate surface feedback
  form 並び順の整理

判断時期:
  v1.0 候補
```

### Settings

```text
項目:
  settings persistence
  user / project / default resolution
  wired settings expansion
  workbench.colorTheme wiring
  preview.renderer wiring
  Settings dirty / apply flow

判断時期:
  Phase 6 で continuity に必要な最小範囲を扱う。
  それ以外は v1.0 候補として判断する。
```

### Project / file operations

```text
項目:
  Untitled Markdown document handling
  Safe filename / default untitled name policy
  Existing project DB migration / naming transition policy
  second-instance policy

判断時期:
  Untitled Markdown document handling:
    Phase 6 前、または v0.90.x までの dogfood 改善候補

  second-instance policy:
    Phase 6 / session restore 周辺で判断する

  Existing project DB migration / naming transition policy:
    v1.0 でデータ互換性を重視する段階で判断する
```

### Text handling policy

```text
項目:
  Text document line ending policy
  Configurable Japanese paragraph indent character
  Unicode space-like character linter

判断時期:
  Phase 5 の可視化基盤が入った後に判断する。
  本文変更を伴うものは、明示 command / export の扱いが固まってから扱う。
  v1.0 候補。
```

Phase 5 では line ending / paragraph indentation を「見える」状態にする。
保存時の line ending 適用、段落字下げ文字の設定化、space-like character linter は Phase 5 には自動的に含めない。

### Search / project-wide navigation

```text
項目:
  Project 全文検索
  project-wide replace
  Quick Access @ / # / no-prefix
  Markdown outline search
  SQLite FTS5 / trigram / BM25

判断時期:
  Phase 7 の File Explorer / Project Navigation 基盤後に判断する。
  v1.0 または v1.x 候補。
```

置換は本文変更を伴うため、本文非破壊原則や明示 command の扱いが固まった後に別 Issue として扱う。

### Performance / preview rendering

```text
項目:
  long document open performance follow-up
  preview rendering cost follow-up
  content-visibility / containment verification
  decoration rendering cost observation

判断時期:
  Phase 5 の editor decoration 作業と隣接して判断する。
  ただし、Phase 5 の必須スコープには自動的に含めない。
```

測定と対処は分ける。
Phase 4 では long document open performance measurement が進んだ。
preview / decoration / layout cost への対処は後続候補として扱う。

---

## v1.0 に向けた候補

v1.0 は、日常的に使える安定版を目指す。

候補:

```text
DB migration
DB snapshot restore
Project settings の安定化
Glossary 管理 UI の安定化
Session restore の安定化
Crash recovery
基本的な Linter
Export / output foundation
FAQ / Help
built-in light / dark theme foundation
Project-wide search
```

上記に加え、「積み残しと判断時期」で v1.0 候補としたものを含む。

v1.0 では、ユーザーのデータを壊さないことを重視する。

```text
v0.90.x:
  dogfood 可能な配布系列

v1.0:
  データを壊さず日常運用できる安定版
```

---

## v1.x 以降の候補

v1.x 以降では、v1.0 までに固めた本文正本・Glossary・Workbench・支援ウィンドウの上に、より大きな補助機能を載せる。

候補:

```text
Git status / diff / commit UI
Integrated Terminal optional / experimental
Plugin API
Trusted UI Extension
高度な Linter
Export / output の拡張
縦書き出力
EPUB / PDF / DOCX 出力
internal drag and drop move
external file / folder import
advanced theme customization
Plain text document support
```

Terminal は Git 統合とセットで考える。

```text
Git UI:
  よく使う操作を安全に提供する

Terminal:
  UI で覆いきれない操作の escape hatch
```

ただし、Terminal は実装コストが高いため後回しにする。

理由:

```text
OS 依存
shell 選択が必要
PTY 制御が必要
native module が絡む可能性
packaging / CI / security が重くなる
```

---

## 当面やらないこと

以下は v0.90.x までの必須スコープに入れない。

```text
Git 統合
Integrated Terminal
Plugin API
複雑な Linter
高度な fuzzy matching
縦書き出力
本文エクスポート
DOCX / PDF / EPUB 出力
共同編集
クラウド同期
layout 永続化
DB snapshot restore
DB migration
Color theme full customization
任意 CSS テーマ
external file drop / import
.txt support
```

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
プラグインに本文編集権限を渡すか
Renderer をどこまで触らせるか
セキュリティ境界をどうするか
署名 / trust model をどうするか
```

### Git integration

初期リリースでは外す方向。

理由:

```text
Git は外部ツールで扱える
小説 IDE としてのコアではない
初期実装に含めると複雑化する
```

将来的には以下を検討する可能性がある。

```text
変更検知
commit helper
history viewer
diff viewer
```

### Custom kind

Glossary entry の `kind` をユーザー定義可能にする案。

現状は固定 enum。

```text
term
person
place
organization
item
concept
```

将来案:

```text
glossary_kinds table
id: UUIDv7
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

### tags

Glossary entry に tags を付ける案。

用途:

```text
章
勢力
時代
登場頻度
視点人物
ネタバレ管理
```

現時点では Future Work。

### Plain text document support

`.txt` support は Phase 5 には含めない。

`.txt` は簡単そうに見えるが、実際には以下が絡む。

```text
encoding policy
line ending policy
本文非破壊原則
```

そのため、v1.x 以降の候補として扱う。

### Export / output

Markdown 本文から提出用原稿を出力する機能。

候補:

```text
ルビ対応
縦書き対応
文字数カウント
章単位出力
PDF / DOCX / EPUB
Word / 一太郎納品を意識した形式変換
```

ただし、本文正本を Markdown とする方針は維持する。

```text
Markdown source:
  作者の正本

Export:
  提出用・納品用の派生物
```

機械置換や体裁調整は、本文保存ではなく export command に閉じ込める。

### Color theme foundation

長時間執筆・編集するために、カラーテーマを切り替えられるようにする。

v0.90.x では必須にしない。
v1.0 以降の候補とする。

初期候補:

```text
built-in themes:
  light
  dark
```

ユーザー定義テーマは、任意 CSS を直接読み込むのではなく、まずは許可されたテーマトークンを設定として受け取る方式を検討する。

非スコープ候補:

```text
任意 CSS の直接読み込み
テーママーケットプレイス
テーマ同期
プラグインによるテーマ配布
高度なテーマエディタ
```

---

## 直近の推奨順

現時点では、以下の順で進める。

```text
1. Phase 5-1: Editor decoration visibility foundation
2. Phase 5-2: Text line ending detection and editor marker display foundation
3. Phase 5-3: Japanese paragraph indentation support
4. Phase 6-1: Session restore foundation
5. Phase 6-2: Recent projects / continuity settings foundation
6. Phase 7-1: Hierarchical file explorer foundation
```

Issue 化待ちは先頭 1〜3 件を目安にする。
詳細なスコープ・非スコープ・受け入れ条件・テスト観点は、それぞれの Issue で定義する。

理由:

```text
Phase 5:
  本文非破壊原則を text handling に適用する。

Phase 6:
  毎日開けるための session restore / recent projects を整える。

Phase 7:
  小説プロジェクトを自然に歩けるようにする。
```

---

## ロードマップ運用

この文書は、完璧に保つ必要はない。
大きな方針・近い候補・保留事項を忘れないために更新する。

### 非スコープ記述の扱い

```text
各 Phase の「扱わないこと」:
  その Phase で読者が期待しやすい誤解だけを書く

当面やらないこと:
  v0.90.x までの全体非スコープを一元管理する

積み残しと判断時期:
  行き先と判断時期を管理する
```

同じ非スコープ項目を複数箇所に重複して書きすぎない。
方針が変わったときに更新箇所が増えすぎるためである。

### 運用ルール

```text
Issue を作る前:
  この文書から候補を拾う

Issue を作った後:
  必要なら候補名を Issue 番号付きに更新する

Issue が完了した後:
  完了済みに移す
  詳細は Issue / PR / 実装へ寄せる

方針が変わった場合:
  古い記述を消す
  または保留・却下として明示する

直近の推奨順:
  先頭 1〜3 Issue 分を目安にする
  詳細なスコープ・非スコープ・受け入れ条件・テスト観点は Issue 側で定義する

古い設計詳細:
  roadmap.md に残しすぎない
```

この文書は、Pergamum の「開発の地図」であり、法律ではない。
実装時の正本は GitHub Issue とする。

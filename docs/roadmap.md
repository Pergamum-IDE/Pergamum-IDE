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

この文書は法律ではない。
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

Phase 3 は完了済み。

Phase 3 では、本文を書く場と周辺作業の場を分離し、Glossary / Navigation / Utility Window / Debug logging / Runtime baseline の基礎を整えた。

```text
Phase 3:
  つながりすぎないようにする
```

次は Phase 4 に入る。

Phase 4 では、後続機能を無理なく載せるため、操作入口を command / menu / shortcut / context menu に寄せる。

```text
Phase 4:
  迷わず触れるようにする
```

以降の大きな流れは以下。

```text
Phase 4:
  迷わず触れるようにする

Phase 5:
  触りすぎないようにする

Phase 6:
  閉じても戻れるようにする

Phase 7:
  プロジェクトを歩けるようにする

Phase 8:
  他人の手に渡せるようにする

v0.90.0:
  毎日開けるようにする
```

---

## Runtime baseline

Phase 3 終了時点の runtime baseline は以下。

```text
Node.js:
  24 baseline

Electron:
  43 baseline

Vite:
  8 baseline

markdown-it:
  latest baseline

better-sqlite3:
  updated

Native module workflow:
  established
```

Runtime version details are recorded here as a baseline snapshot.
The current source of truth is `package.json` / `package-lock.json`.

### Native module 更新ルール

`better-sqlite3` 更新時に発生した ABI mismatch を受け、以下を標準化する。

```text
npm install success
≠
Electron packaged application success
```

Native module を含む更新では、以下を必須工程として扱う。

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

Phase 4 以降、CI と dogfood は別の品質確認工程として扱う。

```text
CI:
  コード品質

Dogfood:
  実際のユーザー経路
```

Native module / file handling / save behavior / packaged exe など、CI だけでは拾いにくい領域は dogfood で確認する。

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

主な完了項目:

```text
Boundary resolver foundation
Glossary match boundary start / end model
Advanced matching settings UI
Glossary occurrence navigation foundation
Workbench resizable panes
Sidebar collapse
Utility Window shell
Glossary occurrences tab
Glossary entry deletion
Glossary navigator search
Debug mode JSONL logging foundation
Utility Window debug log tab
Runtime baseline update
Native module workflow establishment
```

### Debug logging

Debug logging foundation は確定済み。

roadmap.md には、イベント形式・出力項目・ログファイル仕様などの詳細を残さない。
Debug logging の正本は該当 Issue / PR / 実装とする。

将来の Debug Log viewer / issue report export は、確定済みの privacy-safe logging model を前提に別 Issue として扱う。

---

## 積み残しのもの

ここには、foundation は完了したが、完成品としてはまだ残っている派生作業を置く。
すぐにやるとは限らない。

```text
Workbench:
  layout 永続化
  sidebar width 永続化
  editor / preview split ratio 永続化
  utility window height 永続化

Occurrences:
  range anchoring
  文書編集後の occurrence 再計算
  cursor-position-aware navigation
  複数 entry tracking

Debug Log:
  検索
  export
  full file viewer
  issue report 連携

Glossary:
  forms management polish
  warning policy 説明文の整理
  duplicate surface feedback
  form 並び順の整理
```

### layout 永続化の扱い

v0.90.0 では layout 永続化を必須にしない。

初期の session restore では以下を優先する。

```text
復元する:
  last opened project
  open documents
  active editor

復元しない:
  pane width
  editor / preview split ratio
  utility window height
```

layout 永続化は、後続 Issue として扱う。

---

## マイナーバージョン別ロードマップ

| Version | Phase | 合言葉 | 主に積むもの | この版では積まないもの |
| --- | ---: | --- | --- | --- |
| v0.40 系 | Phase 4 | 迷わず触れるようにする | Application menu、basic shortcuts、context menu、Command tab、tab close、About | 全キーバインド customization、Plugin command、VSCode 型 overlay |
| v0.50 系 | Phase 5 | 触りすぎないようにする | Editor decoration visibility、改行検出、行末マーカー、不可視文字表示、段落字下げ command | `.txt` support、encoding detection、line ending 変換 |
| v0.60 系 | Phase 6 | 閉じても戻れるようにする | Session restore、settings foundation、recent projects、preferences entry point | layout 永続化、theme customization、project convention 本格実装 |
| v0.70 系 | Phase 7 | プロジェクトを歩けるようにする | 階層 File Explorer、expand/collapse、open、refresh、外部変更検知 | D&D、external drop/import、Project 全文検索 |
| v0.80 系 | Phase 8 | 他人の手に渡せるようにする | DB snapshot generation、UI polish、packaged dogfood、README/FAQ | DB restore、migration、Export |
| v0.90.0 | Release | 毎日開けるようにする | 締め、release notes、known limitations、exe 配布 | 新規大型機能 |

### v0.90.0 表記について

`v0.90.0` は、v1.0 前に v0.9x 系で複数回 dogfood 配布する余地を残すための表記である。

候補:

```text
v0.90.x
v0.91.x
v0.92.x
```

v0.90.0 は「初回 dogfood 配布版」であり、「v1.0 直前の完成版」ではない。

---

## Phase 4 / v0.4 系: 迷わず触れるようにする

Phase 4 は、Pergamum を「迷わず触れる」状態へ近づけるための版である。

当初は、Application menu / shortcut / context menu / Command launcher など、操作入口の整理を中心に想定していた。

しかし実装を進める中で、単に入口を増やすだけでは不十分であることが分かった。

ユーザーが迷わず触るためには、以下も同時に必要になる。

```text
何を操作しているのか分かる
今どのプロジェクトにいるのか分かる
書ける状態なのか、読み取り専用なのか分かる
新規文書がどう保存されるのか分かる
危ない操作では適切な確認が出る
コマンドの意味と実行可否が分かる
設定値が壊れていても安全に復帰できる
Electron / Chromium 由来の危険操作で作業状態を壊さない
```

そのため Phase 4 では、command / menu / shortcut / context menu だけでなく、project identity、project file、access mode、dialog、settings、Command Palette、untitled document、Electron shortcut policy も含めて扱う。

```text
Command:
  操作の意味

Command Palette:
  操作の発見・実行・状態確認の入口

Menu:
  見つけられる入口

Shortcut:
  速く呼ぶ入口

Context menu:
  選択中の対象に応じた入口

Dialog:
  ユーザー判断を安全に受け取る入口

Settings:
  アプリの振る舞いを安全に調整する入口

Project file:
  プロジェクトを開く入口

Untitled document:
  新規文書を保存可能な文書へ移す入口

Window title / status display:
  現在地と状態を把握する入口
```

### v0.4 系で進んだもの

Phase 4 では、当初予定していた menu / shortcut / context menu の前に、後続作業を支える基盤が多く進んだ。

完了済みまたは大きく進んだもの:

```text
Command Palette foundation
Command enablement / disabled reason foundation
Command Palette status indicator
Command Palette description footer
Command metadata description
Command Palette settings
Settings Catalog foundation
Application Settings UI foundation
settings.json validation
number setting validation
binary dialog foundation
choice dialog foundation
SQLite DB project file foundation
.pergamum project file foundation
project identity foundation
read-only project access mode
read-only command disablement
one-folder-one-instance / write lock foundation
window title project/access mode display
debug logging foundation
long document open performance measurement
```

これらは当初の「操作入口を整理する」からは横に見えるが、実際には「迷わず触れる」ための土台である。

```text
Command Palette:
  何ができるかを見つける

description footer:
  その command が何をするかを読む

disabled reason:
  なぜ実行できないかを知る

read-only mode:
  今は書けない状態だと分かる

window title:
  どの project を触っているか分かる

dialog:
  危ない操作を明示的に判断する

settings validation:
  壊れた設定値で迷子にならない

.pergamum:
  どれがプロジェクト本体か分かる
```

### v0.4 系で残っているもの

Phase 4 の残作業は、v0.50 以降の本文処理・session restore・project navigation・release hardening に進む前に片付けたい、操作入口・状態表示・判断ポイントを中心にする。

候補:

```text
Application Settings dirty / apply flow
Untitled Markdown document handling
Safe filename / default untitled name policy
Startup file open / .pergamum argv handling
Extension association policy
Existing project DB migration / naming transition policy
Application menu items
Context menu foundation
About dialog
Unsafe Electron / Chromium default shortcut suppression
```

### Project open / startup file handling

`.pergamum` SQLite project file foundation は進んだ。

残る課題は、OSや起動引数から `.pergamum` project file を開く導線である。

```text
扱うこと:
  startup argv から .pergamum を開く
  .pergamum ダブルクリック導線の前提整理
  起動時 project open failure の扱い
  既に開いている project との関係
  project switching 時の dirty document 確認

扱わないこと:
  installer 本格対応
  OS file association 登録の完成
  DB migration 本格対応
```

### Extension association policy

`.pergamum` / `.md` / `.markdown` / `.txt` の意味を整理する。

```text
扱うこと:
  .pergamum は Pergamum project file
  .md / .markdown は Markdown document
  .txt は現時点では正式 support しない
  startup / open dialog / save dialog での扱い
  new Markdown default extension の方針

扱わないこと:
  plain text document mode
  encoding detection
  .txt preview
  Generic New File command
```

`.txt` は簡単そうに見えるが、実際には encoding policy / line ending policy / 本文非破壊原則に関わるため、Phase 4 では扱わない。

### Existing project DB migration / naming transition policy

既存の `pergamum.db` から `<projectName>.pergamum` への移行方針は整理しておく。

ただし、破壊的変更が許容される初期開発期間であるため、Phase 4 では本格 migration 機構までは扱わない。

```text
扱うこと:
  既存 project DB の扱い方針
  開発中データをどこまで切り捨て可能とするか
  naming transition の説明

扱わないこと:
  DB migration framework
  backward compatibility guarantee
  snapshot restore
```

### Untitled Markdown document handling

新規 Markdown 文書の扱いは、save / save as / close / dirty state / tab close / session restore に影響する。

Phase 6 の session restore に進む前に、最低限の扱いを整理する。

```text
扱うこと:
  untitled document の identity
  untitled tab title
  default filename
  safe filename policy
  save / save as の扱い
  dirty close confirmation
  tab close との整合

扱わないこと:
  generic New File command
  plain text document mode
  crash recovery
  session restore 本格実装
  recovery store
```

新規 Markdown の既定拡張子は `.md` / `.markdown` の範囲で扱う。
`.txt` は Phase 4 の対象外とする。

### Application Settings dirty / apply flow

Application Settings は既に UI と validation が育ってきている。

一方で、設定変更時の dirty state、即時適用、Apply / Cancel、保存失敗時の扱いはまだ整理が必要である。

```text
扱うこと:
  settings UI の dirty state
  apply / cancel flow
  保存失敗時の表示
  変更中と保存済み状態の区別
  settings.json 直接編集時の fallback 方針との整合

扱わないこと:
  settings foundation の全面作り直し
  theme customization
  project-specific settings 本格実装
```

### Application menu items

Application menu は、Command Palette 以外から操作を見つけるための入口である。

既存 command を menu に載せ、basic shortcut と対応させる。

```text
扱うこと:
  File / Edit / View / Help などの基本 menu
  既存 command との接続
  basic shortcut
  read-only / disabled state との整合
  project / document / settings / about への基本導線

扱わないこと:
  全 command の網羅
  keybinding customization
  plugin command registration
```

### Context menu foundation

Context menu は、選択中の対象に応じた操作入口である。

Phase 5 以降で本文操作 command を増やす前に、最低限の context menu 基盤を整える。

```text
扱うこと:
  editor context menu foundation
  selection-dependent command entry
  cut / copy / paste / select all
  command registry との接続

扱わないこと:
  全領域の context menu 網羅
  plugin-provided context menu
  高度な対象判定
```

### About dialog

About dialog は、アプリ名・バージョン・ライセンス・基本情報を確認する入口である。

Phase 8 の配布品質で慌てて作るのではなく、Phase 4 のうちに小さく入れておく。

```text
扱うこと:
  app name
  version
  license
  repository / project information

扱わないこと:
  update check
  crash report
  telemetry
```

### Unsafe Electron / Chromium default shortcut suppression

Electron / Chromium 由来の既定ショートカットには、執筆アプリとして危険なものがある。

特に reload 系は、未保存状態や作業中 UI を破壊する可能性があるため、Phase 4 で抑制方針を固める。

```text
抑制候補:
  Ctrl+R
  F5
  Ctrl+Shift+R
  Alt+Left
  Alt+Right
  BrowserBack
  BrowserForward
  Ctrl+P
```

DevTools 系 shortcut は、開発・dogfood では必要になる。

そのため、完全に削除するのではなく、hidden settings path による明示 opt-in とする。

候補:

```json
{
  "workbench": {
    "devTools": {
      "enabled": true
    }
  }
}
```

方針:

```text
既定:
  DevTools shortcut は無効

hidden setting:
  workbench.devTools.enabled が true の場合のみ許可

Settings UI:
  表示しない

settings.json が不正な場合:
  既存方針どおり default fallback
```

対象候補:

```text
F12
Ctrl+Shift+I
Ctrl+Shift+J
```

ただし、通常の編集 shortcut は壊さない。

```text
壊さない:
  Ctrl+C
  Ctrl+X
  Ctrl+V
  Ctrl+A
  Ctrl+Z
  Ctrl+Y
  IME composition
```

### Search / replace / Quick Access の扱い

Phase 4 では、project-wide search / replace には入らない。

Quick Access prefix families も、現時点では足場が足りないため保留する。

```text
@ glossary search:
  Glossary検索・選択・表示基盤が必要

# workspace heading search:
  Markdown outline解析が必要

no-prefix file open:
  project file tree / file structure把握が必要
```

これらは Command Palette / Quick Access の将来拡張候補として残すが、v0.4 系の実装ready項目にはしない。

Phase 4 で扱う検索関連は、必要になった場合でも入口整理に留める。

```text
Phase 4 ではやらない:
  project-wide search
  project-wide replace
  bulk replace
  SQLite FTS5 / trigram / BM25
  Quick Access @ / # / no-prefix 実装
```

置換は本文変更を伴うため、本文非破壊原則や明示 command の扱いが固まった後に別 Issue として扱う。

### v0.4 系で積まないもの

Phase 4 では、後続フェーズの本体には入らない。

```text
全キーバインド customization
Plugin command registration
VSCode 型 overlay Command Palette
全 command の網羅
高度な検索・置換
Quick Access @ / # / no-prefix 実装
Glossary検索本格実装
Markdown outline解析
Hierarchical File Explorer
Generic New File command
Plain text document mode
encoding detection
Session restore 本格実装
Project-wide search / replace
本文 decoration visibility
line ending marker
段落字下げ command
release hardening 本体
DB migration framework
DB snapshot restore
```

ただし、後続フェーズに進む前に必要な操作入口・状態表示・判断UIは Phase 4 で可能な限り片付ける。

### v0.4 系の終了条件

```text
Command Palette / menu / shortcut / context menu から、
最低限の日常操作へ迷わず到達できる。

今どの project を触っているか分かる。

どれが project file なのか分かる。

書ける状態か、読み取り専用か分かる。

新規 Markdown document を、
安全に保存・閉じることができる。

危ない操作では適切な dialog が出る。

settings.json が壊れていても、
安全な default に fallback して起動できる。

Electron / Chromium 由来の危険 shortcut で、
作業状態を誤って壊さない。

後続機能を command / menu / context menu / settings に載せる準備ができている。
```

---

## Phase 5 / v0.5 系: 触りすぎないようにする

Phase 5 は、本文そのものを扱う。

対象:

```text
文字
空白
改行
エンコード
```

Pergamum は本文を勝手に変更しない。

```text
本文:
  作者の正本

Editor:
  解釈・表示・警告する層

Command:
  ユーザーが明示した場合のみ変更する層

Export:
  正本とは別の派生物を生成する層
```

禁止:

```text
勝手な normalize
勝手な encoding 変換
勝手な改行変更
勝手な space 置換
```

許可:

```text
表示
警告
提案
明示 command による変更
明示 export による派生物生成
```

### v0.5 系で積むもの

```text
Editor decoration visibility foundation
Text line ending detection and editor marker display foundation
Japanese paragraph indentation commands and indent marker display foundation
```

### Phase 5-1: Editor decoration visibility foundation

目的:

```text
Editor 上で、本文を変更せずに補助表示を行うための
CodeMirror decoration 基盤を整える。
```

やること:

```text
CodeMirror decoration による visibility extension の土台を作る
表示対象を追加しやすい構造にする
表示文字・CSS class・有効/無効状態の責務を分ける
本文内容は変更しない
```

やらないこと:

```text
行末種別の検出
段落字下げ command
Unicode space-like linter
settings.json 対応
自動修正
```

この Issue は、Phase 5-2 / Phase 5-3 の土台である。

### Phase 5-2: Text line ending detection and editor marker display foundation

目的:

```text
Markdown file の LF / CRLF / CR を検出し、
Editor 上で行末マーカーとして見えるようにする。
```

やること:

```text
Markdown file load 時に line ending kind を検出する
LF / CRLF / CR を区別する
Editor 上で行末マーカーを表示する
marker mapping を中央集約する
表示文字は当面ハードコードでよい
```

やらないこと:

```text
改行コード変換
保存時 line ending policy 適用
settings.json 対応
設定 UI
自動修正
.txt support
encoding detection
```

marker mapping は将来 settings.json から差し替えられる形にする。
ただし UI は自由入力ではなく preset dropdown を基本候補とする。

### Phase 5-3: Japanese paragraph indentation commands and indent marker display foundation

日本語小説向けの段落字下げ支援。

原則:

```text
自動:
  NG

Command:
  OK
```

候補 command:

```text
editor.japaneseParagraphIndent.add
editor.japaneseParagraphIndent.remove
```

対象:

```text
U+3000 IDEOGRAPHIC SPACE
または設定された段落字下げ文字
```

動作:

```text
追加:
  行頭に1文字追加
  既存なら何もしない
  空行は対象外

削除:
  行頭の段落字下げ文字を1文字削除
```

Undo 対象とする。

同時に、行頭の段落字下げ文字を Editor 上で見えるようにする。
ただし、本文は変更しない。

### Phase 5 後半候補

Phase 5 全体では、最終的に `.txt` support まで扱う可能性がある。
ただし、`.txt` support は v0.5 系や v0.90.0 の必須ではない。

候補:

```text
Text document line ending policy foundation
Configurable Japanese paragraph indent character foundation
Unicode space-like character linter foundation
Plain text document support foundation
```

`.txt` support は簡単そうに見えるが、実際には以下が絡む。

```text
encoding policy
line ending policy
本文非破壊原則
```

そのため、Phase 5 後半または v1.0 以降の候補として扱う。

### v0.5 系の終了条件

```text
Markdown 本文を勝手に変えずに、
改行・段落字下げ・行末が見える。

段落字下げは、
明示 command でだけ変更できる。
```

---

## Phase 6 / v0.6 系: 閉じても戻れるようにする

Phase 6 は、dogfood 摩擦を下げる。

目的は、アプリを閉じて再起動しても、前回の作業状態へ戻れるようにすることである。

### v0.6 系で積むもの

```text
Session restore foundation
settings foundation
recent projects foundation
preferences entry point
```

候補:

```text
last opened project restore
open documents restore
active editor restore
recent project list
起動時に前回プロジェクトを開くかどうか
最小限の settings 読み書き
```

### settings と session state の区別

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

### v0.6 系で積まないもの

```text
layout 永続化
pane width restore
editor / preview split ratio restore
utility window height restore
theme customization
project-specific manuscript convention の本格実装
```

### v0.6 系の終了条件

```text
アプリを閉じて再起動しても、
前回のプロジェクト・タブ・アクティブエディタへ戻れる。

復元できない document があっても、
アプリ起動や他の復元を妨げない。
```

---

## Phase 7 / v0.7 系: プロジェクトを歩けるようにする

Phase 7 は、File Explorer / Project Navigation の版。

目的は、小説プロジェクトのフォルダ構造を自然に扱えるようにすることである。

### v0.7 系で積むもの

```text
Hierarchical file explorer foundation
folder expand / collapse
Markdown file open
refresh
external file change detection
missing / unreadable file state
```

### フォルダ内変更検知

v0.7 系では、フォルダ内変更検知を入れる価値が高い。

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

### v0.7.x 追加候補

```text
create file
create folder
rename
delete with confirmation
move command
```

これらは明示 command / main process API 経由にする。

### D&D の扱い

D&D は v0.7.0 では入れない。

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

v0.7 では、後で D&D を載せられるように以下を守る。

```text
File Explorer node が直接 fs 操作しない
Renderer が filesystem を直接触らない
file operation は command / main process API 経由にする
project-root-relative path を基本にする
project root 外への移動は禁止する
Navigator selection と active editor highlight を混ぜない
```

### v0.7 系で積まないもの

```text
internal drag and drop move
external file drop / import
Project 全体検索
Outline View
Asset Manager
章構成管理
```

### v0.7 系の終了条件

```text
小説プロジェクトの chapters / notes / worldbuilding / drafts を
階層として見て、開ける。

外部で追加・削除されたファイルを、
File Explorer が refresh によって追える。
```

---

## Phase 8 / v0.8 系: 他人の手に渡せるようにする

Phase 8 は、release hardening の版。

目的は、自分以外の人に exe を渡しても、最低限 dogfood できる状態へ近づけることである。

### v0.8 系で積むもの

```text
DB snapshot generation
snapshot JSON generation
packaged exe dogfood flow
README / FAQ 整理
UI Polish
error / empty / loading state 整理
Debug log 周辺整理
issue report に必要な情報整理
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

### v0.8 系で積まないもの

```text
DB snapshot restore
DB migration
Crash recovery 本格実装
Export / output foundation
installer 高度化
Color theme full customization
```

### v0.8 系の終了条件

```text
自分以外の人が exe を起動して、
壊さずに最低限の dogfood ができる準備が整う。
```

---

## v0.90.0: 初回 dogfood 配布版

v0.90.0 は新機能追加版ではなく、締め版とする。

```text
v0.90.0:
  毎日開けるようにする
```

### v0.90.0 でやること

```text
v0.4〜v0.8 の未完了項目の剪定
release notes
README / FAQ final pass
packaged exe 配布
dogfood checklist
known limitations
upgrade / data warning
```

### v0.90.0 で積まないもの

```text
新規大型機能
Git
Terminal
Plugin API
Export
Cloud
layout 永続化
DB migration
DB snapshot restore
.txt support 必須化
```

### v0.90.0 の終了条件

```text
作者本人が日常 dogfood できる。
他人に exe を渡しても、何をするアプリか説明できる。
壊れる可能性がある領域と、未実装領域が明示されている。
```

v0.90.0 は「全部できる」ではない。
ここから使いながら育てられる状態を目指す。

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
Plain text document support
```

v1.0 では、ユーザーのデータを壊さないことを重視する。

```text
v0.90.0:
  dogfood 可能な配布版

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

以下は v0.90.0 までの必須スコープに入れない。

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
.txt support 必須化
```

ただし、一部は積み残しとして意識する。

```text
layout 永続化:
  v0.90.0 ではやらないが、UX 上の積み残しとして認識する。

D&D:
  v0.7 ではやらない。
  明示 move command ができてから UI として検討する。

Export:
  本文正本ではなく派生物生成として将来扱う。

.txt support:
  Phase 5 の後半候補ではあるが、
  v0.90.0 の必須条件にはしない。
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

---

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

---

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

---

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

---

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

---

### Color theme foundation

長時間執筆・編集するために、カラーテーマを切り替えられるようにする。

v0.90.0 では必須にしない。
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
1. roadmap.md の剪定
2. Phase 4-0: Include renderer .test.tsx files in Vitest config
3. Phase 4-1: Command ID naming and command inventory
4. Phase 4-2: Application menu / basic shortcuts / context menu foundation
5. Phase 4-3: Command tab / Command launcher foundation
6. Phase 5-1: Editor decoration visibility foundation
7. Phase 5-2: Text line ending detection and editor marker display foundation
8. Phase 5-3: Japanese paragraph indentation commands and indent marker display foundation
9. Phase 6-1: Session restore foundation
10. Phase 6-2: settings foundation
11. Phase 7-1: Hierarchical file explorer foundation
```

理由:

```text
roadmap.md:
  古い設計詳細を削り、地図としての役割に戻す。

Phase 4:
  後続機能の入口を command / menu / shortcut / context menu にそろえる。

Phase 5:
  本文非破壊原則を text handling に適用する。

Phase 6:
  毎日開けるための session restore / settings を整える。

Phase 7:
  小説プロジェクトを自然に歩けるようにする。
```

---

## 直近の段取りメモ

このセクションは、次に Issue を切るための一時メモである。

実装スコープの正本ではない。
Issue 化した時点で、詳細は Issue 側へ移す。
実装が完了したら、このセクションから削るか、必要な結論だけを完了済み・ADR・AGENTS.md へ移す。

このセクションは、最大で次の 1〜3 Issue 分までを目安とする。
完了済みの詳細設計を roadmap.md に長く残さない。

### Phase 4: command ID naming

Phase 4 では、Application menu / shortcut / context menu / Command tab から同じ command を呼ぶ。

そのため、新規 command ID は原則として以下に寄せる。

```text
{domain}.{target}.{verb}
```

例:

```text
app.preferences.open
editor.document.save
editor.tab.close
glossary.entry.open
glossary.occurrences.next
glossary.occurrences.previous
utility.command.open
```

domain 候補:

```text
app
editor
glossary
utility
view
project
file
```

verb 候補:

```text
open
close
save
create
delete
toggle
next
previous
refresh
rename
move
```

規則:

```text
verb は末尾に置く
verb に目的語を含めない
複合的な対象は target 側で表現する
UI の置き場所を command ID に含めない
shortcut / menu / context menu / command tab は同じ command を呼ぶ
```

Phase 4 では、既存 command ID を即座に破壊的変更するかどうかは個別 Issue で判断する。
ただし、新規 command ID は原則として `{domain}.{target}.{verb}` に寄せる。

### Phase 4-0: renderer .test.tsx

Phase 4 で UI component が増える前に、renderer `.test.tsx` を Vitest 実行対象へ含める。

目的:

```text
.test.tsx ファイルを Vitest 実行対象に含める
既存の非実行テストを実行対象にする
必要に応じて file naming / config を整理する
```

非スコープ:

```text
UI テスト基盤の全面刷新
testing-library 導入
E2E テスト導入
```

### Phase 4-1: command inventory

Phase 4 の最初に、既存 command ID を棚卸しする。

目的:

```text
既存 command ID を一覧化する
命名規則から外れているものを確認する
破壊的変更するか、旧 ID を残すかを判断する
menu / shortcut / context menu / command tab へ載せる対象を整理する
```

この段階では、すべての command ID を無理に改名しない。
後続 Issue の実装を妨げる揺れだけを優先して整理する。

---

## ロードマップ運用

この文書は、完璧に保つ必要はない。
大きな方針・近い候補・保留事項を忘れないために更新する。

運用案:

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

直近の段取りメモ:
  最大で次の 1〜3 Issue 分までを目安にする
  実装が完了したら削るか、必要な結論だけを ADR / AGENTS.md へ移す

古い設計詳細:
  roadmap.md に残しすぎない
```

この文書は、Pergamum の「開発の地図」であり、法律ではない。
実装時の正本は GitHub Issue とする。

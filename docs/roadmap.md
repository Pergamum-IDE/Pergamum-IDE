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

Phase 4 は `v0.50.0` で完了済み。

```text
Phase 4:
  迷わず触れるようにする
```

その後 Phase 5 の主要項目を実装し、現在は `v0.60.0`。

```text
Phase 5:
  触りすぎないようにする
```

Phase 5 には upstream 挙動確認待ちで deferred とした項目が存在するが、Phase 6 をブロックしない。

現在は Phase 6 に進む。

```text
Phase 6:
  閉じても戻れるようにする
```

`v0.60.0` は Phase 6 開始の milestone version とする。

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

Phase 6 をブロックせず、upstream 側の確認または実装方針が固まった時点で再開する。

### Debug logging

Debug logging foundation は確定済み。

roadmap.md にはイベント形式やログファイル詳細を残しすぎない。

Debug Log viewer、検索、export、issue report integration などは後続機能として扱う。

---

## マイナーバージョン別ロードマップ

| Version   | Phase      | 合言葉             | 主に積んだ / 積むもの                                                                                                                 | この版では積まないもの                                              |
| --------- | ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `v0.50.0` | Phase 4 完了 | 迷わず触れるようにする     | `.pergamum` project file、Settings foundation、read-only handling、write lock、startup argv open、Windows installer / association | Phase 5 本文処理、session restore、project explorer            |
| `v0.51.x` | Phase 5 完了 | 触りすぎないようにする     | line ending preservation / diagnostics、Character Count、paragraph indentation commands、zero-tab foundation                    | `.txt` support、encoding detection、line ending conversion |
| `v0.60.x` | Phase 6    | 閉じても戻れるようにする    | Notification foundation、Session persistence / restore、dirty document recovery、Project / Glossary recovery                    | Workbench layout 永続化、階層 File Explorer                    |
| `v0.70.x` | Phase 7    | プロジェクトを歩けるようにする | 階層 File Explorer、expand / collapse、open、refresh、外部変更検知                                                                       | D&D、external drop / import、Project 全文検索                  |
| `v0.80.x` | Phase 8    | 他人の手に渡せるようにする   | UI polish、packaged dogfood、README / FAQ、release quality 整理                                                                   | DB migration、Export                                      |
| `v0.90.x` | Release    | 毎日開けるようにする      | 締め、release notes、known limitations、配布準備                                                                                      | 新規大型機能                                                   |

### v0.90.x 表記について

`v0.90.x` は、v1.0 前に v0.9x 系を複数回 dogfood 配布できる余地を残すための表記である。

例:

```text
v0.90.x
v0.91.x
v0.92.x
```

`v0.90.x` は「初回 dogfood 配布系列」であり、「v1.0 直前の完成版」を意味しない。

---

## Phase 6 / v0.60.x: 閉じても戻れるようにする

Phase 6 は、アプリを閉じたり予期せず終了したりしても、執筆作業へ自然に戻れるようにするフェーズである。

中心となる考え方は、

```text
昨日の状態に戻れる
書きかけを失わない
必要な情報は邪魔せず伝わる
```

ことである。

---

### Phase 6-0: Roadmap synchronization

Phase 5 の完了内容と積み残しを整理し、Phase 6 の責務・実装順・後続 Phase との境界を roadmap.md に反映する。

---

### Phase 6-1: Notification foundation

通常操作を妨げずに情報を伝えるため、非モーダル通知基盤を追加する。

表示コンポーネントは `NotificationToast` とする。

基本方針:

```text
画面右下に表示
通常操作をブロックしない
フォーカスを奪わない
複数通知を積み上げられる
一定時間後に自動消滅する
```

NotificationToast は **正常系・情報通知専用**とする。

例:

```text
プロジェクト外のファイルを開きました

正常に完了した処理についての補助情報

ユーザー操作を止める必要のない案内
```

warning / error は NotificationToast に流さない。

```text
NotificationToast:
  information
  normal operation

Warning / Error:
  Dialog 等
  ユーザーが確実に認識できる UI
```

NotificationToast の表示時間は Application Settings で変更可能にする。

初期値:

```text
10 seconds
```

具体的な setting key や UI は実装 Issue で定義する。

---

### Phase 6-2: Session persistence foundation

Session state を保存・読み込み・検証するための基盤を作る。

最初から Session Restore 全体を実装せず、まず persistence boundary を確立する。

```text
session state
├─ schema / version
├─ app userData-side storage
├─ read
├─ write
├─ validation
├─ missing / corrupted fallback
└─ lifecycle boundary
```

#### Settings / Session / Recovery の分離

これらを一つの generic settings store に混在させない。

```text
settings:
  ユーザーが意味を理解して変更する設定

session state:
  アプリが前回の UI / 作業状態を復元するための状態

recovery:
  未保存のユーザーコンテンツを失わないためのデータ
```

未保存本文を Settings や Session state に直接埋め込まない。

Recovery はユーザーコンテンツとして別の保存責務を持つ。

#### zero-tab state

zero-tab は合法な persisted state とする。

```text
documents = []
activeDocumentId = null
```

復元時も、タブが存在しなかったならその状態をそのまま復元する。

復元のためだけに Untitled document を作らない。

---

### Phase 6-3: Session restore

起動時に直近の作業状態を復元する。

正常系:

```text
Pergamum startup
    ↓
last project state
    ↓
project open
    ↓
session state load
    ↓
open tabs restore
    ↓
recovery data merge
    ↓
active tab restore
```

主な復元対象:

```text
last opened project
open document tabs
active document
zero-tab state
Settings tab 等、復元価値のある editor state
```

#### 直近プロジェクトが復元できない場合

直近 project file が存在しない、または読み込めない場合は、安全な Welcome state にフォールバックする。

ただし、異常を黙って無視しない。

```text
project file missing:
  Welcome state
  + ユーザーが確実に認識できる warning / error UI

project file unreadable / invalid:
  Welcome state
  + ユーザーが確実に認識できる warning / error UI
```

この用途には NotificationToast を使用しない。

初回起動など、前回 project 自体が存在しない正常状態では Welcome を表示し、警告しない。

#### 個別 document の復元

Session Restore は可能な範囲で継続する。

一つの document を復元できなかったことによって、他の document やアプリ全体の起動を不要に妨げない。

ただし、復元に失敗した重要な状態を黙って破棄しない。

具体的な failure classification と通知 UI は実装 Issue で定義する。

---

### Phase 6-4: Document recovery

dirty document の状態と未保存変更を、アプリ終了をまたいで保持する。

対象:

```text
normal shutdown
abnormal shutdown
```

期待する挙動:

```text
dirty document
    ↓
Pergamum 終了
    ↓
次回起動
    ↓
未保存変更を保持した dirty document として復元
```

Recovery は crash 時だけの emergency dump とはしない。

ユーザーが未保存のまま正常終了した場合も、その作業状態を次回へ引き継げる設計とする。

保存済み Markdown は引き続き本文の source of truth とする。

Recovery は、保存されていないユーザー入力を失わないための補助データとして扱う。

以下は個別 Issue で定義する。

```text
recovery format
write timing
generation / retention policy
cleanup policy
saved source との照合
conflict policy
```

---

### Phase 6-5: Project / Glossary recovery

Project file および Glossary data について、破損・消失などから復元するための基盤を整える。

基本原則:

```text
Project / Glossary source data:
  通常利用時の正本

snapshot / recovery data:
  復元用途の派生物
  通常利用時の正本ではない
```

Glossary DB は source of truth のままとする。

Recovery のために通常利用時の正本を曖昧に二重化しない。

扱う候補:

```text
snapshot generation
snapshot validation
generation retention
restore path
recovery UX
```

snapshot format、保存場所、世代管理、検証方法、restore policy の詳細は個別 Issue で定義する。

---

### Phase 6 で扱わないこと

以下は Phase 6 の必須スコープには含めない。

```text
Workbench layout 全体の永続化

sidebar width restore
editor / preview split ratio restore
utility window height restore

Hierarchical File Explorer
Project 全文検索

DB migration

Export / output foundation
```

---

### Phase 6 の終了条件

```text
アプリを終了して再起動しても、
前回のプロジェクト・タブ・アクティブ文書へ戻れる。

zero-tab だった場合は、
zero-tab のまま復元できる。

dirty document の未保存変更が、
正常終了・異常終了をまたいで失われない。

前回のプロジェクトを復元できない場合は、
安全に Welcome state へ移行し、
異常理由をユーザーが認識できる。

Project / Glossary data について、
復元のための基盤が存在する。

通常の情報通知は、
執筆操作を妨げない NotificationToast で伝えられる。
```

---

## Phase 7 / v0.70.x: プロジェクトを歩けるようにする

Phase 7 は File Explorer / Project Navigation の版。

目的は、小説プロジェクトのフォルダ構造を自然に扱えるようにすることである。

### Phase 7 で扱うこと

```text
Hierarchical File Explorer foundation
folder expand / collapse
Markdown file open
refresh
external file change detection
missing / unreadable file state
```

### フォルダ内変更検知

watcher は filesystem の真実そのものとは扱わない。

```text
watcher:
  refresh trigger

re-scan:
  current filesystem state の確認
```

想定:

```text
Main Process:
  project root を watch
  change / rename 等を受ける
  debounce
  directory tree を再スキャン

Renderer:
  更新通知を受ける
  File Explorer 表示を更新
```

やらないこと:

```text
watch event だけで完全な差分更新を成立させる
rename / move を推測する
dirty editor を勝手に上書きする
```

### File operations 候補

Phase 7 の基盤後、必要に応じて以下を追加する。

```text
create file
create folder
rename
delete with confirmation
move command
```

file operation は明示 command / Main Process API 経由とする。

### D&D の扱い

D&D は Phase 7 の基礎機能には含めない。

D&D は filesystem operation そのものではなく、move command の UI の一つとして考える。

必要な順序:

```text
1. 階層 File Explorer で見える
2. 明示 command で create / rename / delete ができる
3. 明示 command で move ができる
4. その UI として D&D を検討する
```

後から D&D を追加できるよう、以下を守る。

```text
File Explorer node が直接 fs 操作しない
Renderer が filesystem を直接触らない
file operation は command / Main Process API 経由
project-root-relative path を基本とする
project root 外への移動は禁止する
Navigator selection と active editor highlight を混同しない
```

### Phase 7 で扱わないこと

```text
internal drag and drop move
external file drop / import
Project 全文検索
Outline View
Asset Manager
章構成管理
```

Project 全文検索は重要だが、File Explorer / Project Navigation の基盤が成立した後に判断する。

### Phase 7 の終了条件

```text
小説プロジェクト内の
chapters / notes / worldbuilding / drafts 等を
階層として見て、開ける。

外部で追加・削除されたファイルを、
File Explorer が refresh によって追える。
```

---

## Phase 8 / v0.80.x: 他人の手に渡せるようにする

Phase 8 は release hardening の版。

目的は、自分以外の人へ packaged application を渡しても、最低限 dogfood できる状態へ近づけることである。

Project / Glossary recovery の基盤は Phase 6 へ移動する。

Phase 8 では新しい recovery architecture を作らず、Phase 6 で作った recovery path を packaged application 上で検証・polish する。

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
Export / output foundation
installer 高度化
```

### Phase 8 の終了条件

```text
自分以外の人が packaged application を起動して、
壊さずに最低限の dogfood ができる準備が整う。
```

---

## v0.90.x: 初回 dogfood 配布系列

`v0.90.x` は新規大型機能追加系列ではなく、締めの系列とする。

```text
v0.90.x:
  毎日開けるようにする
```

### v0.90.x でやること

```text
v0.51.x〜v0.80.x の未完了項目の剪定

release notes
README / FAQ final pass

packaged application 配布
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

自分以外の人へアプリを渡しても、
何をするアプリか説明できる。

壊れる可能性がある領域と、
未実装領域が明示されている。
```

`v0.90.x` は「全部できる」を目標にしない。

使いながら育てられる状態を目指す。

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

Phase 6 をブロックしない。

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

```text
項目:
  forms management polish
  warning policy 説明文の整理
  duplicate surface feedback
  form 並び順の整理
  view-state persistence

判断時期:
  Phase 6 recovery foundation 後
  または v1.0 候補
```

Glossary DB は source of truth のまま維持する。

---

### Settings

Settings Catalog / Settings Page / user-scope persistence foundation は実装済み。

残り:

```text
user / project / default resolution の拡張
wired settings expansion
workbench.colorTheme wiring
preview.renderer wiring
Settings dirty / apply flow
project-specific settings の本格実装
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

```text
項目:
  Project 全文検索
  project-wide replace
  Quick Access @ / ## / no-prefix
  Markdown outline search
  SQLite FTS5 / trigram / BM25

判断時期:
  Phase 7 の File Explorer / Project Navigation 基盤後

  v1.0 または v1.x 候補
```

replace は本文変更を伴うため、検索と同一機能として安易に導入しない。

明示 command と undo の扱いを含め、別 Issue とする。

---

### Performance / Preview rendering

候補:

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

Export / output foundation

FAQ / Help

built-in light / dark theme foundation

Project-wide search
```

Phase 6 で Session Restore / Document Recovery / Project / Glossary Recovery の foundation を実装する。

したがって v1.0 では、それらを初めて作るのではなく、

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

advanced theme customization

Plain text document support
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

以下は `v0.90.x` までの必須スコープに入れない。

```text
Git integration
Integrated Terminal

Plugin API

複雑な Linter
高度な fuzzy matching

縦書き出力

本文 Export
DOCX / PDF / EPUB 出力

共同編集
クラウド同期

Workbench layout 永続化

DB migration

Color theme full customization
任意 CSS テーマ

external file drop / import

.txt support
```

「当面やらない」は永久にやらないという意味ではない。

Phase 6 へ移動した recovery / snapshot restore 系は、ここには置かない。

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

`.txt` support は初期 roadmap の必須スコープには含めない。

一見単純だが、実際には以下が絡む。

```text
encoding policy
line ending policy
本文非破壊原則
```

そのため `v1.x` 以降の候補とする。

---

### Export / output

Markdown 本文から提出用・閲覧用の派生物を生成する機能。

候補:

```text
ルビ対応
縦書き対応
章単位出力

PDF
DOCX
EPUB

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

長時間執筆・編集するため、将来的にはカラーテーマを切り替えられるようにする。

`v0.90.x` の必須スコープには含めない。

初期候補:

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

現時点では以下の順で進める。

```text
1. Phase 6-0: Roadmap synchronization

2. Phase 6-1: Notification foundation

3. Phase 6-2: Session persistence foundation

4. Phase 6-3: Session restore

5. Phase 6-4: Document recovery

6. Phase 6-5: Project / Glossary recovery

7. Phase 7-1: Hierarchical File Explorer foundation
```

並行保留:

```text
Invisible-character rendering:
  CodeMirror upstream confirmation pending

#260 Document information pane:
  File Explorer navigation model pending
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

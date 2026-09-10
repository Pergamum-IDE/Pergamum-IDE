# Pergamum

[日本語](./README.md) | [English](./README.en.md)

Pergamum（ペルガモン）は、**小説を書く人のためのオープンソース統合執筆環境**です。

MIT ライセンスで公開しているフリーソフトウェアです。

Pergamum は、単なる Markdown エディタではありません。

小説を書いていると、本文とは別に大量の情報が発生します。

人物名。地名。組織名。固有名詞。別称。表記揺れ。時系列。人物同士の関係。ある出来事がいつ起きたのか。ある人物がその時点で何を知っていたのか。

作品が長くなるほど、それらを作者の記憶だけで維持することは難しくなります。

Pergamum は、**本文を書く場所と、作品世界について作者が知っていることを管理する場所を分け、その両方をひとつの執筆環境として扱う**ことを目指しています。

本文は、人間が読める Markdown ファイルとして保存します。

作品世界の構造化情報は、SQLite database として管理します。

そして、作者が書いた本文を勝手に書き換えないこと、保存や復旧の安全性を軽く扱わないことを大事にしています。

> Pergamum は、あなたが捨てると決めるまで、未保存の原稿を勝手に捨てません。

なお、Pergamum は現在も開発中です。  
ここで述べている構想のすべてが実装済みというわけではありません。

ちなみに Pergamum とは、現在のトルコ西部にあった古代ギリシャ都市の名前です。アレクサンドリア図書館に匹敵する大図書館を擁し、羊皮紙（parchment）の語源にもなりました。

---

## 現在の状態

現在の Pergamum は **v0.80.0** です。

Phase 7「プロジェクトを歩けるようにする」までを完了し、小説を書くための中核機能がひととおり揃った段階です。

v0.80.0 時点で、次のような領域が実装済みです。

- Markdown 本文の編集
- `.pergamum` project file によるプロジェクト管理
- 階層 File Explorer とファイル操作
- Active Document Find / Replace（開いている文書内の検索・置換）
- Project 全体の Search / Replace
- Glossary（用語・人物・地名などの管理）と Glossary Completion
- Document Map / Document Metrics
- Session restore と Document Recovery
- Atomic Markdown save / Project write lock
- 画像の貼り付け・プレビュー・リンク追従
- Application / Project settings
- About dialog / third-party notices

一方で、まだ一般利用向けの安定版ではありません。

特に Glossary / project database の schema は今後も変更される可能性があります。重要な原稿や構造化データを扱う場合は、作業ディレクトリ全体を Git や通常のバックアップで管理してください。

v0.90.0 までに予定している作業は、後述の「[ロードマップ](#ロードマップ)」を参照してください。実装済みの機能ではありません。

---

## なぜ作るのか

小説そのものは、ただの文章です。

だから本文は Markdown でいい。

一方で、

> この人物にはどんな別名があるのか  
> この表記は単なる揺れなのか、それとも意図した別称なのか  
> この出来事は何年何月に起きたのか  
> この人物はこの場面の時点で、その事実を知っていたのか

といった情報は、文章だけでは扱いにくいものです。

そこを無理に Markdown へ埋め込むのではなく、構造化されたデータとして別に持たせます。

Pergamum では、現在その役割を次のように分けています。

```text
Markdown
  原稿本文の正本

.pergamum
  Project file
  Project identity / metadata を持つ入口
  人物・用語・地名・組織・概念など
  構造化された作品情報の正本

pergamum.json
  プロジェクト設定

Assets
  画像などのバイナリデータ

Recovery Store
  未保存本文の作業コピーを保持する application data
```

本文をデータベースの都合に合わせることもしないし、構造化情報を Markdown の中へ押し込むこともしません。

それぞれを、一番扱いやすい場所に置きます。

---

## Pergamum が大事にしていること

Pergamum が最終的にやりたいのは、作者の代わりに小説を書くことではありません。

**作者が既に決めたことを忘れないための道具**を作ることです。

Pergamum は、本文を勝手に書き換えません。

特に日本語テキスト処理では、正規化・表記統一・補完・推測を安易に行いません。

```text
やらないこと:
  Unicode 正規化による本文変更
  表記揺れの自動修正
  中黒の自動挿入・削除
  三点リーダーやダッシュの自動整形
  Glossary alias の自動追加
  曖昧一致の自動解決
```

作者が明示的に選んだ場合だけ、補助機能として作用します。

Pergamum の UI は、本文を書く場を守ります。

```text
本文を書く場:
  Editor
  Preview

本文の周辺作業:
  Navigator
  Search
  Occurrences
  Diagnostics
  Output
  Debug Log
  Settings
  Utility Window / 支援ウィンドウ
```

探す・辿る・診断する・出力する・ログを確認する作業は、本文領域ではなく、周辺 UI に逃がします。

---

## 現在できること

Pergamum は現在も開発中ですが、Markdown 原稿を安全に扱うための基盤と、Glossary を結びつけるための基盤が動き始めています。

現在は、主に以下のことができます。

| 分類 | できること |
| -- | -- |
| Project | `.pergamum` project file を作成・開く |
| Project | Project root / project metadata を管理する |
| Project | Project の表示名を変更する（logical rename） |
| Project | Project write lock により同時書き込みを防ぐ |
| Project | 他プロセスが開いている project を read-only で開く |
| Project | stale な write lock / recovery lock を安全に回収する |
| Project | Project を閉じる |
| File Explorer | プロジェクト内のフォルダ・ファイルを階層表示する |
| File Explorer | フォルダの展開・折りたたみ、ファイルを開く、再表示（refresh） |
| File Explorer | 外部で追加・削除・変更されたファイルを検知する |
| File Explorer | ファイル・フォルダの作成・リネーム・削除（確認付き） |
| File Explorer | ファイル・フォルダの移動（コンテキストメニュー / 切り取り・貼り付け / ドラッグ&ドロップ、確認付き） |
| File Explorer | 複数選択、アクティブ文書の reveal |
| Import | 文字コードを指定して `.txt` を Markdown として一括取り込みする |
| Editor | Markdown 本文を編集する |
| Editor | 複数の文書をタブで開く / タブを閉じる / 外部 Markdown を開く |
| Editor | タブごとに editor state を保持する |
| Editor | 改行コードを保ったまま保存する / 改行コードの分布を診断する |
| Editor | Atomic Markdown save pipeline で保存する |
| Editor | 文字数を Status Bar に表示する（Unicode code point 基準） |
| Editor | 段落字下げの一括挿入・削除を行う |
| Editor | Markdown の undo 履歴の深さを設定する |
| Search / Replace | 開いている文書内を検索・置換する（Active Document Find / Replace） |
| Search / Replace | 大文字小文字・単語単位・正規表現などのオプション、全置換 |
| Search / Replace | Glossary を使った検索モード / 近傍検索 |
| Search / Replace | Project 全体をテキスト検索する（Search pane） |
| Search / Replace | Project 全体で置換する |
| Preview | Markdown Preview を表示する |
| Preview | Glossary match を Preview 上に装飾する |
| Preview | project-local な画像リンクをプレビュー表示する |
| Assets | クリップボードの画像を貼り付け、assets に保存して Markdown リンクを挿入する |
| Assets | 壊れた画像リンクを診断（lint 警告）する |
| Assets | Markdown / 画像ファイルの移動時に画像リンク・参照を追従更新する |
| Glossary | Glossary entry を作成・編集・削除する |
| Glossary | Glossary form を管理する（canonical / alias / variant、境界ポリシー） |
| Glossary | Glossary match の Hover Card を表示する |
| Glossary | Glossary entry から本文中の使用箇所へ移動する |
| Glossary | Glossary navigator で entry を探す / occurrences tab で使用箇所を確認する |
| Glossary | primary tag を視覚的に強調する |
| Glossary | Ctrl+Space で Glossary Completion を呼び出す |
| Document Map | 文書全体を俯瞰表示し、クリック / viewport lens で移動する |
| Document Map | 表示するタグや描画方法を設定する、大きな文書をページングして描画する |
| Document Metrics | 文字数・行数・段落数・会話文比率などの指標を表示する |
| Command | Command Palette から操作を検索・実行する |
| Command | Application menu / shortcut / context menu から操作する |
| Settings | Settings Page で application / project 設定を確認・変更する |
| Settings | project 設定で application 設定を上書きする、設定を検索・分類表示する |
| Settings | 再起動が必要な設定は確認のうえ安全に再起動する |
| Session | 前回の project / tabs / active document / window state を復元する |
| Session | Session の読み込みが異常に遅い場合は安全に time out する |
| Recovery | 未保存本文の Recovery payload を保持する |
| Recovery | 前回起動時の未保存本文を復元候補として表示する |
| Recovery | Recovery candidate を `.recovered.md` として復元する / 明示的に破棄する |
| Recovery | 同じ Recovery candidate set の repeated auto-show を抑制する |
| Notification | 正常系の情報通知を NotificationToast で表示する |
| Workbench | Navigator / Editor / Preview のペインを扱う、Sidebar を折りたたむ、タブを並べ替える |
| Utility Window | 支援ウィンドウを開く |
| Debug | Debug mode JSONL log を出力する / Debug Log tab で確認する |
| About | About dialog を表示し、third-party notices への導線を出す |
| Persistence | SQLite に構造化プロジェクトデータを保存する |
| Distribution | Windows installer / `.pergamum` file association の基盤を持つ |

---

## Project file と Project root

Pergamum では、`.pergamum` ファイルを project file として扱います。

`.pergamum` ファイルがあるフォルダを Project root とし、その下に Markdown 本文、project database、project config などを配置します。

```text
MyNovel/
  MyNovel.pergamum
  pergamum.json
  chapter-01.md
  chapter-02.md
  assets/
```

Project file は、単なるフォルダを開くよりも明示的な入口です。

Project identity を持ち、Session restore や Recent Projects、file association と結びつきます。

---

## Session と Recovery

Pergamum では、Session と Recovery を分けて扱います。

```text
Session:
  前回開いていた project / tabs / window state など、
  作業環境を復元するための情報

Recovery:
  未保存の Markdown 本文そのものを守るための作業コピー
```

Session は「前回の作業環境に戻る」ための仕組みです。

Recovery は「未保存の本文を失わない」ための仕組みです。

この二つは似ていますが、役割が違います。

### Session

Session restore は、前回開いていた project、tabs、window state などを復元します。

ただし、Session の読み込みに異常に時間がかかる場合は、起動を無期限に止めません。安全に time out し、その回は Session restore なしで起動します。

Session data を読み込めなかっただけで、既存の Session data を削除したり修復したりはしません。

### Recovery

Recovery は、未保存の Markdown 本文を application data 側の Recovery Store に保存します。

保存済みファイルそのものを勝手に上書きしたり、現在開いている dirty editor に直接流し込んだりはしません。

Recovery candidate を復元する場合は、元ファイルを上書きせず、新しい sidecar file として開きます。

```text
chapter-03.md
chapter-03.recovered.md
chapter-03.recovered-2.md
```

Recovery row は、以下の場合にのみ削除されます。

```text
削除される場合:
  元文書の Save 成功
  Restore 成功後、renderer が .recovered.md を開いたことを finalize した場合
  ユーザーが確認 dialog を経て明示的に破棄した場合

削除されない場合:
  Recovery dialog を閉じる
  「後で決める」を押す
  起動時 auto-show を見た
  reminder toast を見た / 閉じた
  app quit / restart
```

Pergamum は、Recovery candidate を勝手に捨てません。

---

## 保存モデル

Pergamum は、データの性質ごとに保存形式を分けています。

| 保存先 | 形式 | 役割 |
| -- | -- | -- |
| Markdown ファイル | UTF-8 Markdown | 原稿本文の正本。人間が読める通常のテキストファイル |
| `.pergamum` project file | SQLite database | 人物・用語・地名・組織・概念など、構造化された作品情報の正本 |
| `pergamum.json` | JSON | プロジェクト設定（project scope の settings） |
| Application data | JSON など | Session state（前回の作業環境） |
| Recovery Store | application data 側の作業コピー | 未保存本文を失わないための recovery data。本文の正本ではない |

本文をデータベースの都合に合わせることはせず、構造化情報を Markdown に押し込むこともしません。それぞれを一番扱いやすい場所に置きます。

### 信頼性 / 安全性

Pergamum は、保存と復旧の安全性を軽く扱いません。

| 仕組み | 内容 |
| -- | -- |
| Atomic Markdown save | 本文の保存は、書き込み途中の状態を残さない atomic な pipeline で行う |
| Project write lock | 同じ project を複数プロセスが同時に書き換えないようにする。他プロセスが開いている場合は read-only で開く |
| Stale lock recovery | 異常終了などで残った write lock / recovery lock を安全に回収する |
| Session restore | 前回の project / tabs / active document / window state を復元する。読み込みに失敗しても既存の session data を壊さない |
| Document Recovery | 未保存本文を application data 側に保持し、次回起動時に復元候補として提示する。元ファイルを上書きせず `.recovered.md` として開く |

Pergamum は、作者が明示的に破棄するまで、未保存の原稿を勝手に捨てません。

---

## Glossary とは

Pergamum では、作品内の人物・地名・組織・用語・概念などを Glossary として管理します。

たとえば、織田信長に関係する語として、

```text
織田信長
吉法師
信長
お館さま
茶筅髷
```

という文字列が本文中に現れたとします。

このうち、

```text
織田信長:
  人物そのものの表記

吉法師:
  幼名

信長:
  略称

お館さま:
  立場に応じた呼称

茶筅髷:
  髪型
```

として、文脈によって扱いが異なります。

`吉法師` や `お館さま` は同じ人物を指すことがあります。  
一方、`茶筅髷` は人物ではなく髪型を表す語であり、同じ実体ではありません。

Pergamum では、単に似た文脈に現れるからといって、文字列を勝手に同じ実体へまとめません。

さらに、同じ人物を指す文字列であっても、その意味は同じではありません。

Pergamum では、こうした情報を単なる文字列の一覧ではなく、独立した軸として扱います。

```text
Entry:
  人物 / 地名 / 組織 / 用語 / 概念などの実体

Form:
  正規表記 / 別称 / 異表記などの表層形

Warning policy:
  警告するか、無視するかなどの方針

Boundary policy:
  本文中のどの範囲を一致として扱うか
```

また、同じ表層形が複数の実体を指すことも許します。

「武将」という語が複数の人物を指し得るなら、Pergamum は勝手に一人を選びません。

**曖昧なら、曖昧であると報告する。**

これは Pergamum の重要な設計原則です。

---

## Glossary model

Glossary については、以下のような経路で Renderer から Project Database へアクセスします。

```text
Renderer
  ↓
Preload API
  ↓
IPC
  ↓
Glossary Store
  ↓
Project Database
  ↓
SQLite
```

現在の Glossary model では、Entry と Form を分離しています。

```text
Entry:
  作品世界上の実体

Form:
  本文中に現れる文字列
```

Form には、canonical / alias / variant のような役割を持たせることができます。

また、Glossary matching では boundary policy を扱います。

たとえば、`メイド` という surface がある場合、

```text
メイドさん
オーダーメイド
```

の両方に単純一致してしまうと誤検出が起きます。

そのため Pergamum では、Glossary form ごとに一致範囲の境界を調整できます。

```text
一致開始側の境界:
  自動 / 厳密 / なし

一致終了側の境界:
  自動 / 厳密 / なし
```

内部値は以下です。

```text
auto
strict
none
```

この設定により、作者が必要な場合だけ、form 単位で matching の挙動を調整できます。

---

## 現在の制限

Pergamum は現在も開発中です。

日常的に dogfood しながら開発していますが、まだ一般利用向けの安定版ではありません。

現時点では、主に以下の制限があります。

| 分類 | 現在の制限 |
| -- | -- |
| File format | 直接開いて編集できる原稿ファイルは `*.md` のみです |
| File format | 生 `.txt` を直接開いて編集することは未対応です（文字コードを指定した Markdown への一括取り込みには対応。直接編集は v0.90.0 で対応予定） |
| Encoding | 編集対象の本文は UTF-8 のみ対応しています（取り込み時の文字コード変換は Import 機能で対応） |
| Project database | Glossary / project database の schema は開発中で、今後の変更で破壊的変更が入る可能性があります |
| Compatibility | 現時点では、永続的な DB 互換性を保証しません |
| Recovery | Recovery は未保存本文の救済用であり、履歴管理や Git の代替ではありません |
| Search | Project 全体のテキスト検索・置換は利用できます。FTS / outline 検索など高度な検索は今後の開発対象です |
| Output | プロジェクト全体の TXT エクスポートは v0.90.0 で対応予定です。PDF / DOCX / EPUB / 縦書きなど本格的な出力は未実装です |
| Theme | ダークテーマは v0.90.0 で対応予定です（現在はライトテーマのみ） |
| Distribution | 配布基盤は整備中ですが、安定版リリースではありません |

特に `.pergamum` は、現在の Pergamum における構造化データの正本です。

その一方で、Glossary model や project data model はまだ安定版ではありません。

そのため、開発初期の段階では、古い `.pergamum` が将来のバージョンでそのまま使えなくなる可能性があります。

重要な原稿や Glossary を扱う場合は、作業ディレクトリ全体を Git や通常のバックアップで管理してください。

本文 Markdown は、人間が読める通常の UTF-8 Markdown ファイルとして保存します。

一方、Glossary や project metadata については、v0.90.0 までは互換性よりもデータモデルの正しさを優先して変更する場合があります。

---

## データを失わないために

小説は、作者が何十時間、何百時間とかけて作るデータです。

そのため Pergamum では、構造化情報についても「壊れたら作り直せばいい」とは考えていません。

`.pergamum`  project file 内の SQLite database を構造化データの正本としつつ、将来的には Git で差分を確認でき、人間にも読める決定論的な snapshot を生成する予定です。

snapshot は第二の正本にはしません。

正本を二つ作ると、どちらが正しいのかという問題が必ず発生するからです。

その代わり、以下のような一方向の関係にします。

```text
.pergamum
  ↓
deterministic snapshot
  ↓
Git / backup / external tools
```

snapshot から復元するときは、現在の DB を退避し、snapshot 全体を検証したうえで、トランザクションを用いてデータベースを再構築する方針です。

まだ実装されていませんが、これは既にアーキテクチャ上の原則として決定しています。

---

## AI について

Pergamum の開発では、設計レビューや実装支援に生成 AI を活用しています。

一方、現時点の Pergamum 本体には、作者の原稿を生成 AI へ送信したり、AI に小説本文を書かせたりする機能はありません。

AI は開発プロセスを支援するために利用しており、作者の創作そのものを置き換えることは目的としていません。

---

## インストール

Pergamum は現在開発中です。

現時点では、ソースコードから開発環境を構築して試すことができます。

開発には Node.js 24 LTS を使用します。

依存関係のインストール:

```bash
npm ci
```

開発サーバー起動:

```bash
npm run dev
```

開発時によく使う検証コマンドは以下です。

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Windows installer / `.pergamum` file association の基盤はありますが、利用可能な配布物・リリース手順は release ごとの案内を確認してください。

---

## 設計について

Pergamum では、大きな設計判断を ADR（Architecture Decision Record）として残しています。

コードだけを見ると、

> なぜ UUIDv7 なのか  
> なぜ Glossary の表記を別テーブルにしたのか  
> なぜ SQLite が正本なのか  
> なぜ snapshot を正本にしないのか  
> なぜ Command / Navigation / Editor identity を分けるのか  
> なぜ Recovery を project folder ではなく application data 側に置くのか

といった理由は時間とともに失われます。

そのため、「何を採用したか」だけでなく、**何を検討し、なぜ採用しなかったのか**もできるだけ記録しています。

ADR の一覧と各 Status は [`docs/adr/README.md`](./docs/adr/README.md) を参照してください。

主要な ADR:

- [ADR-0001: Project Persistence Architecture](./docs/adr/0001-project-persistence-architecture.md)
- [ADR-0002: Structured Project Data and Glossary Model](./docs/adr/0002-structured-project-data-and-glossary-model.md)
- [ADR-0003: UI Interaction Architecture](./docs/adr/0003-ui-interaction-architecture.md)
- [ADR-0004: Manuscript Non-Destructive Policy](./docs/adr/0004-manuscript-non-destructive-policy.md)
- [ADR-0006: Durable State Categories and Settings Architecture](./docs/adr/0006-settings-architecture.ja.md)
- [ADR-0008: Project File, Project Root, and Project-Local Recovery Layout](./docs/adr/0008-project_file-project_root-and-project_local-recovery-layout.ja.md)
- [ADR-0009: Working Copy Persistence and Recovery Model](./docs/adr/0009-working-copy-persistence-and-recovery-model.ja.md)

実装より先に設計を決めることもあります。

あとで安く直せるコードより、あとで高くつくデータ構造を先に決めたいからです。

---

## ロードマップ

Pergamum の開発ロードマップは以下に整理しています。

- [Pergamum ロードマップ](./docs/roadmap.md)

実装スコープの正本は GitHub Issue です。ロードマップは、方向性・優先順位・保留事項を見失わないための地図として扱います。

これまでの大きな流れは以下です。

```text
Phase 4 (v0.50.0):  迷わず触れるようにする        … 完了
Phase 5 (v0.51.x):  触りすぎないようにする        … 完了
Phase 6 (v0.60.x):  閉じても戻れるようにする      … 完了
Phase 7 (v0.70.x):  プロジェクトを歩けるようにする  … 完了
v0.80.0:            小説 IDE としての中核機能が揃った段階（現在地）
```

v0.90.0 までは、合意済みの次の順序で進めます。これらは実装済みではなく **予定** です。

```text
1.  ショートカットキー対応
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

各項目の詳細・非スコープ・受け入れ条件は個別の GitHub Issue で定義します。

`v1.x` 以降の候補（DB migration、Git 連携、Plugin API、DOCX / EPUB / PDF・縦書き出力、任意 CSS テーマ、共同編集・クラウド同期など）は `docs/roadmap.md` を参照してください。

---

## Third-party notices

Pergamum は、いくつかのサードパーティ製アセット（アイコン、効果音）を同梱しています。

各アセットの著作権表示とライセンス情報は [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) にまとめています。

- Feather icons (MIT)
- Ionicons (MIT)
- Codicons (CC BY 4.0)
- SVG Repo icons（アイコンごとに個別ライセンス）
- Typewriter sounds（OpenGameArt, CC0）

---

## ライセンス

Pergamum は MIT ライセンスで公開しているフリーソフトウェアです。

同梱しているサードパーティ製アセットのライセンスは [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) を参照してください。

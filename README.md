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

現在の Pergamum は、v0.70.0 時点で Phase 6「閉じても戻れるようにする」までを完了した段階です。

本文編集、Project file、Command Palette、Settings、Debug Log、Session restore、Document Recovery など、毎日 dogfood しながら使うための基盤が整いつつあります。

一方で、まだ一般利用向けの安定版ではありません。

特に Glossary / project database の schema は今後も変更される可能性があります。重要な原稿や構造化データを扱う場合は、作業ディレクトリ全体を Git や通常のバックアップで管理してください。

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
| Project | Project write lock により同時書き込みを防ぐ |
| Project | 他プロセスが開いている project を read-only で開く |
| Project | stale project write lock を安全に回収する |
| Project | Project を閉じる |
| Editor | Markdown 本文を編集する |
| Editor | 複数の文書をタブで開く |
| Editor | 開いたタブを閉じる |
| Editor | 外部 Markdown ファイルを開く |
| Editor | 改行コードを保ったまま保存する |
| Editor | Atomic Markdown save pipeline で保存する |
| Editor | 文字数カウントを表示する |
| Editor | 段落字下げの一括挿入・削除を行う |
| Preview | Markdown Preview を表示する |
| Preview | Glossary match を Preview 上に装飾する |
| Glossary | Glossary entry を作成・編集・削除する |
| Glossary | Glossary form を管理する |
| Glossary | Glossary match の Hover Card を表示する |
| Glossary | Glossary entry から本文中の使用箇所へ移動する |
| Glossary | Glossary navigator で entry を探す |
| Glossary | Glossary occurrences tab で使用箇所を確認する |
| Command | Command Palette から操作を検索・実行する |
| Command | Application menu / shortcut / context menu から操作する |
| Settings | Settings Page で設定を確認・変更する |
| Session | 前回の project / tabs / window state を復元する |
| Recovery | 未保存本文の Recovery payload を保持する |
| Recovery | 前回起動時の未保存本文を復元候補として表示する |
| Recovery | Recovery candidate を `.recovered.md` として復元する |
| Recovery | Recovery candidate を明示的に破棄する |
| Recovery | 同じ Recovery candidate set の repeated auto-show を抑制する |
| Notification | 軽い情報通知を NotificationToast で表示する |
| Workbench | Navigator / Editor / Preview のペインを扱う |
| Workbench | Sidebar を折りたたむ |
| Utility Window | 支援ウィンドウを開く |
| Debug | Debug mode JSONL log を出力する |
| Debug | Debug Log tab でログを確認する |
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
| File format | 開ける原稿ファイルは `*.md` のみです |
| File format | `*.txt` やその他のテキストファイルは未対応です |
| Encoding | UTF-8 のみ対応しています |
| Encoding | Shift_JIS / EUC-JP / UTF-16 など、UTF-8 以外の文字コードは未対応です |
| Project database | Glossary / project database の schema は開発中です |
| Project database | 今後の変更で破壊的変更が入る可能性があります |
| Compatibility | 現時点では、永続的な DB 互換性を保証しません |
| Recovery | Recovery は未保存本文の救済用であり、履歴管理や Git の代替ではありません |
| Search | 作品全体を歩くための高度な検索・一覧機能は今後の開発対象です |
| Output | 投稿・印刷・電子書籍向けの本格的な出力機能は未実装です |
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

現在の主要な ADR:

- [ADR-0001: Project Persistence Architecture](./docs/adr/0001-project-persistence-architecture.md)
- [ADR-0002: Structured Project Data and Glossary Model](./docs/adr/0002-structured-project-data-and-glossary-model.md)
- [ADR-0003: UI Interaction Architecture](./docs/adr/0003-ui-interaction-architecture.md)
- [ADR-0004: Manuscript Non-Destructive Policy](./docs/adr/0004-manuscript-non-destructive-policy.md)
- [ADR-0005: Command Domain Taxonomy](./docs/adr/0005-command-domain-taxonomy.md)
- [ADR-0008: Project File / Root / Recovery Layout](./docs/adr/0008-project-file-root-recovery-layout.md)
- [ADR-0009: Recovery Store Architecture](./docs/adr/0009-recovery-store-architecture.md)

実装より先に設計を決めることもあります。

あとで安く直せるコードより、あとで高くつくデータ構造を先に決めたいからです。

---

## ロードマップ

Pergamum の開発ロードマップは以下に整理しています。

- [Pergamum ロードマップ](./docs/roadmap.md)

実装スコープの正本は GitHub Issue です。

ロードマップは、方向性・優先順位・保留事項を見失わないための地図として扱います。

現在は Phase 6「閉じても戻れるようにする」までを完了し、次の段階に進む準備をしています。

大きな流れは以下です。

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

各 Phase の詳細は `roadmap.md` を参照してください。

---

## ライセンス

Pergamum は MIT ライセンスで公開しています。

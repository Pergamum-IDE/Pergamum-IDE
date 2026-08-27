# ADR-0008: Project File, Project Root, and Project-Local Recovery Layout

## Status

Proposed（partially superseded — 下記「Amendments」を参照）

## Date

2026-08-22

## Amendments

### 2026-08-27 — working-copy Recovery の保存先について ADR-0009 により部分 supersede

本 ADR のうち、`.pergamum_recovery/`（project-local recovery directory）を **working-copy Recovery（未保存 Markdown 本文・未保存 `GlossaryEntryDraft` 内容と、その reconciliation metadata）の保存先とする判断** は、**ADR-0009 Working Copy Persistence and Recovery Model により superseded された。**

- working-copy Recovery の保存先は ADR-0009 を正とする。application `userData` 側の専用 Recovery store を使用し、`.pergamum_recovery/` を working-copy Recovery store として使用しない。理由は ADR-0009 が定義する（persisted state と Recovery を同一 failure domain に置かない）。
- 本 ADR の他の判断は引き続き有効である。すなわち `.pergamum` project file、project root、project name / project metadata schema、project boundary、同一 project root 内の複数 `.pergamum` file の許容、one-folder-one-instance policy の前提、OS file association 方針は変更しない。
- `.pergamum_recovery/` の将来用途（削除する、derived data 専用にする 等）、および `project.recoveryDirectoryName` 設定の今後の扱い（有効性・用途）は本 amendment / ADR-0009 では決定しない。**working-copy Recovery には使用しない**、という境界のみを確定する。
- 以下の本文（特に「Project-local recovery directory」節）は履歴として残す。working-copy Recovery の保存先に関する記述は、上記のとおり ADR-0009 に置き換わっている。

## Context

Pergamum は小説執筆向けIDEとして、本文を Markdown ファイルに保持しつつ、Glossary、セッション、復旧情報、プロジェクト構造などの管理情報を SQLite database に保持する。

ADR-0001 では、本文・構造情報・設定情報の責務分担として、概ね以下の方針を採用している。

```text
本文       = Markdown files
構造情報   = SQLite database
設定       = pergamum.json
```

Phase 4-6 の #202 File I/O workflow foundation により、Markdown 文書の読み込み・保存・Save As・dirty close save flow が実際に動作するようになった。

これにより、次の設計論点が明確になった。

```text
保存できる
↓
新規作成は？
↓
新規作成の文書種別は？
↓
.md と .txt はどう分ける？
↓
プロジェクトファイルとは何か？
↓
OS関連付けは？
↓
同じプロジェクトを複数インスタンスで開いてよいのか？
```

従来の `pergamum.db` という名前は、ユーザーから見ると内部実装ファイル、または削除可能な一時DBに見えやすい。

しかし Pergamum のプロジェクトDBは、単なる内部キャッシュではない。Glossary、プロジェクト文書管理、セッション復元、復旧情報との関連など、作品管理の中核を担う。

そのため、Pergamum はプロジェクトDBを明示的な project file として扱う必要がある。

また、ユーザーは用心深く `.pergamum` ファイルをコピー・退避・バックアップする可能性が高い。

例:

```text
/project-root/
  俺TUEEEEEE物語.pergamum
  俺TUEEEEEE物語 - copy.pergamum
  俺TUEEEEEE物語_20260822_backup.pergamum
  pergamum.json
  manuscripts/
```

このようなケースを異常扱いしてはならない。

一方で、同じ project root を複数の Pergamum プロセスで同時に開くと、本文、DB、Glossary、session restore、recovery store、dirty state が競合する可能性がある。

そのため、`.pergamum` project file、project root、project name、project metadata、project-local recovery directory の定義を明確にする。

---

## Decision

Pergamum は、プロジェクトDBファイルとして `.pergamum` 拡張子を使用する。

```text
<任意のファイル名>.pergamum
```

`.pergamum` ファイルは SQLite3 database file であり、Pergamum project file として扱う。

例:

```text
俺TUEEEEEE物語.pergamum
```

`.pergamum` は次の意味を持つ。

```text
.pergamum
  = SQLite3 database file
  = Pergamum project file
  = OS関連付け対象
  = プロジェクトを開く入口
```

ただし、`.pergamum` ファイル名を project name の source of truth にはしない。

Project name の source of truth は `.pergamum` database 内の `metadata.project_name` とする。

---

## Definitions

### Active project file

実際に開かれた `.pergamum` ファイルを active project file とする。

例:

```text
/work/novels/俺TUEEEEEE物語.pergamum
```

この場合:

```text
active project file = /work/novels/俺TUEEEEEE物語.pergamum
```

同一フォルダ内に他の `.pergamum` ファイルが存在していても、それらを active project file とはみなさない。

---

### Project root

開いた `.pergamum` ファイルの親ディレクトリを project root とする。

例:

```text
/work/novels/俺TUEEEEEE物語.pergamum
```

この場合:

```text
project root = /work/novels
```

Project root のフォルダ名は project name として扱わない。

たとえば以下の場合:

```text
/work/pergamum-dogfood/俺TUEEEEEE物語.pergamum
```

project root は `/work/pergamum-dogfood` だが、project name は `pergamum-dogfood` ではない。

---

### Project name

Project name は `.pergamum` database 内の metadata として保持する。

```text
metadata.project_name
```

`.pergamum` ファイル名は、プロジェクト作成時の初期値、または metadata が利用できない場合の表示 fallback として使ってよい。

ただし、作成後の project name の source of truth は `metadata.project_name` とする。

つまり、以下を原則とする。

```text
path は所在。
filename は入口。
metadata が名前。
```

---

## Project boundary

Pergamum project の境界は project root とする。

Project root は、開いた `.pergamum` ファイルの親ディレクトリである。

Pergamum は、project root 配下を project-local file space として扱う。

Project root の外側にあるファイルやディレクトリは、ユーザーの作品管理上どれほど関連があっても、Pergamum project の一部とはみなさない。

Project root 外のファイルを明示的に開いた場合、そのファイルは external file document として扱う。

External file document は、自動的に project document へ昇格しない。

Project root 配下のディレクトリ構造はユーザーが自由に決めてよい。

Pergamum は、単巻、巻別、部別、章別などの作品構造を特定の階層に強制しない。

Project-local file space の判定では、必要に応じて real path を解決し、project root 外へ出るパスを project-local とみなさない。

---

## File name and project name

プロジェクト作成時には、ユーザーが指定した `.pergamum` ファイル名から拡張子を除いた名前を、初期 project name として使ってよい。

例:

```text
俺TUEEEEEE物語.pergamum
```

作成時の初期値:

```text
metadata.project_name = 俺TUEEEEEE物語
```

ただし、作成後に `.pergamum` ファイルがリネームまたはコピーされても、project name を暗黙に変更してはならない。

例:

```text
俺TUEEEEEE物語 - copy.pergamum
俺TUEEEEEE物語_20260822_backup.pergamum
```

これらを開いた場合でも、database 内 metadata が以下であれば:

```text
metadata.project_name = 俺TUEEEEEE物語
```

Pergamum 内で表示される project name は:

```text
俺TUEEEEEE物語
```

のままとする。

`.pergamum` ファイルのリネームは、OS上のファイル名変更であり、Pergamum project name の変更ではない。

---

## Multiple `.pergamum` files in one project root

同一 project root に複数の `.pergamum` ファイルが存在することは許容する。

これはユーザーがバックアップ、コピー、退避、検証用DBを作成するために自然に発生する。

例:

```text
/project-root/
  俺TUEEEEEE物語.pergamum
  俺TUEEEEEE物語 - copy.pergamum
  俺TUEEEEEE物語_20260822_backup.pergamum
  pergamum.json
  manuscripts/
```

Pergamum は、同一フォルダ内のすべての `.pergamum` ファイルを active project file とみなしてはならない。

実際に開かれた `.pergamum` ファイルだけを active project file とする。

---

## Open Folder behavior

フォルダを開く導線で、対象フォルダ内に複数の `.pergamum` ファイルが見つかった場合、Pergamum は黙って1つを選んではならない。

この場合は、開く project file をユーザーに選ばせるか、`.pergamum` ファイルを直接選ぶよう案内する。

例:

```text
このフォルダには複数の .pergamum ファイルがあります。
開く project file を選択してください。
```

または、初期実装ではより単純に:

```text
このフォルダには複数の .pergamum ファイルがあります。
.pergamum ファイルを直接選んで開いてください。
```

としてよい。

この ADR は Open Folder flow の具体的なUI実装までは定義しない。

ただし、複数 `.pergamum` の存在を禁止してはならない。

---

## Project metadata schema

`.pergamum` database は、1行固定の `metadata` table を持つ。

`metadata` table は、project identity と schema information を保持する。

### Required fields

最低限、以下を必須とする。

```text
metadata.project_id
metadata.project_name
metadata.schema_version
```

加えて、作成日時・更新日時も metadata として保持する。

```text
metadata.created_at
metadata.updated_at
```

### Recommended schema

```sql
CREATE TABLE metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,

  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  created_with_app_version TEXT,
  last_opened_with_app_version TEXT
);
```

`metadata` table は1行固定とし、通常は `id = 1` の行だけを使用する。

```sql
SELECT project_name FROM metadata WHERE id = 1;
```

### Column semantics

#### `project_id`

Project identity を表す不変ID。

推奨形式は UUIDv7 string とする。

```text
metadata.project_id = 018f... など
```

`project_id` は project name や filename とは独立する。

同名の別プロジェクトを区別し、コピーされた `.pergamum` と新規作成された `.pergamum` を区別するために使う。

#### `project_name`

ユーザーに表示する project name。

Project name の source of truth は `metadata.project_name` とする。

`.pergamum` ファイル名や project root フォルダ名は、通常運用において project name の source of truth ではない。

#### `schema_version`

Pergamum project database schema version。

`.pergamum` database の論理スキーマバージョンを表す。

Migration 判定、互換性確認、将来の破壊的変更判定に使用する。

#### `created_at`

Project database 作成日時。

ISO 8601 UTC string を推奨する。

#### `updated_at`

Project metadata の更新日時。

この値の更新タイミングは実装方針に依存するため、必要に応じて別issueで詳細を定義する。

#### `created_with_app_version`

Project database 作成時の Pergamum app version。

必須ではないが、サポート・migration・dogfood調査に有用なため保持してよい。

#### `last_opened_with_app_version`

最後にこの project database を開いた Pergamum app version。

必須ではないが、migration・互換性確認・障害調査に有用なため保持してよい。

---

## `metadata.schema_version` and `PRAGMA user_version`

Pergamum は SQLite の `PRAGMA user_version` を migration guard として使用してよい。

その場合、原則として以下を満たす。

```text
metadata.schema_version == PRAGMA user_version
```

役割分担は以下とする。

```text
metadata.schema_version
  Pergamum project database の論理スキーマバージョン
  アプリケーション上の metadata として読む

PRAGMA user_version
  SQLite database migration が最初に参照する整数バージョン
```

Migration 中に一時的な不一致が発生する可能性はあるが、正常に開かれた project database として扱う時点では両者は一致していなければならない。

不一致が検出された場合は、DB破損、migration中断、古い実装由来の不整合として安全側に倒す。

この場合、本文やパスを含む raw error を debug log / console / dialog に出してはならない。

---

## Project name fallback

通常、UI 表示上の project name は `metadata.project_name` を正とする。

Fallback は以下の順序とする。

```text
1. metadata.project_name
2. metadata.project_name が未設定または利用できない場合、.pergamum ファイル名から拡張子を除いた名前
3. それも不可能な場合、Untitled Project
```

ただし、fallback は表示やエラー回復のための補助であり、`.pergamum` ファイル名を project name の source of truth に戻すものではない。

また、metadata が読めない壊れたDBを fallback だけで正常な project database として扱ってはならない。

---

## Project-local recovery directory

> **Note（2026-08-27, ADR-0009 による部分 supersede）:**
> 本節が `.pergamum_recovery/` を working-copy Recovery（未保存本文・dirty document recovery data・crash recovery data・save failure recovery support data）の保存先とする点は、ADR-0009 により superseded された。working-copy Recovery の保存先は application `userData` 側の専用 Recovery store とし、`.pergamum_recovery/` は working-copy Recovery store として使用しない。本節は履歴として残す。

Pergamum は、project root 配下に project-local recovery directory を持つ。

既定名は以下とする。

```text
.pergamum_recovery
```

配置例:

```text
/project-root/
  俺TUEEEEEE物語.pergamum
  pergamum.json
  .pergamum_recovery/
  manuscripts/
```

`.pergamum_recovery/` には、未保存本文、dirty document recovery data、crash recovery data、save failure recovery support data など、ユーザー本文に準じる情報が含まれる可能性がある。

そのため、`.pergamum_recovery/` を単なる一時キャッシュとして扱ってはならない。

Recovery data の cleanup は保守的に行う。

Recovery data の内容、本文、raw path、filename を debug log / console / dialog に出してはならない。

---

## Recovery directory name setting

`.pergamum_recovery` は標準名とする。

ただし、この値を各実装箇所で magic string としてハードコードしてはならない。

既定値は Settings Catalog に定義し、利用側は project settings の解決結果を通じて取得する。

設定キー案:

```text
project.recoveryDirectoryName
```

既定値:

```text
.pergamum_recovery
```

この設定は達人向け設定とする。

通常ユーザーが変更することは想定しないが、特殊な運用、既存ディレクトリとの衝突、同期環境、検証用途などに備えて変更可能にしておく。

---

## Recovery directory name validation

`project.recoveryDirectoryName` は、任意パスではなく、project root 直下のディレクトリ名だけを受け付ける。

許可する値の例:

```text
.pergamum_recovery
_pergamum_recovery
pergamum-recovery
recovery
```

禁止する値の例:

```text
../recovery
./recovery
.pergamum/recovery
C:\temp\recovery
/tmp/recovery
.
..
空文字
```

禁止するもの:

```text
絶対パス
相対パス
../
./
スラッシュ /
バックスラッシュ \
空文字
.
..
制御文字
bidi / zero-width characters
```

つまり、設定できるのは「場所」ではなく、project root 直下の「名前」だけである。

---

## Recovery directory name changes

`project.recoveryDirectoryName` を変更した場合、Pergamum は以後、新しい recovery directory name を使う。

ただし、既存の recovery directory を暗黙に移動・削除・上書きしてはならない。

```text
設定変更後、新しい recovery directory name を使う。
既存の recovery directory は自動移動しない。
```

UI 実装時には、以下のような警告を出すことが望ましい。

```text
リカバリ領域名を変更すると、既存の復旧データが自動的には参照されなくなる場合があります。
通常は変更しないでください。
```

---

## Responsibility split

Pergamum project root 内の主なファイル責務は次のとおりとする。

```text
<任意のファイル名>.pergamum
  Project database
  Pergamum project file
  SQLite3 database file
  OS関連付け対象
  active project file 候補

pergamum.json
  Project Settings

.pergamum_recovery/
  Project-local recovery directory
  未保存本文や復旧用メタデータを含む可能性がある
  キャッシュ扱いしない

*.md / *.markdown
  Markdown document
  本文の正本

*.txt
  Future plain text document
  Markdown の別名にはしない

*.glossary
  Future glossary export/import candidate
```

---

## Markdown / plain text / extension policy

`.md` / `.markdown` は Markdown document として扱う。

`.txt` は将来の plain text document の候補とし、Markdown document の別名にはしない。

`.pergamum` は SQLite3 database file であり、Markdown document でも plain text document でもない。

```text
.md と .markdown は Markdown。
.txt は Markdown の別名ではない。
.pergamum は SQLite。
```

---

## OS file association

`.pergamum` は将来的に OS file association の対象とする。

ただし、この ADR は OS file association の具体的な実装方法を定義しない。

OS file association は、Windows、macOS、Linux で処理系依存が大きい。

そのため、以下は別issueで扱う。

```text
Installer registers .pergamum file association
Startup file open / .pergamum argv handling
```

設計方針としては、インストーラーは `.pergamum` を Pergamum Project file として登録する。

ただし、既定アプリの強制奪取はしない。

ユーザーのOS設定とユーザー選択を尊重する。

---

## One-folder-one-instance policy

同一 project root を複数 Pergamum インスタンスで同時に開くことは防ぐべきである。

ただし、この ADR は one-folder-one-instance enforcement の具体的な実装方法を定義しない。

この ADR で定義するのは、ロックや多重起動判定の単位が active project file path ではなく project root である、という前提である。

理由は、同じ project root 内では以下が共有されるためである。

```text
pergamum.json
.pergamum_recovery/
manuscripts/*.md
session restore
recovery store
dirty document state
```

したがって、以下の2つは別の `.pergamum` ファイルであっても、同じ project root を共有する。

```text
/project-root/俺TUEEEEEE物語.pergamum
/project-root/俺TUEEEEEE物語 - copy.pergamum
```

これらを別プロセスで同時に開くことは、後続issueで防止する。

---

## Non-goals

この ADR では以下を定義しない。

```text
OS file association の具体的実装
インストーラー設定
startup argv handling
open-file event handling
one-folder-one-instance の実装方式
既存 pergamum.db から .pergamum への migration 手順
Open Folder flow の具体的UI
複数プロジェクト同時オープン
複数ウィンドウ対応
New Markdown File command
Plain text document mode
.txt の実装
.glossary export/import
recovery store 本体のスキーマ
recovery data cleanup policy の詳細
```

これらは follow-up issue または別ADRで扱う。

---

## Consequences

### Positive

- `.pergamum` が Pergamum project file として明確になる
- `pergamum.db` よりもユーザーにプロジェクト本体として認識されやすい
- OS file association の対象が明確になる
- Project root の定義が明確になる
- Project name を filename から分離できる
- `.pergamum` のコピーやリネームで project name が暗黙に変わらない
- 複数 `.pergamum` ファイルの存在を自然なユーザー行動として許容できる
- Project metadata と schema version の置き場所が明確になる
- Recovery directory を cache ではなく user content に準じる領域として扱える
- Recovery directory name を将来的に変更可能にできる
- One-folder-one-instance policy の前提が明確になる

### Negative / Trade-offs

- `pergamum.db` から `.pergamum` への移行方針が必要になる
- Project metadata table の初期化と migration が必要になる
- `metadata.schema_version` と `PRAGMA user_version` の整合性を管理する必要がある
- Recovery directory name を settings 経由にするため、単純なハードコードより実装が少し重くなる
- `.pergamum` ファイル名と project name が異なるケースをUI上で自然に扱う必要がある
- Open Folder flow で複数 `.pergamum` が見つかるケースを設計する必要がある

---

## Alternatives considered

### Keep using `pergamum.db`

却下。

`pergamum.db` は内部実装ファイルに見えやすい。

ユーザーから見ると、削除可能な生成物やキャッシュのように見える危険がある。

Pergamum project file として OS file association する対象としても弱い。

---

### Use folder name as project name

却下。

Project root のフォルダ名は、Git repository、同期フォルダ、作業用ディレクトリ、バックアップディレクトリなどの都合で変わる。

例:

```text
/work/pergamum-dogfood/俺TUEEEEEE物語.pergamum
```

この場合、`pergamum-dogfood` を project name とするのは不自然である。

---

### Use `.pergamum` filename as project name source of truth

却下。

ユーザーは `.pergamum` ファイルをコピー・リネームする可能性が高い。

例:

```text
俺TUEEEEEE物語 - copy.pergamum
俺TUEEEEEE物語_20260822_backup.pergamum
```

ファイル名を source of truth にすると、コピーやバックアップによって project name が暗黙に変わってしまう。

Project name は DB metadata に保持する。

---

### Forbid multiple `.pergamum` files in one project root

却下。

ユーザーが用心深く `.pergamum` ファイルをコピー・バックアップするのは自然な行動である。

設計がそれを敵視してはならない。

Pergamum が制御すべきなのは、複数 `.pergamum` ファイルの存在そのものではなく、どの `.pergamum` が active project file なのか、および同じ project root を複数プロセスで同時に開かないことである。

---

### Hard-code `.pergamum_recovery`

却下。

`.pergamum_recovery` は標準名として採用するが、実装箇所に magic string として散らしてはならない。

Recovery directory name は Settings Catalog default として定義し、project settings の解決結果として利用する。

---

### Store all project metadata as key-value

現時点では採用しない。

Project metadata の中核である `project_id`、`project_name`、`schema_version` は、型と必須性が重要である。

そのため、汎用 key-value table よりも、1行固定の `metadata` table として明示的な column を持つ方が望ましい。

将来的な拡張情報については、必要に応じて別 table や限定的な key-value table を検討する。

---

## Implementation notes

### Project creation

新規 project database 作成時は、ユーザーが選んだ `.pergamum` ファイルパスを active project file とする。

```text
/project-root/俺TUEEEEEE物語.pergamum
```

このとき:

```text
activeProjectFile = /project-root/俺TUEEEEEE物語.pergamum
projectRoot = /project-root
```

初期 project name が明示されていない場合、`.pergamum` ファイル名から拡張子を除いた名前を `metadata.project_name` の初期値にしてよい。

```text
metadata.project_name = 俺TUEEEEEE物語
```

ただし、作成後は `metadata.project_name` が正となる。

---

### Project open

`.pergamum` ファイルを開く場合、Pergamum は以下を行う。

```text
1. path を受け取る
2. .pergamum file として扱う
3. SQLite database として開く
4. PRAGMA user_version を読む
5. metadata table を読む
6. metadata.schema_version と PRAGMA user_version の整合性を確認する
7. metadata.project_id / metadata.project_name を読む
8. active project file を設定する
9. parent directory を project root とする
```

失敗した場合、raw path、filename、本文、raw fs error を debug log / console / dialog に出してはならない。

---

### Recovery path resolution

Recovery directory path は、各実装箇所で直接組み立てない。

以下のような resolver を通す。

```text
projectRoot
project.recoveryDirectoryName
  ↓
recoveryDirectoryPath
```

例:

```text
projectRoot = /project-root
project.recoveryDirectoryName = .pergamum_recovery
```

結果:

```text
recoveryDirectoryPath = /project-root/.pergamum_recovery
```

`.pergamum_recovery` という literal を直接利用してよいのは、Settings Catalog default、テスト期待値、ドキュメント、migration notes に限定する。

---

## Follow-up issues

この ADR を受けて、以下を別issueとして扱う。

```text
Implement .pergamum project file layout
Add project metadata table
Define recovery directory setting and resolver
Startup file open / .pergamum argv handling
Installer registers .pergamum file association
Define one-folder-one-instance policy
Existing pergamum.db migration / naming transition
Open Folder flow for .pergamum discovery
New Markdown File / Untitled Markdown document
Safe filename / default untitled name policy
New Markdown default extension setting
Plain text document mode
Generic New File command
Recovery store foundation
```

---

## Summary

Pergamum project は、`.pergamum` SQLite database file を project file として持つ。

実際に開いた `.pergamum` が active project file であり、その親ディレクトリが project root である。

Project name は `.pergamum` ファイル名ではなく、database 内の `metadata.project_name` を正とする。

`.pergamum` database は、1行固定の `metadata` table を持ち、少なくとも `project_id`、`project_name`、`schema_version` を保持する。

Project-local recovery directory の標準名は `.pergamum_recovery` とするが、実装上は Settings Catalog / project settings 経由で解決し、magic string として各所にハードコードしない。

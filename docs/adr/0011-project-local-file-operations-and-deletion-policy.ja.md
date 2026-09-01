# ADR-0011: Project-Local File Operations and Deletion Policy

**Status:** Proposed

**Date:** 2026-09-01

> Status について: 本 ADR は Proposed とする。File Explorer deletion の実装完了後、または削除仕様が dogfood で確認できた後に Accepted 化を検討する。

---

## Context

既存 ADR / docs の調査（Issue #351 事前調査）では、コミット済みの ADR / docs に「project / file / folder deletion を禁止する」という broad な normative policy は**存在しなかった**。

- 「削除してはならない」という normative な記述は、いずれも **Recovery データ**に限定されている（ADR-0007 R-10、ADR-0009 S-46 / S-61 / S-62：silent deletion 禁止、age ベース自動削除禁止 等）。
- `.pergamum_recovery/` については「**暗黙に**移動・削除・上書きしてはならない」があるが、これは `project.recoveryDirectoryName` 設定変更時の暗黙操作に限った話である（ADR-0008）。
- `docs/roadmap.md` の Phase 7「File operations 候補」には **`delete with confirmation`** が予定機能として明記されている。「Phase 7 で扱わないこと」に delete は含まれていない。
- File Explorer には現在 create / rename / move が実装済みだが、これらを所有する専用 ADR は無く、**delete は未実装**である。

したがって本 ADR は「既存の削除禁止 ADR を撤回する」文書ではない。**File Explorer における project-local な file / folder deletion の境界と安全条件を新しく定義する** ADR である。

### 設計意図

Pergamum は **project deletion を提供しない**。project そのもの（project root / `.pergamum` project file）を削除する導線は持たない。

しかし Pergamum は IDE、すなわち統合執筆環境を名乗る。統合執筆環境である以上、File Explorer 管理下の**原稿ファイルや作業フォルダを、ユーザーが明示的に破棄する操作**は提供してよい、というのが本 ADR の PO 判断である。

原稿ファイルを 1 つ削除することは、**下書きの紙を一枚くしゃくしゃに丸めて捨てる**ことに相当する。これは、作品（project）そのものを捨てる操作とは意味が異なる。

本 ADR は、この「作品を捨てる（禁止）」と「作品の中の紙を捨てる（明示操作＋確認で許可）」の切り分けを明確にする。

---

## Related ADRs

- **ADR-0008 Project File, Project Root, and Project-Local Recovery Layout** — project root / project boundary / `.pergamum` project file（project entry point・OS file association 対象）/ 同一 project root 内の複数 `.pergamum` file の許容 を**前提として使用する**。本 ADR の削除境界（project root 配下限定、`.pergamum` 保護）は ADR-0008 の boundary 定義に依拠する。
- **ADR-0009 Working Copy Persistence and Recovery Model** — S-48「Recovery 後に元 file が削除・移動された場合 → target-state = unresolvable → `unresolved`」を参照する。File Explorer による Markdown 削除も、既存の Recovery snapshot を silently delete してはならず、`unresolved` / user-visible handling の対象になる。本 ADR は **Recovery を再設計しない**。
- **ADR-0003 UI Interaction Architecture** — I-3「Navigator / modal は rename・toggle・**削除確認**など作業面を要さない限定操作を提供してよい」。削除は「明示 command ＋ 確認 dialog」というパターンに従う。
- **ADR-0005 Command Domain Taxonomy** — `workspace` domain が「file reveal / rename / delete」と project structure 操作を所有する。削除コマンドは `workspace.file.*` domain に属する。
- **ADR-0004 本文非破壊原則** — 本文の**バイト列**を暗黙に書き換えない原則。File Explorer deletion は「ユーザーが明示した破壊的操作」であり、0004 が禁じる「暗黙の書き換え」とは別種である。0004 はこれを禁じていない。
- **ADR-0000 アクセシビリティと包摂的インタラクションの原則** — 削除の確認 dialog は user-visible で、ユーザーを迷わせない情報（何が消えるか）を提示しなければならない。
- **ADR-0010 Startup File-Open Routing (Cold Start)** — project-local 判定における `realpath` の使い方（PATH-4）と整合させる。
- **docs/roadmap.md Phase 7** — 「File operations 候補：… delete with confirmation」「file operation は明示 command / Main Process API 経由とする」。本 ADR はこの予定を具体化する。

---

## Definitions

**project-local entry**

現在開いている project の project root（ADR-0008）の**配下に実在する** file または folder。判定では、必要に応じて `realpath` を解決し、project root の外へ出る path を project-local とみなさない（ADR-0010 PATH-4 と同方針）。

**protected entry**

project の同一性・設定・復旧・排他制御に関わるため、File Explorer deletion の対象にしてはならない entry（DEL-12 に列挙）。

**detach（Close Project）**

現在のウィンドウから project を切り離す操作。`workspace.project.close`。filesystem 上の project root / `.pergamum` / project-local file は**一切変更しない**。本 ADR では「Close Project は detach であり deletion ではない」という説明のために `detach` の語を用いる（DEL-1）。既存 ADR 全体の用語整理は本 ADR の範囲外である。

**項目（item）**

削除確認 dialog の列挙単位。file と（空フォルダを含む）folder の両方を指す（DEL-11）。

---

## Decision

### ファイル操作の前提（FILEOP）

**FILEOP-1. project-local file operation は、明示 command と Main Process API 経由でのみ行う。**

create / rename / move / delete を含む project-local file operation は、明示的な command と Main Process API を通じて実行する。Renderer は filesystem を直接操作しない（`docs/roadmap.md` Phase 7）。

**FILEOP-2. project-local file operation の対象は project root 配下の entry に限る。**

project root の外へ出る path（`realpath` 解決後を含む）を操作対象にしてはならない。

### 削除ポリシー（DEL）

**DEL-1. Pergamum は project deletion を提供しない。**

project そのものを削除する操作を提供しない。少なくとも以下を禁止する。

- project root の削除
- `.pergamum` project file の削除
- Close Project を「削除」として扱うこと

Close Project は detach（現在のウィンドウから project を切り離すこと）であり、削除ではない。

**DEL-2. Project root deletion は禁止する。**

Pergamum 内から project root ディレクトリ自体を削除してはならない。File Explorer は project root を削除対象として提示しない。

**DEL-3. `.pergamum` project file および SQLite sidecar の deletion は禁止する。**

`.pergamum` project file は project entry point であり、OS file association の対象でもある。File Explorer から `.pergamum` project file を削除してはならない。次の SQLite sidecar も削除対象にしてはならない。

- `.pergamum`
- `-journal`
- `-wal`
- `-shm`

**保護対象は active project file だけでなく、同一 project root 内に存在し得る他のすべての `.pergamum` file を含む**（backup / copy — ADR-0008 が許容する用途 — も含む）。ユーザーが `.pergamum` file を削除したい場合は、OS / file manager 側で行うものとする。

**DEL-4. File Explorer file / folder deletion は、project-local entry に限定して許可する。**

File Explorer 管理下の project-local file / folder entry は、明示操作と確認 dialog を条件に削除可能とする。対象は project root 配下に限定する（FILEOP-2）。project root 外の file / folder を Pergamum の削除対象にしてはならない。project-local 判定では、必要に応じて `realpath` を使い、project root 外へ逃げる path を削除対象にしてはならない。

**DEL-5. 削除は明示 command / Main Process API 経由でのみ行う。**

Renderer が直接 filesystem deletion を行ってはならない（FILEOP-1 の帰結）。

**DEL-6. silent deletion を禁止する。**

Pergamum は file / folder を silent delete してはならない。削除には必ず user-visible な confirmation dialog を伴う。

**DEL-7. 削除は確認 dialog を経由しなければならない。**

削除は確認 dialog を経由しなければならない。確認 dialog は、1 ファイルの削除であっても削除対象を**表形式**で表示する（DEL-10）。

**DEL-8. OS ゴミ箱 / recycle bin へは移動しない。**

本 ADR が定義する File Explorer deletion は、OS trash / recycle bin への移動ではなく、**直接削除**である。したがって確認 dialog では次を明示する。

- ゴミ箱には移動されないこと
- この操作は元に戻せないこと

OS trash / recycle bin integration は future work / non-goal とする。

**DEL-9. 削除確認 dialog の削除ボタンは、5 秒待機後に有効化する。**

削除確認 dialog を開いた時点で削除ボタンは disabled とし、5 秒待機後に有効化する。Cancel は常に利用可能とする。

計測開始点（列挙が長い場合）、残り時間の表示、結果テーブルの更新など詳細 UI は File Explorer 実装仕様で決める（本 ADR では規範化しない）。

**DEL-10. 削除対象を表形式で列挙する。**

削除確認 dialog では、削除対象を表形式で表示する。1 ファイルでも表形式にする。列は以下とする。

| 列 | 内容 |
| --- | --- |
| パス名 | project root からの相対パス（親フォルダ） |
| ファイル名 | file / folder 名 |
| 最終更新日時 | 対象の mtime |
| 書き出し10文字 | 対象がユーザーの意図したファイルであることを確認するための補助情報 |
| 終わり10文字 | 同上 |
| 全バイト数 | 対象ファイルのサイズ |

「書き出し10文字」「終わり10文字」は preview のための補助情報であり、**ファイル全体を読み込む必要はない**。実装は先頭・末尾の小さな範囲のみを読み、安全に表示可能な場合に限って先頭 10 文字・末尾 10 文字を表示する。読み取り不能・decode 失敗・安全に preview できない場合は **`プレビュー不可`** と表示する。

（既存の Recovery candidate dialog の `previewSnippet`（先頭 ~10 code point、空白畳み込み、`…` 付与）と同種の補助情報である。実装ではこのロジックの再利用を検討する。）

**DEL-11. folder 削除も同じ確認 UI を使う。**

folder 削除も、file 削除と同じ確認 UI を使う。選択対象に folder が含まれる場合、その folder 配下の**実際に削除される対象を再帰的に列挙**する。10 ファイルでも 200 ファイルでも、削除される対象は同じ表形式で表示する。件数が多いことを理由に summary-only warning へ置き換える仕様にはしない。

空 folder の扱い:

- 表の対象は「ファイル」ではなく「**項目**」として扱う。
- 空 folder も削除対象として表に表示する。
- folder 行では「書き出し10文字」「終わり10文字」に `フォルダ`、「全バイト数」に `—` を表示してよい。

**DEL-12. protected entries は削除不可とする。**

以下は File Explorer deletion の対象にしてはならない。

- `.pergamum` project files
- SQLite sidecars（`-journal` / `-wal` / `-shm`）
- `.pergamum_recovery/`
- `.pergamum.lock/`
- `.pergamum.lock.stale-*`
- `pergamum.json`
- 既存の reserved File Explorer 名
- 既存の protected suffix

既存実装の `RESERVED_FILE_EXPLORER_NAMES` / `pathHasReservedFileExplorerSegment` / `protectedPergamumFileSuffixes` を再利用する前提とする。

**選択した folder の subtree に protected entry が含まれる場合、その folder はまるごと削除できない。** この場合は削除を拒否し、理由を user-visible に提示する。protected entry を残して他を削除する「部分削除」は本 ADR では採用しない。これは、誤って project infrastructure を壊さないための安全側の判断である。

**DEL-13. dirty / open editor を silent に失わせない。**

削除対象に open editor が含まれる場合の扱いを次の安全方針とする。

- dirty editor を silent discard してはならない。
- open editor が削除対象に含まれる場合、削除前に user-visible に扱う。
- 削除後、open editor identity が dangling な状態で残ってはならない。
- 詳細な UX は実装 Issue で確定してよいが、**silent data loss は禁止**する。

**DEL-14. Recovery snapshot を silently delete しない。**

ADR-0009 S-48 を参照する。Markdown file が削除された場合、既存の Recovery snapshot を silently delete してはならない。Recovery は `unresolved` / user-visible handling の対象になる。本 ADR では Recovery redesign は行わない。

**DEL-15. 削除の実行結果を user-visible にし、成功後に File Explorer を refresh する。中止は rollback ではない。**

- 削除の結果（成功した項目・失敗した項目）は user-visible にしなければならない。失敗した項目を silent に無視してはならない。
- 削除成功後、File Explorer は refresh されなければならず、削除された file / folder が tree に残り続けてはならない。
- 削除の中止（abort）を実装する場合、中止は既に削除された項目を復元する rollback ではなく、まだ削除していない項目の実行を止めることである。中止時点までに削除された項目は削除済みのまま残り、それも結果として user-visible にする。

削除開始後のボタン遷移（「削除」→「中止」等）・逐次表示など詳細な実行 UI は File Explorer 実装仕様で扱う。本 ADR が固定する安全要件は「silent に行わない（DEL-6）/ 確認 dialog 必須（DEL-7）/ 5 秒待機必須（DEL-9）/ 対象一覧を表で表示（DEL-10・DEL-11）/ 結果・失敗を user-visible にする（本 DEL-15）/ 中止は未実行項目の停止であり rollback ではない（本 DEL-15）」までとする。

### 削除確認ダイアログの文言（案）

日本語版には次の趣旨を含める。

> 以下の &lt;N&gt; 個の項目を削除しようとしています。
>
> 削除した項目はゴミ箱には移動されず、直接削除されます。
> この操作は元に戻せません。
>
> 本当に削除してよろしいですか？

folder が含まれる場合の補足:

> 選択されたフォルダに含まれるファイルとサブフォルダも削除対象に含まれます。

ボタン:

- キャンセル（常に有効）
- 削除（dialog 表示から 5 秒間 disabled）

---

## Consequences

### Positive

- 「project は消せない、しかし project の中の紙は明示操作で捨てられる」という統合執筆環境として自然な境界が明文化される。
- 削除は明示 command / Main Process API 経由に限定され（FILEOP-1）、Renderer が fs を直接触らない既存方針と一貫する。将来の D&D / 一括操作もこの経路に載る。
- 確認 dialog が「何が消えるか」を表形式＋先頭/末尾 preview で提示するため、意図しないファイルの削除に気づける。
- 5 秒の遅延と「ゴミ箱に移動されない／元に戻せない」の明示により、反射的な確定を抑止する。
- protected entry（`.pergamum` 一式・recovery・lock・`pergamum.json`）は既存の reserved 名インフラを再利用して保護され、project 破損経路を作らない。
- Recovery との関係は ADR-0009 S-48 の既存契約に寄せ、Recovery を再設計しない。

### Negative / Trade-offs

- OS ゴミ箱に入らない直接削除であり、OS の Explorer / Finder の「削除＝ゴミ箱」体験と異なる。5 秒遅延・表形式・文言で緩和するが、UX 上の摩擦は残る。
- folder 削除で subtree 全件を表形式に出す方針のため、非常に大きなサブツリー（数千件）では列挙・描画コストが問題になり得る。summary-only や対象省略は禁じているため、**全件提示の原則を保ったまま**の表示性能対策（virtualization / pagination / progressive rendering / 列挙のキャンセル 等）が実装側で必要になる（実装 follow-up）。
- 先頭/末尾 10 文字 preview は対象ファイルごとに小範囲の read を要する。encoding は現行 pipeline に合わせ BOM-less UTF-8 を前提とし、非対応は `プレビュー不可`。text encoding policy（将来）に踏み込まない範囲に留める。
- DEL-3 により、同一 project root にある backup 用 `.pergamum` copy も Pergamum 内からは削除できず、OS 側で削除する必要がある。
- subtree に protected entry を含む folder はまるごと削除できない（DEL-12）。「project 内の一部だけ整理したい」ケースで、ユーザーが個別に対象を選び直す手間が生じ得る。

---

## Alternatives Considered

### File Explorer から一切の削除を提供しない（従来の暗黙姿勢を維持）

却下（PO 判断）。統合執筆環境として、原稿ファイル・作業フォルダの明示的破棄は提供する。project deletion は引き続き提供しない。

### 削除を OS ゴミ箱送りにする（`shell.trashItem` 等）

今回は却下。プラットフォーム差・ゴミ箱の可用性・sandbox 制約があり、挙動が環境依存になる。まず「直接削除＋強い確認」で境界を固め、OS trash integration は future work とする（DEL-8）。

### 件数が多い folder 削除では summary-only（「フォルダ内の N ファイルを削除します」）にする

却下（PO 指示）。何が消えるかを具体的に列挙することが安全確認の主目的であり、件数を理由に列挙を省略しない（DEL-11）。列挙コストの手当ては実装側の課題とする。

### 削除ボタンの遅延を設けない / チェックボックス確認にする

却下。反射的な確定を防ぐため、時間遅延（DEL-9）と対象の表形式提示（DEL-10）を採用する。

### `.pergamum` の削除を「active でない copy に限り」許可する

却下（PO 判断）。同一 project root 内のすべての `.pergamum` を保護対象とする（DEL-3）。誤って active project file を消す事故や、識別ミスの余地を残さない。backup / copy `.pergamum` を消したい場合は OS / file manager 側で行う。

### protected entry を残して folder を部分削除する

却下（PO 判断）。subtree に protected entry を含む folder はまるごと削除できない（DEL-12）。部分削除は project infrastructure を壊すリスクと、削除結果が中途半端になる分かりにくさを招く。

---

## Non-goals

本 ADR では以下を扱わない。

- project deletion
- project root deletion
- `.pergamum` project file deletion
- OS trash / recycle bin integration
- undo for deletion
- external drag-and-drop import
- project root 外の任意の外部ファイルの削除
- runtime file watcher
- Recovery redesign
- text encoding policy
- `.txt` support
- `.mdown` / `.mkd` support

---

## Future Work

- OS trash / recycle bin integration（プラットフォーム別）。
- 削除の undo / 短期の復元導線。
- 大規模サブツリー削除時の確認 UI の表示性能（virtualization / pagination / progressive rendering / 列挙のキャンセル。全件提示の原則は維持する）。
- 削除の一部失敗（権限エラー等）の報告 UI（#346 の read-only failure-list dialog の再利用余地）。
- D&D を含む move / delete の UI 統合（roadmap Phase 7 の順序）。

---

## 実装 Issue へ委ねる未確定事項（non-normative / implementation follow-up）

> 本章は **non-normative** である。上記 §Decision の規範決定を制約・変更するものではなく、実装 Issue および File Explorer 実装仕様で確定する項目の一覧である。

1. **DEL-9 のタイマー詳細**: 計測開始点（対象列挙が長い場合に、dialog 表示時点から数えるか列挙完了時点から数えるか）、残り時間の表示有無。※「5 秒待機後に有効化」自体は本 ADR の規範決定（DEL-9）。
2. **DEL-10 / DEL-11 の列挙の表示性能**: 非常に大きなサブツリーでの virtualization / pagination / progressive rendering / 列挙のキャンセル。**全件提示の原則は維持し、summary-only への置換や対象の省略は行わない**（これは DEL-11 の規範決定）。
3. **先頭/末尾 preview（DEL-10）**: 読み取る byte 窓のサイズ、decode 戦略、code point / grapheme の扱い、空白・改行の畳み込み（Recovery `previewSnippet` ロジックの再利用範囲）、表示幅。
4. **DEL-13 の open / dirty editor UX**: 削除前に閉じさせるか、保存を促すか、削除をブロックするか。削除後の editor identity 無効化の具体。※「silent data loss 禁止」自体は規範決定（DEL-13）。
5. **DEL-14 の Recovery 連携**: 削除に伴う Recovery row の再キー / `unresolved` 遷移の main-process 側実装（ADR-0009 S-48）。
6. **DEL-15 の refresh / 結果提示 / 中止 UI**: 既存の File Explorer refresh 機構（`FileExplorerRefreshDirectoriesRequest` 等）の再利用、結果・失敗の提示 UI（#346 の read-only failure-list dialog の再利用余地）、削除開始後のボタン遷移（「削除」→「中止」等）・逐次表示。※「結果・失敗を user-visible にする / 中止は未実行項目の停止であり rollback ではない」自体は規範決定（DEL-15）。
7. **コマンド面**: `workspace.file.delete` を定義するか。context menu のみか、Del キー割当、Command Palette 露出。
8. **symlink**: symlink entry の削除は「link のみ削除」か。ルールの明文化。
9. **i18n / アクセシビリティ**: 文言キー、表と時限ボタンのスクリーンリーダー通知（「削除ボタンはあと N 秒で有効になります」等）。

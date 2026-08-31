# ADR-0010: 起動時ファイルオープンのルーティング（cold start）

**Status:** Accepted

**Date:** 2026-09-01

---

## Context

ADR-0008 は `.pergamum` project file、project root、project boundary、同一 project root 内の複数 `.pergamum` file の許容、lock / 多重起動判定の単位（= project root）を定義した。ただし「Startup file open / `.pergamum` argv handling」および「Open Folder flow で複数 `.pergamum` が見つかるケース」は明示的に follow-up issue へ先送りしていた（ADR-0008 §Non-goals / §Follow-up issues）。

Phase 7-2 の事前監査で、この先送り部分に安全境界の穴が見つかった。

```text
Pergamum project 配下の Markdown file が、起動引数 / Open With / EXE drop で渡されたとき、
現在開いている project に属していなければ standalone writable document として開かれていた。

そのため、別の Pergamum process がその project を writable lock している状態でも、
同一ファイルを project document と standalone document の両方から編集・保存できてしまう。
これは manuscript data loss につながる。
```

App レベルの project write lock（`.pergamum.lock/`）は実装済みで、同一 project の二重 read-write open は防止されている。しかし起動時 Markdown routing がその lock-aware path に到達していなかった。

本 ADR は、**cold start（起動時）** に渡されたファイルオープン対象のルーティング判断を確定する。実装は #347 で完了している。

### スコープ

- 対象: cold start のみ（`process.argv` から得た起動対象、Open With、EXE drop）。
- 非対象: runtime `second-instance` forwarding、macOS `open-file` event、既存ウィンドウへの focus / routing、instance registry、OS file association の登録、`.txt` サポート、encoding policy、standalone external Markdown の cross-process lock、hardlink 同一性検出、Recovery 再設計。これらは Future Work とする。

---

## Related ADRs

- **ADR-0008 Project File, Project Root, and Project-Local Recovery Layout** — project root / project boundary / 複数 `.pergamum` 許容 / lock 単位 = project root を**前提として使用する**（変更しない）。ADR-0008 が follow-up へ先送りした「Startup file open / `.pergamum` argv handling」および Open Folder ambiguity の **cold-start 部分**を本 ADR が確定する。複数 `.pergamum` の扱いは ADR-0008 §Open Folder behavior と同じ方針（黙って 1 つを選ばない）に従う。
- **ADR-0009 Working Copy Persistence and Recovery Model** — 本 ADR は Recovery の契約を**変更しない**。起動時ルーティングは Recovery snapshot の分類・claim・順序を変更しない。現行の Recovery restore 挙動（`.recovered[-N].md` sidecar 作成 + 2 フェーズ finalize。ADR-0009 §実装状況）は不変。dialog の提示タイミングについては本 ADR §Implementation notes を参照（規範ではない）。multi-instance 環境での Recovery owner に関する既知の限界は KNOWN-3 に記す。
- **ADR-0004 本文非破壊原則** — 「project-owned Markdown を standalone writable にフォールバックしない」の根拠。
- **ADR-0000 アクセシビリティと包摂的インタラクションの原則** — 拒否理由を user-visible にする（STARTUP-7）根拠。
- **ADR-0007 Recovery and Runtime Coordination** — multi-instance separation を弱めない前提として参照。

---

## Definitions

本 ADR で用いる Markdown document の種別を次のとおり定義する。これらは Window context（後述）とは独立した軸である。

**Project Document**

Pergamum project root 配下に属し、project document discovery / File Explorer / project-open lifecycle / read-only project policy の対象になる Markdown document。

**External File Document**

enclosing Pergamum project が無い、または project document として扱われない、独立した Markdown file document。Project Document ではなく、File Explorer / project document registry の対象外。

ただし **startup file-open routing では、project-owned Markdown を External File Document に fallback してはならない**（LOCK-STARTUP-1）。

**Untitled Document**

まだ file path を持たない一時的な Markdown document。**Startup file-open routing の対象ではない**（`process.argv` / Open With / EXE drop は必ず path を伴う）。

### Window context と Document kind は別軸である

- **Project Window Context** は Project Document / External File Document / Untitled Document を含みうる。
- **Projectless Window Context** は External File Document / Untitled Document を含みうる。

すなわち「project window にいるか」と「開いている document がどの kind か」は別の判断軸であり、本 ADR の routing 判断は Document kind 側を決める。

---

## Decision

### 安全不変条件

以下は #347 で導入した安全不変条件であり、本 ADR で正式化する。

**LOCK-STARTUP-1. project-owned Markdown を起動時に standalone writable として開いてはならない。**

起動引数 / Open With / EXE drop で渡された Markdown file が Pergamum project 配下にある場合、standalone writable document として開いてはならない。

**LOCK-STARTUP-2. enclosing project discovery が成功したら、routing は project-open lifecycle を経由しなければならない。**

**LOCK-STARTUP-3. enclosing project が別の live process によって lock されている場合、起動時 Markdown open は拒否するか、明示的なポリシーで read-only として扱わなければならない。**

standalone writable へ暗黙にフォールバックしてはならない。

**LOCK-STARTUP-4. enclosing project discovery が曖昧、または安全に関わる理由で失敗した場合、起動時 Markdown open は安全に拒否しなければならない。**

**LOCK-STARTUP-5. 起動時のファイルオープン対象は local filesystem path でなければならない。URL であってはならない。**

### 入力とパスの分類

**PATH-1. URL-like 入力は拒否する。**

`scheme://authority/...` 形式、および slash より前に `:` を持つ bare scheme（`mailto:`、`about:`、独自プロトコル等）を URL-like とみなし、local file path として扱わない。

**PATH-2. Windows drive path・UNC path・POSIX absolute path は local path であり、URL-like ではない。**

`C:\...` / `C:/...` / bare `C:`、`\\server\share\...`、`/abs/...` はすべて local path として受理する。

**PATH-3. 対象は存在する通常ファイルでなければならない。**

`stat` で確認する。ディレクトリ、存在しないパス、通常ファイル以外は拒否する。

**PATH-4. symlink は enclosing-project discovery の前に `realpath` で解決する。**

`realpath` の役割は**安全性の根拠**である。分類のうち enclosing-project discovery（project-owned か否かの判定）と、開くファイルの選択は、**実体パス**に対して行う。これにより、project 外に置かれた symlink が project-owned Markdown を指していても project-owned として扱われる（LOCK-STARTUP-1）。`realpath` が解決できない場合（broken symlink 等）は安全に拒否する（notFound / discoveryFailed）。

**PATH-5. 拡張子 allowlist は「ユーザーが指定した入口パスの名前」に適用する。symlink の実体パス側の拡張子は検証しない。**

拡張子は**ユーザー意図の分類ヒント**であり、content / encoding safety を保証するものではない。したがって PATH-4（実体パス基準の discovery = 安全性の根拠）と PATH-5（入口名基準の拡張子判定 = 意図の分類）は**目的が異なるため意図的に非対称**であり、矛盾ではない。

- `chapter-link.md`（実体名が異なっても）は `.md` 対象として STARTUP-1 の allowlist を通す。
- `foo.md -> bar.txt` のように実体側が非対応拡張子でも、実体拡張子では拒否しない（KNOWN-2）。
- `.md` 拡張子であっても中身が Shift_JIS / 壊れた UTF-8 / バイナリである可能性はある。content / encoding の妥当性検証は本 ADR の範囲外であり、**v0.9 の text encoding policy** が扱う。

### ルーティング

**STARTUP-1. 起動時 Markdown が受理する拡張子は `.md` / `.markdown` のみ。**

`.txt`、`.mdown`、`.mkd`、拡張子なし、未知の拡張子は unsupported として拒否する。`.txt` は v0.9 の `.txt` / encoding policy が定義されるまで unsupported を維持する（ADR-0008 §Markdown / plain text / extension policy と整合。ここではさらに startup に限って範囲を狭める）。

**STARTUP-2. enclosing project が無い場合、External File Document として開く。**

project がその Markdown を所有しないため、standalone で開いてよい（Case A）。

**STARTUP-3. enclosing project が見つかった場合、その project へ昇格する。**

最近接の祖先ディレクトリで、ちょうど 1 つの `.pergamum` を含むものを enclosing project root とする。その `.pergamum` project を**既存の project-open lifecycle**で開き、その後 Markdown を **Project Document** として開く（standalone では開かない。LOCK-STARTUP-1 / 2）。

**STARTUP-4. enclosing project が lock されている場合、既存の read-only 確認 lifecycle を使用する。**

- read-only で開くことをユーザーが確認 → Markdown は **read-only Project Document** として開く。
- キャンセル → 何も開かない。
- open が致命的に失敗（lock setup failure / 回復不能なエラー）→ 何も開かない。失敗を報告する。
- いずれの場合も standalone writable にフォールバックしない（LOCK-STARTUP-3）。

**STARTUP-5. 最近接 enclosing root に複数の `.pergamum` がある場合は、曖昧として拒否する。**

これは**無効な project layout ではない**。ADR-0008 が明示的に許容している（バックアップ・コピー・退避・検証用 DB）。しかし起動時 routing は「どの `.pergamum` が active か」を一意に選べない（ADR-0008 に default project file の規則は無い）。したがって拒否し、該当する `.pergamum` を直接開くよう（または Pergamum 内でその Markdown を開くよう）ユーザーに促す。これは ADR-0008 §Open Folder behavior（黙って 1 つを選ばない）と同じ方針である。standalone writable として開いてはならない（LOCK-STARTUP-1 / 4）。

**STARTUP-6. 安全に関わる discovery 失敗は安全に拒否する。**

I/O error、permission error、読み取れない祖先ディレクトリ、解決できない symlink、その他の unsafe な入力の場合、安全に拒否する。standalone writable にフォールバックしない（LOCK-STARTUP-4）。

**STARTUP-7. 拒否された対象には user-visible な説明を提示する。**

拒否 dialog は info dialog（OK のみ）とする（ADR-0000）。dialog の提示タイミング・他 modal との衝突回避は §Implementation notes を参照（本 ADR の規範ではない）。

**STARTUP-8. URL-like な `.pergamum` 起動引数も拒否する。**

`path.resolve("https://.../x.pergamum")` は `.pergamum` 拡張子を持つ local path を生成してしまうため、`.pergamum` 直接起動の経路でも URL-like 判定（PATH-1 / PATH-2）を適用する。drive path / UNC path / POSIX absolute path の `.pergamum` は影響を受けない。

**STARTUP-9. enclosing project は開いたが、target Markdown を Project Document として解決できない場合、何も開かず safe failure / status を出す。**

project root 配下にあるが project document discovery / registry に含まれない Markdown（capture 直後の削除・置換等）が startup target になった場合、Pergamum は何も開かず safe failure / status を提示する。**External File Document / standalone writable へ fallback してはならない。** これは LOCK-STARTUP-1 / 2 の帰結である。

### 既知の限界

**KNOWN-1. hardlink 同一性は検出しない。**

1 つの inode を指す複数の hardlink のうち、一方が project-owned・他方が project 外から開かれる場合、`realpath` では区別できない（`realpath` は symlink を解決するが hardlink は解決対象ではない）。hardlink 同一性の検出には **filesystem identity 比較**が必要である（POSIX なら `dev` + `ino`、Windows なら file index 相当）。KNOWN-4 の standalone external Markdown cross-process lock は関連するが、**それ単体では hardlink 同一性を解決しない**。今回は実装しない known limitation とする。

**KNOWN-2. symlink の実体パス側の拡張子は検証しない。**

PATH-5 のとおり、拡張子 allowlist は入口名に対してのみ適用する。`foo.md -> bar.txt` のように実体が非対応拡張子の場合でも、この経路は塞がない。

- 理由: 拡張子は安全性の根拠ではなく、ユーザー意図の分類ヒントにすぎない。
- 実体拡張子で塞いでも、ユーザーが `bar.txt` を `bar.md` にリネームすれば同じ状況になる。
- `.md` でも中身が Shift_JIS / 壊れた UTF-8 / バイナリである可能性はある。
- この問題の本丸は拡張子ではなく、v0.9 で扱う text encoding policy である。したがってこの漏水箇所に個別対策を積まず、encoding policy 側で扱う。

**KNOWN-3. multi-instance 環境での Recovery owner に関する限界（read-only 別プロセス）。**

- multi-instance 環境では Recovery Store は first-come owner である。
- read-only confirmation（STARTUP-4）により 2 番目の process が起動した場合、その process は **Recovery nonOwner** である可能性がある。
- 本 ADR の project-owned Markdown は read-only Project Document として開かれるため、その文書自体の通常編集は制限される。
- ただし、同じ process / window で別の standalone / untitled dirty buffer を開いた場合、それらは Recovery 保護対象外になり得る。
- これは #347 / ADR-0010 では解決しない known limitation である。

**KNOWN-4. standalone external Markdown の cross-process lock は対象外。**

2 つのウィンドウが同じ外部 `.md` を開くケースは本 ADR の範囲外。

**KNOWN-5. 本 ADR は cold start のみを扱う。**

runtime `second-instance` / macOS `open-file` / 既存ウィンドウ focus / instance registry / OS file association 登録 / `.txt` / encoding policy / Recovery 再設計は範囲外（Future Work）。

---

## Implementation notes（non-normative）

以下は現行実装の記述であり、本 ADR の規範ではない。将来の実装変更を制約しない。

**dialog の並び順・modal 衝突回避。**

現行実装では、起動時ルーティングの rejection dialog（STARTUP-7）および read-only confirmation（STARTUP-4）を、cold-start restore の他の Error dialog と同じ **deferred-dialog idle boundary / modal gate** から提示することで modal 衝突を避けている。

- Recovery candidate dialog と startup rejection dialog / read-only confirmation の**絶対順序は、本 ADR では規範化しない**。
- Open With 操作への応答と Recovery dialog の望ましい UX 順序は、将来見直し可能とする。

**STARTUP-9 の現行挙動。**

renderer 側の launch-target routing（`routeMarkdownLaunchTargetNow` の enclosing-project scope）は、既に STARTUP-9 の挙動になっている。すなわち: enclosing project が開いていなければ何もしない / target を Project Document として解決できなければ `status.projectDocumentNotFound` を出す / fresh read が失敗しても同様に status を出すのみで、いずれの分岐にも standalone を開く経路が無い。本 ADR に伴うコード変更は不要である。

---

## Consequences

### Positive

- Phase 7-2 blocker（project-owned Markdown が 2 process から編集可能になる）を塞ぐ。
- 曖昧な複数 `.pergamum` の扱いが ADR-0008 §Open Folder behavior と一貫する。
- URL-like / symlink の扱いが `.pergamum` 直接起動と Markdown 起動で一貫する。
- lock された project の扱いに専用 dialog や lock owner metadata の schema 変更を導入せず、既存の read-only 確認 lifecycle を再利用する。
- 拡張子判定（意図の分類）と realpath discovery（安全性の根拠）の責務が分離され、拡張子が「安全性の証明」として誤用されない。

### Negative / Trade-offs

- `.md` symlink は実体ファイル（canonical path）で開かれる。link のパスが tab に出ると期待したユーザーには意外に映りうる（PATH-4）。
- symlink 実体側の拡張子は検証しないため、`foo.md -> bar.txt` は塞がれない（KNOWN-2）。content / encoding safety は encoding policy（v0.9）まで持ち越す。
- hardlink 同一性は依然として未検出（KNOWN-1）。
- multi-instance の read-only 起動 process では、同 window の standalone / untitled buffer が Recovery 保護外になり得る（KNOWN-3）。
- 単一の非 `.pergamum` positional 引数は、従来「黙って無視」だったものが拒否 dialog を出すようになる。Open With の誤操作に対するフィードバックとしては妥当だが、挙動変更である。

---

## Alternatives Considered

### lock された project 用に専用の hard-reject dialog を追加する

却下。#347 の issue 原文（Case C）は「拒否」を示唆していたが、LOCK-STARTUP-3 は「拒否 **または** 明示ポリシーによる read-only」を許容する。既存の read-only 確認 lifecycle を再利用する方がアプリ全体と一貫し、新規 dialog も lock owner metadata の schema 変更（`projectName` 追加等）も不要。専用 hard-reject は必要になれば別 issue で扱う。

### 複数 `.pergamum` のうち 1 つを heuristic で選ぶ（mtime 最新、名前一致 等）

却下。ADR-0008 に default project file の規則が無く、「黙って 1 つを選ばない」方針に反する。誤った project を開くと write lock は正しく検出されても project identity / name が誤る。

### 起動時 Markdown routing を renderer 側の scope 推定に任せる（従来方式の踏襲）

却下。renderer は「restore された project の scope 内か」しか見ておらず、別 project 配下の Markdown を standalone writable に落としていた。enclosing project discovery は main process で行い、lock-aware path に載せる必要がある。

### symlink を解決せず、指定パスのまま discovery する

却下。project 外に置かれた symlink が project-owned Markdown を指すケースで LOCK-STARTUP-1 を破る。`realpath` は ADR-0008 §Project boundary が既に「必要に応じて real path を解決」と述べている方針とも整合する。

### symlink の実体パス側の拡張子でも拒否する（`foo.md -> bar.txt` を塞ぐ）

却下。拡張子は content / encoding safety の根拠ではなく、ユーザー意図の分類ヒントにすぎない。実体拡張子で塞いでも rename で同じ状況になり、`.md` でも壊れた encoding / バイナリはあり得る。個別対策を積むより、v0.9 の text encoding policy で content / encoding 妥当性をまとめて扱う方が一貫する（KNOWN-2）。

---

## Future Work

- runtime `second-instance` / macOS `open-file` forwarding（起動済み process への転送）。
- 既存ウィンドウへの focus / routing、instance registry、open-document registry。
- OS file association の登録（installer）。
- standalone external Markdown の cross-process lock、および **filesystem identity 比較（POSIX `dev`+`ino` / Windows file index 相当）による hardlink 同一性検出**（KNOWN-1 / KNOWN-4）。
- `.txt` サポートと text encoding policy（v0.9）。content / encoding 妥当性検証（`.md` 拡張子だが Shift_JIS / 壊れた UTF-8 / バイナリ 等）はここで扱う（KNOWN-2）。
- multi-instance の Recovery nonOwner process における standalone / untitled buffer の保護（KNOWN-3）。

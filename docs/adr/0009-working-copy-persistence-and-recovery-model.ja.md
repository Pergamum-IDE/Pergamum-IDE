# ADR-0009: Working Copy Persistence and Recovery Model

**Status:** Accepted

**Date:** 2026-08-27

---

## Context

Phase 6 では Session persistence / Session restore / Recovery を実装する（roadmap Phase 6-2〜6-5）。

Pergamum には、永続化先の異なる 2 種類の編集可能な working copy が存在する。

```text
Markdown document
  persisted state = Markdown file（本文の正本）
  working copy    = editor 上の CurrentDocument

Glossary Entry
  persisted state = .pergamum 内の SQLite 行（保存済み Glossary の正本）
  working copy    = GlossaryEntryDraft
```

保存先は異なるが、

> persisted state にまだ反映されていない working copy を、
> 正常終了・異常終了の双方でどう保護し、
> 再起動後に persisted state と安全に照合するか

という Recovery の問題は共通している。

SQLite の transaction / journal による堅牢性は前提とするが、SQLite 自体が正常でも commit 前の working copy は失われる。Markdown も、save が走る前の editor 上の未保存変更は file には存在しない。

ADR-0006 は durable state categories を、ADR-0007 は recovery storage / identity / restore の非破壊・best-effort 方針を、ADR-0008 は `.pergamum` project file / project root / project-local layout を定義した。

ADR-0009 は、その上に **working copy 単位の Recovery 共通契約** を定義する。

- persisted state / working copy / Session の境界
- persisted baseline（present / absent）の意味と、fingerprint による baseline identity
- Save lifecycle と、それと論理的に分離された save-attempt lifecycle
- dirty 判定 semantics と、dirty 比較 / fingerprint が共有する semantic representation
- Recovery snapshot の best-effort capture / lifecycle
- 再起動後の reconciliation classification と、それと区別される terminal outcome
- multi-instance の namespace / provenance / exclusive claim
- Recovery store の障害時 semantics・payload / metadata integrity
- Glossary 固有の specialization

ADR-0009 は、Recovery snapshot の物理保存形式・directory layout・atomic write / checksum 実装・hash algorithm・instance liveness の物理方式・Recovery UI の具体デザイン・live Glossary save conflict の実装・Session persistence 本体を定義しない。これらは後続 Issue が所有する。

---

## Related ADRs

- **ADR-0000 Accessibility and Inclusive Interaction Principles** は、conflict / corrupt / Recovery unavailable のような状態が user-visible で、ユーザーを迷わせない diagnostics につながることを求める。
- **ADR-0002 Structured Project Data and Glossary Model** は、`pergamum.db` を structured project data の正本とし、`GlossaryEntry` / `GlossaryForm` model、UUIDv7、`none` / `unique` / `ambiguous` の非 silent 解決、snapshot が derived representation であることを定義する。ADR-0009 はこれを変更しない。
- **ADR-0004 本文非破壊原則** は、Pergamum が本文・ユーザー入力を暗黙に正規化・置換しないことを求める。ADR-0009 の dirty 比較 normalization はこの原則に従い、保存内容を書き換えない。
- **ADR-0006 Durable State Categories and Settings Architecture** は、`session` と `recovery` が別カテゴリであること、recovery が app userData-side の dedicated store に属し generic settings table に入れてはならないことを定義する。ADR-0009 はこの category 境界に依存する。
- **ADR-0007 Recovery and Runtime Coordination** は、recovery record が独立した `recoveryId` を持つこと、project name / path を primary identity にしないこと、restore が explicit / 非破壊であること、複数 candidate は自動選択しないこと、retention / deletion policy が必要なこと、multi-instance で recovery を分離すること、cloud-sync が対象外であることを定義する。ADR-0009 はこれらを working copy 単位の contract として具体化する。
- **ADR-0008 Project File, Project Root, and Project-Local Recovery Layout** は、`.pergamum` project file、project root、`.pergamum_recovery/` を定義する。ADR-0009 は working-copy Recovery を app userData-side の専用 store に置くため、`.pergamum_recovery/` を working-copy Recovery の保存先とする ADR-0008 の判断を **部分的に supersede する**（本 ADR §「ADR-0008 との関係（partial supersession）」S-67）。ADR-0008 の Project File / Project Root 等の他の判断は変更しない。

---

## Relationship to ADR-0006 / ADR-0007

**RA-1. ADR-0009 は ADR-0006 の state categories と ADR-0007 の recovery 方針に依存する。**

ADR-0009 は settings architecture / state categories を再定義しない。ADR-0007 の recovery identity / non-destructive restore / multi-instance separation を前提とし、それを working copy 単位の persistence / reconciliation contract として定義する。ADR-0009 は multi-instance support を single-instance 前提へ後退させない。

---

## Terminology

```text
Persisted State
  ユーザーが正常に保存した正本。Markdown なら on-disk の Markdown file、
  Glossary なら .pergamum 内の Entry / Form 行。

Working Copy
  persisted state から load / 新規作成された後、編集され得る mutable な表現。
  Markdown なら CurrentDocument（content + line-ending 情報）、Glossary なら GlossaryEntryDraft。

Persisted Baseline
  working copy が同期している persisted state。値域は { present(fingerprint), absent }（S-16）。
  present は「working copy が load された、または最後の acknowledged save/create で
  同期された persisted state の fingerprint」。absent は「persisted target がまだ成立していない」。
  Recovery snapshot を取得した時点ではない。

semantic representation
  working copy / persisted state の意味状態を deterministic に表す正規形。
  dirty 比較と fingerprint 計算は同一の semantic representation 定義に依存する（S-33）。

fingerprint
  semantic representation を serialize した canonical persisted representation に対する
  collision-resistant な要約値。hash algorithm と byte 仕様は後続 Issue で決定する。

baselineFingerprint
  active persisted baseline の fingerprint（baseline absent なら値なし）。

saveAttemptFingerprint (SAF)
  ある save attempt が persisted state へ書き込む immutable payload の fingerprint。
  persist 開始前に durable 記録する（S-22）。

recoveryPayloadFingerprint (RPF)
  ある Recovery snapshot が保持する working copy payload の fingerprint。
  snapshot payload 自身の integrity 検証にも用いる（S-58）。

save-attempt state
  1 つの persist / save attempt の状態（S-26）。token / SAF / target identity / attempt baseline と、
  result ∈ { prepared, in-flight, acknowledged-success, acknowledged-failure,
             unresolved-after-termination }。

Recovery Snapshot
  未反映 working copy の payload + RPF + active baseline / provenance
  + owner / target identity + reconciliation-critical metadata。
  app userData-side の専用 Recovery store に置く。

instanceRunId
  1 つの application process / run を一意に識別する値（ADR-0007 の appInstanceId に対応）。

originInstanceRunId
  Recovery snapshot を生成した run。immutable な provenance。write 権ではない（S-54）。

namespace
  Recovery store 内の logical / physical partitioning（origin bucket）。write 権そのものではない（S-14）。

current exclusive claim
  ある Recovery snapshot を変更（restore / replace / discard / cleanup）できる唯一の write authorization（S-14, S-53）。

Reconciliation
  Recovery snapshot と現在の persisted state を working copy 単位で照合し classification を与える処理（S-42〜S-46）。

Terminal outcome
  Recovery snapshot の lifecycle を終了させる、ユーザー操作または確定遷移（S-40）。classification とは別概念。
```

---

## Decision

### 境界: Persisted State / Working Copy / Session

**S-1. persisted state と working copy を分離する。**

persisted state は正本、working copy は編集され得る派生表現であり、両者を同一の in-memory 表現へ融合してはならない。Markdown の working copy は編集中の editor 内容であって file bytes ではない。Glossary の working copy は `GlossaryEntryDraft` であって `.pergamum` の行ではない。

**S-2. persisted state を working copy から無条件に更新してはならない。**

working copy の内容が persisted state になるのは、Save lifecycle（S-24〜S-30）を経た場合に限る。

**S-3. Glossary DB は保存済み Glossary 情報の source of truth である。**

`.pergamum` 内の Glossary 行が保存済み Glossary の正本であり、Recovery snapshot / Session / derived snapshot はいずれも正本ではない。

**S-4. Session・Recovery・Persisted State は別責務であり、混在させてはならない。**

```text
Persisted State = ユーザーが正常に保存した正本
Session         = 何を開いていたか。editor / document / entry の identity と navigation / UI 復元状態。
Recovery        = persisted state に反映されていない working copy payload
                  + baseline を識別する情報 + reconciliation metadata
```

**S-5. Session に dirty working copy の本文・draft 全体を格納してはならない。**

Session state に Markdown の未保存本文や `GlossaryEntryDraft` 全体を埋め込んではならない。Session が保持してよいのは identity と navigation / UI 復元状態のみである。未保存 working copy の内容は Recovery の責務であり、Recovery store にのみ置く。

**S-6. Session が存在しないことだけを理由に Recovery を破棄してはならない。**

Session state が missing / corrupt / 未復元でも、対応する Recovery snapshot は独立して保持し reconciliation 対象とする。

**S-7. Recovery は best-effort の保護であり、persisted state の正本でも、その保存より上位でもない。**

Recovery は persisted state を無条件に上書きしない（S-64）。Recovery store への記録・capture が失敗しても、ユーザーが明示的に行う本体 Save 自体を必ず禁止する設計にはしない（S-22, S-60）。ADR-0009 は「必ず Recovery できる」という絶対保証を作らない（S-36）。

### Recovery store の責務と配置

**S-8. Recovery data は application userData 側の専用 Recovery store にのみ置く。**

Recovery data を以下に格納してはならない。

- Project DB（`.pergamum` / 旧 `pergamum.db`）
- project-local file（`pergamum.json`、project root 配下の任意 file、`.pergamum_recovery/` を含む）
- Settings store（`settings.json` / `pergamum.json` の `"settings"` section）
- Session store
- generic settings table

Recovery data は ADR-0006 S-6 の "app userData-side dedicated recovery store/table" に置く。

**S-9. persisted state と Recovery を同一 failure domain に置かない。**

Project DB / project file が破損・欠損・移動・アクセス不能になっても Recovery を独立して保持し reconciliation 可能にするためである。Recovery を Project DB や project-local file に置くと、persisted state を失う障害が Recovery も同時に失わせ、Recovery の目的に反する。

**S-10. 1 つの Recovery store が複数 project・standalone・untitled の Recovery を保持する。**

### Reconciliation 単位と identity

**S-11. Recovery の persistence / reconciliation 単位は個々の working copy である。**

単位は Markdown document なら 1 document、Glossary なら 1 Entry draft とする。各 Recovery snapshot は他と独立して classification / reconciliation できなければならない。UI 上でどうまとめて提示するかは後続 Recovery UI Issue が決める。

**S-12. 各 Recovery snapshot は reconciliation に必要な owner / target identity を持つ。**

```text
project-scoped Markdown          → projectId + document identity（canonical project-relative path）
Glossary Entry                   → projectId + entry identity（entryId, UUIDv7）
standalone / external Markdown    → persisted target identity（canonical absolute path。volume / host hint 可）
untitled Markdown                → application-local working-copy identity（opaque id）。target-state = absent
新規（pre-persist）Glossary draft → application-local working-copy identity（opaque id）+「project P の新規 entry」。target-state = absent
```

`projectId` は ADR-0008 の `metadata.project_id` を用いる。project name / project root フォルダ名 / `.pergamum` file 名を identity にしてはならない（ADR-0007 R-4、ADR-0008）。

**S-13. Recovery identity と persisted target identity を同一視してはならない。**

同一 persisted target を複数 instance / 複数 working copy が参照していても、それぞれ独立した Recovery snapshot として保持できなければならない（ADR-0007 R-4）。各 snapshot は独自の record identity（`recoveryId`）を持つ。

**S-14. write authorization は current exclusive claim を唯一の正とする。namespace と originInstanceRunId は write 権ではない。**

- `namespace` は Recovery store 内の logical / physical partitioning（origin bucket）であり、それ自体が write authorization ではない。
- `originInstanceRunId` は snapshot を生成した run を表す immutable な provenance であり、write permission ではない。claim が別 instance へ移っても変化しない。
- snapshot 生成時、`originInstanceRunId` はその生成 namespace と整合する。別 instance が claim した後は、namespace ではなく claim（S-53〜S-56）が write を authorize する。
- recorded な claim transfer で説明できない namespace / `originInstanceRunId` の不整合は、ownership unverifiable の signal として扱う（S-56, S-59）。`instanceRunId` を単に二重保存するだけの曖昧な状態にしてはならない。

### persisted baseline と fingerprint

**S-15. persisted baseline は、working copy が同期している persisted state を指し、Recovery snapshot 取得時点を指さない。**

連続する capture（snapshot A, B, …）はすべて同じ baseline を持つ。

**S-16. persisted baseline の値域は { present(fingerprint), absent } である。**

- `absent` は「persisted target がまだ成立していない」working copy を表す。untitled Markdown、pre-persist Glossary draft、unresolved Recovery を「新規」として復元した working copy が該当する。
- `absent` は「空 file」「空 persisted state」と同義ではない。baseline absent の working copy を、勝手に空 persisted state へ rebase してはならない。
- baseline が absent → present に遷移するのは、first successful + acknowledged Save / Create の時だけである（S-17）。
- baseline absent の working copy に対しても Recovery は保持でき、restore 時に persisted target を勝手に作ってはならない（ADR-0007 R-7、S-49）。

**S-17. baseline を更新するのは、新しい persisted state が成立し、application がその成功を acknowledged で確認した場合に限る。**

save request 発行時点、persist 処理中、commit 成功だが acknowledgement 未受信の時点では baseline を更新してはならない。

**S-18. semantic correctness / 同一性判定の第一機構は fingerprint である。**

baseline identity・reconciliation の同一性判定は fingerprint を正とする。file mtime / size / `updated_at` は advisory hint に限り、「同一性の証明」に用いてはならない。

**S-19. Recovery metadata は次の 3 fingerprint を概念上明示して保持する。**

```text
baselineFingerprint       active persisted baseline の fingerprint（absent なら値なし）
saveAttemptFingerprint     save attempt が書き込む immutable payload の fingerprint（S-22 で durable 記録）
recoveryPayloadFingerprint この snapshot が保持する working copy payload の fingerprint
```

`saveAttemptFingerprint` と `recoveryPayloadFingerprint` は独立した値である。save 開始後に発生した編集は `recoveryPayloadFingerprint` を更新するが `saveAttemptFingerprint` は更新しない。両者を混同してはならない（S-28, S-30, S-43）。

**S-20. timestamp 単独を baseline identity としてはならない。**

`updated_at` / file mtime のみでは「commit 済み・acknowledgement 未受信」と「persisted state が別経路で変化」を判別できない。timestamp は clock skew・filesystem 粒度・外部ツールの書き換えの影響を受ける。advisory hint / diagnostics に限って用いる。

**S-21. monotonically increasing revision は baseline identity の必須要件としない。**

現行 schema に revision 列は無く、file-backed Markdown に対応物が無い。`glossary_entries.updated_at` は ms 精度で monotonic な per-row counter ではない。identity は fingerprint による。Glossary schema への monotonic `revision` 追加は有用な将来拡張だが必須ではない。

**S-22. persist operation 開始前に、その save attempt と、その時点の working copy を事後照合できる durable Recovery state が存在しなければならない。**

順序を次に固定する。

```text
1. save 対象の immutable payload を確定する
2. 次を、互いに整合した recoverable state として durable にする:
     - その時点の最新 working-copy payload
     - recoveryPayloadFingerprint
     - baselineFingerprint（baseline present の場合）
     - saveAttemptFingerprint
     - saveAttemptToken / correlation metadata
     - target identity
3. persisted state への persist / commit を開始する
4. acknowledgement（success または failure）を受信する
5. S-28 / S-29 に従って save-attempt state を確定し、baseline / dirty / snapshot を再評価する
```

- 手順 2 は、metadata だけでなく、その時点の working-copy payload も含む。debounce 未発火などで snapshot が未作成 / 一世代古い場合でも、persist 開始時点で最新 working copy を事後照合できる durable state を要求する。
- 物理的に一回の write / atomic record である必要はない。物理形式・atomic write 方式は後続 Issue とする。論理的不変条件のみを固定する。
- 手順 2 の失敗（Recovery state write failure）時の semantics: Recovery protection が成立しているように見せない／ユーザーが確実に認識できる warning / error を出す（S-60）／ユーザーが本体 Save を続行することは許容する。ただしその場合、次回 reconciliation で残存 snapshot の関係を証拠だけで一意確定できず `already persisted` ではなく `conflict` に degrade しうる（S-46）。silent rollback には決してならない（S-30）。

**S-23. fingerprint 計算と reconciliation は、editor input critical path / startup critical path を不必要に同期 blocking してはならない。**

semantic correctness は fingerprint を正とする（S-18）。全文 hash 等の計算は async scheduling / worker / streaming hash / hint による fast-path で critical path 外に置く。具体方式は後続 Issue とする。

### Save lifecycle と save-attempt lifecycle

**S-24. save lifecycle の状態と遷移を次に固定する。**

```text
clean
  | edit event
  v
semantic comparison
  |（same）           |（different）
  v                   v
clean               dirty
                      | save request
                      v
                    saving（unresolved save attempt が 1 つ存在。S-25, S-26）
                    /                          \
       acknowledged-success                acknowledged-failure
                    |                          |
       baseline := 成立 payload             baseline 不変
       + working copy を再評価（S-28）      + dirty 維持 + payload 保持（S-29）
```

`edited` は状態ではなくイベントである。現行実装の `saveFailed` は UI 上の dirty のサブ状態として扱う（baseline 不変、再 save 可能）。現行実装 `saveInFlightGuard` は save を直列化しており、本 ADR の S-25 と整合する。

**S-25. 同一 working copy について、結果未確定（unresolved）の persist / save attempt は同時に高々 1 つとする。**

- 後続の Save request は serialize / queue / 既存 attempt の resolve 後に開始する、のいずれかで扱う。
- 同一 working copy に対して複数の persist operation を並列実行してはならない。
- Phase 6 では複数 in-flight save attempt を表現するモデルへ拡張しない。具体的な queue / UI 実装は後続 Issue とする。

**S-26. save-attempt state を Recovery payload state と論理的に分離してモデル化する。**

```text
save-attempt state:
  saveAttemptToken        working copy と相関づける opaque identifier
  saveAttemptFingerprint  確定した immutable payload の fingerprint
  target identity         書き込み先
  attempt baseline        attempt 開始時点の baselineFingerprint（present / absent）
  result:
    prepared                    S-22 手順 2 完了、persist 未開始
    in-flight                   persist / commit 実行中
    acknowledged-success        成功の acknowledgement を受信（S-28）
    acknowledged-failure        失敗の acknowledgement を受信（S-29）
    unresolved-after-termination result 未確定のまま owning run が終了。終了 run が書く
                                persisted state ではなく、次の run が導出する論理状態でもある（下記）
```

物理ファイル / record を Recovery payload と分割する必要はない。分離するのは論理 lifecycle である。

`unresolved-after-termination` は「終了する process が必ず durable に書き込む状態」ではない。crash / OS shutdown / 電源断では終了 run 自身が書けない。次の application run は、durable metadata と ownership / liveness 情報から次のようにこの状態を導出する。

```text
durable な save-attempt result が prepared または in-flight
  （acknowledged-success / acknowledged-failure の durable result が無い）
  AND owning run が relinquished または abandoned / confirmed-dead（S-56）
    → その save attempt を unresolved-after-termination として扱う
```

normal shutdown 時に明示的にこの状態へ遷移・flush する実装は許容する。ただし crash 時にも同じ semantics を導出できなければならない。物理 liveness 判定方式は後続 Issue とする。

**S-27. unresolved save attempt の retire lifecycle を閉じる。**

**`retire` は物理削除ではなく、その attempt を active unresolved correlation から外すことである。** retire 後も metadata を historical / provenance-only として保持してよい。ただし **retire 済み attempt は必ず** 次を満たす。

- reconciliation の `corr` 判定に使用しない。
- `already persisted` 判定に使用しない。
- S-25 の unresolved-attempt slot を占有しない。
- 後続 Save を block しない。

`corr`（active correlation）は「過去に save を試したことがある」ではなく、「**durable に記録され、かつ現在も unresolved（＝未 retire）な** save attempt との correlation が成立する」ことを意味する。

Recovery payload の cleanup（S-38 semantic clean 復帰 / S-40 terminal outcome）は、それ単独では attempt を retire しない。両者は別操作である。

**この S-27 が save-attempt retirement 条件の canonical / complete list である。** 他 statement（S-40 等）は retirement を再列挙せず、本 statement を参照する。

attempt を retire する条件を次に完全列挙する。

1. **acknowledged-success** の安全な transition 完了時（S-28）。
2. **acknowledged-failure** の安全な transition 完了時（S-29）。
3. reconciliation で **`already persisted` confirmed** に達したとき（S-43）。
4. reconciliation で **`persisted-equivalent (no-op cleanup)`** により Recovery lifecycle を terminal cleanup するとき（S-44 / S-45 手順 4b）。
5. reconciliation の **`safe restore`（baseline advanced / unchanged / absent いずれも）がユーザーによって明示確定され、restore 後の working copy が active lifecycle を開始したとき**（S-45, S-49）。詳細は下記。
6. **`conflict`** に対してユーザーが明示的な解決を確定したとき（Recovery を restore する、current persisted state を採用して Recovery を discard する、その他本 ADR が terminal outcome と認める明示判断。S-40, S-50）。この "restore" は claim を伴う通常操作であり、S-56 の claim-free read-only salvage extraction とは別物である。
7. **explicit discard / abandonment** により Recovery lifecycle が terminal outcome に達したとき（S-40）。

次は terminal resolution ではないため、active unresolved attempt を勝手に retire してはならない: `deferred` / `unresolved` / `corrupt` / `ownership unverifiable`、`conflict` の判断保留、**`safe restore` の判断保留・キャンセル**（snapshot 保持・attempt active のまま）。S-56 の claim-free read-only salvage extraction も retire ではない（original attempt は active のまま）。

「attempt の commit result を因果的に確定できた」ことと、「Recovery lifecycle 上、その古い attempt を今後 active correlation として扱う必要がなくなった」ことは別である。例えば `conflict` や `safe restore (baseline unchanged / absent)` をユーザーが明示解決した場合、過去 attempt の commit result は unknown のままでよい（failure と断定してはならない）。その場合は provenance-only へ retire し、未来の `corr` / `already persisted` 判定には参加させない。

**条件 5（safe restore 確定時の retirement）の詳細。** `safe restore` は classification された瞬間には terminal ではない。`safe restore classification → ユーザーが restore を明示確定 → original Recovery lifecycle 終了 → restored working copy が新しい active lifecycle を開始 → old unresolved save attempt を retire` の順で進む。restore 後は次を満たす。

- **baseline advanced**（例: `corr` true, `SAF == P`, `RPF != P`）: persist attempt の payload が current persisted state に着地していることを fingerprint で確認済み。restore 確定後、baseline := P、recovered payload を dirty working copy として active lifecycle へ移す、old attempt を retire（SAF / token は provenance-only 保持可、future `corr` / `already persisted` 不参加）、S-25 slot を解放、subsequent Save を許可。因果的 ACK は失われているが reconciliation に必要な state-equivalence は確認済み。
- **baseline unchanged**（`P == BF`）: persisted state は old baseline のまま。unresolved attempt の commit result 自体が不明でも、ユーザーが restore を確定して新しい active working-copy lifecycle を開始した時点で、old attempt を future active correlation として保持する意味はない。old attempt を provenance-only へ retire、future `corr` 不参加、S-25 slot を解放、restore 後の dirty working copy は新 lifecycle として Save 可能。
- **baseline absent**（target-state = absent での restore 確定）: baseline absent の recovered working copy を active lifecycle へ移す、old unresolved attempt を provenance-only へ retire、future `corr` 不参加、S-25 slot を解放、subsequent Save / Create を許可。attempt の commit result を "failure" と断定しない。

restore を延期・キャンセルした場合は snapshot 保持・attempt active のまま・retire しない。

**S-28. acknowledged-success の扱い。saved + acknowledged はそれだけでは必ずしも terminal outcome ではない。**

```text
acknowledged-success（payload = A）
  1. acknowledged persisted payload A を新 baseline として評価可能にする
     （baseline := fingerprint(A)。baseline absent だった場合は present へ遷移）
  2. current working copy を新 baseline A に対して semantic 再評価する:
       - semantic-equivalent かつ未保存 working-copy state が残らない
             → clean。Recovery lifecycle を終了してよい（terminal cleanup。S-40）。
       - 異なる（save 開始後の post-save edit が存在する）
             → dirty を維持。Recovery payload を保持。active baseline は A へ前進。
               S-24 の lifecycle を新しい baseline で継続する。terminal ではない。
  3. 新 baseline + current payload / RPF + 2. の再評価結果を recoverable state として durable にする
  4. その protection を確認してから、unresolved save-attempt correlation を最終的に retire する（S-27）
```

acknowledged-success だけを理由に clean 化・snapshot 破棄・lifecycle 終了をしてはならない。

**durability ordering**: unresolved save-attempt correlation の retire（手順 4）は、手順 3 の durable protection を確認した後に行う。transition の途中で crash しても、少なくとも次のどちらかから安全に reconciliation できなければならない。

```text
A. 旧 unresolved save-attempt metadata（SAF / token / attempt baseline）
B. 新 baseline + current Recovery payload（RPF）+ dirty-clean 再評価結果
```

「橋を渡り切る前に旧 save-attempt provenance を焼かない」。物理 atomic write / transaction / file format は本 ADR で決定しない。

**S-29. acknowledged-failure の扱い。**

```text
acknowledged-failure（payload = A）
  - baseline は更新しない
  - working copy は dirty のまま
  - Recovery payload は保持
  - Recovery payload / baseline protection が維持されていることを確認してから、
    この save attempt の active / unresolved correlation を retire する
```

retire した failed save attempt の `saveAttemptFingerprint` / `saveAttemptToken` を、以後の `already persisted` 判定に用いてはならない（S-27, S-43）。

**S-30. commit 成功・acknowledgement 未受信・終了のケースを必須対応とし、save 開始後の編集を save の成功によって clean / persisted 扱いしてはならない。**

```text
save request → persist / commit 成功 → Renderer が acknowledgement を受信できない → application 終了
```

この場合 save-attempt state は `unresolved-after-termination` となる。再起動時の reconciliation は次を安全に判定できなければならない。

```text
persisted == SAF AND RPF == SAF
    → save attempt の payload は already persisted（S-43）。snapshot は破棄してよい。

persisted == SAF AND RPF != SAF
    → save attempt 自体は persisted 済みだが、その後の未保存 working-copy edit が存在する。
      Recovery payload を破棄してはならない。baseline を save attempt の結果へ前進させた
      "safe restore (baseline advanced)" として扱う（S-45 手順 5）。
```

正常に保存済みの persisted state を、古い Recovery によって silent に巻き戻してはならない。

### dirty semantics と semantic representation

**S-31. dirty は「edit event の履歴」ではなく「現在の working copy と persisted baseline の意味状態が異なること」と定義する。**

- 編集後に baseline と同じ意味状態へ戻った working copy は clean である。`edited` は状態ではなくイベントである。
- baseline present の場合、比較対象は persisted baseline の semantic representation である。
- baseline absent の場合、比較対象は working-copy 種別ごとに定義された「初期 / 空の working-copy 内容」とする。untouched untitled（初期テンプレート内容のまま）や untouched pre-persist draft（意味のある入力が無い）は dirty ではなく、Recovery snapshot も要さない。意味のある編集が入った時点で dirty（baseline = absent のまま）となる。

**S-32. dirty 比較のための normalization は比較専用であり、保存内容を書き換えてはならない。**

比較用 normalization はユーザー入力（保存される値）を変更してはならない（ADR-0004）。Unicode 正規化・width folding・case folding・fuzzy 化を行わない。文字比較は codepoint 完全一致とする（ADR-0002 §6、ADR-0004）。

**S-33. working-copy 種別ごとに semantic representation は 1 つとし、dirty 比較と fingerprint の双方がそれに依存する。**

```text
dirty comparison = semanticRepresentation(working copy) vs semanticRepresentation(baseline)
fingerprint      = hash(serialize(semanticRepresentation(persisted state)))
```

比較用の構造表現と hash 用の byte serialization は技術詳細として分離してよいが、含める / 除く field と normalization 規則は同一の semantic representation 定義（S-34 / S-35）から導く。二箇所で別々に field set を定義してはならない。

**S-34. Markdown の semantic representation と canonical persisted serialization。**

現行 I/O pipeline（`markdownFileIo.ts` / `fileIpc.ts` / `projectIpc.ts`、2026-08-27 調査）は次のように動作する。

- **read**: bytes を UTF-8（`fatal`）で decode し、先頭 U+FEFF（BOM）があれば **除去** して `content` とする。`hadBom` は read metadata として renderer へ渡されるが、renderer は現在これを使用しない。
- **write**: `fs.writeFile(path, content, "utf8")`。BOM を再付与しない。`hadBom` を save に反映しない。
- encoding は `"utf8"` 固定。line ending は load 時に `"\n"` へ正規化し、per-break の種別を別途 track して save 時に `serializeLineEndings` で再構成する。save bytes を決める状態は line-ending 種別のみである。

したがって:

- Markdown の semantic representation は **正規化済み `content`（`"\n"` テキスト）** と **per-break の line-ending 種別集合** の 2 要素とする。line-ending 種別は保存バイト列を決めるため save semantics の一部である。
- **canonical persisted representation** は `serialize(content, line-ending 種別)` であり、現行 pipeline が実際に書き出す **BOM-less UTF-8 バイト列** に一致する。Markdown の persisted fingerprint は **この canonical persisted representation** に対して計算する。raw disk bytes ではない（BOM 付き file の raw bytes は Pergamum が書き戻すバイト列と一致しないため、raw bytes を fingerprint 入力にすると未編集の BOM file が直ちに conflict に見える）。
- dirty であるのは、`content` または line-ending 種別集合が、baseline の semantic representation と一致しない場合である。前後空白・空行・Unicode 表記の違いはすべて意味差分として扱う（暗黙 trim / 正規化なし）。
- **原則**: Markdown の semantic / persisted serialization model は、現行 save pipeline が保存・再現する byte-affecting state を一貫して扱う。現時点でそれは line-ending 種別のみである。BOM と非 UTF-8 encoding は現行 pipeline が保存・再現しないため semantic representation に含めない。将来の Issue が pipeline に BOM 保存や encoding 検出を追加する場合、その状態を同時に semantic representation と fingerprint 入力へ加える。BOM だけを場当たりで特別扱いしない。

**S-35. Glossary Entry の semantic representation と dirty。**

Glossary の semantic representation の field と比較 / normalization 規則を次に固定する。dirty 比較（`draft` vs `draft.entry`）も fingerprint（S-65）もこの定義を用いる。

| 対象 | 比較単位 | normalization | 順序 |
| ---- | -------- | ------------- | ---- |
| kind | enum 完全一致 | なし | - |
| description | 逐語完全一致（前後・行末の空白を含む） | なし（保存内容も trim しない） | - |
| canonical surface | trim 後の完全一致 | 比較 / serialize 時に trim（保存 semantics） | - |
| canonical match boundary start / end | enum 完全一致（`auto` / `strict` / `none`） | なし | - |
| non-canonical form 集合 | 正規化後の集合一致 | 各 form の surface を trim。trim 後 surface が空の行は semantic state から除外。`(relation, surface, warningPolicy, matchBoundaryStart, matchBoundaryEnd)` で決定的にソート | 順序は無意味 |
| form.surface | trim 後の完全一致 | trim | - |
| form.relation | enum 完全一致（`alias` / `variant`） | なし | - |
| form.warningPolicy | enum 完全一致（`default` / `ignore` / `warn`） | なし | - |
| form.match boundary start / end | enum 完全一致 | なし | - |
| form identifier（form id） | 除外（semantic state に含めない） | - | - |

確定した edge case:

- alias / form の順序は意味を持たない（集合比較）。
- description の末尾空白は差分である（逐語比較。暗黙 trim すると close 時に編集を silently 破棄しうるため。ADR-0004）。
- form を削除後に同一内容を再追加した場合、正規化後の集合が一致すれば clean（form id 差は無視）。
- local id ↔ 保存済み uuid の差は意味差分ではない。
- 空 surface の non-canonical form 行の追加は dirty ではない（semantic state から除外）。
- canonical surface の前後空白のみの変更は dirty ではない（trim して比較 / serialize）。

現行実装整合: 本 statement は `glossaryEntryDraft.ts` の `isGlossaryEntryDraftDirty` / `normalizeGlossaryFormsForComparison` を基礎とし、「空 surface form 行を semantic state から除外する」点のみ現行より厳密化する（現行は保存 input からのみ除外）。

### Recovery capture と snapshot lifecycle

**S-36. Recovery capture は best-effort である。**

- Recovery store が利用可能で、application が capture を実行可能な通常動作条件下では、dirty working copy に対して eventually capture を試み、成功させる。
- capture を完了できない場合、Recovery protection が成立したとみなしてはならず、S-60 の failure semantics に従う。
- ADR-0009 は「絶対に Recovery できる」という保証を作らない（S-7）。debounce 未発火中の crash など、未 flush 編集の損失はありうる。その window は debounce 時間で有界である。

**S-37. capture の trigger / lifecycle boundary は少なくとも次を含み、editor input critical path を阻害せず、save 開始時を唯一の capture point にしてはならない。**

- working copy が dirty になった後、非同期 debounce で capture する。
- 連続する編集は coalesce する。新しい capture は同一 working copy の pending capture / 既存 snapshot を論理的に置き換える（S-39）。
- active editor / tab / project context の変更時。
- application の正常終了時。
- persist 開始前（S-22 手順 2 が最新 working-copy payload を durable にする）。
- dirty working copy の live な ownership を失うその他の lifecycle boundary。

debounce 時間・atomic write の物理実装は後続 Issue とする。

**S-38. working copy が baseline と semantic-equivalent へ戻ったら snapshot を破棄する。ただし unresolved save attempt がある間は保留する。**

- 通常時: undo / 手動 revert 等で working copy が active baseline と意味的に等しくなったら、Recovery snapshot を破棄し pending capture を取り消す。これは lifecycle 遷移であり、再起動後 reconciliation の stale 後始末に依存してはならない。
- **gate**: その working copy に、resolve すれば baseline を変えうる unresolved save attempt が存在する間は、「現在の baseline と一致する」ことだけを理由に snapshot を破棄してはならない。現在の working copy を capture / 保持し、save attempt が確定（acknowledged-success / acknowledged-failure / reconciliation による解決）した後、確定した baseline に対して working copy を再評価し、その時点で clean / dirty と破棄可否を決定する。
- **capture 継続**: unresolved save attempt が存在すること自体は Recovery payload capture の停止理由ではない。gate による cleanup 保留中も、working copy の編集（post-save edit / Undo / Redo）に応じて RPF / payload capture を継続し、常に最新 working-copy state を現行 Recovery payload として保持する（S-37, S-39）。

**S-39. 同一 working copy に対する論理現行 Recovery snapshot は 1 つとする。**

継続する dirty edit による新しい capture は、同一 working copy の既存 snapshot を論理的に置き換える。置き換えられた旧世代を別の復元候補として扱わない。履歴型 / 版管理型 Recovery は将来の別機能とする。

**S-40. Recovery snapshot の lifecycle を終了させる terminal outcome を次に固定する。**

- **saved + acknowledged（再評価後 clean）**: acknowledged-success の後、S-28 の再評価で working copy が成立 payload と semantic-equivalent かつ未保存 working-copy state が残らない場合、snapshot を破棄する。再評価で post-save edit が残る場合は terminal ではなく、lifecycle を新 baseline で継続する。
- **already persisted confirmed**: reconciliation で `already persisted`（S-43）と確定した snapshot を、確定後に破棄する。Recovery history として保持しない。
- **persisted-equivalent (no-op cleanup)**: reconciliation-driven の terminal cleanup（S-44）。`already persisted` とは provenance が異なる（save attempt との相関を因果的に主張しない）。
- **returned to semantic clean**: S-38（gate を満たす場合）。
- **safe restore のユーザー明示確定**: `safe restore`（baseline advanced / unchanged / absent）が classification されたうえで、ユーザーが restore を明示確定し、restored working copy が新しい active lifecycle を開始したとき。classification された瞬間は terminal ではない。判断を延期・キャンセルした場合は snapshot 保持・非 terminal（S-41）。詳細は S-27 条件 5。
- **conflict のユーザー明示解決**: `conflict` に対してユーザーが Recovery を restore（claim を伴う通常操作）する、または current persisted state を採用して Recovery を discard する等の明示判断を確定したとき（S-50）。S-56 の claim-free read-only salvage extraction はこれに含まれない。
- **explicit discard / abandonment**: ユーザーが未保存変更または Recovery 内容を明示的に破棄した場合（dirty document を「保存せず閉じる」、dirty Glossary draft を明示破棄、Recovery UI で「復元しない / 破棄」を選択）、対応 snapshot を破棄する。

**terminal outcome に伴う save-attempt retirement は S-27 に従う（S-27 が retirement 条件の canonical list）。** 本 statement は retirement 条件を再列挙しない。

**S-41. 判断の延期は terminal outcome ではない。**

Recovery UI を閉じただけ、conflict の判断を保留、**`safe restore` の判断を保留・キャンセル**、persisted target が一時的に利用不能で判定できなかった、の各場合は破棄しない（snapshot 保持・相関 unresolved attempt は active のまま。S-27）。次回起動時にも reconciliation 可能な状態を維持する。orphan / unresolved snapshot（persisted target の削除・移動・利用不能で reconciliation を完了できないもの）も silently 破棄しない（S-46, S-62）。

### Reconciliation classification と判定手順

**S-42. reconciliation classification と terminal outcome を混同してはならない。Recovery store unavailable は store-level state であり、個別 classification の外である。**

```text
Reconciliation classifications（個別 snapshot + persisted state を観測して得る）:
  safe restore / already persisted / conflict / deferred / unresolved / corrupt
  内部 outcome: persisted-equivalent (no-op cleanup)  ※ UI category を増やさない

Terminal outcomes / terminal cleanup（S-40。伴う save-attempt retirement は S-27）:
  saved + acknowledged（再評価後 clean） / already persisted confirmed /
  persisted-equivalent (no-op cleanup) / returned to semantic clean /
  safe restore のユーザー明示確定 / conflict のユーザー明示解決 / explicit discard
```

- 内部 classification と UI category を同一視しない。`explicit discard` は classification ではなく terminal outcome である。
- **Recovery store 全体が unavailable の場合、そもそも個別 snapshot classification を行えない。** これは store-level state として扱い（S-57, S-60）、「Recovery が存在しない」とは扱わない。

**S-43. `already persisted` は、対応する save attempt との相関を確認できる場合に限定する。**

`already persisted` は、Pergamum の save operation が因果的に成功したことの証明ではない。**相関する save-attempt payload が現在の persisted state と（fingerprint 上）等価である**ことを表す。acknowledgement を受信できていなくても、この等価性を確認できれば、その payload はすでに persisted state に反映されているとみなす。

`already persisted` と判定してよいのは、次のすべてが成立する場合に限る。

- durable に記録され、かつ現在も unresolved な save attempt が、この working copy と相関づけられる（`saveAttemptToken` / target identity の一致）。retire 済み（acknowledged-failure）の attempt は用いない（S-29）。
- `saveAttemptFingerprint == fingerprint(current persisted state)`。
- `recoveryPayloadFingerprint == saveAttemptFingerprint`（save attempt 以降の編集が無い）。

相関を確認できない場合は `already persisted` としてはならない。3 番目が偽（save attempt 以降に編集がある）の場合は `already persisted` ではなく "safe restore (baseline advanced)"（S-45 手順 5）とする。

**S-44. `persisted-equivalent (no-op cleanup)` は provenance を断定しない。**

`fingerprint(current persisted state) == recoveryPayloadFingerprint` だが `already persisted`（S-43）の条件を満たさない場合。次のいずれも含む。

- 相関する unresolved save attempt が無い（外部 editor / 他 instance が偶然同一内容を書いた、または retire 済みの failed attempt しか無い）。
- 相関する unresolved save attempt はあるが `SAF != P`（S-45 手順 4b）。

いずれも Pergamum の追跡された save attempt によって persisted されたと因果的に確定はできない。

- 内容上は復元不要である。snapshot は破棄してよい（payload は persisted state 側に安全に存在する）。これは terminal cleanup（S-40）である。
- ただし `already persisted` と報告してはならない（provenance の偽り）。内部 outcome として `persisted-equivalent (no-op cleanup)` を記録する。
- この terminal cleanup と同時に、相関する unresolved save attempt があればそれを active correlation から retire する（S-27）。provenance-only として残してよい。`already persisted` と因果的に記録しない。

**S-45. reconciliation の判定手順を次に固定する。**

```text
入力:
  target-state = reconciliation 時点で観測した current persisted target state。
                 snapshot 作成時の静的属性ではなく runtime observation とする。
                 unresolved save attempt が durable target identity を持つ場合は、その identity に
                 ついて現在の persisted target 成立を確認してから決定する。
    ∈ { present, absent, unresolvable }
      present      = 現在 persisted target が存在する（P を取得して persisted comparison へ進む）
      absent       = 現在 persisted target が存在しない（untitled / pre-persist draft / "新規" 復元。
                     baseline absent だった working copy でも、Save/Create の commit-success /
                     ACK-lost で成立していれば present になる）
      unresolvable = existence / identity を安全に判定できない（削除 / 移動 / 媒体未接続 等）
  P    = fingerprint(current persisted state)          （target-state = present のときのみ）
  BF   = active baselineFingerprint（baseline absent なら値なし）
  SAF  = 現在も unresolved（未 retire）な save attempt の saveAttemptFingerprint（無ければ値なし）
  RPF  = recoveryPayloadFingerprint
  corr = durable に記録され、かつ現在 unresolved（未 retire）な save attempt との correlation が成立する

前段（保守的・非破壊優先）:
  0a. snapshot payload を parse できない                              → corrupt
  0b. parse できるが fingerprint(payload) != RPF                      → corrupt（integrity mismatch。S-58）
  0c. reconciliation-critical metadata が schema / 内部整合しない       → corrupt または ownership unverifiable（S-59）
  1.  reconciliation に必要な project / context が利用不能             → deferred
  2.  target-state = unresolvable                                     → unresolved

本判定:
  3.  target-state = absent
        → safe restore (baseline absent)。target を fabricate しない（S-49）。
  4.  RPF == P
        4a. corr かつ SAF == P   → already persisted（S-43）
        4b. それ以外              → persisted-equivalent (no-op cleanup)（S-44）。
                                   corr が true（SAF != P）の場合、この cleanup と同時に
                                   その attempt を active correlation から retire する（S-27）。
  5.  corr かつ SAF == P かつ RPF != P
        → safe restore (baseline advanced)。active baseline を P へ前進。payload 保持（S-30）。
  6.  BF != absent かつ P == BF
        → safe restore (baseline unchanged)。payload は未保存編集。
        （BF = absent の場合この branch は成立しない。absent を空 fingerprint / 特殊 hash として
          比較してはならない。他 branch に一致しなければ 7 へ進む。）
  7.  それ以外                    → conflict（S-46）
```

`safe restore (baseline unchanged)` と `safe restore (baseline advanced)` は同じ UI classification だが internal baseline handling が異なる。実装はこれを混同してはならない。

classification 後の snapshot 扱い:

- safe restore（いずれも）/ conflict / deferred / unresolved / corrupt → snapshot を保持。classification された瞬間は terminal ではない。`safe restore` / `conflict` はユーザーが restore / 解決を明示確定した時点で terminal outcome となり、そこで相関 unresolved attempt を retire する（S-27 条件 5 / 6、S-40）。判断保留・キャンセルなら snapshot 保持・attempt active のまま（S-41）。
- already persisted → 確定後に破棄（相関 attempt を retire。S-27 条件 3）。
- persisted-equivalent (no-op cleanup) → 破棄してよい（terminal cleanup）。`already persisted` として記録せず、相関 attempt があれば retire する（S-27 条件 4、S-44）。

**S-46. conflict / deferred / unresolved / corrupt は互いに別状態であり、`Recovery なし` と同一視してはならない。**

- `conflict` = Recovery payload / baseline / current persisted state の関係を、現在保持している証拠だけでは安全に一意確定できない、という保守的 classification である。外部 process / 外部 editor による persisted state の変更は原因候補の一つにすぎず、`conflict` は「外部変更が確認された」という因果的意味を持たない。Recovery metadata write failure 後に本体 Save を続行して相関情報を失った場合（S-22）なども `conflict` に含まれる。`conflict` の snapshot は保持し、explicit なユーザー判断を要求する（S-63, S-64）。
- `deferred` = reconciliation に必要な project / context が現在利用可能でない。対応 context が利用可能になるまで保持し、orphan / discard とみなさない。
- `unresolved` = reconciliation を試みる context はあるが target を解決できない。silently 破棄しない。例: 外部 Markdown が removable media 上にあり再起動時に媒体未接続の場合、「ファイルが存在しない」を即座に discard と解釈してはならない。
- `corrupt` = Recovery data 自体（payload の parse / integrity、または reconciliation-critical metadata の整合。S-58, S-59）を正常に扱えない。auto 正常化・上書き・削除をしてはならない（S-61）。

### New / deleted working copy

**S-47. Glossary の New / deleted ケースの判定を固定する。**

- **DB create 前の新規 `GlossaryEntryDraft`**: application-local working-copy identity（S-12）、baseline = absent。target-state は snapshot の静的属性ではなく reconciliation 時点の runtime observation である（S-45）。この pre-persist draft は現行実装に存在しない（現行は create を先に DB へ commit してから draft を開く）。本 ADR は契約のみ定め、pre-persist draft と client 相関可能な create identity / token（`saveAttemptToken`）の導入は後続 Issue とする。
- **create commit 成功後、Renderer acknowledgement 前の終了**: create attempt は `unresolved-after-termination`。再起動時、attempt の durable target identity（`saveAttemptToken` / client 生成 `entryId`）を使い **現在の persisted target 成立を runtime 観測**する（S-45）。target が現在存在すれば `target-state = present` として P を取得し persisted comparison へ進む（相関確認 + `RPF == SAF` で `already persisted`、post-create edit があれば "safe restore (baseline advanced)"）。「元々 absent だったから absent」として `absent` branch へ入り重複 Create してはならない。相関が heuristic にとどまる場合は自動適用せず explicit なユーザー確認を要求する。
- **Recovery snapshot が存在する Entry が DB 上で削除済み**: 現在状態としては target-state = unresolvable → `unresolved`。過去に save が成功していた場合、その provenance（過去の baseline 等）は保持してよいが、現在 target が存在しない以上 reconciliation の現在状態は `unresolved` である。silently 破棄しない。ユーザーは明示操作で新規 entry として復元できる（自動再作成なし）。
- **Entry delete と dirty draft の競合**: 削除は許容するが、その entry に対する open な dirty draft / pending Recovery が存在することを user-visible にする。削除は Recovery snapshot を silently 消さない。draft 側の Recovery は `unresolved` になる。

**S-48. Markdown の New / deleted ケースの判定を固定する。**

- **untitled document**: target-state = absent、baseline = absent。Session が無くても Recovery を保持する。restore は untitled working copy を再生成し、project path を勝手に作らず project へ silently 保存しない（ADR-0007 R-7、S-49）。
- **Recovery 後に元 file が削除・移動された場合**: target-state = unresolvable → `unresolved`。時間経過のみを理由に自動削除しない（S-62）。
- **project Markdown で project が閉じている場合**: `deferred`。
- **standalone Markdown で媒体が未接続の場合**: `unresolved`。

### Restore 後の semantics

**S-49. restore 後の dirty state / baseline / provenance。**

- restore した working copy は、内容が現在の persisted state と意味的に等しい場合を除き `dirty` として扱う。persisted state と異なる内容を復元した working copy を「保存済み」として扱ってはならない。
- **target-state = present** の restore: restore 後の active baseline identity は現在の persisted state の fingerprint とする（current persisted state へ rebase）。これにより以後の save の conflict 判定が意味を持つ。
- **target-state = absent** の restore（untitled / pre-persist draft / "新規" 復元）: active baseline は `absent` のままとし、persisted target を fabricate しない。first successful + acknowledged Save / Create で初めて baseline が present になる（S-16, S-17）。
- snapshot が捕捉時に基準としていた **original baseline provenance**（`baselineFingerprint` または absent、advisory hint）は、active baseline を rebase した後も working copy / Recovery metadata の provenance として、terminal outcome（S-40）まで保持しなければならない。provenance を失う設計にしてはならない。

**S-50. conflict-derived restore の provenance を terminal outcome まで保持する。**

ユーザーが `conflict` Recovery を明示的に restore した場合、内容は current persisted state 上の dirty working copy となり（rebase された baseline。S-49）、その working copy が **conflict-derived restore である** provenance を terminal outcome まで保持する。Pergamum は自動 merge しない。その後の save で explicit overwrite confirmation を要求するか、live optimistic concurrency とどう統合するかは後続 Issue で決定する。

### Reconciliation timing

**S-51. 起動時にすべての project-scoped Recovery を即座に照合する必要はない。**

project-scoped Recovery は、その `projectId` に対応する project context が利用可能になった時点で reconciliation 対象になる。

```text
project A を開いている間:
  project A の Recovery → reconciliation 対象
  project B の Recovery → 保持し deferred。project B が利用可能になるまで reconciliation しない。
```

別 project の Recovery が存在するという理由だけで現在の project 操作を妨げてはならず、それ自体を error として提示してはならない。deferred Recovery は orphan / discard とみなさず、対応 context が再び利用可能になるまで保持する。

**S-52. project context を必要としない Recovery（standalone / external Markdown、untitled、pre-persist Glossary draft）は、必要な persisted target / working-copy identity が解決可能になった時点で reconciliation 対象になる。**

Session が存在しないことだけを理由にこれらの Recovery を破棄してはならない（S-6）。

### Multi-instance ownership と claim

**S-53. Recovery snapshot の write authorization は current exclusive claim を唯一の正とする。**

各 application run は一意な `instanceRunId` を持ち、**自分が現在 claim を保持する snapshot のみ** を変更する。namespace に snapshot が属することは write 権を意味しない（S-14）。single-instance 前提への後退は行わない。

**S-54. `originInstanceRunId`（provenance）と current claim（write 権）を分離する。**

```text
originInstanceRunId  Recovery snapshot を生成した run。immutable。restore / reconciliation の
                     validation と provenance に用いる。write permission ではない。claim が
                     別 instance へ移っても変化しない。
current claim         その snapshot を現在変更できる唯一の write authorization。relinquished owner
                     または abandoned / confirmed-dead owner の snapshot を別 instance が引き継ぐ
                     場合はここが移る。
```

**S-55. relinquished owner または abandoned / confirmed-dead owner の Recovery snapshot を別 instance が変更するには、事前に exclusive claim を取得しなければならない。**

- relinquished owner（正常終了などで自 Recovery の ownership を明示的に手放した run）と、abandoned / confirmed-dead owner（crash 等で終了が確認された run）の snapshot は、exclusive claim 成功後に引き継げる。
- another live instance が所有する Recovery snapshot を claim してはならない。
- ownership unverifiable の Recovery snapshot を claim してはならない（abandoned とみなしてはならない）。
- 同一 Recovery snapshot を複数 live instance が同時に claim してはならない。
- claim 成功前に restore / replace / discard / cleanup / corrupt 隔離を行ってはならない。
- race（複数 instance がほぼ同時に同一 snapshot を発見）では、exclusive claim 機構により高々 1 つが成功する。claim に失敗した instance は保持のみ行い、変更しない。

liveness 判定・ownership relinquish・exclusive claim の物理実装（OS lock / lease / heartbeat / atomic rename / PID + start identity 等）は後続 Issue とする。

**S-56. 再起動時、Recovery snapshot の owner を少なくとも次に分類できなければならない。**

```text
current instance                  現在の run 自身が claim を保持
another live instance             別の live run が claim を保持
relinquished owner                正常終了などで ownership を明示的に手放した run。
                                  dirty Recovery を保持したまま終了することは正常な lifecycle であり、
                                  abandoned ではない。
abandoned / confirmed-dead owner  crash 等で終了が確認された run
ownership unverifiable            owner の生死 / claim を確認できない。recorded な claim transfer で
                                  説明できない namespace / originInstanceRunId の不整合を含む（S-14）。
```

- **relinquished owner** と **abandoned / confirmed-dead owner** の snapshot は、exclusive claim（S-55）成功後に引き継ぎ可能。
- **another live instance** と **ownership unverifiable** の snapshot は claim 禁止。
- normal shutdown で dirty Recovery を保持することを abandoned と呼んではならない。

**ownership unverifiable Recovery の claim-free read-only salvage extraction。**

ownership が確定できない場合でも payload をユーザーが救出できるよう、conflict 解決時の `restore`（claim を伴う通常操作。S-27, S-50）とは別に、**claim を必要としない read-only salvage extraction** を許可する。force claim や「ユーザーがOKしたので abandoned 扱い」は採用しない。

salvage extraction は ownership unverifiable snapshot について次を厳守する。

- original Recovery snapshot の claim を取得しない。original snapshot / claim metadata / ownership metadata / originInstanceRunId を変更しない。replace / discard / cleanup / corrupt 隔離しない。
- **original の active / unresolved save attempt を retire しない。** salvage extraction は original Recovery lifecycle の terminal outcome ではない（S-27, S-40）。
- persisted target を変更しない。original target へ write しない。
- live owner が実際に存在していても original に対して destructive effect を持たない。

**salvage を許可する integrity 条件**は「すべての reconciliation-critical metadata が正常」ではない。ownership unverifiable の原因自体が claim / ownership / target provenance metadata の不整合である場合、それを理由に salvage まで不可にすると escape hatch が自己無効化する。salvage に必要なのは original target / ownership を信頼することではなく、payload を独立した baseline-absent working copy として安全に解釈・コピーできることである。したがって:

- **payload integrity（S-58）と、その payload を独立 working copy として解釈するために必要な最小限の metadata（種別・schema version・payload encoding 情報など）が検証可能なら salvage 可**。claim / ownership / target provenance が検証不能でも、それらを新 working copy に継承しない形で salvage できる。
- payload 自体、または payload interpretation に必要な metadata が unsafe / corrupt なら salvage 不可（`corrupt` / `ownership unverifiable` のまま保持）。

そのうえで許可する内容:

- Recovery payload を読み取り、**新しい working copy へコピー**する。
- 新 working copy は fresh recovery identity を持ち、persisted baseline は `absent`（S-16）。種別ごとの baseline-absent working copy とする（Markdown は原則として新しい untitled working copy、Glossary は target を上書きしない新しい pre-persist working copy）。original の claim / ownership / target provenance は新 working copy に継承しない。元 Recovery との provenance link は必要に応じて保持してよい。
- **original unverifiable snapshot / その save-attempt state / claim / ownership state はそのまま残す。**

この操作は **restore ではない**。S-55 の「restore / mutation は claim 必須」という原則は維持する。具体 UI は後続 Issue とする。

### Recovery store の障害 semantics

**S-57. Recovery store 障害を「Recovery なし」と同一視してはならない。**

少なくとも次を区別し、障害は可能な限り Recovery 単位に隔離する。

```text
Recovery store unavailable            store 全体が読めない（store-level state。個別 classification の外。S-42）
individual Recovery unreadable        個別 snapshot を parse できない
individual Recovery integrity mismatch parse できるが RPF または metadata と整合しない（S-58, S-59）
target unavailable                   snapshot は読めるが target を解決できない
valid Recovery                       正常
```

個別 Recovery の破損によって、読み取り可能な他の Recovery まで無効として扱ってはならない。

**S-58. stored Recovery payload の integrity を `recoveryPayloadFingerprint` で検証する。**

読み取り時、stored payload の semantic representation から再計算した fingerprint が記録済み `recoveryPayloadFingerprint` と一致しない場合、その snapshot を正常な Recovery として扱ってはならない（`corrupt` として分類。S-45 手順 0b）。「parse できるが payload が部分破損」を「parse 不能」と区別する。checksum format / hash algorithm / atomic write は後続 Issue とする。

**S-59. reconciliation-critical metadata の integrity を検証できない Recovery record を、正常な record として自動 reconciliation してはならない。**

対象 metadata は少なくとも次を含む。

```text
recoveryId / schema version
target identity（projectId / entryId / path identity 等）
baselineFingerprint
saveAttemptFingerprint
saveAttemptToken / correlation metadata
originInstanceRunId / claim 関連 metadata
```

schema consistency / 内部整合を検証できない場合、最も保守的で非破壊な状態（`corrupt` または `ownership unverifiable`）へ分類し、silent restore / cleanup を行わない。物理 checksum / MAC / atomic file format は後続 Issue とする。

**S-60. capture / write / read failure を silently 無視してはならず、情報通知だけで処理してはならない。**

- dirty working copy の Recovery capture / metadata write（S-22 手順 2 を含む）に失敗した場合、Recovery protection が成立しているように見せてはならない。
- これらはユーザーコンテンツ保護に関わる異常状態であり、`NotificationToast`（roadmap Phase 6-1 で正常系・情報通知専用）だけで処理してはならない。ユーザーが確実に認識できる warning / error UI を用いる。
- Recovery store の障害だけを理由に、可能な場合の application 起動や persisted document の閲覧を全面禁止する必要はない。ただし「Recovery が利用できない状態である」ことをユーザーに認識可能にしなければならない。

**S-61. corrupt Recovery を自動的に正常化・上書き・削除してはならない。**

読み取り不能・integrity mismatch と判定した Recovery data は原データを保持する。後続の物理保存設計で quarantine / diagnostic を可能にする方式を検討する。quarantine file layout や repair 機構の具体は本 ADR のスコープ外とする。

**S-62. unresolved / corrupt Recovery の retention / cleanup。**

- unresolved / corrupt Recovery を、単なる時間経過のみを理由に自動削除してはならない。
- Phase 6 の範囲では、これらに対する age ベースの silent deletion を導入しない。将来 age ベースの cleanup を導入する場合は条件を明示的に定義し、ユーザーが認識できる形にする（可能ならユーザー確認を伴う）。
- 通常の（terminal outcome に達した）working copy の Recovery snapshot は S-40 に従って破棄する。ADR-0007 R-10 の retention 方針に従う。

### 異常状態のユーザー認識

**S-63. conflict / ambiguous / corrupt / integrity mismatch / Recovery unavailable は異常状態であり、`NotificationToast` だけで処理してはならない。**

これらは、ユーザーが確実に認識できる UI（blocking または持続的な surface）で提示しなければならない。UI category と「確実に認識できること」という要件は本 ADR で固定し、具体的な UI 実装は後続 Recovery UI Issue が所有する。

**S-64. Recovery restore は明示的かつ非破壊である。**

- Recovery を自動復元してはならない（ADR-0007 R-8）。
- persisted state を Recovery で silently 上書きしてはならない。
- 同一 target に複数 Recovery candidate が存在する場合、自動選択せず explicit なユーザー選択を要求する（ADR-0007 R-9）。
- Recovery data を debug log / console / dialog に raw で出してはならない（ADR-0007 R-8、ADR-0008）。

### Glossary specialization

**S-65. Glossary の fingerprint は S-35 の semantic representation を serialize して計算する。**

fingerprint 対象は S-35 が定める field と normalization（form id / `created_at` / `updated_at` / SQLite rowid 等は除外、surface は trim 済み、空 surface の non-canonical form は含めない、Unicode / width / case folding なし）に一致する。独立した field list を定義しない。byte 表現（区切り・エスケープ）と hash algorithm は後続 Issue とする。

**S-66. Glossary の live save は現在 last-write-wins であり、conflict 検出は reconciliation が担う。**

`updateGlossaryEntry` は現在 baseline / revision を検査せず DB 行を無条件に上書きする。本 ADR はこれを前提に conflict 検出を Recovery reconciliation（S-45）へ置く。live save path の optimistic concurrency 検査（save 実行時点で baseline fingerprint と現在 DB 状態を比較し、不一致なら explicit conflict handling）は後続 Issue とする。save 直後の residual dirty（server 正規化による空 form 行除去等）は S-35 の「空 surface form 行を semantic state から除外」により解消され、save 直後の residual dirty から即座に conflicting snapshot を生成してはならない。

---

## ADR-0008 との関係（partial supersession）

ADR-0008 は project root 配下に `.pergamum_recovery/` を定義し、そこに「未保存本文、dirty document recovery data、crash recovery data、save failure recovery support data を含む可能性がある」と述べている。`.pergamum_recovery/` を working-copy Recovery の保存先とするこの判断は、本 ADR の S-8 / S-9 と矛盾する。

**S-67. working-copy Recovery の保存先について、ADR-0009 は ADR-0008 の該当判断を部分的に supersede する。**

- **working-copy Recovery（未保存 Markdown 本文・未保存 `GlossaryEntryDraft` 内容と、その reconciliation metadata）の保存先は ADR-0009 を正とする。** application `userData` 側の専用 Recovery store を使用し（S-8）、`.pergamum_recovery/` を working-copy Recovery store として使用しない。
- この supersede は **partial** である。ADR-0008 全体の status は変更しない。ADR-0008 の Project File / Project Root / project name / project metadata / project boundary / 複数 `.pergamum` file の許容 / one-folder-one-instance policy / OS file association といった他の判断は引き続き有効である。
- `.pergamum_recovery/` の将来用途（削除する、derived data 専用にする 等）、および `project.recoveryDirectoryName` 設定の今後の扱い（有効性・用途）は本 ADR では決定しない。**working-copy Recovery には使用しない**という境界のみを確定する。
- 対応する amendment note を ADR-0008 側（`0008-...ja.md` の「Amendments」節および「Project-local recovery directory」節冒頭）に追加済みである。

---

## 現行実装の調査結果と本 Issue 前提との差分

1. **Glossary の "DB create 前の新規 `GlossaryEntryDraft`" は現行実装に存在しない。** 現行は sidebar フォームから `window.pergamum.glossary.create` で先に DB へ commit し、その後 persisted entry から draft を開く。Issue の `persisted revision = 12` 型モデルおよび pre-persist draft は net-new の設計であり、S-12 / S-16 / S-47 で契約のみ定め、実装は後続 Issue とした。
2. **`persisted revision` は schema に存在しない。** `glossary_entries` は `id` / `kind` / `description` / `created_at` / `updated_at` のみ。したがって baseline identity は content fingerprint 方式を採用した（S-18〜S-22）。
3. **Glossary の save に baseline / optimistic concurrency 検査が無い。** `updateGlossaryEntry` は last-write-wins。conflict 検出は Recovery reconciliation が担う設計とし（S-45、S-66）、live save path の conflict 検査は後続 Issue とした。
4. **Markdown の外部変更検出は未実装。** `editorState.ts` に `EditorSyncState` と `isEditorConflicted` が定義されているが runtime 未接続。file の persisted baseline は in-memory の `savedContent` snapshot のみで、fingerprint / mtime / size は persist されていない。本 ADR は Recovery metadata に `baselineFingerprint` と advisory hint を持たせることを要求する（S-19）。外部変更検出方式（mtime / size / hash）の実装は ADR-0007 R-13 の後続 Issue に属する。
5. **Markdown I/O の BOM / encoding（2026-08-27 調査）。** read は BOM を除去し `hadBom` を metadata に載せるが、renderer は未使用。write は BOM を再付与せず `fs.writeFile(..., "utf8")`。encoding は `"utf8"` 固定。save bytes を決める状態は line-ending 種別のみ。したがって Markdown の canonical persisted representation は BOM-less UTF-8 とし、fingerprint は raw disk bytes ではなく canonical persisted representation に対して計算する（S-34）。BOM 保存 / encoding 検出を将来追加する場合は semantic representation と fingerprint 入力へ同時に加える。
6. **ADR-0008 の `.pergamum_recovery/` と本 Issue 前提の矛盾。** S-67 で partial supersede し、ADR-0008 側に amendment note を追加済み。`.pergamum_recovery/` の将来用途と `project.recoveryDirectoryName` の今後の扱いは未決とする。
7. **Session persistence / restore 本体は未実装。** `src` に session / recovery の実装は無く、本作業は greenfield 設計である。
8. **確定を要したが本 Issue で決定した項目**: description の末尾空白を dirty 差分とみなす（S-35）、空 non-canonical form 行を semantic state から除外する（S-35）、untouched untitled / untouched pre-persist draft は dirty でなく Recovery snapshot を要さない（S-31）、Markdown persisted fingerprint は canonical BOM-less UTF-8 representation に対して計算する（S-34）。
9. **本 ADR で契約のみ定め、値の決定を後続に委ねた項目**: fingerprint の hash algorithm と byte 仕様、fingerprint 計算の async scheduling 方式、debounce 時間、retention 期間 / 世代数、unresolved / corrupt cleanup の具体条件、instance liveness / exclusive claim の物理方式、Recovery store の物理形式 / directory layout / atomic write / checksum、save request の queue 実装、conflict-derived restore と live save の統合、Recovery management UI。

---

## Consequences

- Markdown document と Glossary Entry は、保存先が違っても同一の working copy Recovery 契約に従う。Glossary 固有事情は specialization（S-65〜S-66）に閉じる。
- baseline identity が content fingerprint に統一され、timestamp / revision 有無に依存しない。3 fingerprint（baseline / saveAttempt / recoveryPayload）と save-attempt lifecycle の分離により、acknowledged / 未 ack いずれの場合も save 開始後の編集を save の成功で clean 扱いする事故、および provenance を偽って `already persisted` とする事故を防ぐ。
- save-attempt state（`prepared` / `in-flight` / `acknowledged-success` / `acknowledged-failure` / `unresolved-after-termination`）を Recovery payload lifecycle と論理的に分離し、payload cleanup が未確定 attempt の provenance を失わせない。acknowledged-failure は correlation を retire し、古い failed attempt が `already persisted` 判定に混入しない。
- save-attempt retirement 条件は **S-27 を canonical / complete list** とし、他 statement は再列挙せず参照する。`safe restore`（baseline advanced / unchanged / absent）のユーザー明示確定も retirement 条件に含め（S-27 条件 5）、reconcile 経由で復元した working copy でも old attempt が S-25 slot を占有し続けて次の Save が永久に開始できない事故を防ぐ。判断保留・キャンセルなら snapshot 保持・attempt active のまま。
- 同一 working copy の unresolved save attempt は高々 1 つに制約され、複数 in-flight による reconciliation の曖昧化を防ぐ。
- in-flight save 中の Undo を early terminal clean とみなさない gate（S-38）により、commit 成功が baseline を進めても未保存 working copy を失わない。
- dirty 比較と fingerprint が同一の semantic representation（S-33〜S-35）に依存し、両者がずれる事故を防ぐ。Markdown の byte-affecting state（現状は line-ending 種別のみ）の扱いを一貫化し、BOM / encoding を場当たりで特別扱いしない。
- persisted baseline に `present / absent` を導入し、untitled / pre-persist draft / "新規" 復元で persisted target や空 persisted state を勝手に作らない。
- Recovery capture は best-effort と明示され（S-36）、「必ず Recovery できる」保証を作らない。S-60 の failure semantics と矛盾しない。
- reconciliation classification と terminal outcome / terminal cleanup が分離され（S-40, S-42）、Recovery store unavailable は store-level state として個別 classification の外に置かれる。
- multi-instance で write authorization を current exclusive claim に一本化し（S-14, S-53）、namespace / `originInstanceRunId` を write 権としない。relinquished / abandoned-confirmed-dead owner の snapshot は claim 取得後にのみ変更でき、race でも高々 1 instance が claim する。single-instance 前提へは後退しない。
- payload integrity（S-58）に加え reconciliation-critical metadata の integrity（S-59）も要求し、壊れた record を保守的・非破壊な状態へ落とす。
- **Recovery management UI が存在しない期間、対応 project が二度と開かれない deferred Recovery、target を解決できない unresolved Recovery、および ownership unverifiable Recovery は、ユーザーから見えないまま app userData 側に蓄積し得る。** ownership unverifiable は S-56 の claim-free read-only salvage extraction を行っても original snapshot が不変・非 terminal であるため、original のまま長期残存する。Phase 6 は時間経過のみによる silent deletion を導入しないため、この蓄積は意図した安全側のトレードオフである。deferred / unresolved / ownership unverifiable を確認・明示破棄できる最小限の管理手段は後続 Issue で検討する（具体 UI は本 ADR で決めない）。
- working-copy Recovery の保存先について ADR-0009 が ADR-0008 の該当判断を partial supersede する（S-67）。

---

## Alternatives Considered

### timestamp（`updated_at` / file mtime）単独を baseline identity とする

却下。「commit 済み・acknowledgement 未受信」と「外部 conflict」を判別できない。advisory hint / diagnostics に限定する。

### monotonically increasing revision を必須機構とする

採用しない。Glossary schema 変更が必要で、file-backed Markdown に対応物が無い。fingerprint を必須機構とし、revision は optional な将来補強にとどめる。

### acknowledged save だけで Recovery lifecycle を terminal とみなす

却下。save 開始後の post-save edit が存在すると失われる。acknowledged-success の後に working copy を新 baseline で再評価し、residual unsaved state が無い場合のみ terminal とする（S-28）。

### in-flight save 中に working copy が現在 baseline と一致したら snapshot を破棄する

却下。unresolved save attempt の成功で baseline が進むと、破棄済みで未保存 working copy を失う。save attempt が resolve するまで破棄を保留する（S-38 gate）。

### save-attempt correlation を Recovery payload と同一 lifecycle にする

却下。payload cleanup で未確定 attempt の provenance を失う。論理 lifecycle を分離し、acknowledged-success / failure で明示的に retire する（S-26, S-27, S-29）。

### `corr` を「過去に save を試したことがある」とする

却下。retire 済みの failed attempt が `already persisted` を誤成立させる。`corr` は「durable に記録され、現在も unresolved な attempt との相関」に限定する（S-27, S-29, S-43）。

### `already persisted` を「persisted 内容が recovery payload と一致」だけで判定する

却下。外部経路の偶然一致で provenance を偽る。相関する unresolved save attempt の確認を必須とし、相関できない一致は `persisted-equivalent (no-op cleanup)` として区別する（S-43, S-44）。

### 同一 working copy に複数 in-flight save attempt を許す

Phase 6 では却下。single save-attempt slot では正しく reconciliation できない。unresolved attempt を高々 1 つに制約し、後続 request を serialize / queue する（S-25）。

### saveAttempt metadata のみを persist 前に durable にする

却下。debounce 未発火中の即 Save で、最新 working-copy payload を事後照合できない。persist 開始前に payload も含めた整合 durable state を要求する（S-22）。

### Markdown fingerprint を raw disk bytes に対して計算する

却下。BOM 付き file の raw bytes は Pergamum が書き戻すバイト列と一致せず、未編集でも conflict に見える。canonical persisted representation（現行 pipeline が実際に書くバイト列）に対して計算する（S-34）。

### BOM を場当たりで特別扱いする

却下。encoding 等が増えたとき破綻する。byte-affecting state は現行 pipeline が保存・再現するものを semantic representation として一貫して扱い、将来の追加も同じ原則で扱う（S-34）。

### namespace を write authorization とする

却下。A 起源の snapshot を B が claim した後の write 権が曖昧になる。write authorization は current exclusive claim を唯一の正とし、namespace は partitioning、`originInstanceRunId` は provenance に限定する（S-14, S-53, S-54）。

### 未保存本文 / draft 全体を Session state に格納する

却下。非交渉制約に反する。Session は identity + navigation に限る。

### Recovery を Project DB / project-local file（`.pergamum_recovery/` を含む）に置く

却下。persisted state と同一 failure domain に入り、project の破損・欠損・移動時に Recovery も同時に失われる。

### 起動時に Recovery を自動適用する / persisted state を silently 上書きする

却下。ADR-0004 / ADR-0007 の非破壊・explicit choice 原則に反する。

### 「file が無い」「store が読めない」を「Recovery なし」とみなして cleanup する

却下。data loss リスク。破棄ではなく分類する（deferred / unresolved / corrupt）。store 全体 unavailable は個別 classification の外の store-level state として扱う（S-42）。

### corrupt / integrity mismatch の Recovery を自動正常化・上書き・削除する

却下。forensic / quarantine 価値を失う。原データを保全する（S-58, S-59, S-61）。

### capture を「必ず成功する」と保証する

却下。S-53 の capture / write failure と矛盾する。best-effort とし、失敗時は S-60 の failure semantics に従う（S-36）。

### conflict / corrupt / unavailable を `NotificationToast` だけで扱う

却下。異常状態はユーザーが確実に認識できる UI を要する。

### instance をまたいで単一の Recovery namespace を共有する / single-instance を前提にする

いずれも却下。前者は同時起動 instance が互いの snapshot を上書きする。後者は multi-instance support を削る。current exclusive claim を write authorization とし、relinquished / abandoned-confirmed-dead owner の snapshot は claim 経由で引き継ぐ（S-53〜S-56）。

### relinquished / abandoned owner の Recovery を claim 無しで別 instance が処理する

却下。B と C がほぼ同時に起動した race で二重処理・二重 restore が起こりうる。exclusive claim 取得を前提とする（S-55）。

### semantic clean へ戻った working copy の snapshot を再起動後 reconciliation で片付ける

却下。stale snapshot が残り、no-op reconciliation を増やす。clean 復帰時に破棄する（S-38。gate 付き）。

### 同一 working copy の複数世代 Recovery snapshot を復元候補として蓄積する

本 Issue のスコープ外。論理現行世代は 1 つとし、履歴型 Recovery は将来の別機能とする。

### Glossary dirty 判定と fingerprint を別々の field set で定義する

却下。将来ずれて「dirty では同一 / fingerprint では相違」等の事故が起こる。単一の semantic representation に両者を依存させる（S-33, S-35, S-65）。

### Glossary dirty 判定を非正規化のバイト一致で行う

却下。form の並べ替えや等価な form 集合が誤って dirty になる。surface / form は正規化集合で比較し、description は逐語比較する。いずれも保存内容は書き換えない。

---

## Future Work / 後続 Issue 候補

- **Recovery store foundation**: 物理保存形式、directory layout、atomic write、checksum / MAC、schema、`recoveryId` 生成と collision handling（ADR-0007 R-6）。
- **fingerprint 仕様**: hash algorithm、Markdown / Glossary の canonical persisted representation の byte 仕様、critical path 外での async / streaming 計算方式（S-23）。
- **Recovery capture 実装**: debounce 時間、coalescing、lifecycle boundary への hook、persist preflight（S-22 手順 2）、semantic clean 復帰時の破棄と gate、正常終了 flush。
- **save-attempt lifecycle 実装**: save-attempt state の durable 記録、単一 unresolved attempt の enforcement、後続 Save request の serialize / queue、acknowledged-failure での retire。
- **Session persistence foundation（Phase 6-2）** / **Session restore（Phase 6-3）**: identity + navigation の schema、missing / corrupt fallback、zero-tab の扱い。
- **Recovery reconciliation 実装（Phase 6-4）**: S-45 の判定手順、baseline present / absent の扱い、project context 利用可能化時の trigger、already persisted / no-op の確定と破棄。
- **Recovery UI**: classification の提示、複数 candidate の explicit 選択、conflict / corrupt / integrity mismatch / unavailable の確実な認識 UI、**deferred / unresolved / ownership unverifiable Recovery を確認・明示破棄できる最小限の管理手段**、ownership unverifiable に対する claim-free read-only salvage extraction（S-56）の導線。
- **Multi-instance exclusive claim**: OS lock / lease / heartbeat / atomic rename / PID + start identity、race 時の claim 調停、ownership unverifiable の扱い、claim transfer の記録。
- **Markdown 外部変更検出**: mtime / size / content hash による `EditorSyncState` 駆動と live conflict handling（ADR-0007 R-13 の後続）。
- **Markdown byte-affecting state の拡張**: Issue 候補 "Preserve or explicitly define UTF-8 BOM behavior for Markdown files"（現行 pipeline は BOM を read で除去し write で再付与しない = BOM が落ちる既存動作。ADR-0009 の新規仕様ではない）。BOM 保存 / encoding 検出を追加する場合は semantic representation と fingerprint 入力へ同時統合する（S-34 の原則に従う）。
- **Glossary live save の conflict 検査**: save 実行時点の optimistic concurrency 検査と explicit conflict handling、conflict-derived restore（S-50）との統合。
- **Glossary pre-persist 新規 draft**: application-local identity、client 相関可能な create identity / token、acknowledgement 未受信 create の reconciliation。
- **Glossary schema 拡張検討**: monotonic `revision` 列の要否。
- **retention / cleanup policy**: unresolved / corrupt Recovery の保持と、将来 age ベース cleanup を導入する場合の明示条件。
- **`.pergamum_recovery/` の将来用途と `project.recoveryDirectoryName` の扱いの決定**: working-copy Recovery に使用しない境界は S-67 で確定済み。用途決定時に ADR-0008 の追補または新規 ADR で扱う。
- **corrupt Recovery の quarantine / diagnostic 方式**。
- **ADR-0009 の英語版**（`0009-...en.md`）の作成。

# ADR-0009: Working Copy Persistence and Recovery Model

**Status:** Accepted

**Date:** 2026-08-27

---

## Context

Phase 6 implements Session persistence / Session restore / Recovery (roadmap Phase 6-2 to 6-5).

Pergamum contains two types of editable working copies with different persistence targets:

```text
Markdown document
  persisted state = Markdown file (canonical source of truth for body text)
  working copy    = CurrentDocument in editor

Glossary Entry
  persisted state = SQLite row inside .pergamum (canonical source of truth for saved Glossary)
  working copy    = GlossaryEntryDraft

```

Although the persistence targets differ, the core Recovery problem remains identical:

> How to protect working copies not yet reflected in persisted state during both normal and abnormal terminations, and how to safely reconcile them with persisted state after application restart.

While the robustness provided by SQLite transactions/journals is assumed, uncommitted working copies are lost even if SQLite itself remains healthy. Similarly for Markdown, unsaved edits in the editor prior to a save operation do not exist in the file.

ADR-0006 defined durable state categories; ADR-0007 defined non-destructive, best-effort policies for recovery storage, identity, and restore; and ADR-0008 defined the `.pergamum` project file, project root, and project-local layout.

ADR-0009 builds on top of these by defining a **common Recovery contract per working copy**:

* Boundaries between persisted state, working copy, and Session
* Meaning of persisted baseline (present / absent) and baseline identity via fingerprints
* Save lifecycle and its logical separation from the save-attempt lifecycle
* Dirty determination semantics, and the shared semantic representation used by dirty comparison and fingerprints
* Best-effort capture and lifecycle of Recovery snapshots
* Post-restart reconciliation classifications and their distinct terminal outcomes
* Multi-instance namespace, provenance, and exclusive claims
* Failure semantics, payload integrity, and metadata integrity of the Recovery store
* Glossary-specific specializations

ADR-0009 does not define physical storage formats for Recovery snapshots, directory layout, atomic write/checksum implementations, hash algorithms, physical mechanisms for instance liveness, concrete Recovery UI designs, live Glossary save conflict implementations, or Session persistence itself. These are owned by follow-up Issues.

---

## Related ADRs

* **ADR-0000 Accessibility and Inclusive Interaction Principles** requires that states like conflict, corrupt, or Recovery unavailable be user-visible, leading to diagnostics that do not confuse the user.
* **ADR-0002 Structured Project Data and Glossary Model** defines `pergamum.db` as the canonical source for structured project data, the `GlossaryEntry` / `GlossaryForm` models, UUIDv7, non-silent resolution of `none` / `unique` / `ambiguous`, and snapshots as derived representations. ADR-0009 does not alter these.
* **ADR-0004 Non-Destructive Text Principle** requires that Pergamum MUST NOT implicitly normalize or substitute text or user input. Normalization for dirty comparison in ADR-0009 obeys this principle and MUST NOT rewrite saved content.
* **ADR-0006 Durable State Categories and Settings Architecture** defines `session` and `recovery` as distinct categories, and specifies that recovery belongs to an app userData-side dedicated store and MUST NOT be placed in a generic settings table. ADR-0009 depends on this category boundary.
* **ADR-0007 Recovery and Runtime Coordination** defines that recovery records MUST have an independent `recoveryId`, project name/path MUST NOT be the primary identity, restores MUST be explicit/non-destructive, multiple candidates MUST NOT be auto-selected, retention/deletion policies are required, recovery MUST be isolated across multi-instances, and cloud-sync is out of scope. ADR-0009 materializes these as per-working-copy contracts.
* **ADR-0008 Project File, Project Root, and Project-Local Recovery Layout** defines the `.pergamum` project file, project root, and `.pergamum_recovery/`. Because ADR-0009 places working-copy Recovery in an app userData-side dedicated store, it **partially supersedes** ADR-0008's decision to use `.pergamum_recovery/` as the storage location for working-copy Recovery (see § "Relationship to ADR-0008 (partial supersession)" S-67). Other decisions in ADR-0008 regarding Project File / Project Root remain unchanged.

---

## Relationship to ADR-0006 / ADR-0007

**RA-1. ADR-0009 depends on the state categories of ADR-0006 and the recovery policies of ADR-0007.**

ADR-0009 SHALL NOT redefine the settings architecture or state categories. It assumes ADR-0007's recovery identity, non-destructive restore, and multi-instance separation, defining them as persistence and reconciliation contracts per working copy. ADR-0009 MUST NOT regress multi-instance support to a single-instance assumption.

---

## Terminology

```text
Persisted State
  The canonical source of truth successfully saved by the user.
  On-disk Markdown file for Markdown; Entry / Form rows in .pergamum for Glossary.

Working Copy
  A mutable representation that can be edited after being loaded or created fresh from persisted state.
  CurrentDocument (content + line-ending information) for Markdown; GlossaryEntryDraft for Glossary.

Persisted Baseline
  The persisted state with which the working copy is synchronized. The domain of values is { present(fingerprint), absent } (S-16).
  "present" means "the fingerprint of the persisted state with which the working copy was loaded or last synchronized via an acknowledged save/create". "absent" means "a persisted target has not yet been established".
  It does not refer to the point in time when a Recovery snapshot was taken.

semantic representation
  A canonical form deterministically representing the semantic state of a working copy / persisted state.
  Dirty comparison and fingerprint calculations depend on the identical semantic representation definition (S-33).

fingerprint
  A collision-resistant summary value calculated over the canonical persisted representation obtained by serializing the semantic representation. The hash algorithm and byte specifications are decided in follow-up Issues.

baselineFingerprint
  The fingerprint of the active persisted baseline (no value if baseline is absent).

saveAttemptFingerprint (SAF)
  The fingerprint of the immutable payload that a given save attempt writes to persisted state.
  MUST be durably recorded before persist begins (S-22).

recoveryPayloadFingerprint (RPF)
  The fingerprint of the working copy payload held by a given Recovery snapshot.
  Also used for verifying the integrity of the snapshot payload itself (S-58).

save-attempt state
  The state of a single persist / save attempt (S-26). Contains token / SAF / target identity / attempt baseline, and
  result ∈ { prepared, in-flight, acknowledged-success, acknowledged-failure,
             unresolved-after-termination }.

Recovery Snapshot
  Unreflected working copy payload + RPF + active baseline / provenance
  + owner / target identity + reconciliation-critical metadata.
  Stored in an app userData-side dedicated Recovery store.

instanceRunId
  A value uniquely identifying a single application process / run (corresponds to appInstanceId in ADR-0007).

originInstanceRunId
  The run that generated the Recovery snapshot. Immutable provenance. Does not constitute write authorization (S-54).

namespace
  Logical or physical partitioning inside the Recovery store (origin bucket). Does not constitute write authorization itself (S-14).

current exclusive claim
  The sole write authorization capable of mutating (restore / replace / discard / cleanup) a given Recovery snapshot (S-14, S-53).

Reconciliation
  The process of matching a Recovery snapshot against the current persisted state per working copy to assign a classification (S-42 to S-46).

Terminal outcome
  A user action or confirmed transition that terminates the lifecycle of a Recovery snapshot (S-40). A distinct concept from classification.

```

---

## Decision

### Boundaries: Persisted State / Working Copy / Session

**S-1. Persisted state and working copy MUST be separated.**

Persisted state is the canonical source of truth, and working copy is a mutable derived representation; the two MUST NOT be merged into a single in-memory representation. A Markdown working copy is the editor content under edit, not file bytes. A Glossary working copy is a `GlossaryEntryDraft`, not rows in `.pergamum`.

**S-2. Persisted state MUST NOT be updated unconditionally from a working copy.**

Working copy content SHALL become persisted state only through the Save lifecycle (S-24 to S-30).

**S-3. The Glossary DB is the source of truth for saved Glossary information.**

Glossary rows inside `.pergamum` are the canonical source of truth for saved Glossary entries; Recovery snapshots, Sessions, and derived snapshots are NOT sources of truth.

**S-4. Session, Recovery, and Persisted State are distinct responsibilities and MUST NOT be mixed.**

```text
Persisted State = Canonical source of truth successfully saved by the user
Session         = What was open; identity of editor / document / entry and navigation / UI restoration state
Recovery        = Working copy payload not reflected in persisted state
                  + baseline identifying information + reconciliation metadata

```

**S-5. Session MUST NOT store full body texts or drafts of dirty working copies.**

Session state MUST NOT embed unsaved Markdown body text or entire `GlossaryEntryDraft` objects. Session state MAY retain only identity and navigation / UI restoration state. Unsaved working copy content is the sole responsibility of Recovery and MUST be placed only in the Recovery store.

**S-6. Recovery MUST NOT be discarded solely because a Session does not exist.**

Even if Session state is missing, corrupt, or unrestored, the corresponding Recovery snapshot MUST be retained independently and subjected to reconciliation.

**S-7. Recovery is a best-effort protection, and is neither the canonical source of truth for persisted state nor superior to the saving of persisted state.**

Recovery MUST NOT unconditionally overwrite persisted state (S-64). Even if recording to or capture by the Recovery store fails, the architecture MUST NOT be designed to unconditionally prohibit the core Save operation explicitly performed by the user (S-22, S-60). ADR-0009 SHALL NOT establish an absolute guarantee that "Recovery is always guaranteed" (S-36).

### Responsibilities and Placement of Recovery Store

**S-8. Recovery data MUST be placed exclusively in an application userData-side dedicated Recovery store.**

Recovery data MUST NOT be stored in:

* Project DB (`.pergamum` / legacy `pergamum.db`)
* project-local files (`pergamum.json`, any file under project root, including `.pergamum_recovery/`)
* Settings store (`settings.json` / `"settings"` section of `pergamum.json`)
* Session store
* generic settings table

Recovery data MUST be placed in the "app userData-side dedicated recovery store/table" specified in ADR-0006 S-6.

**S-9. Persisted state and Recovery MUST NOT be placed in the same failure domain.**

This ensures that even if a Project DB / project file becomes corrupt, missing, moved, or inaccessible, Recovery remains independently readable and reconcilable. Placing Recovery in a Project DB or project-local file would cause failures that lose persisted state to simultaneously lose Recovery, defeating the purpose of Recovery.

**S-10. A single Recovery store SHALL hold Recovery for multiple projects, standalone files, and untitled documents.**

### Reconciliation Unit and Identity

**S-11. The unit of persistence and reconciliation for Recovery SHALL be an individual working copy.**

The unit SHALL be one document for a Markdown document, and one Entry draft for Glossary. Each Recovery snapshot MUST be capable of being classified and reconciled independently of others. Concrete representation and grouping in the UI SHALL be decided by follow-up Recovery UI Issues.

**S-12. Each Recovery snapshot MUST hold owner and target identity necessary for reconciliation.**

```text
project-scoped Markdown          → projectId + document identity (canonical project-relative path)
Glossary Entry                   → projectId + entry identity (entryId, UUIDv7)
standalone / external Markdown    → persisted target identity (canonical absolute path; volume / host hint allowed)
untitled Markdown                → application-local working-copy identity (opaque id); target-state = absent
new (pre-persist) Glossary draft → application-local working-copy identity (opaque id) + "new entry for project P"; target-state = absent

```

`projectId` SHALL use `metadata.project_id` from ADR-0008. Project name, project root directory name, or `.pergamum` file name MUST NOT be used as primary identity (ADR-0007 R-4, ADR-0008).

**S-13. Recovery identity and persisted target identity MUST NOT be conflated.**

Even if multiple instances or multiple working copies reference the same persisted target, they MUST be retained as independent Recovery snapshots (ADR-0007 R-4). Each snapshot SHALL possess its own record identity (`recoveryId`).

**S-14. Write authorization SHALL treat current exclusive claim as the sole source of truth. Namespace and originInstanceRunId are NOT write authorizations.**

* `namespace` is a logical or physical partitioning (origin bucket) inside the Recovery store, and does not itself constitute write authorization.
* `originInstanceRunId` is immutable provenance representing the run that created the snapshot, and is not a write permission. It does not change even if a claim transfers to another instance.
* At snapshot creation, `originInstanceRunId` aligns with its creation namespace. After another instance claims it, the claim (S-53 to S-56) authorizes writes, not the namespace.
* Discrepancies between namespace and `originInstanceRunId` that cannot be explained by recorded claim transfers SHALL be treated as signals of ownership unverifiable (S-56, S-59). `instanceRunId` MUST NOT be redundantly duplicated in a way that leaves its role ambiguous.

### Persisted Baseline and Fingerprint

**S-15. Persisted baseline refers to the persisted state with which the working copy is synchronized, and MUST NOT refer to the point in time when a Recovery snapshot was taken.**

Consecutive captures (snapshot A, B, …) SHALL all share the identical baseline.

**S-16. The value domain of persisted baseline SHALL be { present(fingerprint), absent }.**

* `absent` represents a working copy whose "persisted target has not yet been established". This applies to untitled Markdown, pre-persist Glossary drafts, and working copies restored as "new" from unresolved Recovery.
* `absent` is NOT synonymous with "empty file" or "empty persisted state". A working copy with baseline absent MUST NOT be arbitrarily rebased to an empty persisted state.
* Baseline SHALL transition from absent → present exclusively upon the first successful + acknowledged Save / Create (S-17).
* Recovery MAY be retained for working copies with baseline absent, and restoring them MUST NOT fabricate a persisted target (ADR-0007 R-7, S-49).

**S-17. Updating the baseline SHALL occur exclusively when a new persisted state is established and the application confirms its success via acknowledgement.**

The baseline MUST NOT be updated at save request issuance, during persist processing, or when commit succeeds but acknowledgement has not yet been received.

**S-18. The primary mechanism for semantic correctness and identity determination SHALL be fingerprints.**

Baseline identity and reconciliation equivalence checks MUST treat fingerprints as canonical truth. File mtime, size, and `updated_at` are advisory hints only and MUST NOT be used as "proof of identity".

**S-19. Recovery metadata SHALL conceptually explicitly retain the following three fingerprints:**

```text
baselineFingerprint       Fingerprint of the active persisted baseline (no value if absent)
saveAttemptFingerprint     Fingerprint of the immutable payload that a save attempt writes (durably recorded in S-22)
recoveryPayloadFingerprint Fingerprint of the working copy payload held by this snapshot

```

`saveAttemptFingerprint` and `recoveryPayloadFingerprint` are independent values. Edits occurring after save initiation SHALL update `recoveryPayloadFingerprint` but MUST NOT update `saveAttemptFingerprint`. The two MUST NOT be conflated (S-28, S-30, S-43).

**S-20. Timestamp alone MUST NOT be used as baseline identity.**

`updated_at` / file mtime alone cannot distinguish between "committed but acknowledgement unreceived" and "persisted state altered via another path". Timestamps are subject to clock skew, filesystem granularity, and external tool edits. They SHALL be used strictly as advisory hints / diagnostics.

**S-21. Monotonically increasing revisions SHALL NOT be a mandatory requirement for baseline identity.**

Current schema lacks a revision column, and file-backed Markdown has no corresponding entity. `glossary_entries.updated_at` is not a monotonic per-row counter with millisecond precision. Identity SHALL depend on fingerprints. Adding a monotonic `revision` to the Glossary schema is a useful future enhancement, but is NOT required.

**S-22. Prior to starting a persist operation, durable Recovery state MUST exist that allows subsequent correlation between that save attempt and the working copy at that moment.**

The execution order MUST be fixed as follows:

```text
1. Freeze the immutable payload to be saved.
2. Durably record the following as mutually consistent recoverable state:
     - The latest working-copy payload at that moment
     - recoveryPayloadFingerprint
     - baselineFingerprint (if baseline is present)
     - saveAttemptFingerprint
     - saveAttemptToken / correlation metadata
     - target identity
3. Initiate persist / commit to persisted state.
4. Receive acknowledgement (success or failure).
5. Finalize save-attempt state according to S-28 / S-29, and re-evaluate baseline / dirty / snapshot.

```

* Step 2 MUST include not only metadata, but also the working-copy payload at that moment. Even if a snapshot is uncreated or one generation old due to un-fired debouncing, durable state MUST exist at persist start allowing post hoc correlation with the latest working copy.
* This DOES NOT require a physically single write or atomic record. Physical formats and atomic write methods are decided in follow-up Issues. Only logical invariants are fixed here.
* Semantics upon failure of Step 2 (Recovery state write failure): The system MUST NOT make it appear as though Recovery protection was established; it MUST issue a warning/error that the user is guaranteed to recognize (S-60); and it MAY allow the user to proceed with the core Save operation. However, in that event, the remaining snapshot relationship cannot be uniquely established by evidence alone during next reconciliation, and MAY degrade to `conflict` instead of `already persisted` (S-46). It SHALL NEVER result in a silent rollback (S-30).

**S-23. Fingerprint calculation and reconciliation MUST NOT unnecessarily synchronously block the editor input critical path or startup critical path.**

Semantic correctness treats fingerprints as canonical truth (S-18). However, heavy calculations such as full-text hashing SHALL be placed outside critical paths via async scheduling, workers, streaming hashing, or hint-based fast-paths. Concrete methods are left to follow-up Issues.

### Save Lifecycle and Save-Attempt Lifecycle

**S-24. The state and transitions of the save lifecycle MUST be fixed as follows:**

```text
clean
  | edit event
  v
semantic comparison
  | (same)            | (different)
  v                   v
clean               dirty
                      | save request
                      v
                    saving (exactly one unresolved save attempt exists; S-25, S-26)
                    /                          \
       acknowledged-success                acknowledged-failure
                    |                          |
       baseline := established payload      baseline unchanged
       + re-evaluate working copy (S-28)   + dirty maintained + payload retained (S-29)

```

`edited` is an event, not a state. `saveFailed` in current implementation SHALL be treated as a sub-state of dirty in the UI (baseline unchanged, save retryable). The existing implementation's `saveInFlightGuard` serializes saves, which aligns with S-25.

**S-25. For any single working copy, at most one persist / save attempt with an unresolved result SHALL exist simultaneously.**

* Subsequent Save requests MUST be handled either by serializing, queuing, or starting after the resolution of existing attempts.
* Concurrent execution of multiple persist operations against the same working copy MUST NOT occur.
* Phase 6 SHALL NOT extend the model to represent multiple in-flight save attempts. Concrete queue and UI implementations belong to follow-up Issues.

**S-26. Save-attempt state MUST be modeled as logically distinct from Recovery payload state.**

```text
save-attempt state:
  saveAttemptToken        Opaque identifier correlating with the working copy
  saveAttemptFingerprint  Fingerprint of the finalized immutable payload
  target identity         Persistence target destination
  attempt baseline        baselineFingerprint at attempt initiation (present / absent)
  result:
    prepared                    Step 2 of S-22 completed; persist not yet started
    in-flight                   Persist / commit currently executing
    acknowledged-success        Received success acknowledgement (S-28)
    acknowledged-failure        Received failure acknowledgement (S-29)
    unresolved-after-termination Owning run terminated with result unresolved. Not written by terminating run,
                                but logical state derived by subsequent run (see below)

```

Physical files or records need not be split from Recovery payloads. What is separated is the logical lifecycle.

`unresolved-after-termination` is NOT a state that a terminating process MUST durably write. In crashes, OS shutdowns, or power losses, the terminating run cannot write it. The subsequent application run derives this state from durable metadata and ownership/liveness info as follows:

```text
Durable save-attempt result is prepared or in-flight
  (No durable result for acknowledged-success / acknowledged-failure exists)
  AND owning run is relinquished or abandoned / confirmed-dead (S-56)
    → Treat that save attempt as unresolved-after-termination

```

Implementations MAY explicitly transition and flush to this state during normal shutdown. However, the same semantics MUST be derivable upon crash. Physical liveness check methods belong to follow-up Issues.

**S-27. The retire lifecycle of an unresolved save attempt MUST be closed.**

**`retire` does NOT mean physical deletion; it means removing the attempt from active unresolved correlation.** Retired attempts MAY be retained as historical / provenance-only metadata. However, a **retired attempt MUST always** satisfy:

* MUST NOT be used for `corr` checks during reconciliation.
* MUST NOT be used for `already persisted` checks.
* MUST NOT occupy the unresolved-attempt slot in S-25.
* MUST NOT block subsequent Saves.

`corr` (active correlation) means NOT "has attempted a save in the past", but "correlation is established with a save attempt that is **durably recorded and currently unresolved (i.e. un-retired)**".

Cleanup of a Recovery payload (S-38 semantic clean return / S-40 terminal outcome) does NOT by itself retire an attempt. The two are distinct operations.

**This S-27 is the canonical and complete list of save-attempt retirement conditions.** Other statements (such as S-40) SHALL NOT re-list retirement conditions, but MUST reference this statement.

The conditions for retiring an attempt are fully enumerated as follows:

1. Upon safe transition completion of **acknowledged-success** (S-28).
2. Upon safe transition completion of **acknowledged-failure** (S-29).
3. When **`already persisted` confirmed** is reached during reconciliation (S-43).
4. When Recovery lifecycle reaches terminal cleanup via **`persisted-equivalent (no-op cleanup)`** during reconciliation (S-44 / S-45 Step 4b).
5. **When `safe restore` (whether baseline advanced, unchanged, or absent) is explicitly confirmed by the user, and the restored working copy enters an active lifecycle** (S-45, S-49). See details below.
6. **When explicit resolution is confirmed by the user for `conflict`** (restoring Recovery, adopting current persisted state and discarding Recovery, or other explicit decisions recognized as terminal outcome by this ADR; S-40, S-50). This "restore" is a normal operation involving a claim, distinct from claim-free read-only salvage extraction in S-56.
7. **When Recovery lifecycle reaches terminal outcome via explicit discard / abandonment** (S-40).

The following are NOT terminal resolutions, and MUST NOT arbitrarily retire an active unresolved attempt: `deferred` / `unresolved` / `corrupt` / `ownership unverifiable`, deferred judgment on `conflict`, and **deferred judgment or cancellation of `safe restore`** (snapshot retained, attempt remains active). Claim-free read-only salvage extraction in S-56 is also NOT a retirement (original attempt remains active).

Causally confirming an attempt's commit result is distinct from requiring that old attempt to no longer be treated as active correlation in the Recovery lifecycle. For instance, when a user explicitly resolves a `conflict` or `safe restore (baseline unchanged / absent)`, the commit result of the past attempt MAY remain unknown (MUST NOT be asserted as failure). In such cases, it SHALL be retired to provenance-only, participating no further in future `corr` / `already persisted` checks.

**Details for Condition 5 (retirement upon safe restore confirmation).** `safe restore` is NOT terminal at the instant it is classified. It proceeds in order: `safe restore classification → user explicitly confirms restore → original Recovery lifecycle terminates → restored working copy initiates new active lifecycle → retire old unresolved save attempt`. Following restore, requirements are:

* **baseline advanced** (e.g., `corr` true, `SAF == P`, `RPF != P`): Confirmed via fingerprint that persist attempt payload landed in current persisted state. After restore confirmation, baseline := P, move recovered payload as dirty working copy to active lifecycle, retire old attempt (SAF / token MAY be retained as provenance-only, excluded from future `corr` / `already persisted`), release S-25 slot, allow subsequent Saves. Although the acknowledgement itself was lost, the state equivalence required for reconciliation has been independently confirmed.
* **baseline unchanged** (`P == BF`): Persisted state remains at old baseline. Even if commit result of unresolved attempt is unknown, once user confirms restore to start new active working-copy lifecycle, retaining old attempt as future active correlation serves no purpose. Retire old attempt to provenance-only, exclude from future `corr`, release S-25 slot; restored dirty working copy MAY save under new lifecycle.
* **baseline absent** (restore confirmation when target-state = absent): Move recovered working copy with baseline absent to active lifecycle, retire old unresolved attempt to provenance-only, exclude from future `corr`, release S-25 slot, allow subsequent Save / Create. DO NOT assert commit result of attempt as "failure".

If restore is deferred or cancelled, snapshot MUST be retained, attempt remains active, and retirement MUST NOT occur.

**S-28. Handling of acknowledged-success. `saved + acknowledged` alone is NOT necessarily a terminal outcome.**

```text
acknowledged-success (payload = A)
  1. Make acknowledged persisted payload A evaluable as new baseline
     (baseline := fingerprint(A); if baseline was absent, transition to present).
  2. Semantically re-evaluate current working copy against new baseline A:
       - Semantic-equivalent and no unsaved working-copy state remains
             → clean. Recovery lifecycle MAY terminate (terminal cleanup; S-40).
       - Different (post-save edit exists after save initiation)
             → Maintain dirty. Retain Recovery payload. Advance active baseline to A.
               Continue S-24 lifecycle under new baseline. NOT terminal.
  3. Durably record new baseline + current payload / RPF + 2.'s re-evaluation result as recoverable state.
  4. After confirming that protection, finally retire unresolved save-attempt correlation (S-27).

```

Clean status, snapshot destruction, or lifecycle termination MUST NOT be performed based solely on acknowledged-success.

**Durability ordering**: Retiring the unresolved save-attempt correlation (Step 4) MUST occur AFTER confirming durable protection in Step 3. Even if a crash occurs mid-transition, safe reconciliation MUST be possible from at least one of the following:

```text
A. Legacy unresolved save-attempt metadata (SAF / token / attempt baseline)
B. New baseline + current Recovery payload (RPF) + dirty-clean re-evaluation result

```

"Do not burn the old save-attempt provenance before fully crossing the bridge." Physical atomic writes, transactions, and file formats are NOT decided in this ADR.

**S-29. Handling of acknowledged-failure.**

```text
acknowledged-failure (payload = A)
  - DO NOT update baseline
  - Working copy remains dirty
  - Retain Recovery payload
  - Confirm that Recovery payload / baseline protection is maintained,
    then retire active / unresolved correlation for this save attempt

```

`saveAttemptFingerprint` / `saveAttemptToken` of a retired failed save attempt MUST NOT be used for subsequent `already persisted` checks (S-27, S-43).

**S-30. Cases involving commit success, unreceived acknowledgement, and termination MUST be handled, and post-save initiation edits MUST NOT be treated as clean / persisted due to save success.**

```text
save request → persist / commit succeeds → Renderer fails to receive acknowledgement → application terminates

```

In this case, save-attempt state becomes `unresolved-after-termination`. Post-restart reconciliation MUST safely evaluate:

```text
persisted == SAF AND RPF == SAF
    → Payload of save attempt is already persisted (S-43). Snapshot MAY be destroyed.

persisted == SAF AND RPF != SAF
    → Save attempt itself was persisted, but unsaved working-copy edits occurred afterward.
      Recovery payload MUST NOT be destroyed. Treat as "safe restore (baseline advanced)"
      where baseline is advanced to save attempt result (S-45 Step 5).

```

A properly saved persisted state MUST NOT be silently rolled back by stale Recovery data.

### Dirty Semantics and Semantic Representation

**S-31. Dirty SHALL be defined NOT as "history of edit events", but as "current working copy semantically differing from persisted baseline".**

* A working copy that returns to the identical semantic state as baseline after editing is clean. `edited` is an event, not a state.
* When baseline is present, comparison target is the semantic representation of persisted baseline.
* When baseline is absent, comparison target is defined per working-copy type as "initial / empty working-copy content". Untouched untitled (retaining initial template content) and untouched pre-persist draft (lacking meaningful input) are NOT dirty and DO NOT require Recovery snapshots. When meaningful edits are entered, it becomes dirty (baseline remains absent).

**S-32. Normalization for dirty comparison is for comparison purposes only and MUST NOT rewrite saved content.**

Comparison normalization MUST NOT alter user input (saved values) (ADR-0004). Unicode normalization, width folding, case folding, and fuzzing SHALL NOT be performed. Character comparison SHALL be exact codepoint matching (ADR-0002 §6, ADR-0004).

**S-33. Exactly one semantic representation SHALL exist per working-copy type, and both dirty comparison and fingerprints SHALL depend on it.**

```text
dirty comparison = semanticRepresentation(working copy) vs semanticRepresentation(baseline)
fingerprint      = hash(serialize(semanticRepresentation(persisted state)))

```

Structural representation for comparison and byte serialization for hashing MAY be separated as technical details, but included/excluded fields and normalization rules MUST derive from the identical semantic representation definition (S-34 / S-35). Field sets MUST NOT be defined separately in two places.

**S-34. Markdown semantic representation and canonical persisted serialization.**

The existing I/O pipeline (`markdownFileIo.ts` / `fileIpc.ts` / `projectIpc.ts`, investigated 2026-08-27) operates as follows:

* **read**: Decodes bytes as UTF-8 (`fatal`), **strips** leading U+FEFF (BOM) if present, and yields `content`. `hadBom` is passed to renderer as read metadata, but renderer currently does not use it.
* **write**: `fs.writeFile(path, content, "utf8")`. Does NOT re-attach BOM. Does NOT reflect `hadBom` in save.
* Encoding is fixed to `"utf8"`. Line endings normalize to `"\n"` on load, tracking per-break types separately to reconstruct via `serializeLineEndings` on save. The only state determining save bytes is line-ending types.

Therefore:

* Markdown semantic representation SHALL consist of **normalized `content` (`"\n"` text)** and **per-break line-ending type sets**. Line-ending types determine saved byte sequences and are part of save semantics.
* **Canonical persisted representation** SHALL be `serialize(content, line-ending types)`, matching the **BOM-less UTF-8 byte sequence** actually written by the current pipeline. Markdown persisted fingerprints SHALL be calculated against **this canonical persisted representation**, NOT raw disk bytes. (Raw bytes of files with BOMs do not match bytes Pergamum writes back; using raw bytes as fingerprint input would cause unedited BOM files to immediately appear conflicted).
* Dirty status exists when `content` or line-ending type sets differ from baseline semantic representation. Leading/trailing whitespace, blank lines, and Unicode representation differences are all treated as semantic differences (no implicit trim / normalization).
* **Principle**: The Markdown semantic / persisted serialization model SHALL consistently handle byte-affecting state preserved and reproduced by the current save pipeline. Currently, that is line-ending types only. BOM and non-UTF-8 encodings are NOT preserved/reproduced by current pipeline, and SHALL NOT be included in semantic representation. If future Issues add BOM preservation or encoding detection to the pipeline, those states SHALL simultaneously be added to semantic representation and fingerprint inputs. BOM MUST NOT be given ad-hoc special treatment alone.

**S-35. Glossary Entry semantic representation and dirty.**

Glossary semantic representation fields, comparison, and normalization rules MUST be fixed as follows. Dirty comparison (`draft` vs `draft.entry`) and fingerprints (S-65) SHALL both use this definition.

| Subject | Unit of Comparison | Normalization | Order |
| --- | --- | --- | --- |
| kind | Exact enum match | None | - |
| description | Verbatim exact match (including leading/trailing/line-end whitespace) | None (saved content also untrimmed) | - |
| canonical surface | Exact match after trim | Trim during comparison / serialize (save semantics) | - |
| canonical match boundary start / end | Exact enum match (`auto` / `strict` / `none`) | None | - |
| non-canonical form set | Set match after normalization | Trim surface of each form. Rows with empty surface after trim excluded from semantic state. Deterministically sorted by `(relation, surface, warningPolicy, matchBoundaryStart, matchBoundaryEnd)` | Order meaningless |
| form.surface | Exact match after trim | Trim | - |
| form.relation | Exact enum match (`alias` / `variant`) | None | - |
| form.warningPolicy | Exact enum match (`default` / `ignore` / `warn`) | None | - |
| form.match boundary start / end | Exact enum match | None | - |
| form identifier (form id) | Excluded (not included in semantic state) | - | - |

Fixed edge cases:

* Order of aliases / forms is meaningless (set comparison).
* Trailing whitespace in description is a difference (verbatim comparison; implicit trim could silently discard edits on close; ADR-0004).
* Re-adding identical content after form deletion is clean if normalized set matches (form id differences ignored).
* Differences between local id ↔ saved uuid are NOT semantic differences.
* Adding non-canonical form rows with empty surfaces is NOT dirty (excluded from semantic state).
* Altering only leading/trailing whitespace of canonical surface is NOT dirty (trimmed for comparison / serialization).

Alignment with existing implementation: This statement grounds itself on `isGlossaryEntryDraftDirty` / `normalizeGlossaryFormsForComparison` in `glossaryEntryDraft.ts`, tightening only the rule that "empty surface form rows are excluded from semantic state" (current implementation excludes them only from save inputs).

### Recovery Capture and Snapshot Lifecycle

**S-36. Recovery capture is best-effort.**

* Under normal operating conditions where Recovery store is available and application can execute capture, capture SHALL eventually be attempted and succeeded for dirty working copies.
* If capture cannot complete, Recovery protection MUST NOT be assumed established, obeying failure semantics in S-60.
* ADR-0009 SHALL NOT create a guarantee that "Recovery is absolutely guaranteed" (S-7). Un-flushed edits MAY be lost during crashes prior to debounce firing. That window is bounded by debounce duration.

**S-37. Capture triggers / lifecycle boundaries MUST include at least the following, MUST NOT block the editor input critical path, and MUST NOT treat save initiation as the sole capture point:**

* Async debounced capture after working copy becomes dirty.
* Coalescing consecutive edits. New capture logically replaces pending capture / existing snapshot for the same working copy (S-39).
* Active editor / tab / project context changes.
* Application normal shutdown.
* Prior to persist initiation (Step 2 of S-22 durably records latest working-copy payload).
* Other lifecycle boundaries where live ownership of a dirty working copy is lost.

Debounce time and physical atomic write implementations belong to follow-up Issues.

**S-38. When a working copy returns to semantic-equivalent with baseline, its snapshot MUST be destroyed. However, destruction MUST be gated while unresolved save attempts exist.**

* Normal operation: When a working copy becomes semantically equal to active baseline via undo / manual revert, Recovery snapshot MUST be destroyed and pending captures cancelled. This is a lifecycle transition and MUST NOT rely on post-restart reconciliation cleanup.
* **Gate**: While an unresolved save attempt exists for that working copy that could alter the baseline upon resolution, the snapshot MUST NOT be destroyed based solely on "matching current baseline". The current working copy MUST be captured / retained, and after the save attempt resolves (acknowledged-success / acknowledged-failure / reconciliation resolution), the working copy SHALL be re-evaluated against the finalized baseline to determine clean / dirty status and destruction eligibility.
* **Continued capture**: The existence of an unresolved save attempt is NOT a reason to halt Recovery payload capture. During gate-induced cleanup deferral, RPF / payload capture MUST continue according to working-copy edits (post-save edits / Undo / Redo), maintaining the latest working-copy state as current Recovery payload (S-37, S-39).

**S-39. Exactly one logical current Recovery snapshot SHALL exist per working copy.**

New captures from ongoing dirty edits logically replace existing snapshots for the same working copy. Replaced older generations SHALL NOT be retained as alternate restore candidates. History-based or versioned Recovery is reserved for future features.

**S-40. Terminal outcomes that terminate Recovery snapshot lifecycles MUST be fixed as follows:**

* **saved + acknowledged (clean after re-evaluation)**: Following acknowledged-success, if S-28 re-evaluation determines working copy is semantic-equivalent to established payload and no unsaved working-copy state remains, destroy snapshot. If post-save edits remain after re-evaluation, it is NOT terminal; continue lifecycle under new baseline.
* **already persisted confirmed**: Destroy snapshot after reconciliation confirms `already persisted` (S-43). DO NOT retain as Recovery history.
* **persisted-equivalent (no-op cleanup)**: Reconciliation-driven terminal cleanup (S-44). Provenance differs from `already persisted` (does NOT causally assert correlation with save attempt).
* **returned to semantic clean**: S-38 (when gate conditions are met).
* **user explicit confirmation of safe restore**: When `safe restore` (baseline advanced / unchanged / absent) is classified, and user explicitly confirms restore, initiating a new active lifecycle for restored working copy. NOT terminal at the instant of classification. If judgment deferred or cancelled, retain snapshot and remain non-terminal (S-41). See S-27 Condition 5 for details.
* **user explicit resolution of conflict**: When explicit user decision is confirmed for `conflict`, such as restoring Recovery (normal operation with claim) or adopting current persisted state and discarding Recovery (S-50). Claim-free read-only salvage extraction in S-56 is NOT included here.
* **explicit discard / abandonment**: When user explicitly discards unsaved changes or Recovery content ("close without saving" dirty document, explicitly discard dirty Glossary draft, select "do not restore / discard" in Recovery UI), destroy corresponding snapshot.

**Save-attempt retirement accompanying terminal outcomes MUST obey S-27 (S-27 is the canonical list of retirement conditions).** This statement SHALL NOT re-list retirement conditions.

**S-41. Deferring judgment is NOT a terminal outcome.**

Simply closing Recovery UI, deferring conflict decision, **deferring or cancelling `safe restore` judgment**, or inability to evaluate due to temporary target unavailability MUST NOT cause snapshot destruction (snapshot retained; correlated unresolved attempt remains active; S-27). Reconcilable state MUST be maintained for next launch. Orphan / unresolved snapshots (unresolved reconciliation due to deleted/moved/inaccessible targets) MUST NOT be silently destroyed (S-46, S-62).

### Reconciliation Classification and Procedures

**S-42. Reconciliation classifications and terminal outcomes MUST NOT be conflated. Recovery store unavailable is a store-level state, outside individual classifications.**

```text
Reconciliation classifications (obtained by observing individual snapshot + persisted state):
  safe restore / already persisted / conflict / deferred / unresolved / corrupt
  Internal outcome: persisted-equivalent (no-op cleanup) ※ MUST NOT add UI categories

Terminal outcomes / terminal cleanup (S-40; accompanying save-attempt retirement obeys S-27):
  saved + acknowledged (clean after re-evaluation) / already persisted confirmed /
  persisted-equivalent (no-op cleanup) / returned to semantic clean /
  user explicit confirmation of safe restore / user explicit resolution of conflict / explicit discard

```

* Internal classifications MUST NOT be equated with UI categories. `explicit discard` is a terminal outcome, not a classification.
* **If Recovery store as a whole is unavailable, individual snapshot classification cannot occur.** This SHALL be treated as a store-level state (S-57, S-60), NOT as "Recovery does not exist".

**S-43. `already persisted` SHALL be restricted to cases where correlation with a corresponding save attempt can be confirmed.**

`already persisted` is NOT proof that Pergamum's save operation succeeded causally. It indicates that **a correlated save-attempt payload is (via fingerprint) equivalent to current persisted state**. Even if acknowledgement was not received, if this equivalence is confirmed, that payload is considered already reflected in persisted state.

`already persisted` MAY be classified ONLY when ALL of the following hold:

* A durably recorded and currently unresolved save attempt correlates with this working copy (matching `saveAttemptToken` / target identity). Retired (acknowledged-failure) attempts MUST NOT be used (S-29).
* `saveAttemptFingerprint == fingerprint(current persisted state)`.
* `recoveryPayloadFingerprint == saveAttemptFingerprint` (no edits post save initiation).

If correlation cannot be confirmed, it MUST NOT be classified as `already persisted`. If the third condition is false (edits exist post save initiation), it MUST be classified as "safe restore (baseline advanced)" (S-45 Step 5), NOT `already persisted`.

**S-44. `persisted-equivalent (no-op cleanup)` MUST NOT assert provenance.**

Cases where `fingerprint(current persisted state) == recoveryPayloadFingerprint`, but conditions for `already persisted` (S-43) are NOT met. Includes:

* No correlated unresolved save attempt exists (external editor / another instance accidentally wrote identical content, or only retired failed attempts exist).
* Correlated unresolved save attempt exists, but `SAF != P` (S-45 Step 4b).

Neither can causally confirm that content was persisted by Pergamum's tracked save attempt.

* Content-wise, restore is unnecessary. Snapshot MAY be destroyed (payload exists safely on persisted state side). This is terminal cleanup (S-40).
* However, it MUST NOT be reported as `already persisted` (falsifying provenance). Record internally as `persisted-equivalent (no-op cleanup)`.
* Simultaneously with this terminal cleanup, if a correlated unresolved save attempt exists, it MUST be retired from active correlation (S-27). MAY be retained as provenance-only. MUST NOT be causally recorded as `already persisted`.

**S-45. Reconciliation evaluation procedures MUST be fixed as follows:**

```text
Inputs:
  target-state = Current persisted target state observed at reconciliation time.
                 Runtime observation, NOT static attribute at snapshot creation.
                 If unresolved save attempt holds durable target identity, verify current persisted target
                 establishment for that identity before deciding.
    ∈ { present, absent, unresolvable }
      present      = Persisted target currently exists (obtain P and proceed to persisted comparison)
      absent       = Persisted target currently does not exist (untitled / pre-persist draft / "new" restore.
                     Even if baseline was absent, if established via commit-success / ACK-lost of Save/Create, becomes present)
      unresolvable = Existence / identity cannot be safely evaluated (deleted / moved / media disconnected, etc.)
  P    = fingerprint(current persisted state)          (only when target-state = present)
  BF   = active baselineFingerprint (no value if baseline is absent)
  SAF  = saveAttemptFingerprint of currently unresolved (un-retired) save attempt (no value if none)
  RPF  = recoveryPayloadFingerprint
  corr = Correlation established with durably recorded and currently unresolved (un-retired) save attempt

Pre-checks (conservative, non-destructive prioritization):
  0a. Cannot parse snapshot payload                                   → corrupt
  0b. Parseable, but fingerprint(payload) != RPF                       → corrupt (integrity mismatch; S-58)
  0c. Reconciliation-critical metadata schema / internal inconsistency → corrupt OR ownership unverifiable (S-59)
  1.  Required project / context unavailable                           → deferred
  2.  target-state = unresolvable                                     → unresolved

Main evaluation:
  3.  target-state = absent
        → safe restore (baseline absent). DO NOT fabricate target (S-49).
  4.  RPF == P
        4a. corr AND SAF == P    → already persisted (S-43)
        4b. Otherwise            → persisted-equivalent (no-op cleanup) (S-44).
                                   If corr is true (SAF != P), retire that attempt from
                                   active correlation simultaneously with this cleanup (S-27).
  5.  corr AND SAF == P AND RPF != P
        → safe restore (baseline advanced). Advance active baseline to P. Retain payload (S-30).
  6.  BF != absent AND P == BF
        → safe restore (baseline unchanged). Payload is unsaved edits.
        (If BF = absent, this branch CANNOT match. MUST NOT compare absent as empty fingerprint / special hash.
         Proceed to 7 if no match on other branches.)
  7.  Otherwise                   → conflict (S-46)

```

`safe restore (baseline unchanged)` and `safe restore (baseline advanced)` share the same UI classification, but differ in internal baseline handling. Implementations MUST NOT conflate them.

Snapshot handling post classification:

* safe restore (all variants) / conflict / deferred / unresolved / corrupt → Retain snapshot. NOT terminal at classification instant. `safe restore` / `conflict` become terminal outcomes when user explicitly confirms restore / resolution, retiring correlated unresolved attempts at that point (S-27 Condition 5 / 6, S-40). If judgment deferred / cancelled, retain snapshot and attempt remains active (S-41).
* already persisted → Destroy after confirmation (retire correlated attempt; S-27 Condition 3).
* persisted-equivalent (no-op cleanup) → Destroy allowed (terminal cleanup). DO NOT record as `already persisted`; retire correlated attempt if present (S-27 Condition 4, S-44).

**S-46. conflict, deferred, unresolved, and corrupt are distinct states, and MUST NOT be equated with "No Recovery".**

* `conflict` = Conservative classification meaning relationship between Recovery payload, baseline, and current persisted state cannot be safely uniquely determined by currently held evidence alone. Persisted state edits by external processes / editors are merely one candidate cause; `conflict` carries NO causal assertion that "external edits were confirmed". Scenarios such as continuing core Save after Recovery metadata write failure and losing correlation info (S-22) are also classified as `conflict`. `conflict` snapshots MUST be retained, requiring explicit user decisions (S-63, S-64).
* `deferred` = Required project / context for reconciliation currently unavailable. Retain until corresponding context becomes available; DO NOT treat as orphan / discard.
* `unresolved` = Context to attempt reconciliation exists, but target cannot be resolved. MUST NOT silently destroy. E.g., if external Markdown is on removable media disconnected at restart, "file does not exist" MUST NOT be immediately interpreted as discard.
* `corrupt` = Recovery data itself (payload parse / integrity, or reconciliation-critical metadata consistency; S-58, S-59) cannot be handled normally. Auto-normalization, overwriting, or deletion MUST NOT be performed (S-61).

### New / Deleted Working Copy

**S-47. Glossary New / Deleted case evaluation MUST be fixed as follows:**

* **New `GlossaryEntryDraft` prior to DB create**: Application-local working-copy identity (S-12), baseline = absent. Target-state is runtime observation at reconciliation time, NOT static snapshot attribute (S-45). Pre-persist drafts DO NOT exist in current implementation (current code commits create to DB via `window.pergamum.glossary.create` from sidebar form first, then opens draft from persisted entry). ADR-0009 defines contract only; introducing client-correlatable create identity / tokens (`saveAttemptToken`) and pre-persist drafts belongs to follow-up Issues.
* **Termination after create commit success but before Renderer acknowledgement**: Create attempt is `unresolved-after-termination`. Upon restart, use attempt's durable target identity (`saveAttemptToken` / client-generated `entryId`) to **runtime-observe current persisted target establishment** (S-45). If target currently exists, set `target-state = present`, obtain P, and proceed to persisted comparison (`already persisted` if correlation confirmed + `RPF == SAF`; "safe restore (baseline advanced)" if post-create edits exist). MUST NOT enter `absent` branch and perform duplicate Create simply because it was "originally absent". If correlation is heuristic only, DO NOT auto-apply; require explicit user confirmation.
* **Entry deleted in DB while Recovery snapshot exists**: Current state is target-state = unresolvable → `unresolved`. If save succeeded in past, that provenance (past baseline, etc.) MAY be retained, but because current target is absent, current reconciliation state is `unresolved`. MUST NOT silently destroy. User MAY restore as new entry via explicit action (no auto-recreation).
* **Conflict between Entry delete and dirty draft**: Deletion is permitted, but existence of open dirty draft / pending Recovery for that entry MUST be user-visible. Deletion MUST NOT silently erase Recovery snapshots. Draft-side Recovery becomes `unresolved`.

**S-48. Markdown New / Deleted case evaluation MUST be fixed as follows:**

* **untitled document**: target-state = absent, baseline = absent. Retain Recovery even without Session. Restore regenerates untitled working copy; MUST NOT arbitrarily invent project path or silently save to project (ADR-0007 R-7, S-49).
* **Source file deleted / moved after Recovery**: target-state = unresolvable → `unresolved`. MUST NOT auto-delete solely due to passage of time (S-62).
* **Project Markdown when project is closed**: `deferred`.
* **Standalone Markdown when media is disconnected**: `unresolved`.

### Semantics After Restore

**S-49. Dirty state, baseline, and provenance after restore.**

* Restored working copy MUST be treated as `dirty` unless content is semantically identical to current persisted state. A restored working copy containing content differing from persisted state MUST NOT be treated as "saved".
* **Restore when target-state = present**: Active baseline identity post restore SHALL be fingerprint of current persisted state (rebase to current persisted state). This ensures subsequent save conflict checks remain meaningful.
* **Restore when target-state = absent** (untitled / pre-persist draft / "new" restore): Active baseline SHALL remain `absent`, and MUST NOT fabricate a persisted target. Baseline becomes present ONLY upon first successful + acknowledged Save / Create (S-16, S-17).
* **Original baseline provenance** referenced by snapshot at capture (`baselineFingerprint` or absent, advisory hints) MUST be retained as provenance for working copy / Recovery metadata until terminal outcome (S-40), even after rebasing active baseline. Architecture MUST NOT lose provenance.

**S-50. Conflict-derived restore provenance MUST be retained until terminal outcome.**

When a user explicitly restores a `conflict` Recovery, content becomes a dirty working copy on current persisted state (rebased baseline; S-49), and provenance that this working copy is a **conflict-derived restore** MUST be retained until terminal outcome. Pergamum SHALL NOT auto-merge. Requiring explicit overwrite confirmation on subsequent save or integrating with live optimistic concurrency is decided in follow-up Issues.

### Reconciliation Timing

**S-51. All project-scoped Recoveries DO NOT need to be reconciled immediately at startup.**

Project-scoped Recoveries become reconciliation targets when the project context corresponding to their `projectId` becomes available.

```text
While Project A is open:
  Project A Recovery → Reconciliation target
  Project B Recovery → Retained as deferred. NO reconciliation until Project B becomes available.

```

The mere existence of Recovery for another project MUST NOT block operations in current project, and MUST NOT be presented as an error itself. Deferred Recovery SHALL NOT be considered orphan / discard, but retained until corresponding context becomes available again.

**S-52. Recoveries not requiring project context (standalone / external Markdown, untitled, pre-persist Glossary drafts) become reconciliation targets when required persisted target / working-copy identities become resolvable.**

These Recoveries MUST NOT be destroyed solely because a Session does not exist (S-6).

### Multi-Instance Ownership and Claims

**S-53. Recovery snapshot write authorization SHALL treat current exclusive claim as sole canonical truth.**

Each application run possesses a unique `instanceRunId`, and MUST mutate **ONLY snapshots for which it currently holds a claim**. Snapshot membership in a namespace does NOT imply write permission (S-14). Multi-instance support MUST NOT regress to single-instance assumptions.

**S-54. `originInstanceRunId` (provenance) and current claim (write authorization) MUST be separated.**

```text
originInstanceRunId  The run that generated the Recovery snapshot. Immutable. Used for restore / reconciliation
                     validation and provenance. NOT a write permission. Does NOT change if claim transfers.
current claim         Sole write authorization capable of mutating the snapshot. Transfers when another instance
                     takes over snapshot of a relinquished or abandoned / confirmed-dead owner.

```

**S-55. To mutate a Recovery snapshot of a relinquished owner or abandoned / confirmed-dead owner, another instance MUST first acquire an exclusive claim.**

* Snapshots of relinquished owners (runs explicitly surrendering ownership upon normal shutdown) and abandoned / confirmed-dead owners (runs confirmed terminated via crash etc.) MAY be taken over following successful exclusive claim acquisition.
* Recovery snapshots owned by another live instance MUST NOT be claimed.
* Recovery snapshots with ownership unverifiable MUST NOT be claimed (MUST NOT be assumed abandoned).
* Multiple live instances MUST NOT simultaneously claim the identical Recovery snapshot.
* Restore, replace, discard, cleanup, or corrupt-isolation MUST NOT be performed prior to successful claim acquisition.
* In races (multiple instances discovering identical snapshot nearly simultaneously), exclusive claim mechanisms ensure at most one succeeds. Instances failing claim MUST retain snapshot without mutating it.

Physical implementations for liveness checks, ownership relinquishment, and exclusive claims (OS locks, leases, heartbeats, atomic renames, PID + start identity, etc.) belong to follow-up Issues.

**S-56. At restart, Recovery snapshot owners MUST be categorized into at least the following:**

```text
current instance                  Current run itself holds claim
another live instance             Another live run holds claim
relinquished owner                Run explicitly surrendered ownership upon normal shutdown etc.
                                  Retaining dirty Recovery upon termination is normal lifecycle, NOT abandoned.
abandoned / confirmed-dead owner  Run confirmed terminated via crash etc.
ownership unverifiable            Owner liveness / claim cannot be confirmed. Includes namespace / originInstanceRunId
                                  inconsistencies unexplainable by recorded claim transfers (S-14).

```

* Snapshots of **relinquished owner** and **abandoned / confirmed-dead owner** are claimable following successful exclusive claim (S-55).
* Snapshots of **another live instance** and **ownership unverifiable** MUST NOT be claimed.
* Retaining dirty Recovery during normal shutdown MUST NOT be called abandoned.

**Claim-free read-only salvage extraction for ownership unverifiable Recovery.**

To allow users to salvage payload content even when ownership cannot be confirmed, **claim-free read-only salvage extraction** SHALL be permitted, distinct from conflict resolution `restore` (normal operation requiring claim; S-27, S-50). Force claiming or "treating as abandoned because user agreed" SHALL NOT be adopted.

Salvage extraction MUST strictly observe the following for ownership unverifiable snapshots:

* MUST NOT acquire claim on original Recovery snapshot. MUST NOT mutate original snapshot / claim metadata / ownership metadata / originInstanceRunId. MUST NOT replace / discard / cleanup / isolate as corrupt.
* **MUST NOT retire original active / unresolved save attempt.** Salvage extraction is NOT a terminal outcome of original Recovery lifecycle (S-27, S-40).
* MUST NOT alter persisted target. MUST NOT write to original target.
* MUST NOT produce destructive effects on original even if a live owner actually exists.

**Integrity conditions permitting salvage** do NOT require "all reconciliation-critical metadata to be valid". If the reason for ownership unverifiable is inconsistency in claim / ownership / target provenance metadata, disallowing salvage on those grounds would self-nullify the escape hatch. Salvage requires NOT trusting original target / ownership, but safely interpreting/copying payload as an independent baseline-absent working copy. Therefore:

* **If payload integrity (S-58) and minimal metadata necessary to interpret payload as an independent working copy (type, schema version, payload encoding info, etc.) are verifiable, salvage SHALL be permitted.** Even if claim / ownership / target provenance are unverifiable, salvage MAY proceed without inheriting them into new working copy.
* If payload itself or metadata required for payload interpretation is unsafe / corrupt, salvage MUST NOT proceed (retained as `corrupt` / `ownership unverifiable`).

Permitted actions under salvage:

* Read Recovery payload and **copy into a new working copy**.
* New working copy receives fresh recovery identity, with persisted baseline set to `absent` (S-16). Formed as baseline-absent working copy per type (Markdown as new untitled working copy; Glossary as new pre-persist working copy without overwriting target). Original claim / ownership / target provenance MUST NOT be inherited into new working copy. Provenance links to source Recovery MAY be retained as needed.
* **Original unverifiable snapshot / its save-attempt state / claim / ownership state MUST remain intact.**

This operation is **NOT a restore**. S-55's principle that "restore / mutation requires claim" is maintained. Concrete UI belongs to follow-up Issues.

### Failure Semantics of Recovery Store

**S-57. Recovery store failures MUST NOT be equated with "No Recovery".**

At least the following MUST be distinguished, isolating failures to individual Recovery units where possible:

```text
Recovery store unavailable            Entire store unreadable (store-level state; outside individual classification; S-42)
individual Recovery unreadable        Individual snapshot unparseable
individual Recovery integrity mismatch Parseable, but inconsistent with RPF or metadata (S-58, S-59)
target unavailable                   Snapshot readable, but target unresolvable
valid Recovery                       Normal

```

Corruption of an individual Recovery MUST NOT cause other readable Recoveries to be treated as invalid.

**S-58. Integrity of stored Recovery payload MUST be verified via `recoveryPayloadFingerprint`.**

Upon read, if fingerprint recalculated from stored payload semantic representation does not match recorded `recoveryPayloadFingerprint`, that snapshot MUST NOT be treated as valid Recovery (classified as `corrupt`; S-45 Step 0b). "Parseable but partially corrupted payload" MUST be distinguished from "unparseable". Checksum formats, hash algorithms, and atomic writes belong to follow-up Issues.

**S-59. Recovery records whose reconciliation-critical metadata integrity cannot be verified MUST NOT be auto-reconciled as valid records.**

Target metadata includes at least:

```text
recoveryId / schema version
target identity (projectId / entryId / path identity, etc.)
baselineFingerprint
saveAttemptFingerprint
saveAttemptToken / correlation metadata
originInstanceRunId / claim-related metadata

```

If schema consistency / internal integrity cannot be verified, classify into most conservative, non-destructive state (`corrupt` or `ownership unverifiable`), and MUST NOT perform silent restore / cleanup. Physical checksums / MACs / atomic file formats belong to follow-up Issues.

**S-60. Capture / write / read failures MUST NOT be silently ignored, and MUST NOT be processed via information notifications alone.**

* If Recovery capture / metadata write (including Step 2 of S-22) fails for a dirty working copy, the system MUST NOT make it appear as though Recovery protection was established.
* These are abnormal states involving user content protection, and MUST NOT be handled solely by `NotificationToast` (reserved for normal-path informational notifications in roadmap Phase 6-1). User-guaranteed-recognizable warning / error UIs MUST be used.
* Recovery store failure alone MUST NOT require totally prohibiting application startup or persisted document viewing where possible. However, the state that "Recovery is unavailable" MUST be recognizable to the user.

**S-61. Corrupt Recovery MUST NOT be automatically normalized, overwritten, or deleted.**

Recovery data evaluated as unreadable or integrity mismatched MUST retain raw data. Follow-up physical storage designs SHALL consider mechanisms allowing quarantine / diagnostics. Quarantine file layouts and repair mechanisms are out of scope for this ADR.

**S-62. Retention / cleanup of unresolved / corrupt Recovery.**

* Unresolved / corrupt Recovery MUST NOT be auto-deleted solely due to passage of time.
* Within Phase 6 scope, age-based silent deletion SHALL NOT be introduced for these. If future age-based cleanup is introduced, conditions MUST be explicitly defined and made user-recognizable (with user confirmation where possible).
* Normal working copy Recovery snapshots (reaching terminal outcome) SHALL be destroyed according to S-40, obeying retention policy in ADR-0007 R-10.

### User Awareness of Abnormal States

**S-63. conflict, ambiguous, corrupt, integrity mismatch, and Recovery unavailable are abnormal states, and MUST NOT be handled solely via `NotificationToast`.**

These MUST be presented via UIs guaranteed recognizable by users (blocking or persistent surface). UI categories and requirement of "guaranteed user recognition" are fixed by this ADR; concrete UI implementations belong to follow-up Recovery UI Issues.

**S-64. Recovery restore IS explicit and non-destructive.**

* Recovery MUST NOT be auto-restored (ADR-0007 R-8).
* Persisted state MUST NOT be silently overwritten by Recovery.
* When multiple Recovery candidates exist for same target, system MUST NOT auto-select; explicit user choice IS required (ADR-0007 R-9).
* Recovery data MUST NOT be output raw in debug logs / console / dialogs (ADR-0007 R-8, ADR-0008).

### Glossary Specialization

**S-65. Glossary fingerprints SHALL be calculated by serializing the semantic representation in S-35.**

Fingerprint scope matches fields and normalizations specified in S-35 (excluding form id / `created_at` / `updated_at` / SQLite rowid, surface trimmed, empty surface non-canonical forms excluded, no Unicode / width / case folding). Independent field lists MUST NOT be defined. Byte representation (delimiters, escaping) and hash algorithms belong to follow-up Issues.

**S-66. Glossary live save currently uses last-write-wins, and conflict detection IS owned by reconciliation.**

`updateGlossaryEntry` currently overwrites DB rows unconditionally without inspecting baseline / revision. This ADR assumes this premise, placing conflict detection in Recovery reconciliation (S-45). Optimistic concurrency checks on live save path (comparing baseline fingerprint with current DB state at save time, triggering explicit conflict handling on mismatch) belong to follow-up Issues. Residual dirty post save (server normalization removing empty form rows, etc.) is resolved via S-35 "excluding empty surface form rows from semantic state", and MUST NOT immediately generate conflicting snapshots from post-save residual dirty state.

---

## Relationship to ADR-0008 (partial supersession)

ADR-0008 defines `.pergamum_recovery/` under project root, stating it "may contain unsaved body text, dirty document recovery data, crash recovery data, and save failure recovery support data". This decision to place working-copy Recovery in `.pergamum_recovery/` conflicts with S-8 / S-9 of this ADR.

**S-67. Regarding storage location of working-copy Recovery, ADR-0009 partially supersedes the corresponding decision in ADR-0008.**

* **Storage location for working-copy Recovery (unsaved Markdown body text, unsaved `GlossaryEntryDraft` content, and associated reconciliation metadata) SHALL treat ADR-0009 as canonical source.** Application `userData`-side dedicated Recovery store SHALL be used (S-8), and `.pergamum_recovery/` MUST NOT be used as working-copy Recovery store.
* This supersession is **partial**. Overall status of ADR-0008 remains unchanged. ADR-0008 decisions regarding Project File / Project Root / project name / project metadata / project boundary / allowing multiple `.pergamum` files / one-folder-one-instance policy / OS file associations remain valid.
* Future uses for `.pergamum_recovery/` (deletion, dedicated to derived data, etc.) and future treatment of `project.recoveryDirectoryName` setting (validity / purpose) are NOT decided in this ADR. **Only the boundary prohibiting use for working-copy Recovery is established.**
* Corresponding amendment notes have been added to ADR-0008 (`0008-...ja.md` under "Amendments" section and beginning of "Project-local recovery directory" section).

---

## Existing Implementation Survey Results and Gaps with Issue Premises

1. **Glossary "new `GlossaryEntryDraft` prior to DB create" DOES NOT exist in current implementation.** Current code commits create to DB first via `window.pergamum.glossary.create` from sidebar form, then opens draft from persisted entry. The `persisted revision = 12` type model and pre-persist drafts in Issue are net-new designs; S-12 / S-16 / S-47 establish contracts only, leaving implementation to follow-up Issues.
2. **`persisted revision` DOES NOT exist in schema.** `glossary_entries` contains only `id` / `kind` / `description` / `created_at` / `updated_at`. Thus baseline identity adopted content fingerprinting (S-18 to S-22).
3. **Glossary save LACKS baseline / optimistic concurrency checks.** `updateGlossaryEntry` is last-write-wins. Conflict detection is designed to be owned by Recovery reconciliation (S-45, S-66); live save path conflict checks belong to follow-up Issues.
4. **Markdown external change detection is UNIMPLEMENTED.** `editorState.ts` defines `EditorSyncState` and `isEditorConflicted`, but they are disconnected at runtime. File persisted baseline exists only as in-memory `savedContent` snapshot; fingerprint / mtime / size are not persisted. This ADR requires Recovery metadata to hold `baselineFingerprint` and advisory hints (S-19). External change detection implementation (mtime / size / hash) belongs to follow-up Issues under ADR-0007 R-13.
5. **Markdown I/O BOM / encoding (investigated 2026-08-27).** Read strips BOM and records `hadBom` in metadata, but renderer leaves it unused. Write does not re-attach BOM, using `fs.writeFile(..., "utf8")`. Encoding is fixed to `"utf8"`. Only line-ending types determine save bytes. Therefore Markdown canonical persisted representation is BOM-less UTF-8, and fingerprints are calculated against canonical persisted representation rather than raw disk bytes (S-34). If BOM preservation / encoding detection is added in future, it SHALL be integrated into semantic representation and fingerprint inputs simultaneously.
6. **Conflict between ADR-0008 `.pergamum_recovery/` and Issue premise.** Partially superseded in S-67 with amendment notes added to ADR-0008. Future uses of `.pergamum_recovery/` and `project.recoveryDirectoryName` remain undecided.
7. **Session persistence / restore core is UNIMPLEMENTED.** No session / recovery implementation exists in `src`; this work is a greenfield design.
8. **Items requiring determination decided in this Issue**: Treat trailing whitespace in description as dirty difference (S-35); exclude empty non-canonical form rows from semantic state (S-35); untouched untitled / untouched pre-persist draft are not dirty and require no Recovery snapshot (S-31); Markdown persisted fingerprint is calculated against canonical BOM-less UTF-8 representation (S-34).
9. **Items contractually specified in this ADR, delegating values to follow-up Issues**: Hash algorithms and byte specs for fingerprints; async scheduling for fingerprint calculation; debounce duration; retention periods / generation limits; concrete conditions for unresolved / corrupt cleanup; physical mechanisms for instance liveness / exclusive claims; physical storage format / directory layout / atomic writes / checksums for Recovery store; save request queue implementation; integration of conflict-derived restore and live save; Recovery management UI.
10. **Implementation status (as of Phase 7-2 / 2026-09-01).** Items 1-9 above were surveyed on 2026-08-27; this clarifies what changed and what did not by Phase 7-2.
    - **Implemented (the current Recovery restore path)**: capture of the dirty payload (recording a base fingerprint `baseSize` / `baseSha256`); previous-run detection via `origin_instance_run_id` plus the startup candidate list / auto-show / reminder; a **flat candidate list** keyed by `recoveryId`; restore (the candidate body is atomically written to a **new `.recovered[-N].md` sidecar**; the **original file is never overwritten**; an existing `.recovered` is never overwritten); a **two-phase finalize** (the restore module only writes and never deletes a Recovery row -> the renderer opens the written file -> then `recovery:finalizeRestoredCandidates` deletes the row; **row deletion happens after restore finalize**). The code label is "Phase 6-4-4".
    - **Not implemented (this ADR is contract only; not current behavior)**: the reconciliation classification engine (S-42 to S-46); the S-45 decision procedure; reconciliation timing (S-51 / S-52); the save-attempt lifecycle and retirement (S-27, `saveAttemptFingerprint` / `saveAttemptToken`); per-snapshot exclusive claim (S-53 to S-56); external-change detection (the consumer side of the S-19 advisory hints; see item 4); reconciliation by overwriting the original file. Nothing consumes the recorded base fingerprint for classification.
    - **What "Status: Accepted" means**: this ADR is accepted as the **contract** for working-copy Recovery. It does not mean every S-* procedure is implemented today. Only the implemented scope above has shipped.
    - **Relationship to ADR-0010 (Startup File-Open Routing)**: ADR-0010 **does not change** this Recovery contract. Startup Markdown routing does not affect Recovery snapshot classification, claims, or ordering. The startup routing rejection dialog / read-only confirmation are presented from the same deferred-dialog idle boundary as the other cold-start restore Error dialogs to avoid modal collisions (the **absolute ordering** relative to the Recovery candidate dialog **is not normativized in ADR-0010**; see ADR-0010 §Implementation notes). A known limitation about the Recovery owner under multi-instance is recorded in ADR-0010 KNOWN-3.

---

## Consequences

* Markdown documents and Glossary Entries follow the identical working copy Recovery contract despite differing persistence targets. Glossary-specific concerns are encapsulated in specialization (S-65 to S-66).
* Baseline identity is unified under content fingerprints, independent of timestamps / revision presence. Separating three fingerprints (baseline / saveAttempt / recoveryPayload) and save-attempt lifecycles prevents accidents where post-save initiation edits are treated as clean due to save success (whether acknowledged or un-acknowledged), as well as accidents falsifying provenance as `already persisted`.
* Save-attempt state (`prepared` / `in-flight` / `acknowledged-success` / `acknowledged-failure` / `unresolved-after-termination`) is logically separated from Recovery payload lifecycle, preventing payload cleanup from destroying unresolved attempt provenance. Acknowledged-failure retires correlation, preventing stale failed attempts from contaminating `already persisted` evaluations.
* Save-attempt retirement conditions treat **S-27 as canonical and complete list**, referenced rather than re-listed by other statements. Explicit user confirmation of `safe restore` (baseline advanced / unchanged / absent) is included in retirement conditions (S-27 Condition 5), preventing accidents where working copies restored via reconciliation continuously occupy S-25 slots and permanently block subsequent Saves. If judgment deferred / cancelled, snapshot retained and attempt remains active.
* Unresolved save attempts for the same working copy are restricted to at most one, preventing reconciliation ambiguities from multiple in-flight attempts.
* Gating against early terminal clean during in-flight save Undos (S-38) ensures unsaved working copies are not lost even if commit success advances baseline.
* Dirty comparison and fingerprint calculation depend on the identical semantic representation (S-33 to S-35), preventing divergence bugs. Treatment of Markdown byte-affecting state (currently line-ending types only) is consistent, avoiding ad-hoc special casing for BOM / encoding.
* Introducing `present / absent` to persisted baseline ensures untitled / pre-persist drafts / "new" restores do not fabricate persisted targets or empty persisted states.
* Recovery capture is explicitly best-effort (S-36), creating no guarantee that "Recovery is absolutely guaranteed". Compatible with failure semantics in S-60.
* Reconciliation classifications are separated from terminal outcomes / terminal cleanup (S-40, S-42), and Recovery store unavailable is treated as a store-level state outside individual classifications.
* Write authorization in multi-instances is unified under current exclusive claim (S-14, S-53), excluding namespace / `originInstanceRunId` from write authority. Relinquished / abandoned-confirmed-dead owner snapshots are mutable only post claim acquisition; races succeed for at most one instance. Multi-instance support does not regress.
* Payload integrity (S-58) and reconciliation-critical metadata integrity (S-59) are required, falling back broken records to conservative, non-destructive states.
* **During periods lacking Recovery management UI, deferred Recoveries for never-reopened projects, unresolved Recoveries with unresolvable targets, and ownership unverifiable Recoveries MAY accumulate on app userData side unseen by users.** Ownership unverifiable snapshot remains intact and non-terminal even after claim-free read-only salvage extraction (S-56), lingering long-term. Because Phase 6 introduces no silent age-based deletion, this accumulation is an intended conservative safety trade-off. Minimal management means to inspect / explicitly discard deferred / unresolved / ownership unverifiable snapshots SHALL be considered in follow-up Issues (concrete UI not decided in this ADR).
* ADR-0009 partially supersedes corresponding decisions in ADR-0008 regarding working-copy Recovery storage location (S-67).

---

## Alternatives Considered

### Using timestamp (`updated_at` / file mtime) alone as baseline identity

Rejected. Cannot distinguish "committed but unacknowledged" from "external conflict". Restricted strictly to advisory hints / diagnostics.

### Requiring monotonically increasing revision as mandatory mechanism

Not adopted. Requires Glossary schema changes, and file-backed Markdown lacks a counterpart. Fingerprints made mandatory; revision remains optional future reinforcement.

### Treating acknowledged save alone as terminal outcome for Recovery lifecycle

Rejected. Post-save edits made after save initiation would be lost. Re-evaluate working copy against new baseline following acknowledged-success, making outcome terminal ONLY if no residual unsaved state exists (S-28).

### Destroying snapshot if working copy matches current baseline during in-flight save

Rejected. If baseline advances upon unresolved save attempt success, destroyed unsaved working copy is lost. Defer destruction until save attempt resolves (S-38 gate).

### Making save-attempt correlation share lifecycle with Recovery payload

Rejected. Payload cleanup would lose unresolved attempt provenance. Separate logical lifecycles, explicitly retiring upon acknowledged-success / failure (S-26, S-27, S-29).

### Defining `corr` as "has attempted save in past"

Rejected. Retired failed attempts would falsely satisfy `already persisted`. Restrict `corr` to "correlation with durably recorded, currently unresolved attempt" (S-27, S-29, S-43).

### Evaluating `already persisted` solely on "persisted content matches recovery payload"

Rejected. Accidental alignment via external paths falsifies provenance. Require confirmation of correlated unresolved save attempt, distinguishing non-correlated matches as `persisted-equivalent (no-op cleanup)` (S-43, S-44).

### Allowing multiple in-flight save attempts for the same working copy

Rejected for Phase 6. Single save-attempt slot cannot reconcile correctly otherwise. Restrict unresolved attempt to at most one, serializing / queuing subsequent requests (S-25).

### Durably recording saveAttempt metadata alone prior to persist

Rejected. Immediate Save before debounce fires prevents post hoc correlation with latest working-copy payload. Require consistent durable state including payload prior to persist start (S-22).

### Calculating Markdown fingerprints against raw disk bytes

Rejected. Raw bytes of files with BOMs do not match bytes Pergamum writes back, causing unedited files to appear conflicted. Calculate against canonical persisted representation (bytes pipeline actually writes) (S-34).

### Special-casing BOM in ad-hoc manner

Rejected. Breaks when encodings etc. increase. Byte-affecting state preserved/reproduced by current pipeline is handled consistently as semantic representation, applying identical principles to future additions (S-34).

### Treating namespace as write authorization

Rejected. Ambiguates write authority after instance B claims snapshot originating in A. Write authorization treats current exclusive claim as sole truth, restricting namespace to partitioning and `originInstanceRunId` to provenance (S-14, S-53, S-54).

### Storing full unsaved body text / draft in Session state

Rejected. Violates non-negotiable constraints. Session restricted to identity + navigation.

### Placing Recovery in Project DB / project-local files (including `.pergamum_recovery/`)

Rejected. Places Recovery in identical failure domain as persisted state; project corruption / deletion / move loses Recovery simultaneously.

### Auto-applying Recovery at launch / silently overwriting persisted state

Rejected. Violates non-destructive, explicit choice principles in ADR-0004 / ADR-0007.

### Treating "file missing" or "store unreadable" as "No Recovery" and cleaning up

Rejected. Data loss risk. Categorize into deferred / unresolved / corrupt instead of destroying. Store-wide unavailability treated as store-level state outside individual classifications (S-42).

### Auto-normalizing, overwriting, or deleting corrupt / integrity-mismatched Recovery

Rejected. Loses forensic / quarantine value. Retain raw data (S-58, S-59, S-61).

### Guaranteeing capture "always succeeds"

Rejected. Conflicts with capture / write failures in S-60. Treat as best-effort, obeying failure semantics in S-60 upon failure (S-36).

### Handling conflict / corrupt / unavailable solely via `NotificationToast`

Rejected. Abnormal states require user-guaranteed-recognizable UIs.

### Sharing single Recovery namespace across instances / assuming single-instance

Both rejected. Former causes concurrent instances to overwrite each other's snapshots. Latter cuts multi-instance support. Treat current exclusive claim as write authorization, taking over snapshots of relinquished / abandoned-confirmed-dead owners via claim (S-53 to S-56).

### Processing relinquished / abandoned owner Recovery in another instance without claim

Rejected. Races where B and C launch nearly simultaneously cause double processing / double restores. Require exclusive claim acquisition (S-55).

### Cleaning up snapshots returning to semantic clean via post-restart reconciliation

Rejected. Leaves stale snapshots, increasing no-op reconciliations. Destroy upon return to clean during live runtime (S-38; gated).

### Accumulating multiple Recovery snapshot generations per working copy as restore candidates

Out of scope for this Issue. Exactly one current logical generation retained; historical Recovery reserved for future features.

### Defining Glossary dirty checking and fingerprints using separate field sets

Rejected. Future drift creates bugs where "dirty matches, but fingerprint differs". Both rely on single semantic representation (S-33, S-35, S-65).

### Performing Glossary dirty checking via un-normalized byte matching

Rejected. Form reordering or equivalent form sets falsely mark as dirty. Compare surface / forms via normalized sets, and description verbatim. Neither rewrites saved content.

---

## Future Work / Follow-up Issues

* **Recovery store foundation**: Physical storage formats, directory layout, atomic writes, checksums / MACs, schema, `recoveryId` generation, and collision handling (ADR-0007 R-6).
* **fingerprint specifications**: Hash algorithms, byte specs for Markdown / Glossary canonical persisted representations, and async / streaming calculation methods outside critical paths (S-23).
* **Recovery capture implementation**: Debounce duration, coalescing, lifecycle boundary hooks, persist preflight (Step 2 of S-22), destruction on semantic clean return with gate, normal shutdown flush.
* **save-attempt lifecycle implementation**: Durable recording of save-attempt state, enforcement of single unresolved attempt, serialization / queuing of subsequent Save requests, retirement on acknowledged-failure.
* **Session persistence foundation (Phase 6-2)** / **Session restore (Phase 6-3)**: Schemas for identity + navigation, missing / corrupt fallback, zero-tab handling.
* **Recovery reconciliation implementation (Phase 6-4)**: Evaluation procedures in S-45, baseline present / absent handling, triggers on project context availability, confirmation and destruction of already persisted / no-op.
* **Recovery UI**: Classification presentation, explicit multi-candidate selection, user-guaranteed-recognizable UIs for conflict / corrupt / integrity mismatch / unavailable, **minimal management surface to inspect / explicitly discard deferred / unresolved / ownership unverifiable Recovery**, and UI flows for claim-free read-only salvage extraction (S-56) on ownership unverifiable snapshots.
* **Multi-instance exclusive claim**: OS locks / leases / heartbeats / atomic renames / PID + start identity, claim arbitration during races, handling ownership unverifiable, recording claim transfers.
* **Markdown external change detection**: `EditorSyncState`-driven and live conflict handling via mtime / size / content hashes (follow-up to ADR-0007 R-13).
* **Markdown byte-affecting state extension**: Follow-up candidate "Preserve or explicitly define UTF-8 BOM behavior for Markdown files" (existing pipeline strips BOM on read and does not re-attach on write = existing behavior drops BOMs; NOT a new ADR-0009 spec). If BOM preservation / encoding detection is added, integrate into semantic representation and fingerprint inputs simultaneously (following principles in S-34).
* **Glossary live save conflict checking**: Optimistic concurrency checking at save time and explicit conflict handling, integration with conflict-derived restore (S-50).
* **Glossary pre-persist new draft**: Application-local identity, client-correlatable create identity / token, reconciliation of un-acknowledged creates.
* **Glossary schema expansion evaluation**: Necessity of monotonic `revision` column.
* **Retention / cleanup policy**: Retention of unresolved / corrupt Recovery, and explicit conditions if introducing future age-based cleanup.
* **Determining future uses of `.pergamum_recovery/` and handling `project.recoveryDirectoryName**`: Boundary prohibiting use for working-copy Recovery established in S-67. Addressed via ADR-0008 addendum or new ADR when purpose is decided.
* **Quarantine / diagnostic methods for corrupt Recovery**.

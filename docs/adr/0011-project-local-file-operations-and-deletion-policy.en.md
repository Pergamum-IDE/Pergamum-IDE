# ADR-0011: Project-Local File Operations and Deletion Policy

**Status:** Proposed

**Date:** 2026-09-01

> On Status: this ADR is Proposed. Promotion to Accepted will be considered after the File Explorer deletion feature is implemented, or after the deletion behavior has been verified in dogfooding.

---

## Context

The Issue #351 pre-investigation of existing ADRs / docs found **no** broad normative policy that forbids "project / file / folder deletion" in the committed ADRs / docs.

- Every normative "must not delete" statement is scoped to **Recovery data** (ADR-0007 R-10; ADR-0009 S-46 / S-61 / S-62: no silent deletion, no age-based auto-deletion, etc.).
- ADR-0008 says the recovery directory "must not be **implicitly** moved, deleted, or overwritten", but only in the context of an implicit operation when the `project.recoveryDirectoryName` setting changes.
- `docs/roadmap.md` Phase 7 "File operations candidates" explicitly lists **`delete with confirmation`** as a planned feature. Delete is **not** in the "not addressed in Phase 7" list.
- File Explorer currently implements create / rename / move, but no dedicated ADR owns these, and **delete is not implemented**.

Therefore this ADR is **not** a document that retracts an existing "no deletion" ADR. It **newly defines the boundary and safety conditions for project-local file / folder deletion in File Explorer.**

### Design intent

Pergamum **does not provide project deletion.** There is no path to delete a project itself (the project root or the `.pergamum` project file).

But Pergamum calls itself an IDE — an integrated writing environment. Being an integrated writing environment, it may provide an operation for the user to **explicitly discard a manuscript file or a working folder** managed by File Explorer. That is the PO decision behind this ADR.

Deleting one manuscript file is the equivalent of **crumpling up one sheet of draft paper and throwing it away.** That is different in meaning from discarding the work (the project) itself.

This ADR makes explicit the split between "discard the work (forbidden)" and "discard a sheet of paper inside the work (allowed via an explicit operation + confirmation)".

---

## Related ADRs

- **ADR-0008 Project File, Project Root, and Project-Local Recovery Layout** — this ADR **uses as premises** the project root / project boundary / the `.pergamum` project file (project entry point, OS file association target) / the acceptance of multiple `.pergamum` files within one project root. This ADR's deletion boundary (limited to under the project root; `.pergamum` protected) relies on ADR-0008's boundary definition.
- **ADR-0009 Working Copy Persistence and Recovery Model** — references S-48 ("source file deleted / moved after Recovery → target-state = unresolvable → `unresolved`"). A Markdown deletion via File Explorer likewise must not silently delete an existing Recovery snapshot; it becomes subject to `unresolved` / user-visible handling. This ADR **does not redesign Recovery.**
- **ADR-0003 UI Interaction Architecture** — I-3: "Navigator / modal may provide limited operations that do not need a work surface, such as rename, toggle, and **deletion confirmation**." Deletion follows the "explicit command + confirmation dialog" pattern.
- **ADR-0005 Command Domain Taxonomy** — the `workspace` domain owns project-structure operations, including "file reveal / rename / delete". The delete command belongs to the `workspace.file.*` domain.
- **ADR-0004 Manuscript Non-Destructive Policy** — the principle of not implicitly rewriting the **bytes** of the manuscript. A File Explorer deletion is "a destructive operation the user explicitly requested", which is a different kind of thing from the "implicit rewrite" that ADR-0004 forbids. ADR-0004 does not forbid it.
- **ADR-0000 Accessibility and Inclusive Interaction Principles** — the deletion confirmation dialog must be user-visible and present information (what will be removed) that does not confuse the user.
- **ADR-0010 Startup File-Open Routing (Cold Start)** — align with how `realpath` is used for the project-local decision (PATH-4).
- **docs/roadmap.md Phase 7** — "File operations candidates: … delete with confirmation" / "file operations go through an explicit command / Main Process API". This ADR concretizes that plan.

---

## Definitions

**project-local entry**

A file or folder that **actually exists under** the project root (ADR-0008) of the currently open project. The check resolves `realpath` where necessary and does not treat a path that escapes the project root as project-local (same approach as ADR-0010 PATH-4).

**protected entry**

An entry that must not be a target of File Explorer deletion because it is involved in project identity, settings, recovery, or exclusive locking (enumerated in DEL-12).

**detach (Close Project)**

The operation that detaches the project from the current window. `workspace.project.close`. It **does not change anything** on the filesystem — not the project root, not the `.pergamum` file, not any project-local file. This ADR uses the word `detach` only to explain that "Close Project is a detach, not a deletion" (DEL-1). Reorganizing terminology across the existing ADRs is out of scope for this ADR.

**item**

The enumeration unit of the deletion confirmation dialog. It refers to both files and folders (including empty folders) (DEL-11).

---

## Decision

### File operation premises (FILEOP)

**FILEOP-1. Project-local file operations go through an explicit command and the Main Process API only.**

Project-local file operations — including create / rename / move / delete — are executed through an explicit command and the Main Process API. The renderer does not operate on the filesystem directly (`docs/roadmap.md` Phase 7).

**FILEOP-2. The target of a project-local file operation is limited to entries under the project root.**

A path that escapes the project root (including after `realpath` resolution) must not be an operation target.

### Deletion policy (DEL)

**DEL-1. Pergamum does not provide project deletion.**

There is no operation to delete a project itself. At minimum the following are forbidden:

- deleting the project root
- deleting the `.pergamum` project file
- treating Close Project as a "deletion"

Close Project is a detach (detaching the project from the current window), not a deletion.

**DEL-2. Project root deletion is forbidden.**

The project root directory itself must not be deleted from inside Pergamum. File Explorer does not present the project root as a deletion target.

**DEL-3. Deletion of the `.pergamum` project file and its SQLite sidecars is forbidden.**

The `.pergamum` project file is the project entry point and is also an OS file association target. The `.pergamum` project file must not be deleted from File Explorer. The following SQLite sidecars must not be deletion targets either:

- `.pergamum`
- `-journal`
- `-wal`
- `-shm`

**The protected set includes not only the active project file but every other `.pergamum` file that may exist within the same project root** (including backups / copies — a use case that ADR-0008 explicitly allows). If the user wants to delete a `.pergamum` file, they do it via the OS / file manager.

**DEL-4. File Explorer file / folder deletion is allowed only for project-local entries.**

Project-local file / folder entries managed by File Explorer may be deleted, conditioned on an explicit operation and a confirmation dialog. Targets are limited to under the project root (FILEOP-2). A file / folder outside the project root must not be a Pergamum deletion target. The project-local check uses `realpath` where necessary and must not make a path that escapes the project root a deletion target.

**DEL-5. Deletion goes through an explicit command / the Main Process API only.**

The renderer must not perform filesystem deletion directly (a consequence of FILEOP-1).

**DEL-6. Silent deletion is forbidden.**

Pergamum must not silently delete a file / folder. Deletion always involves a user-visible confirmation dialog.

**DEL-7. Deletion must go through a confirmation dialog.**

Deletion must go through a confirmation dialog. The confirmation dialog displays the deletion targets as a **table**, even for a single-file deletion (DEL-10).

**DEL-8. Do not move to the OS trash / recycle bin.**

The File Explorer deletion defined by this ADR is not a move to the OS trash / recycle bin; it is a **direct deletion**. The confirmation dialog therefore makes the following explicit:

- that items are not moved to the trash
- that this operation cannot be undone

OS trash / recycle bin integration is future work / a non-goal.

**DEL-9. The delete button of the deletion confirmation dialog is enabled after a 5-second wait.**

When the deletion confirmation dialog opens, the delete button is disabled, and is enabled after a 5-second wait. Cancel is always available.

The measurement start point (when enumeration is long), whether a remaining-time countdown is shown, table updates, and other detailed UI are decided by the File Explorer implementation spec (not normativized in this ADR).

**DEL-10. Enumerate the deletion targets as a table.**

The deletion confirmation dialog displays the deletion targets as a table. Even a single file is shown as a table. Columns:

| Column | Content |
| --- | --- |
| Path | project-root-relative path (parent folder) |
| Name | file / folder name |
| Last modified | the target's mtime |
| First 10 characters | auxiliary information to confirm the target is the file the user intended |
| Last 10 characters | same |
| Total bytes | the target file's size |

"First 10 characters" / "Last 10 characters" are auxiliary preview information; **the whole file need not be read.** The implementation reads only a small head / tail range, and shows the first 10 / last 10 characters only when it can do so safely. When the content is unreadable, decoding fails, or it cannot be previewed safely, show **`Preview unavailable`**.

(This is the same kind of auxiliary information as the existing Recovery candidate dialog's `previewSnippet` — the first ~10 code points, whitespace collapsed, `…` appended. The implementation should consider reusing that logic.)

**DEL-11. Folder deletion uses the same confirmation UI.**

Folder deletion uses the same confirmation UI as file deletion. When the selection includes a folder, **recursively enumerate the targets that will actually be deleted** under that folder. Whether it is 10 files or 200 files, the targets to be deleted are shown in the same table. It is not a spec to replace enumeration with a summary-only warning because the count is large.

Handling of empty folders:

- The table treats its rows as "**items**", not "files".
- An empty folder is also shown in the table as a deletion target.
- For folder rows, "First 10 characters" / "Last 10 characters" may show `Folder`, and "Total bytes" may show `—`.

**DEL-12. Protected entries cannot be deleted.**

The following must not be targets of File Explorer deletion:

- `.pergamum` project files
- SQLite sidecars (`-journal` / `-wal` / `-shm`)
- `.pergamum_recovery/`
- `.pergamum.lock/`
- `.pergamum.lock.stale-*`
- `pergamum.json`
- existing reserved File Explorer names
- existing protected suffixes

The existing implementation's `RESERVED_FILE_EXPLORER_NAMES` / `pathHasReservedFileExplorerSegment` / `protectedPergamumFileSuffixes` are assumed to be reused.

**If the subtree of a selected folder contains a protected entry, that folder cannot be deleted as a whole.** In that case the deletion is refused and the reason is presented user-visibly. "Partial deletion" — deleting the rest while keeping the protected entry — is not adopted in this ADR. This is a conservative decision to avoid accidentally breaking project infrastructure.

**DEL-13. Do not silently lose a dirty / open editor.**

The handling when a deletion target includes an open editor follows this safety policy:

- A dirty editor must not be silently discarded.
- When an open editor is included in a deletion target, it is handled user-visibly before deletion.
- After deletion, an open editor identity must not remain in a dangling state.
- Detailed UX may be finalized in the implementation Issue, but **silent data loss is forbidden.**

**DEL-14. Do not silently delete a Recovery snapshot.**

References ADR-0009 S-48. When a Markdown file is deleted, an existing Recovery snapshot must not be silently deleted. Recovery becomes subject to `unresolved` / user-visible handling. This ADR does not redesign Recovery.

**DEL-15. Make the deletion result user-visible and refresh File Explorer on success. Abort is not a rollback.**

- The deletion result (which items succeeded, which failed) must be user-visible. Failed items must not be silently ignored.
- After a successful deletion, File Explorer must be refreshed, and a deleted file / folder must not remain in the tree.
- If an abort of the deletion is implemented, the abort is not a rollback that restores already-deleted items; it stops the execution of items not yet deleted. Items deleted up to the abort point remain deleted, and that too is made user-visible as part of the result.

Detailed execution UI such as the button transition after deletion starts ("Delete" → "Abort", etc.) and incremental display is handled by the File Explorer implementation spec. The safety requirements this ADR fixes are: "not silent (DEL-6) / confirmation dialog required (DEL-7) / 5-second wait required (DEL-9) / targets shown as a table (DEL-10, DEL-11) / result and failures made user-visible (this DEL-15) / abort is stopping not-yet-executed items and is not a rollback (this DEL-15)".

### Deletion confirmation dialog wording (draft)

The English version conveys the following intent:

> You are about to delete the following &lt;N&gt; item(s).
>
> Deleted items are not moved to the trash; they are deleted directly.
> This operation cannot be undone.
>
> Are you sure you want to delete?

Supplement when folders are included:

> Files and subfolders contained in the selected folder(s) are also included as deletion targets.

Buttons:

- Cancel (always enabled)
- Delete (disabled for 5 seconds from when the dialog opens)

---

## Consequences

### Positive

- The natural boundary for an integrated writing environment — "you cannot delete the project, but you can discard a sheet of paper inside it via an explicit operation" — is made explicit.
- Deletion is limited to going through an explicit command / the Main Process API (FILEOP-1), consistent with the existing principle that the renderer does not touch the filesystem. Future D&D / bulk operations ride on this path too.
- The confirmation dialog presents "what will be removed" as a table plus head/tail preview, so an unintended file deletion can be noticed.
- The 5-second delay and the explicit "not moved to the trash / cannot be undone" wording suppress reflexive confirmation.
- Protected entries (the `.pergamum` set, recovery, lock, `pergamum.json`) are protected by reusing the existing reserved-name infrastructure, creating no project-corruption path.
- The relationship to Recovery is kept within ADR-0009 S-48's existing contract; Recovery is not redesigned.

### Negative / Trade-offs

- It is a direct deletion that does not go to the OS trash, unlike the "delete = trash" experience of the OS Explorer / Finder. The 5-second delay, the table, and the wording mitigate this, but UX friction remains.
- Because the policy for folder deletion is to show the entire subtree as a table, for very large subtrees (thousands of entries) the enumeration / rendering cost can become a problem. Because summary-only and omitting targets are forbidden, the implementation needs display-performance measures that **keep the principle of showing every item** (virtualization / pagination / progressive rendering / enumeration cancellation) (implementation follow-up).
- The head/tail 10-character preview requires a small read per target file. Encoding is assumed to be BOM-less UTF-8 to match the current pipeline, and anything unsupported is `Preview unavailable`. It stays within a scope that does not step into the (future) text encoding policy.
- Because of DEL-3, a backup `.pergamum` copy in the same project root also cannot be deleted from inside Pergamum and must be deleted on the OS side.
- A folder whose subtree contains a protected entry cannot be deleted as a whole (DEL-12). In a "I just want to tidy up part of the project" case, the user may have to re-select targets individually.

---

## Alternatives Considered

### Provide no deletion at all in File Explorer (keep the prior implicit stance)

Rejected (PO decision). As an integrated writing environment, explicit discarding of manuscript files / working folders is provided. Project deletion continues not to be provided.

### Send deletions to the OS trash (`shell.trashItem`, etc.)

Rejected for now. There are platform differences, trash availability, and sandbox constraints, so the behavior becomes environment-dependent. First fix the boundary with "direct deletion + strong confirmation"; OS trash integration is future work (DEL-8).

### Use summary-only ("Delete N files inside the folder") for high-count folder deletion

Rejected (PO instruction). Concretely enumerating what will be removed is the main purpose of the safety confirmation, and enumeration is not omitted because the count is large (DEL-11). Handling the enumeration cost is an implementation-side task.

### No delay on the delete button / a checkbox confirmation instead

Rejected. To prevent reflexive confirmation, a time delay (DEL-9) and a tabular presentation of the targets (DEL-10) are adopted.

### Allow `.pergamum` deletion "only for non-active copies"

Rejected (PO decision). All `.pergamum` files within the same project root are protected (DEL-3). This leaves no room for the accident of deleting the active project file or for a misidentification. To remove a backup / copy `.pergamum`, do it on the OS / file manager side.

### Partially delete a folder while keeping protected entries

Rejected (PO decision). A folder whose subtree contains a protected entry cannot be deleted as a whole (DEL-12). Partial deletion invites the risk of breaking project infrastructure and the confusion of a half-finished deletion result.

---

## Non-goals

This ADR does not address:

- project deletion
- project root deletion
- `.pergamum` project file deletion
- OS trash / recycle bin integration
- undo for deletion
- external drag-and-drop import
- deletion of arbitrary external files outside the project root
- runtime file watcher
- Recovery redesign
- text encoding policy
- `.txt` support
- `.mdown` / `.mkd` support

---

## Future Work

- OS trash / recycle bin integration (per platform).
- Undo for deletion / a short-term restore path.
- Display performance of the confirmation UI for large-subtree deletion (virtualization, pagination, progressive rendering, enumeration cancellation; the principle of showing every item is kept).
- Reporting UI for partial deletion failure (permission error, etc.) (potential reuse of the #346 read-only failure-list dialog).
- UI integration of move / delete including D&D (the roadmap Phase 7 ordering).

---

## Open items delegated to the implementation Issue (non-normative / implementation follow-up)

> This section is **non-normative.** It does not constrain or change the normative decisions in §Decision above; it is a list of items to be finalized in the implementation Issue and the File Explorer implementation spec.

1. **DEL-9 timer detail**: the measurement start point (when target enumeration is long, whether to count from when the dialog is shown or from when enumeration completes), whether a remaining-time display is shown. Note: "enabled after a 5-second wait" itself is a normative decision (DEL-9).
2. **DEL-10 / DEL-11 enumeration display performance**: virtualization / pagination / progressive rendering / enumeration cancellation for very large subtrees. **The principle of showing every item is kept; no replacement with summary-only and no omission of targets** (this is the DEL-11 normative decision).
3. **Head/tail preview (DEL-10)**: the byte window size to read, the decode strategy, code point / grapheme handling, whitespace / newline collapsing (how much of the Recovery `previewSnippet` logic to reuse), display width.
4. **DEL-13 open / dirty editor UX**: close first, prompt to save, or block the deletion. The specifics of invalidating the editor identity after deletion. Note: "no silent data loss" itself is a normative decision (DEL-13).
5. **DEL-14 Recovery wiring**: the main-process-side implementation of re-keying the Recovery row / the `unresolved` transition on deletion (ADR-0009 S-48).
6. **DEL-15 refresh / result presentation / abort UI**: reuse of the existing File Explorer refresh mechanism (`FileExplorerRefreshDirectoriesRequest`, etc.), the result / failure presentation UI (potential reuse of the #346 read-only failure-list dialog), the button transition after deletion starts ("Delete" → "Abort", etc.) and incremental display. Note: "make result and failures user-visible / abort is stopping not-yet-executed items and is not a rollback" itself is a normative decision (DEL-15).
7. **Command surface**: whether to define `workspace.file.delete`. Context-menu only, a Del-key binding, Command Palette exposure.
8. **symlink**: whether deleting a symlink entry is "delete the link only". Making the rule explicit.
9. **i18n / accessibility**: wording keys, screen-reader announcement for the table and the timed button ("The delete button will be enabled in N seconds", etc.).

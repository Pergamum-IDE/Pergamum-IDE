# ADR-0010: Startup File-Open Routing (Cold Start)

**Status:** Accepted

**Date:** 2026-09-01

---

## Context

ADR-0008 defined the `.pergamum` project file, project root, project boundary, the acceptance of multiple `.pergamum` files within one project root, and the unit of locking / multi-instance detection (the project root). It explicitly deferred "Startup file open / `.pergamum` argv handling" and "the Open Folder flow when multiple `.pergamum` files are found" to follow-up issues (ADR-0008 §Non-goals / §Follow-up issues).

The Phase 7-2 pre-audit found a safety-boundary hole in that deferred area.

```text
A Markdown file inside a Pergamum project, when passed via startup args /
Open With / EXE drop, was opened as a standalone writable document whenever
it did not belong to the currently open project.

As a result, even while another Pergamum process held that project's
writable lock, the same file could be edited and saved from both a project
document and a standalone document. This leads to manuscript data loss.
```

The app-level project write lock (`.pergamum.lock/`) was already implemented and prevents a double read-write open of the same project. But startup Markdown routing never reached that lock-aware path.

This ADR fixes the routing decision for a **cold-start** file-open target. The implementation was completed in #347.

### Scope

- In scope: cold start only (the launch target extracted from `process.argv`, Open With, EXE drop).
- Out of scope: runtime `second-instance` forwarding, the macOS `open-file` event, existing-window focus / routing, an instance registry, OS file association registration, `.txt` support, encoding policy, cross-process locking of standalone external Markdown, hardlink identity detection, and any Recovery redesign. These are Future Work.

---

## Related ADRs

- **ADR-0008 Project File, Project Root, and Project-Local Recovery Layout** — this ADR **uses as premises** (and does not change) the project root / project boundary / acceptance of multiple `.pergamum` / lock unit = project root. It fixes the **cold-start portion** of ADR-0008's deferred "Startup file open / `.pergamum` argv handling" and the Open Folder ambiguity. Multiple `.pergamum` files are handled with the same policy as ADR-0008 §Open Folder behavior (never silently pick one).
- **ADR-0009 Working Copy Persistence and Recovery Model** — this ADR **does not change** the Recovery contract. Startup routing does not change Recovery snapshot classification, claims, or ordering. Current Recovery restore behavior (creating a `.recovered[-N].md` sidecar + two-phase finalize; see ADR-0009 §Implementation status) is unchanged. Dialog presentation timing is described in §Implementation notes (non-normative). A known limitation about the Recovery owner under multi-instance is recorded in KNOWN-3.
- **ADR-0004 Manuscript Non-Destructive Policy** — the rationale for "never fall back to standalone writable for a project-owned Markdown".
- **ADR-0000 Accessibility and Inclusive Interaction Principles** — the rationale for making rejection reasons user-visible (STARTUP-7).
- **ADR-0007 Recovery and Runtime Coordination** — referenced as the premise that multi-instance separation is not weakened.

---

## Definitions

This ADR uses the following Markdown document kinds. They are an axis independent of Window context (below).

**Project Document**

A Markdown document that belongs under a Pergamum project root and is subject to project document discovery / File Explorer / the project-open lifecycle / the read-only project policy.

**External File Document**

An independent Markdown file document that has no enclosing Pergamum project, or that is not treated as a project document. It is not a Project Document and is outside File Explorer / the project document registry.

However, **startup file-open routing MUST NOT fall back a project-owned Markdown to an External File Document** (LOCK-STARTUP-1).

**Untitled Document**

A transient Markdown document that has no file path yet. It is **not a target of startup file-open routing** (`process.argv` / Open With / EXE drop always carry a path).

### Window context and document kind are independent axes

- A **Project Window Context** may contain Project Documents, External File Documents, and Untitled Documents.
- A **Projectless Window Context** may contain External File Documents and Untitled Documents.

That is, "are we in a project window" and "what kind is the open document" are separate axes; this ADR's routing decision determines the document kind.

---

## Decision

### Safety invariants

The following safety invariants were introduced in #347 and are formalized here.

**LOCK-STARTUP-1. A project-owned Markdown file MUST NOT be opened as standalone writable at startup.**

A Markdown file passed via startup args / Open With / EXE drop that lies inside a Pergamum project MUST NOT be opened as a standalone writable document.

**LOCK-STARTUP-2. If enclosing project discovery succeeds, routing MUST go through the project-open lifecycle.**

**LOCK-STARTUP-3. If the enclosing project is locked by another live process, the startup Markdown open MUST be rejected, or handled read-only through an explicit policy.**

It MUST NOT silently fall back to standalone writable.

**LOCK-STARTUP-4. If enclosing project discovery is ambiguous, or fails for a safety-relevant reason, the startup Markdown open MUST be rejected safely.**

**LOCK-STARTUP-5. A startup file-open target MUST be a local filesystem path. It MUST NOT be a URL.**

### Input and path classification

**PATH-1. URL-like input is rejected.**

`scheme://authority/...` forms, and a bare scheme with a payload before any slash (`mailto:`, `about:`, custom protocols), are treated as URL-like and are not treated as local file paths.

**PATH-2. Windows drive paths, UNC paths, and POSIX absolute paths are local paths, not URL-like.**

`C:\...` / `C:/...` / bare `C:`, `\\server\share\...`, and `/abs/...` are all accepted as local paths.

**PATH-3. The target must exist and be a regular file.**

Verified with `stat`. Directories, missing paths, and non-regular-files are rejected.

**PATH-4. Symlinks are resolved with `realpath` before enclosing-project discovery.**

`realpath` here is a **safety mechanism**. Enclosing-project discovery (deciding project-owned or not) and the choice of which file to open operate on the **real target path**. This ensures that a symlink placed outside any project but pointing at a project-owned Markdown is still treated as project-owned (LOCK-STARTUP-1). If `realpath` cannot resolve the path (e.g. a broken symlink), the target is rejected safely (notFound / discoveryFailed).

**PATH-5. The extension allowlist is applied to the name of the user-supplied entry path. The real target's extension of a symlink is not validated.**

The extension is a **classification hint about user intent**; it does not guarantee content / encoding safety. PATH-4 (real-path discovery = a safety mechanism) and PATH-5 (entry-name extension check = intent classification) therefore serve **different purposes and are intentionally asymmetric**, not contradictory.

- `chapter-link.md` (even if its real name differs) passes the STARTUP-1 allowlist as a `.md` target.
- `foo.md -> bar.txt`, where the real target has an unsupported extension, is not rejected on the real extension (KNOWN-2).
- Even a `.md` file may contain Shift_JIS / broken UTF-8 / binary content. Content / encoding validity is out of scope for this ADR and is handled by the **v0.9 text encoding policy**.

### Routing

**STARTUP-1. Startup Markdown accepts `.md` / `.markdown` only.**

`.txt`, `.mdown`, `.mkd`, extensionless files, and unknown extensions are rejected as unsupported. `.txt` stays unsupported until the v0.9 `.txt` / encoding policy is defined (consistent with ADR-0008 §Markdown / plain text / extension policy; narrowed further here for startup).

**STARTUP-2. With no enclosing project, open as an External File Document.**

No project owns the Markdown, so opening it standalone is allowed (Case A).

**STARTUP-3. With an enclosing project found, promote to that project.**

The nearest ancestor directory containing exactly one `.pergamum` is the enclosing project root. Open that `.pergamum` project **through the existing project-open lifecycle**, then open the Markdown as a **Project Document** (never standalone; LOCK-STARTUP-1 / 2).

**STARTUP-4. If the enclosing project is locked, use the existing read-only confirmation lifecycle.**

- The user confirms "open read-only" → the Markdown opens as a **read-only Project Document**.
- Cancel → nothing opens.
- The open fails fatally (lock setup failure / unrecoverable error) → nothing opens; the failure is reported.
- In every case there is no fallback to standalone writable (LOCK-STARTUP-3).

**STARTUP-5. Multiple `.pergamum` files in the nearest enclosing root are rejected as ambiguous.**

This is **not an invalid project layout** — ADR-0008 explicitly allows it (backups, copies, verification DBs). But startup routing cannot unambiguously choose which `.pergamum` is active (ADR-0008 has no "default project file" rule). It therefore rejects and tells the user to open the specific `.pergamum` directly (or open the Markdown from inside Pergamum). This mirrors ADR-0008 §Open Folder behavior (never silently pick one). It MUST NOT be opened as standalone writable (LOCK-STARTUP-1 / 4).

**STARTUP-6. Safety-relevant discovery failures are rejected safely.**

An I/O error, a permission error, an unreadable ancestor directory, an unresolvable symlink, or any other unsafe input results in a safe rejection. There is no fallback to standalone writable (LOCK-STARTUP-4).

**STARTUP-7. A rejected target is given a user-visible explanation.**

The rejection dialog is an info dialog (OK only) (ADR-0000). Dialog presentation timing and avoidance of collisions with other modals are described in §Implementation notes (not normative in this ADR).

**STARTUP-8. URL-like `.pergamum` startup arguments are also rejected.**

`path.resolve("https://.../x.pergamum")` produces a local path with a `.pergamum` suffix, so the URL-like check (PATH-1 / PATH-2) is applied on the `.pergamum` direct-launch path as well. Drive paths, UNC paths, and POSIX absolute `.pergamum` paths are unaffected.

**STARTUP-9. If the enclosing project opens but the target Markdown cannot be resolved as a Project Document, open nothing and surface a safe failure / status.**

If a Markdown that lies under the project root but is not in project document discovery / the registry (e.g. deleted or replaced right after capture) becomes the startup target, Pergamum opens nothing and surfaces a safe failure / status. It **MUST NOT fall back to an External File Document / standalone writable**. This is a consequence of LOCK-STARTUP-1 / 2.

### Known limitations

**KNOWN-1. Hardlink identity is not detected.**

Given multiple hardlinks to one inode where one is project-owned and one is opened from outside a project, `realpath` cannot distinguish them (`realpath` resolves symlinks, not hardlinks). Detecting hardlink identity requires a **filesystem identity comparison** (POSIX `dev` + `ino`; a file-index equivalent on Windows). The KNOWN-4 cross-process lock for standalone external Markdown is related but **does not by itself resolve hardlink identity**. This is left as a known limitation and is not implemented now.

**KNOWN-2. The real target's extension of a symlink is not validated.**

Per PATH-5, the extension allowlist is applied to the entry name only. A case like `foo.md -> bar.txt`, where the real target has an unsupported extension, is not blocked on this path.

- Rationale: the extension is not a safety mechanism, only a classification hint about user intent.
- Blocking on the real extension would not help: the user could rename `bar.txt` to `bar.md` and reach the same situation.
- Even a `.md` file may contain Shift_JIS / broken UTF-8 / binary content.
- The core of this problem is not the extension but the v0.9 text encoding policy. Rather than piling a point fix onto this leak, it is handled by the encoding policy.

**KNOWN-3. Multi-instance limitation about the Recovery owner (read-only second process).**

- Under multi-instance, the Recovery Store is a first-come owner.
- If a second process starts via the read-only confirmation (STARTUP-4), that process may be a **Recovery non-owner**.
- This ADR's project-owned Markdown opens as a read-only Project Document, so ordinary editing of that document itself is restricted.
- However, if that same process / window opens another standalone / untitled dirty buffer, those may fall outside Recovery protection.
- This is a known limitation not resolved by #347 / ADR-0010.

**KNOWN-4. Cross-process locking of standalone external Markdown is out of scope.**

Two windows opening the same external `.md` is outside this ADR.

**KNOWN-5. This ADR covers cold start only.**

Runtime `second-instance` / macOS `open-file` / existing-window focus / instance registry / OS file association registration / `.txt` / encoding policy / Recovery redesign are out of scope (Future Work).

---

## Implementation notes (non-normative)

The following describes the current implementation. It is not normative and does not constrain future implementations.

**Dialog ordering / modal collision avoidance.**

The current implementation presents the startup routing rejection dialog (STARTUP-7) and the read-only confirmation (STARTUP-4) from the same **deferred-dialog idle boundary / modal gate** as the other cold-start restore Error dialogs, which avoids modal collisions.

- The **absolute ordering** between the Recovery candidate dialog and the startup rejection dialog / read-only confirmation **is not normativized in this ADR**.
- The desired UX ordering between the response to an "Open With" action and the Recovery dialog is open to future revision.

**Current behavior for STARTUP-9.**

The renderer-side launch-target routing (the enclosing-project scope of `routeMarkdownLaunchTargetNow`) already behaves per STARTUP-9: if the enclosing project is not open it does nothing; if the target cannot be resolved as a Project Document it surfaces `status.projectDocumentNotFound`; if a fresh read fails it likewise only surfaces a status. No branch opens a standalone document. No code change is required for this ADR.

---

## Consequences

### Positive

- Closes the Phase 7-2 blocker (a project-owned Markdown editable from two processes).
- Ambiguous multiple-`.pergamum` handling is consistent with ADR-0008 §Open Folder behavior.
- URL-like / symlink handling is consistent between `.pergamum` direct launch and Markdown launch.
- The locked-project case reuses the existing read-only confirmation lifecycle — no dedicated dialog and no lock-owner-metadata schema change.
- The extension check (intent classification) and `realpath` discovery (a safety mechanism) have separated responsibilities, so the extension is not misused as "proof of safety".

### Negative / Trade-offs

- A `.md` symlink opens its real file (canonical path). A user expecting the link path in the tab may find this surprising (PATH-4).
- The real target's extension of a symlink is not validated, so `foo.md -> bar.txt` is not blocked (KNOWN-2). Content / encoding safety is deferred to the encoding policy (v0.9).
- Hardlink identity is still undetected (KNOWN-1).
- In a multi-instance read-only-started process, standalone / untitled buffers in the same window may fall outside Recovery protection (KNOWN-3).
- A single non-`.pergamum` positional argument, previously silently ignored, now produces a rejection dialog. This is reasonable feedback for an "Open With" mistake, but it is a behavior change.

---

## Alternatives Considered

### Add a dedicated hard-reject dialog for a locked project

Rejected. The #347 issue text (Case C) suggested "reject", but LOCK-STARTUP-3 allows "reject **or** handled read-only through an explicit policy". Reusing the existing read-only confirmation lifecycle is more consistent with the rest of the app and needs no new dialog and no lock-owner-metadata schema change (e.g. adding `projectName`). A dedicated hard-reject can be a separate issue if it is ever wanted.

### Heuristically pick one of the multiple `.pergamum` files (newest mtime, name match, etc.)

Rejected. ADR-0008 has no "default project file" rule and requires "never silently pick one". Opening the wrong project would still detect the write lock correctly but attach the wrong project identity / name.

### Leave startup Markdown routing to the renderer's scope guess (the prior approach)

Rejected. The renderer only checked "is this inside the restored project's scope" and dropped a Markdown under a different project into standalone writable. Enclosing-project discovery must run in the main process and go through the lock-aware path.

### Do discovery on the given path without resolving symlinks

Rejected. It breaks LOCK-STARTUP-1 for a symlink placed outside a project that points at a project-owned Markdown. `realpath` is also consistent with ADR-0008 §Project boundary, which already states that real paths are resolved as needed.

### Also reject a symlink whose real target has an unsupported extension (block `foo.md -> bar.txt`)

Rejected. The extension is not a basis for content / encoding safety, only a classification hint about user intent. Blocking on the real extension does not help (a rename reaches the same state), and a `.md` file can still hold broken encoding / binary content. Rather than piling on a point fix, content / encoding validity is handled together by the v0.9 text encoding policy (KNOWN-2).

---

## Future Work

- Runtime `second-instance` / macOS `open-file` forwarding to an already-running process.
- Existing-window focus / routing, an instance registry, an open-document registry.
- OS file association registration (installer).
- Cross-process locking of standalone external Markdown, and **hardlink identity detection via a filesystem identity comparison (POSIX `dev`+`ino` / a Windows file-index equivalent)** (KNOWN-1 / KNOWN-4).
- `.txt` support and a text encoding policy (v0.9). Content / encoding validity checks (a `.md` extension holding Shift_JIS / broken UTF-8 / binary, etc.) are handled here (KNOWN-2).
- Protecting standalone / untitled buffers in a multi-instance Recovery non-owner process (KNOWN-3).

# ADR-0008: Project File, Project Root, and Project-Local Recovery Layout

## Status

Proposed

## Date

2026-08-22

## Amendments

### 2026-08-27 — working-copy Recovery storage is partially superseded by ADR-0009

The decision in this ADR to use `.pergamum_recovery/` (the project-local recovery directory) as **the storage location for working-copy Recovery (unsaved Markdown text, unsaved `GlossaryEntryDraft` content, and their reconciliation metadata)** has been **superseded by ADR-0009 Working Copy Persistence and Recovery Model**.

- The storage location for working-copy Recovery is now authoritatively defined by ADR-0009. It uses a dedicated Recovery store under the application `userData` area and does not use `.pergamum_recovery/` as a working-copy Recovery store. The reasoning is defined by ADR-0009: persisted state and Recovery must not be placed in the same failure domain.
- All other decisions in this ADR remain in force: the `.pergamum` project file, project root, project name / project metadata schema, project boundary, acceptance of multiple `.pergamum` files within one project root, the premise of the one-folder-one-instance policy, and the OS file association policy are unchanged.
- The future use of `.pergamum_recovery/` (for example, deleting it or dedicating it to derived data), and the future handling of the `project.recoveryDirectoryName` setting (its validity and purpose), are not decided by this amendment or by ADR-0009. This amendment only fixes the boundary that `.pergamum_recovery/` is **not used for working-copy Recovery**.
- The body below, especially the “Project-local recovery directory” section, is kept as history. The description of where working-copy Recovery is stored is replaced by ADR-0009 as stated above.

### 2026-09-01 — startup file-open routing (cold start) is fixed by ADR-0010

This ADR explicitly deferred “Startup file open / `.pergamum` argv handling” and “the Open Folder flow when multiple `.pergamum` files are found” to follow-up issues in §Non-goals / §Follow-up issues.

Of that deferred area, the **cold-start portion (startup arguments / Open With / EXE drop)** is now fixed by **ADR-0010 Startup File-Open Routing (Cold Start)**, implemented in #347.

- The decisions in this ADR are **not rewritten**. ADR-0010 **uses as premises** this ADR’s project root, project boundary, acceptance of multiple `.pergamum` files within one project root, and lock unit = project root.
- Multiple `.pergamum` files are **not an invalid project layout** (see this ADR’s §“Multiple `.pergamum` files in one project root” and §Alternatives considered “Forbid multiple `.pergamum` files in one project root”). Because startup routing cannot choose one unambiguously, ADR-0010 **rejects this case as ambiguous** and, mirroring §“Open Folder behavior”, never silently chooses one; it tells the user to open the specific `.pergamum` file directly.
- Runtime `second-instance`, macOS `open-file`, existing-window focus, instance registry, and OS file association registration remain undecided (see ADR-0010 §Future Work and this ADR’s §Follow-up issues).

## Context

Pergamum is an IDE for novel writing. It stores manuscript text in Markdown files, while storing management information such as Glossary data, session state, recovery information, and project structure in a SQLite database.

ADR-0001 adopted the following broad responsibility split between manuscript text, structured data, and settings.

```text
Manuscript text = Markdown files
Structured data = SQLite database
Settings        = pergamum.json
```

Phase 4-6, #202 File I/O workflow foundation, made Markdown document loading, saving, Save As, and dirty close save flow actually work.

That made the following design questions concrete.

```text
We can save.
↓
How do we create new documents?
↓
What document kinds can be created?
↓
How do we distinguish .md and .txt?
↓
What is a project file?
↓
What should OS file association target?
↓
Can the same project be opened by multiple instances at the same time?
```

The previous name `pergamum.db` is likely to look, from the user’s point of view, like an internal implementation file or a disposable temporary database.

However, Pergamum’s project database is not merely an internal cache. It is central to work management: Glossary, project document management, session restoration, and relations to recovery information.

Therefore, Pergamum needs to treat the project database as an explicit project file.

Users are also likely to cautiously copy, move aside, or back up `.pergamum` files.

Example:

```text
/project-root/
  俺TUEEEEEE物語.pergamum
  俺TUEEEEEE物語 - copy.pergamum
  俺TUEEEEEE物語_20260822_backup.pergamum
  pergamum.json
  manuscripts/
```

This kind of layout must not be treated as abnormal.

On the other hand, if the same project root is opened by multiple Pergamum processes at the same time, manuscript text, the database, Glossary, session restore, recovery store, and dirty state may conflict.

For that reason, this ADR defines the `.pergamum` project file, project root, project name, project metadata, and project-local recovery directory.

---

## Decision

Pergamum uses the `.pergamum` extension for project database files.

```text
<any file name>.pergamum
```

A `.pergamum` file is a SQLite3 database file and is treated as a Pergamum project file.

Example:

```text
俺TUEEEEEE物語.pergamum
```

`.pergamum` has the following meaning.

```text
.pergamum
  = SQLite3 database file
  = Pergamum project file
  = OS file association target
  = Entry point for opening a project
```

However, the `.pergamum` file name is not the source of truth for the project name.

The source of truth for the project name is `metadata.project_name` inside the `.pergamum` database.

---

## Definitions

### Active project file

The `.pergamum` file that was actually opened is the active project file.

Example:

```text
/work/novels/俺TUEEEEEE物語.pergamum
```

In this case:

```text
active project file = /work/novels/俺TUEEEEEE物語.pergamum
```

Even if other `.pergamum` files exist in the same folder, they are not considered active project files.

---

### Project root

The parent directory of the opened `.pergamum` file is the project root.

Example:

```text
/work/novels/俺TUEEEEEE物語.pergamum
```

In this case:

```text
project root = /work/novels
```

The project root folder name is not treated as the project name.

For example:

```text
/work/pergamum-dogfood/俺TUEEEEEE物語.pergamum
```

The project root is `/work/pergamum-dogfood`, but the project name is not `pergamum-dogfood`.

---

### Project name

The project name is stored as metadata inside the `.pergamum` database.

```text
metadata.project_name
```

The `.pergamum` file name may be used as the initial value when creating a project, or as a display fallback when metadata is unavailable.

However, after creation, the source of truth for the project name is `metadata.project_name`.

In short:

```text
The path is the location.
The filename is the entry point.
The metadata is the name.
```

---

## Project boundary

The boundary of a Pergamum project is the project root.

The project root is the parent directory of the opened `.pergamum` file.

Pergamum treats the area under the project root as the project-local file space.

Files and directories outside the project root are not considered part of the Pergamum project, no matter how related they may be to the user’s work management.

If a file outside the project root is explicitly opened, it is treated as an external file document.

An external file document is not automatically promoted to a project document.

Users may choose any directory structure under the project root.

Pergamum does not force a specific hierarchy for works, volumes, parts, chapters, or similar structures.

When determining project-local file space, Pergamum resolves real paths as needed and does not treat paths that escape outside the project root as project-local.

---

## File name and project name

When creating a project, Pergamum may use the `.pergamum` file name specified by the user, minus the extension, as the initial project name.

Example:

```text
俺TUEEEEEE物語.pergamum
```

Initial value at creation time:

```text
metadata.project_name = 俺TUEEEEEE物語
```

However, after creation, renaming or copying the `.pergamum` file must not implicitly change the project name.

Examples:

```text
俺TUEEEEEE物語 - copy.pergamum
俺TUEEEEEE物語_20260822_backup.pergamum
```

Even if these files are opened, if the metadata inside the database is:

```text
metadata.project_name = 俺TUEEEEEE物語
```

then the project name displayed inside Pergamum remains:

```text
俺TUEEEEEE物語
```

Renaming a `.pergamum` file is an OS-level file name change, not a Pergamum project name change.

---

## Multiple `.pergamum` files in one project root

Multiple `.pergamum` files may exist in the same project root.

This naturally happens when users create backups, copies, moved-aside files, or verification databases.

Example:

```text
/project-root/
  俺TUEEEEEE物語.pergamum
  俺TUEEEEEE物語 - copy.pergamum
  俺TUEEEEEE物語_20260822_backup.pergamum
  pergamum.json
  manuscripts/
```

Pergamum must not treat every `.pergamum` file in the same folder as an active project file.

Only the `.pergamum` file that was actually opened is the active project file.

---

## Open Folder behavior

When opening a folder, if multiple `.pergamum` files are found inside the target folder, Pergamum must not silently choose one.

In this case, Pergamum should either ask the user to choose which project file to open, or instruct the user to select a `.pergamum` file directly.

Example:

```text
This folder contains multiple .pergamum files.
Choose the project file to open.
```

Or, for an initial implementation, it may use the simpler message:

```text
This folder contains multiple .pergamum files.
Choose a .pergamum file directly.
```

This ADR does not define the concrete UI implementation of the Open Folder flow.

However, Pergamum must not forbid the presence of multiple `.pergamum` files.

---

## Project metadata schema

The `.pergamum` database has a fixed-single-row `metadata` table.

The `metadata` table stores project identity and schema information.

### Required fields

At minimum, the following fields are required.

```text
metadata.project_id
metadata.project_name
metadata.schema_version
```

Creation and update timestamps are also stored as metadata.

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

The `metadata` table is fixed to a single row, and normally only the row with `id = 1` is used.

```sql
SELECT project_name FROM metadata WHERE id = 1;
```

### Column semantics

#### `project_id`

An immutable ID representing project identity.

The recommended format is a UUIDv7 string.

```text
metadata.project_id = 018f... etc.
```

`project_id` is independent of the project name and filename.

It is used to distinguish separate projects with the same name, and to distinguish copied `.pergamum` files from newly created `.pergamum` files.

#### `project_name`

The project name displayed to the user.

The source of truth for the project name is `metadata.project_name`.

The `.pergamum` file name and project root folder name are not, in normal operation, the source of truth for the project name.

#### `schema_version`

The Pergamum project database schema version.

It represents the logical schema version of the `.pergamum` database.

It is used for migration decisions, compatibility checks, and future breaking-change detection.

#### `created_at`

The project database creation time.

An ISO 8601 UTC string is recommended.

#### `updated_at`

The project metadata update time.

The timing for updating this value depends on the implementation policy, and may be defined in detail in a separate issue if needed.

#### `created_with_app_version`

The Pergamum app version that created the project database.

This is not required, but may be stored because it is useful for support, migration, and dogfood investigations.

#### `last_opened_with_app_version`

The Pergamum app version that last opened this project database.

This is not required, but may be stored because it is useful for migration, compatibility checks, and incident investigations.

---

## `metadata.schema_version` and `PRAGMA user_version`

Pergamum may use SQLite’s `PRAGMA user_version` as a migration guard.

In that case, the following should hold in principle.

```text
metadata.schema_version == PRAGMA user_version
```

The responsibility split is as follows.

```text
metadata.schema_version
  The logical schema version of the Pergamum project database
  Read as application-level metadata

PRAGMA user_version
  An integer version first consulted by SQLite database migration
```

Temporary inconsistency may occur during migration, but once a project database is treated as successfully opened, the two values must match.

If an inconsistency is detected, Pergamum must fail safe as a possible database corruption, interrupted migration, or inconsistency from an old implementation.

In this case, raw errors that include manuscript text or paths must not be written to debug logs, console output, or dialogs.

---

## Project name fallback

Normally, the UI display name for a project is `metadata.project_name`.

Fallback order is as follows.

```text
1. metadata.project_name
2. If metadata.project_name is unset or unavailable, the .pergamum file name without extension
3. If that is also impossible, Untitled Project
```

However, fallback is only a helper for display and error recovery. It does not make the `.pergamum` file name the source of truth for the project name again.

Also, a broken database whose metadata cannot be read must not be treated as a valid project database merely because a fallback display name can be produced.

---

## Project-local recovery directory

> **Note (2026-08-27, partially superseded by ADR-0009):**
> The part of this section that treats `.pergamum_recovery/` as the storage location for working-copy Recovery (unsaved text, dirty document recovery data, crash recovery data, and save failure recovery support data) has been superseded by ADR-0009. The storage location for working-copy Recovery is a dedicated Recovery store under the application `userData` area, and `.pergamum_recovery/` is not used as a working-copy Recovery store. This section is kept as history.

Pergamum has a project-local recovery directory under the project root.

The default name is:

```text
.pergamum_recovery
```

Example layout:

```text
/project-root/
  俺TUEEEEEE物語.pergamum
  pergamum.json
  .pergamum_recovery/
  manuscripts/
```

`.pergamum_recovery/` may contain information equivalent to user manuscript content, such as unsaved text, dirty document recovery data, crash recovery data, and save failure recovery support data.

Therefore, `.pergamum_recovery/` must not be treated as a mere temporary cache.

Recovery data cleanup is performed conservatively.

Recovery data contents, manuscript text, raw paths, and filenames must not be written to debug logs, console output, or dialogs.

---

## Recovery directory name setting

`.pergamum_recovery` is the standard name.

However, this value must not be hard-coded as a magic string at each implementation site.

The default value is defined in the Settings Catalog, and consumers obtain it through resolved project settings.

Proposed setting key:

```text
project.recoveryDirectoryName
```

Default value:

```text
.pergamum_recovery
```

This setting is an expert setting.

It is not expected to be changed by ordinary users, but it remains configurable for special operation, conflicts with existing directories, synchronized environments, verification use, and similar cases.

---

## Recovery directory name validation

`project.recoveryDirectoryName` accepts only a directory name directly under the project root, not an arbitrary path.

Allowed examples:

```text
.pergamum_recovery
_pergamum_recovery
pergamum-recovery
recovery
```

Forbidden examples:

```text
../recovery
./recovery
.pergamum/recovery
C:\temp\recovery
/tmp/recovery
.
..
empty string
```

Forbidden forms:

```text
absolute paths
relative paths
../
./
slash /
backslash \
empty string
.
..
control characters
bidi / zero-width characters
```

In other words, this setting controls only the “name” directly under the project root, not the “location.”

---

## Recovery directory name changes

If `project.recoveryDirectoryName` is changed, Pergamum uses the new recovery directory name from then on.

However, existing recovery directories must not be implicitly moved, deleted, or overwritten.

```text
After the setting is changed, use the new recovery directory name.
Do not automatically move existing recovery directories.
```

When implementing the UI, it is desirable to show a warning such as:

```text
Changing the recovery area name may make existing recovery data no longer referenced automatically.
Normally, do not change this setting.
```

---

## Responsibility split

The main file responsibilities inside a Pergamum project root are as follows.

```text
<any file name>.pergamum
  Project database
  Pergamum project file
  SQLite3 database file
  OS file association target
  Candidate active project file

pergamum.json
  Project Settings

.pergamum_recovery/
  Project-local recovery directory
  May contain unsaved text and recovery metadata
  Not treated as a cache

*.md / *.markdown
  Markdown document
  Source of truth for manuscript text

*.txt
  Future plain text document
  Not an alias for Markdown

*.glossary
  Future glossary export/import candidate
```

---

## Markdown / plain text / extension policy

`.md` and `.markdown` are treated as Markdown documents.

`.txt` is a candidate for a future plain text document and is not an alias for a Markdown document.

`.pergamum` is a SQLite3 database file and is neither a Markdown document nor a plain text document.

```text
.md and .markdown are Markdown.
.txt is not an alias for Markdown.
.pergamum is SQLite.
```

---

## OS file association

`.pergamum` is a future OS file association target.

However, this ADR does not define the concrete implementation method for OS file association.

OS file association differs significantly across Windows, macOS, and Linux.

Therefore, the following are handled in separate issues.

```text
Installer registers .pergamum file association
Startup file open / .pergamum argv handling
```

As a design policy, the installer registers `.pergamum` as a Pergamum Project file.

However, Pergamum must not forcibly take over the default application.

It respects the user’s OS settings and user choices.

---

## One-folder-one-instance policy

Opening the same project root with multiple Pergamum instances at the same time should be prevented.

However, this ADR does not define the concrete implementation method for one-folder-one-instance enforcement.

This ADR only defines the premise that the unit of locking and multi-open detection is not the active project file path, but the project root.

The reason is that the following are shared within the same project root.

```text
pergamum.json
.pergamum_recovery/
manuscripts/*.md
session restore
recovery store
dirty document state
```

Therefore, the following two files share the same project root even though they are different `.pergamum` files.

```text
/project-root/俺TUEEEEEE物語.pergamum
/project-root/俺TUEEEEEE物語 - copy.pergamum
```

Opening these in separate processes at the same time is prevented in a follow-up issue.

---

## Non-goals

This ADR does not define the following.

```text
Concrete implementation of OS file association
Installer settings
startup argv handling
open-file event handling
Implementation method for one-folder-one-instance
Migration procedure from existing pergamum.db to .pergamum
Concrete UI for the Open Folder flow
Opening multiple projects at the same time
Multiple-window support
New Markdown File command
Plain text document mode
.txt implementation
.glossary export/import
Schema of the recovery store itself
Details of the recovery data cleanup policy
```

These are handled in follow-up issues or separate ADRs.

---

## Consequences

### Positive

- `.pergamum` becomes clearly defined as the Pergamum project file.
- It is easier for users to recognize it as the project body than `pergamum.db`.
- The target of OS file association becomes clear.
- The definition of project root becomes clear.
- The project name can be separated from the filename.
- Copying or renaming a `.pergamum` file does not implicitly change the project name.
- The presence of multiple `.pergamum` files can be accepted as natural user behavior.
- The location of project metadata and schema version becomes clear.
- The recovery directory can be treated as an area equivalent to user content rather than as a cache.
- The recovery directory name can be made configurable in the future.
- The premise of the one-folder-one-instance policy becomes clear.

### Negative / Trade-offs

- A migration policy from `pergamum.db` to `.pergamum` is required.
- Initialization and migration of the project metadata table are required.
- Consistency between `metadata.schema_version` and `PRAGMA user_version` must be managed.
- Resolving the recovery directory name through settings is slightly heavier than simple hard-coding.
- The UI must naturally handle cases where the `.pergamum` filename differs from the project name.
- The Open Folder flow must handle cases where multiple `.pergamum` files are found.

---

## Alternatives considered

### Keep using `pergamum.db`

Rejected.

`pergamum.db` looks too much like an internal implementation file.

From the user’s point of view, it risks looking like a deletable generated artifact or cache.

It is also weak as an OS file association target for a Pergamum project file.

---

### Use folder name as project name

Rejected.

The project root folder name may change for reasons such as Git repositories, synchronized folders, working directories, or backup directories.

Example:

```text
/work/pergamum-dogfood/俺TUEEEEEE物語.pergamum
```

In this case, using `pergamum-dogfood` as the project name is unnatural.

---

### Use `.pergamum` filename as project name source of truth

Rejected.

Users are likely to copy and rename `.pergamum` files.

Examples:

```text
俺TUEEEEEE物語 - copy.pergamum
俺TUEEEEEE物語_20260822_backup.pergamum
```

If the filename were the source of truth, copying or backing up the file would implicitly change the project name.

The project name is stored in DB metadata.

---

### Forbid multiple `.pergamum` files in one project root

Rejected.

It is natural for cautious users to copy and back up `.pergamum` files.

The design must not treat this as hostile.

What Pergamum should control is not the mere existence of multiple `.pergamum` files, but which `.pergamum` file is the active project file, and preventing the same project root from being opened by multiple processes at the same time.

---

### Hard-code `.pergamum_recovery`

Rejected.

`.pergamum_recovery` is adopted as the standard name, but it must not be scattered across implementation sites as a magic string.

The recovery directory name is defined as a Settings Catalog default and used as the resolved project setting value.

---

### Store all project metadata as key-value

Not adopted at this time.

The core project metadata fields `project_id`, `project_name`, and `schema_version` have important type and requiredness semantics.

Therefore, it is preferable to use an explicit fixed-single-row `metadata` table with columns, rather than a generic key-value table.

For future extension information, a separate table or limited key-value table may be considered as needed.

---

## Implementation notes

### Project creation

When creating a new project database, the `.pergamum` file path chosen by the user is the active project file.

```text
/project-root/俺TUEEEEEE物語.pergamum
```

At that time:

```text
activeProjectFile = /project-root/俺TUEEEEEE物語.pergamum
projectRoot = /project-root
```

If an initial project name is not explicitly specified, the `.pergamum` filename without extension may be used as the initial value of `metadata.project_name`.

```text
metadata.project_name = 俺TUEEEEEE物語
```

However, after creation, `metadata.project_name` is authoritative.

---

### Project open

When opening a `.pergamum` file, Pergamum performs the following.

```text
1. Receive the path
2. Treat it as a .pergamum file
3. Open it as a SQLite database
4. Read PRAGMA user_version
5. Read the metadata table
6. Check consistency between metadata.schema_version and PRAGMA user_version
7. Read metadata.project_id / metadata.project_name
8. Set the active project file
9. Treat the parent directory as the project root
```

If this fails, raw paths, filenames, manuscript text, and raw filesystem errors must not be written to debug logs, console output, or dialogs.

---

### Recovery path resolution

Recovery directory paths are not assembled directly at each implementation site.

They go through a resolver like the following.

```text
projectRoot
project.recoveryDirectoryName
  ↓
recoveryDirectoryPath
```

Example:

```text
projectRoot = /project-root
project.recoveryDirectoryName = .pergamum_recovery
```

Result:

```text
recoveryDirectoryPath = /project-root/.pergamum_recovery
```

Direct use of the literal `.pergamum_recovery` is allowed only in the Settings Catalog default, test expectations, documentation, and migration notes.

---

## Follow-up issues

The following are handled as separate issues after this ADR.

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

A Pergamum project has a `.pergamum` SQLite database file as its project file.

The `.pergamum` file actually opened is the active project file, and its parent directory is the project root.

The project name is not the `.pergamum` filename; the authoritative value is `metadata.project_name` inside the database.

The `.pergamum` database has a fixed-single-row `metadata` table and stores at least `project_id`, `project_name`, and `schema_version`.

The standard name of the project-local recovery directory is `.pergamum_recovery`, but implementation must resolve it through the Settings Catalog / project settings and must not hard-code it as a magic string at each use site.

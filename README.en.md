# Pergamum

[日本語](./README.md) | [English](./README.en.md)

Pergamum is an **open-source integrated writing environment for novelists**.

It is free software released under the MIT License.

Pergamum is not just another Markdown editor.

When writing a novel, a large amount of information emerges outside the manuscript itself.

Character names. Place names. Organization names. Proper nouns. Aliases. Spelling variations. Timelines. Relationships between characters. When a certain event happened. What a certain character knew at that point in the story.

The longer a work becomes, the harder it is to maintain all of that by the author's memory alone.

Pergamum aims to **separate the place where the manuscript is written from the place where the author manages what they know about the story world, while treating both as parts of a single writing environment**.

The manuscript is stored as human-readable Markdown files.

Structured information about the story world is managed as a SQLite database.

Pergamum also takes seriously the principle that it should not rewrite the author's manuscript without permission, and that saving and recovery safety should never be treated lightly.

> Pergamum will not discard your unsaved manuscript until you decide to discard it.

Pergamum is still under active development.  
Not everything described here has been implemented yet.

The name Pergamum comes from an ancient Greek city in what is now western Turkey. Pergamum had a great library that rivaled the Library of Alexandria, and its name is also associated with the origin of the word “parchment.”

---

## Current status

Pergamum is currently at **v0.80.0**.

It has completed up through Phase 7, “Make it possible to walk through the project,” and the core features for writing a novel are now in place.

As of v0.80.0, the following areas are implemented:

- Markdown manuscript editing
- Project management via `.pergamum` project files
- Hierarchical File Explorer and file operations
- Active Document Find / Replace (search and replace within the open document)
- Project-wide Search / Replace
- Glossary (managing terms, characters, places, and so on) and Glossary Completion
- Document Map / Document Metrics
- Session restore and Document Recovery
- Atomic Markdown save / Project write lock
- Image paste / preview / link updates
- Application / Project settings
- About dialog / third-party notices

That said, Pergamum is not yet a stable release for general use.

In particular, the Glossary / project database schema may still change in the future. If you use Pergamum with important manuscripts or structured data, please manage the entire working directory with Git or ordinary backups.

For work planned up to v0.90.0, see the [Roadmap](#roadmap) section below. Those items are planned, not implemented.

---

## Why build this?

A novel itself is just text.

So the manuscript can be Markdown.

On the other hand, information such as the following is difficult to handle as plain prose alone:

> What aliases does this character have?  
> Is this spelling merely a variation, or an intentional alternate name?  
> In what year and month did this event happen?  
> Did this character know that fact at this point in the scene?

Rather than forcing that information into Markdown, Pergamum keeps it separately as structured data.

Pergamum currently separates these roles as follows:

```text
Markdown
  The source of truth for manuscript text

.pergamum
  Project file
  The entry point that carries project identity / metadata
  The source of truth for structured story information,
  such as characters, terms, places, organizations, and concepts

pergamum.json
  Project settings

Assets
  Binary data such as images

Recovery Store
  Application data that holds working copies of unsaved manuscript text
```

Pergamum does not bend the manuscript to fit database convenience, nor does it force structured information into Markdown.

Each kind of data is placed where it is easiest to handle.

---

## What Pergamum values

Pergamum is not trying to write novels on behalf of the author.

It is trying to become **a tool that helps authors remember what they have already decided**.

Pergamum does not rewrite the manuscript on its own.

Especially for Japanese text processing, Pergamum avoids careless normalization, unification, completion, and inference.

```text
Things Pergamum does not do:
  Modify manuscript text through Unicode normalization
  Automatically fix spelling variations
  Automatically insert or remove middle dots
  Automatically format ellipses or dashes
  Automatically add Glossary aliases
  Automatically resolve ambiguous matches
```

Pergamum acts as an assistant only when the author explicitly chooses to use a feature.

Pergamum's UI protects the place where the manuscript is written.

```text
Places for writing the manuscript:
  Editor
  Preview

Peripheral work around the manuscript:
  Navigator
  Search
  Occurrences
  Diagnostics
  Output
  Debug Log
  Settings
  Utility Window
```

Searching, following references, diagnostics, output, and log inspection are moved out to peripheral UI surfaces instead of crowding the manuscript area.

---

## What Pergamum can currently do

Pergamum is still under development, but the foundations for safely handling Markdown manuscripts and connecting them with the Glossary are now working.

Pergamum can currently do the following:

| Category | Capability |
| -- | -- |
| Project | Create and open `.pergamum` project files |
| Project | Manage Project root / project metadata |
| Project | Change a Project's display name (logical rename) |
| Project | Prevent concurrent writes with a Project write lock |
| Project | Open a project as read-only when another process is already using it |
| Project | Safely recover stale write locks / recovery locks |
| Project | Close the current Project |
| File Explorer | Show project folders and files as a tree |
| File Explorer | Expand / collapse folders, open files, refresh |
| File Explorer | Detect files added, removed, or changed outside the app |
| File Explorer | Create, rename, and delete files and folders (with confirmation) |
| File Explorer | Move files and folders (context menu / cut & paste / drag & drop, with confirmation) |
| File Explorer | Multi-selection, reveal the active document |
| Import | Bulk-import `.txt` files as Markdown with a chosen character encoding |
| Editor | Edit Markdown manuscript text |
| Editor | Open multiple documents in tabs / close tabs / open external Markdown |
| Editor | Keep editor state per tab |
| Editor | Preserve line endings when saving / diagnose line ending distribution |
| Editor | Save through an atomic Markdown save pipeline |
| Editor | Show character count in the Status Bar (Unicode code point based) |
| Editor | Bulk insert / remove paragraph indentation |
| Editor | Configure Markdown undo history depth |
| Search / Replace | Search and replace within the open document (Active Document Find / Replace) |
| Search / Replace | Options such as case, whole word, and regex; replace all |
| Search / Replace | Glossary-based search modes / nearby search |
| Search / Replace | Search across the whole project (Search pane) |
| Search / Replace | Replace across the whole project |
| Preview | Show Markdown Preview |
| Preview | Decorate Glossary matches in Preview |
| Preview | Render project-local image links in Preview |
| Assets | Paste a clipboard image, save it to assets, and insert a Markdown link |
| Assets | Diagnose broken image links (lint warnings) |
| Assets | Update image links / references when Markdown or image files are moved |
| Glossary | Create, edit, and delete Glossary entries |
| Glossary | Manage Glossary forms (canonical / alias / variant, boundary policy) |
| Glossary | Show Hover Cards for Glossary matches |
| Glossary | Navigate from Glossary entries to their occurrences in the manuscript |
| Glossary | Search entries in the Glossary navigator / review occurrences in the occurrences tab |
| Glossary | Highlight primary tags visually |
| Glossary | Invoke Glossary Completion with Ctrl+Space |
| Document Map | Show a bird's-eye view of the document and navigate by click / viewport lens |
| Document Map | Configure which tags and rendering to show; page large documents when rendering |
| Document Metrics | Show metrics such as character, line, and paragraph counts and dialogue ratio |
| Command | Search and run operations from the Command Palette |
| Command | Use application menu / shortcuts / context menu |
| Settings | View and edit application / project settings in the Settings Page |
| Settings | Override application settings per project; search and categorize settings |
| Settings | Confirm and safely restart for settings that require a restart |
| Session | Restore the previous project / tabs / active document / window state |
| Session | Time out safely if Session loading takes abnormally long |
| Recovery | Persist Recovery payloads for unsaved manuscript text |
| Recovery | Show unsaved text from the previous run as recovery candidates |
| Recovery | Restore Recovery candidates as `.recovered.md` files / explicitly discard them |
| Recovery | Suppress repeated auto-show for the same Recovery candidate set |
| Notification | Show informational (non-error) notifications with NotificationToast |
| Workbench | Work with Navigator / Editor / Preview panes, collapse the Sidebar, reorder tabs |
| Utility Window | Open the Utility Window |
| Debug | Output Debug mode JSONL logs / inspect them in the Debug Log tab |
| About | Show the About dialog with a link to third-party notices |
| Persistence | Store structured project data in SQLite |
| Distribution | Provide foundations for a Windows installer and `.pergamum` file association |

---

## Project file and Project root

Pergamum treats `.pergamum` files as project files.

The folder containing the `.pergamum` file is the Project root. Markdown manuscripts, the project database, project config, and related files live under that folder.

```text
MyNovel/
  MyNovel.pergamum
  pergamum.json
  chapter-01.md
  chapter-02.md
  assets/
```

A Project file is a more explicit entry point than simply opening a folder.

It carries Project identity and connects to Session restore, Recent Projects, and file association.

---

## Session and Recovery

Pergamum treats Session and Recovery as separate concepts.

```text
Session:
  Information used to restore the working environment,
  such as the previously opened project, tabs, and window state

Recovery:
  Working copies used to protect unsaved Markdown manuscript text itself
```

Session is a mechanism for returning to the previous working environment.

Recovery is a mechanism for not losing unsaved manuscript text.

They may sound similar, but their roles are different.

### Session

Session restore restores the previously opened project, tabs, window state, and related environment.

However, if loading Session data takes abnormally long, Pergamum does not block startup indefinitely. It times out safely and starts without Session restore for that run.

Pergamum does not delete or repair existing Session data merely because it failed to load it.

### Recovery

Recovery saves unsaved Markdown manuscript text into the Recovery Store on the application data side.

It does not overwrite saved files on its own, nor does it directly inject recovered text into the currently open dirty editor.

When restoring a Recovery candidate, Pergamum opens it as a new sidecar file instead of overwriting the original file.

```text
chapter-03.md
chapter-03.recovered.md
chapter-03.recovered-2.md
```

A Recovery row is deleted only in the following cases:

```text
Cases where it is deleted:
  The original document is saved successfully
  Restore succeeds and the renderer finalizes that it opened the .recovered.md file
  The user explicitly discards it through a confirmation dialog

Cases where it is not deleted:
  The Recovery dialog is closed
  The user chooses “Decide Later”
  The startup auto-show has been displayed
  A reminder toast has been displayed / closed
  The app quits / restarts
```

Pergamum does not discard Recovery candidates on its own.

---

## Storage model

Pergamum separates storage formats by the nature of the data.

| Location | Format | Role |
| -- | -- | -- |
| Markdown files | UTF-8 Markdown | Source of truth for manuscript text; ordinary human-readable text files |
| `.pergamum` project file | SQLite database | Source of truth for structured story information: characters, terms, places, organizations, concepts |
| `pergamum.json` | JSON | Project settings (project-scope settings) |
| Application data | JSON and similar | Session state (the previous working environment) |
| Recovery Store | Working copies on the application data side | Recovery data for not losing unsaved text; not the source of truth for the manuscript |

Pergamum does not bend the manuscript to fit the database, nor does it force structured information into Markdown. Each kind of data is placed where it is easiest to handle.

### Reliability and safety

Pergamum does not treat saving and recovery safety lightly.

| Mechanism | Description |
| -- | -- |
| Atomic Markdown save | Manuscript saves go through an atomic pipeline that never leaves a half-written state |
| Project write lock | Prevents multiple processes from writing to the same project at once; opens read-only when another process holds it |
| Stale lock recovery | Safely reclaims write locks / recovery locks left behind by abnormal termination |
| Session restore | Restores the previous project / tabs / active document / window state; does not corrupt existing session data even if loading fails |
| Document Recovery | Keeps unsaved text on the application data side and offers it as a recovery candidate on the next run; opens it as `.recovered.md` instead of overwriting the original file |

Pergamum will not discard your unsaved manuscript until you explicitly choose to discard it.

---

## What is the Glossary?

In Pergamum, characters, places, organizations, terms, concepts, and similar story-world entities are managed as the Glossary.

For example, suppose the following strings related to Oda Nobunaga appear in the manuscript:

```text
Oda Nobunaga
Kippōshi
Nobunaga
Lord
Chasenmage
```

These may have different meanings depending on context:

```text
Oda Nobunaga:
  The person's main name

Kippōshi:
  Childhood name

Nobunaga:
  Short name

Lord:
  A title or form of address depending on social position

Chasenmage:
  A hairstyle
```

`Kippōshi` and `Lord` may refer to the same person.  
On the other hand, `Chasenmage` refers to a hairstyle, not the person themself.

Pergamum does not automatically merge strings into the same entity merely because they appear in similar contexts.

Even when multiple strings refer to the same person, they do not necessarily have the same meaning.

Pergamum treats this information as separate axes, rather than as a flat list of strings.

```text
Entry:
  An entity such as a character, place, organization, term, or concept

Form:
  A surface form such as a canonical name, alias, or variant spelling

Warning policy:
  A policy such as whether to warn or ignore

Boundary policy:
  A policy for what range in the manuscript should count as a match
```

Pergamum also allows the same surface form to refer to multiple entities.

If the word “warrior” may refer to multiple characters, Pergamum will not choose one automatically.

**If something is ambiguous, report it as ambiguous.**

This is one of Pergamum's important design principles.

---

## Glossary model

The Glossary is accessed from the Renderer to the Project Database through the following path:

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

The current Glossary model separates Entry and Form.

```text
Entry:
  An entity in the story world

Form:
  A string that appears in the manuscript
```

A Form can have a role such as canonical, alias, or variant.

Glossary matching also uses boundary policy.

For example, if the surface form is `maid`, naive matching may cause false positives inside larger words or phrases.

In Japanese, the surface `メイド` may appear in both of the following:

```text
メイドさん
オーダーメイド
```

If both are matched by simple substring matching, false positives occur.

Pergamum therefore allows matching boundaries to be adjusted per Glossary form.

```text
Start-side boundary:
  auto / strict / none

End-side boundary:
  auto / strict / none
```

The internal values are:

```text
auto
strict
none
```

This lets the author adjust matching behavior per form only when needed.

---

## Current limitations

Pergamum is still under development.

It is being developed through daily dogfooding, but it is not yet a stable release for general use.

The current major limitations are as follows:

| Category | Current limitation |
| -- | -- |
| File format | Files that can be opened and edited directly are limited to `*.md` |
| File format | Opening and editing raw `.txt` files directly is not yet supported (bulk import into Markdown with a chosen encoding is supported; direct editing is planned for v0.90.0) |
| Encoding | Manuscript editing is UTF-8 only (encoding conversion at import time is handled by the Import feature) |
| Project database | The Glossary / project database schema is still under development and future changes may include breaking changes |
| Compatibility | Long-term DB compatibility is not guaranteed at this stage |
| Recovery | Recovery is for rescuing unsaved manuscript text, not a replacement for history management or Git |
| Search | Project-wide text search and replace are available; advanced search such as FTS or outline search is a future development target |
| Output | Project-wide TXT export is planned for v0.90.0; full-fledged output such as PDF / DOCX / EPUB / vertical writing is not implemented yet |
| Theme | A dark theme is planned for v0.90.0 (currently light theme only) |
| Distribution | Distribution foundations are being prepared, but this is not a stable release |

In particular, `.pergamum` is currently the source of truth for structured data in Pergamum.

At the same time, the Glossary model and project data model are not stable yet.

Because of that, during this early development stage, old `.pergamum` files may become unusable in future versions.

If you handle important manuscripts or Glossary data, please manage the entire working directory with Git or ordinary backups.

Manuscript Markdown is stored as ordinary, human-readable UTF-8 Markdown files.

For Glossary and project metadata, until v0.90.0 Pergamum may prioritize correctness of the data model over compatibility.

---

## To avoid losing data

A novel is data that an author may spend tens or hundreds of hours creating.

For that reason, Pergamum does not treat structured information as something that can simply be recreated if it breaks.

While treating the SQLite database inside the `.pergamum` project file as the source of truth for structured data, Pergamum plans to generate deterministic snapshots that can be inspected with Git diffs and read by humans.

A snapshot will not become a second source of truth.

If there are two sources of truth, the question of which one is correct inevitably arises.

Instead, Pergamum follows a one-way relationship like this:

```text
.pergamum
  ↓
deterministic snapshot
  ↓
Git / backup / external tools
```

When restoring from a snapshot, the current database will be moved aside, the entire snapshot will be validated, and the database will be rebuilt in a transaction.

This has not been implemented yet, but it is already an architectural principle.

---

## About AI

Pergamum uses generative AI for design review and implementation support during development.

However, the current Pergamum application itself does not have any feature that sends the author's manuscript to generative AI or asks AI to write novel text.

AI is used to support the development process. Replacing the author's creative work is not the goal.

---

## Installation

Pergamum is currently under development.

At the moment, you can try it by building the development environment from source.

Development uses Node.js 24 LTS.

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Common verification commands during development:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

The foundations for a Windows installer and `.pergamum` file association exist, but please check the guidance for each release regarding available distributables and release procedures.

---

## Design

Pergamum records major design decisions as ADRs (Architecture Decision Records).

If you only look at the code, the reasons behind decisions such as the following will be lost over time:

> Why UUIDv7?  
> Why separate Glossary surface forms into a different table?  
> Why is SQLite the source of truth?  
> Why is a snapshot not the source of truth?  
> Why separate Command / Navigation / Editor identity?  
> Why place Recovery on the application data side instead of in the project folder?

Therefore, Pergamum tries to record not only **what was adopted**, but also **what was considered and why it was not adopted**.

For the full list of ADRs and their statuses, see [`docs/adr/README.md`](./docs/adr/README.md).

Major ADRs:

- [ADR-0001: Project Persistence Architecture](./docs/adr/0001-project-persistence-architecture.md)
- [ADR-0002: Structured Project Data and Glossary Model](./docs/adr/0002-structured-project-data-and-glossary-model.md)
- [ADR-0003: UI Interaction Architecture](./docs/adr/0003-ui-interaction-architecture.md)
- [ADR-0004: Manuscript Non-Destructive Policy](./docs/adr/0004-manuscript-non-destructive-policy.md)
- [ADR-0006: Durable State Categories and Settings Architecture](./docs/adr/0006-settings-architecture.en.md)
- [ADR-0008: Project File, Project Root, and Project-Local Recovery Layout](./docs/adr/0008-project_file-project_root-and-project_local-recovery-layout.en.md)
- [ADR-0009: Working Copy Persistence and Recovery Model](./docs/adr/0009-working-copy-persistence-and-recovery-model.en.md)

Sometimes design is decided before implementation.

This is because data structures that are expensive to fix later should be decided earlier than code that can be fixed cheaply later.

---

## Roadmap

The Pergamum development roadmap is maintained here:

- [Pergamum Roadmap](./docs/roadmap.md)

The source of truth for implementation scope is GitHub Issues. The roadmap is treated as a map for keeping track of direction, priorities, and postponed items.

The broad flow so far is:

```text
Phase 4 (v0.50.0):  Make it easy to find and use operations   … done
Phase 5 (v0.51.x):  Avoid touching the manuscript too much     … done
Phase 6 (v0.60.x):  Make it possible to close and come back     … done
Phase 7 (v0.70.x):  Make it possible to walk through the project … done
v0.80.0:            Core features for a novelists' IDE are in place (current)
```

Up to v0.90.0, work proceeds in the following agreed order. These items are **planned**, not implemented.

```text
1.  Keyboard shortcut support
2.  TAB handling refinements
3.  Raw TXT format support
4.  Ruby / emphasis dots support
5.  Markdown toolbar
6.  General Preview refinements
7.  Project-wide TXT export
8.  Settings JSON export
9.  Dark theme
10. Polish
```

The scope, non-scope, and acceptance criteria for each item are defined in individual GitHub Issues.

For candidates beyond `v1.x` (DB migration, Git integration, Plugin API, DOCX / EPUB / PDF and vertical-writing output, arbitrary CSS themes, collaborative editing / cloud sync, and so on), see `docs/roadmap.md`.

---

## Third-party notices

Pergamum bundles a few third-party assets (icons and sound effects).

Attribution and license information for each asset is collected in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

- Feather icons (MIT)
- Ionicons (MIT)
- Codicons (CC BY 4.0)
- SVG Repo icons (per-icon licenses)
- Typewriter sounds (OpenGameArt, CC0)

---

## License

Pergamum is free software released under the MIT License.

For the licenses of the bundled third-party assets, see [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

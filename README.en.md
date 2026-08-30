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

As of v0.70.0, Pergamum has completed up through Phase 6, “Make it possible to close and come back.”

The foundations for daily dogfooding are now taking shape, including manuscript editing, Project files, Command Palette, Settings, Debug Log, Session restore, and Document Recovery.

That said, Pergamum is not yet a stable release for general use.

In particular, the Glossary / project database schema may still change in the future. If you use Pergamum with important manuscripts or structured data, please manage the entire working directory with Git or ordinary backups.

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
| Project | Prevent concurrent writes with a Project write lock |
| Project | Open a project as read-only when another process is already using it |
| Project | Safely recover stale Project write locks |
| Project | Close the current Project |
| Editor | Edit Markdown manuscript text |
| Editor | Open multiple documents in tabs |
| Editor | Close opened tabs |
| Editor | Open external Markdown files |
| Editor | Preserve line endings when saving |
| Editor | Save through an atomic Markdown save pipeline |
| Editor | Show character count |
| Editor | Bulk insert / remove paragraph indentation |
| Preview | Show Markdown Preview |
| Preview | Decorate Glossary matches in Preview |
| Glossary | Create, edit, and delete Glossary entries |
| Glossary | Manage Glossary forms |
| Glossary | Show Hover Cards for Glossary matches |
| Glossary | Navigate from Glossary entries to their occurrences in the manuscript |
| Glossary | Search entries in the Glossary navigator |
| Glossary | Review occurrences in the Glossary occurrences tab |
| Command | Search and run operations from the Command Palette |
| Command | Use application menu / shortcuts / context menu |
| Settings | View and edit settings in the Settings Page |
| Session | Restore the previous project / tabs / window state |
| Recovery | Persist Recovery payloads for unsaved manuscript text |
| Recovery | Show unsaved text from the previous run as recovery candidates |
| Recovery | Restore Recovery candidates as `.recovered.md` files |
| Recovery | Explicitly discard Recovery candidates |
| Recovery | Suppress repeated auto-show for the same Recovery candidate set |
| Notification | Show lightweight informational notifications with NotificationToast |
| Workbench | Work with Navigator / Editor / Preview panes |
| Workbench | Collapse the Sidebar |
| Utility Window | Open the Utility Window |
| Debug | Output Debug mode JSONL logs |
| Debug | Inspect logs in the Debug Log tab |
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
| File format | Manuscript files that can be opened are limited to `*.md` |
| File format | `*.txt` and other text files are not yet supported |
| Encoding | Only UTF-8 is supported |
| Encoding | Non-UTF-8 encodings such as Shift_JIS, EUC-JP, and UTF-16 are not yet supported |
| Project database | The Glossary / project database schema is still under development |
| Project database | Future changes may include breaking changes |
| Compatibility | Long-term DB compatibility is not guaranteed at this stage |
| Recovery | Recovery is for rescuing unsaved manuscript text, not a replacement for history management or Git |
| Search | Advanced search and navigation across the entire work are future development targets |
| Output | Full-fledged output for submission, printing, and ebooks is not implemented yet |
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

Major ADRs:

- [ADR-0001: Project Persistence Architecture](./docs/adr/0001-project-persistence-architecture.md)
- [ADR-0002: Structured Project Data and Glossary Model](./docs/adr/0002-structured-project-data-and-glossary-model.md)
- [ADR-0003: UI Interaction Architecture](./docs/adr/0003-ui-interaction-architecture.md)
- [ADR-0004: Manuscript Non-Destructive Policy](./docs/adr/0004-manuscript-non-destructive-policy.md)
- [ADR-0005: Command Domain Taxonomy](./docs/adr/0005-command-domain-taxonomy.md)
- [ADR-0008: Project File / Root / Recovery Layout](./docs/adr/0008-project-file-root-recovery-layout.md)
- [ADR-0009: Recovery Store Architecture](./docs/adr/0009-recovery-store-architecture.md)

Sometimes design is decided before implementation.

This is because data structures that are expensive to fix later should be decided earlier than code that can be fixed cheaply later.

---

## Roadmap

The Pergamum development roadmap is maintained here:

- [Pergamum Roadmap](./docs/roadmap.md)

The source of truth for implementation scope is GitHub Issues.

The roadmap is treated as a map for keeping track of direction, priorities, and postponed items.

Pergamum has completed through Phase 6, “Make it possible to close and come back,” and is preparing to move to the next stage.

The broad flow is:

```text
Phase 4:
  Make it easy to find and use operations

Phase 5:
  Avoid touching the manuscript too much

Phase 6:
  Make it possible to close and come back

Phase 7:
  Make it possible to walk through the project

Phase 8:
  Make it ready to hand to other people

v0.90.0:
  Make it usable every day
```

See `roadmap.md` for details of each Phase.

---

## License

Pergamum is released under the MIT License.

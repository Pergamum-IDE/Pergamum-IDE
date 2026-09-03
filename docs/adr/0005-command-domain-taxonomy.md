# ADR-0005: Command Domain Taxonomy

**Status:** Accepted

**Date:** 2026-08-17

---

## Context

Command Palette の導入により、Pergamum の command ID はユーザーにも開発者にも見える識別子になった。

command ID は今後、Command Palette、menu、toolbar、shortcut、debug logging、plugin API、command rename policy、Issue / ADR / test の設計語彙に影響する。

現時点では `editor` / `viewer` / `workbench` / `workspace` / `glossary` / `settings` / `search` / `import` / `export` / `app` の責務境界、および plugin command namespace との関係が明文化されていない。

Command Palette の user-facing category や表示位置を考える前に、command ID domain が何を表すのかを定義する必要がある。

---

## Decision

### 1. Command domain is the semantics owner

Command domain は caller surface ではなく、command semantics の owner を表す。

つまり command ID は、どこから呼ばれたかではなく、その操作の意味をどの subsystem が所有するかで分類する。

Caller / presentation surface の例:

```text
Command Palette
menus
toolbars
shortcuts
panels
status bar
context menus
```

これらは command を呼び出す場所であり、command ID domain ではない。

たとえば Preview 上の UI から現在文書を保存する場合でも、保存の意味を editor subsystem が所有するなら command は `editor.*` でよい。

逆に、ステータスバーに表示されるからといって、文字数カウント機能が自動的に `workbench.*` になるわけではない。

### 2. Command ID domain and user-facing category are separate

Command ID domain と Command Palette 上の user-facing category は同一視しない。

Command ID domain は、開発者向けの責務境界と安定識別子である。

Command Palette category は、ユーザー向けの grouping / display metadata であり、i18n や UX 上の都合で domain と異なる可能性がある。

例:

```ts
{
  id: "editor.document.save",
  palette: {
    category: "document"
  }
}
```

この場合:

```text
command domain:
  editor

user-facing category:
  document
```

Command Palette grouping UI の実装は本 ADR では扱わない。

### 3. Built-in command domain closed set

Built-in command domain の closed set は実装上 `src/shared/commandTaxonomy.ts` の `CORE_COMMAND_DOMAINS` を単一の機械的な source of truth とする。

本 ADR は、その closed set の意味と責務境界を記録する。

Built-in command domains:

```text
editor
viewer
workbench
workspace
glossary
settings
search
import
export
app
```

`app` is deprecated.

`app` は既存 command ID との migration compatibility のために closed set へ残すが、新規 command ID では使用しない。

Known existing deprecated commands:

```text
app.project.open
app.recentProjects.toggle
```

これらは rename 候補として記録するが、本 ADR / Issue では rename しない。

Possible future names:

```text
app.project.open
  -> workspace.project.open

app.recentProjects.toggle
  -> workspace.recentProjects.toggle
```

Deprecated `app.*` command ID の固定リストは `src/shared/commandTaxonomy.ts` の `DEPRECATED_APP_COMMAND_IDS` に定義する。

この固定リストは migration 中に `app.*` の既存集合を凍結するためだけに存在する。最後の `app.*` command が rename されたら、固定リストも削除する。

### 4. Reserved command namespace roots

Reserved command namespace roots は built-in command domains とは別に定義する。

`plugin` is not a built-in command domain.

`plugin` は plugin-owned command namespace の root として予約する。

Reserved namespace roots は `src/shared/commandTaxonomy.ts` の `RESERVED_COMMAND_NAMESPACE_ROOTS` に定義する。

Pergamum first-party / bundled / native plugins should use:

```text
plugin.pergamum.<feature>.<target>.<verb>
```

Third-party plugins should use:

```text
plugin.<pluginId>.<feature>.<target>.<verb>
```

Third-party plugins must not use:

```text
plugin.pergamum.*
```

Built-in command IDs and plugin command IDs may have different segment structures.

Built-in command IDs generally follow:

```text
{domain}.{target}.{verb}
```

Plugin command IDs generally follow:

```text
plugin.{pluginId}.{feature}.{target}.{verb}
```

Plugin runtime, plugin manifest validation, plugin permissions, plugin contribution points, and plugin settings schema are out of scope.

### 5. Built-in domains are reserved

Built-in command domains are reserved for Pergamum built-in commands.

Plugins must not register commands under built-in command domains.

Plugins that need to extend built-in behavior should use host-defined contribution points rather than overriding built-in command IDs.

Future contribution point examples:

```text
Markdown preview renderer
status bar item
export provider
import provider
glossary form provider
diagnostics provider
```

Contribution point implementation is out of scope.

### 6. Command ID collision policy

Command IDs are globally unique.

Pergamum must not use last-writer-wins semantics for command registration.

If a command attempts to register an ID that is already registered:

```text
keep the existing command
reject the later registration
report a diagnostic
```

Current `CommandRegistry` already rejects duplicate command IDs by throwing `DuplicateCommandIdError`.

Future plugin registration may report diagnostics differently, but must preserve the same semantic policy:

```text
existing command wins
later registration is rejected
no silent overwrite
```

---

## Built-in Command Domains

### `editor`

`editor` は editing subsystem を表す。

対象例:

```text
current editable document
text editing behavior
save / revert
selection
cursor
input
clipboard editing commands
undo / redo
editor-specific command routing
```

Examples:

```text
editor.document.save
editor.selection.copy
editor.selection.cut
editor.selection.paste
```

`editor.document.save` は現時点で正しい command ID として扱う。

`document` は domain ではなく target であり、現在の編集対象文書を表す。Dirty state / editable document state は editor subsystem が所有するため、`editor.document.save` は rename 候補にしない。

### `viewer`

`viewer` は reading / preview subsystem を表す。

対象例:

```text
Markdown Preview
rendered content navigation
reveal source from rendered content
reading surface state
viewer-first operations
future mobile viewer / companion reading operations
```

Examples:

```text
viewer.source.reveal
viewer.render.refresh
```

現時点で `viewer.*` command が存在しない場合でも、`viewer` は reserved built-in domain として定義する。

Preview / reading surface は今後 command を持つ可能性が高く、`editor` と `viewer` の境界を先に定義しておかないと preview-related command が `editor.*` に流入しやすい。

`viewer` は本文を編集する subsystem ではない。ただし viewer から editor command を呼ぶことはあり得る。

### `workbench`

`workbench` は Pergamum の抽象的な作業台 / UI shell を表す。

対象例:

```text
Command Palette
Utility Window
pane / panel
layout
Activity Bar
sidebar visibility
shell-level dialogs
About dialog
settings UI surface, when only opening the UI is meant
```

Examples:

```text
workbench.commandPalette.open
workbench.utilityWindow.open
workbench.debugLog.open
workbench.sidebar.toggle
workbench.layout.reset
workbench.about.open
workbench.settings.open
```

`workbench` は project root、filesystem、settings resolution、external artifact generation を所有しない。

```text
Workbench is where work is arranged.
Workspace is what project space is open.
```

### `workspace`

`workspace` は開いている project / container と、その filesystem-facing project structure を表す。

対象例:

```text
project open / close
project root
file tree
project-relative path
workspace navigation
project file selection
file reveal / rename / delete
recent projects, if treated as project selection history
```

Examples:

```text
workspace.project.open
workspace.project.close
workspace.file.open
workspace.file.reveal
workspace.file.rename
workspace.navigator.focus
workspace.recentProjects.toggle
```

Filesystem-facing commands belong to `workspace`, not `workbench`.

Opening an existing project folder is a workspace operation, not import.

### `glossary`

`glossary` は Glossary subsystem を表す。

対象例:

```text
glossary entry
glossary form
canonical / alias / variant / warning
occurrence tracking
occurrence navigation
glossary hover / preview integration where the command semantics are glossary-owned
```

Examples:

```text
glossary.entry.create
glossary.entry.open
glossary.occurrences.previous
glossary.occurrences.next
glossary.occurrences.tracking.close
```

Glossary は Pergamum の中核機能であり、`editor` / `viewer` / `workspace` の下位概念として扱わない。

本 ADR / Issue では glossary save command を追加・rename しない。

将来 dedicated glossary save command を追加する場合は、既存 save implementation を確認し、現在の save path が glossary editor state を `editor.document.save` の一部として扱っているのか、glossary save が既に separate command boundary を持つのかを確認してから判断する。

### `settings`

`settings` は configuration subsystem を表す。

対象例:

```text
global settings
project settings
effective settings resolution
settings schema / validation
plugin settings
settings import/export where the semantics are configuration-owned
```

Examples:

```text
settings.global.save
settings.project.save
settings.effective.inspect
settings.effective.reload
settings.schema.validate
settings.plugin.inspect
```

Opening the settings UI belongs to `workbench`:

```text
workbench.settings.open
```

Settings data itself belongs to `settings.*`.

Project settings may override global settings. This precedence rule belongs to the settings subsystem, not `workspace` or `workbench`.

Do not use `settings.global.open` or `settings.project.open` as examples when the command merely opens the settings UI, because that confuses UI opening with settings data semantics.

### `search`

`search` は search / find / replace subsystem を表す。

対象例:

```text
current document search
project-wide search / grep
search query state
search results
search result navigation
regex / case sensitivity / whole-word options
replace preview
replace apply
replace cancellation
```

Examples:

```text
search.document.open
search.workspace.open
search.query.toggleRegex
search.results.next
search.results.previous
search.replace.open
search.replace.preview
search.replace.apply
search.replace.cancel
```

`search` は、active editor document だけを検索する場合でも `editor` の下位ではない。

`search` は、project-wide search を扱う場合でも `workspace` の下位ではない。

Replace is not a separate top-level domain.

Replace operations belong under `search.*` because they share query, scope, results, preview, and navigation state with search.

User-facing feature names may use Finder / Replacer, but command domain should use `search`.

### `import`

`import` は Pergamum 外部の形式・データを Pergamum-managed project data へ取り込む subsystem を表す。

対象例:

```text
glossary JSON import
glossary CSV / TSV template import
future project import
future DOCX import, if ever supported
import validation
import preview
import apply transaction
```

Examples:

```text
import.glossary.open
import.glossary.run
import.docx.open
import.docx.run
```

Opening an existing project folder or existing project file is not import.

Examples:

```text
workspace.project.open
workspace.file.open
```

Import means crossing an external data boundary into Pergamum-managed structure.

Import wizard / dialog commands may be Command Palette-visible.

Direct execution commands that require runtime arguments, such as paths/options, should follow existing palette visibility policy and usually remain hidden.

### `export`

`export` は Pergamum-managed data から外部成果物を生成する subsystem を表す。

対象例:

```text
glossary JSON / CSV / TSV export
DOCX export
future EPUB / PDF export
submission package generation
future AI review context pack
artifact generation from manuscript, project metadata, glossary, and settings
```

Examples:

```text
export.glossary.open
export.glossary.run
export.docx.open
export.docx.run
```

Export is not ordinary save.

Saving current editor content is:

```text
editor.document.save
```

Generating an external artifact is:

```text
export.*
```

Export wizard / dialog commands may be Command Palette-visible.

Direct execution commands that require runtime arguments, such as destination path/options, should follow existing palette visibility policy and usually remain hidden.

### `app`

`app` is deprecated.

Existing `app.*` command IDs are allowed only for migration compatibility.

Known current commands:

```text
app.project.open
app.recentProjects.toggle
```

New commands must not use `app.*`.

Possible future names:

```text
app.project.open
  -> workspace.project.open

app.recentProjects.toggle
  -> workspace.recentProjects.toggle
```

This ADR / Issue does not perform those renames.

Application-level UI commands that are not tied to project or filesystem semantics should usually belong to `workbench`, not `app`.

Example:

```text
workbench.about.open
```

---

## Mechanical Enforcement

ADR text alone is not sufficient to keep the taxonomy stable.

This ADR is paired with minimal code/test enforcement:

```text
src/shared/commandTaxonomy.ts
```

The implementation defines:

```text
CORE_COMMAND_DOMAINS
RESERVED_COMMAND_NAMESPACE_ROOTS
DEPRECATED_APP_COMMAND_IDS
```

Tests assert:

- every command ID actually registered in the command registry has a first segment in `CORE_COMMAND_DOMAINS`
- built-in command IDs do not use `RESERVED_COMMAND_NAMESPACE_ROOTS`
- every registered `app.*` command ID is included in `DEPRECATED_APP_COMMAND_IDS`

`knownDebugLogCommandIds` is a debug log allowlist catalog. It may be useful as a reference, but it must not be treated as a complete substitute for command registry registration.

---

## Consequences

### Positive

- Command ID domain decisions become reviewable before Command Palette grouping or plugin APIs grow.
- Built-in command domains and plugin namespace roots are separated.
- `app.*` migration compatibility remains explicit and frozen.
- New built-in command IDs are mechanically checked against the taxonomy.
- Duplicate registration policy remains no silent overwrite.

### Negative

- Adding a new built-in command domain now requires changing the shared taxonomy constant and the ADR.
- Adding a new built-in command registration must keep taxonomy tests aligned with what the app actually registers.
- `app.*` commands remain visible until a future migration issue renames them.

### Accepted constraints

This ADR intentionally does not resolve all existing command naming inconsistencies.

The goal is taxonomy and enforcement, not broad command rename work.

---

## Alternatives Considered

### Classify by caller surface

Rejected.

Classifying command IDs by where they are displayed or invoked from would create unstable names such as toolbar-specific, menu-specific, or palette-specific command IDs.

The same operation must be invokable from multiple surfaces without changing its command ID.

### Treat `plugin` as a built-in domain

Rejected.

`plugin` is a namespace root for plugin-owned commands, not a built-in subsystem owner.

Keeping `plugin` separate from built-in domains preserves a clear collision boundary.

### Keep allowing arbitrary `app.*`

Rejected.

`app` is too broad to express ownership and would continue to absorb unrelated commands.

Existing `app.*` IDs remain only for migration compatibility.

### Create top-level `replace`

Rejected.

Replace shares query, scope, results, preview, and navigation state with search.

The command domain is therefore `search`, with replace operations under `search.*`.

---

## Future Work

### Deprecated `app.*`

Record candidates:

```text
app.project.open
  -> workspace.project.open

app.recentProjects.toggle
  -> workspace.recentProjects.toggle
```

Do not rename them in this ADR / Issue.

### Glossary occurrence command ordering

Existing glossary occurrence command IDs may have inconsistent target ordering.

Known examples:

```text
glossary.entry.occurrences.previous
glossary.occurrences.previous
glossary.occurrences.entry.open
```

This is not a domain problem, because all remain under `glossary`.

It is a target-ordering consistency problem.

Do not rename them in this ADR / Issue.

### Glossary save command

This ADR / Issue does not introduce or rename a glossary save command.

Before adding a dedicated glossary save command, check the existing save implementation.

In particular, confirm whether the current save path treats glossary editor state as part of `editor.document.save`, or whether glossary save already has a separate command boundary.

Do not rename save commands in this ADR / Issue.

### ADR README gaps

If ADR README lists are missing ADR-0003 or ADR-0004, backfilling those entries should be handled separately from this ADR / Issue.

---

## Out of Scope

This ADR / Issue does not implement:

- Command Palette grouping UI
- Command Palette visual polish
- match highlighting
- command enablement / `when` policy
- command invoked / ignored logging cleanup
- application menu allowlist rename
- large command ID rename
- `app.*` command rename
- glossary occurrence command rename
- glossary save command rename
- plugin runtime
- plugin manifest
- plugin permission model
- plugin contribution points
- plugin settings schema
- menu / toolbar / shortcut restructuring
- settings system
- search / replace
- import / export

---

## References

- ADR-0003: UI Interaction Architecture
- Issue #126: Command Palette foundation
- Issue #131: Define command domain taxonomy and record ADR-0005

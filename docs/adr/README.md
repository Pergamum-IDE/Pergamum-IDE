# Architecture Decision Records (ADR)

このディレクトリは、Pergamum の重要なアーキテクチャ上の意思決定（Architecture Decision Records）を管理します。

ADR は、単なる設計メモではありません。

「なぜその設計を採用したのか」を記録し、将来の設計変更や機能追加の判断基準となることを目的としています。

---

## 運用方針

- ADR は一度採択した設計判断を記録する。
- ADR は過去を書き換えない。
- 設計変更が必要になった場合は、新しい ADR を追加し、以前の ADR を置き換える理由を記録する。
- Issue や Pull Request は、必要に応じて関連する ADR を参照する。

---

## ADR 一覧

| No. | Title | Status | Description |
| ---- | ----- | ------ | ----------- |
| ADR-0000 | Accessibility and Inclusive Interaction Principles | Accepted | アクセシビリティと包摂的インタラクションの原則。既存 ADR の decision / invariant を遡って無効化せず、以後の設計判断の前提となる。日本語版: `0000-accessibility-and-inclusive-interaction-principles.ja.md` / English: `0000-accessibility-and-inclusive-interaction-principles.en.md` |
| ADR-0001 | Project Persistence Architecture | Accepted | プロジェクトの永続化方式（Markdown / SQLite / Assets）の基本方針を定義する。 |
| ADR-0002 | Structured Project Data and Glossary Model | Accepted | 構造化 Project Data の正本、Glossary entity/form model、UUIDv7、snapshot/restore 原則を定義する。 |
| ADR-0003 | UI Interaction Architecture | Accepted | UI 操作アーキテクチャの invariant（I-1〜I-41、凍結済み）。Activity Bar / Sidebar / Editor の責務境界、EditorId の単一化、Command 経由の操作原則を定義する。 |
| ADR-0004 | Manuscript Non-Destructive Policy | Accepted | 本文非破壊原則と日本語テキスト処理方針。Pergamum が本文・ユーザー入力を暗黙に正規化・置換しないことを定義する。 |
| ADR-0005 | Command Domain Taxonomy | Draft | Command ID domain の責務境界、built-in domain、reserved plugin namespace、collision policy を定義する。 |
| ADR-0006 | Durable State Categories and Settings Architecture | Proposed | settings / meta / session / recovery / runtime coordination のカテゴリ境界と Settings Catalog / resolution / validation 方針を定義する。日本語版: `0006-settings-architecture.ja.md` / English: `0006-settings-architecture.en.md` |
| ADR-0007 | Recovery and Runtime Coordination | Proposed | recovery storage / identity / restore と runtime coordination marker の非破壊・best-effort 方針を定義する。日本語版: `0007-recovery-and-runtime-coordination.ja.md` / English: `0007-recovery-and-runtime-coordination.en.md` |
| ADR-0008 | Project File, Project Root, and Project-Local Recovery Layout | Proposed（partially superseded by ADR-0009） | Defines the `.pergamum` project file, project root boundary, project metadata, and project-local recovery layout. working-copy Recovery を `.pergamum_recovery/` に置く判断のみ ADR-0009 が supersede（他の判断は有効）。日本語版: `0008-project_file-project_root-and-project_local-recovery-layout.ja.md` / English: `0008-project_file-project_root-and-project_local-recovery-layout.en.md` |
| ADR-0009 | Working Copy Persistence and Recovery Model | Accepted | Markdown document と Glossary Entry に共通する working-copy Recovery の契約（persisted state / working copy / baseline の境界、content fingerprint による baseline identity、dirty semantics、Recovery capture timing、snapshot lifecycle、safe restore / already persisted / conflict / deferred / unresolved / corrupt の分類、Recovery store の責務分離と障害時 semantics、Glossary specialization）を定義する。§実装状況（as of Phase 7-2）で、現行実装（`.recovered[-N].md` sidecar + 2 フェーズ finalize）と、契約のみで未実装の範囲（reconciliation engine / save-attempt lifecycle / per-snapshot claim / external-change detection）を区別する。日本語版: `0009-working-copy-persistence-and-recovery-model.ja.md` / English: `0009-working-copy-persistence-and-recovery-model.en.md` |
| ADR-0010 | Startup File-Open Routing (Cold Start) | Accepted | cold-start（起動引数 / Open With / EXE drop）で渡されたファイルオープン対象のルーティング。`.md` / `.markdown` のみ受理、URL-like 入力拒否、`realpath` による symlink 解決、project-owned Markdown の enclosing `.pergamum` への昇格と既存 project-open lifecycle 経由の open、lock 時の read-only 確認、複数 `.pergamum` の曖昧拒否を定義する。ADR-0008 が follow-up 送りにした startup argv handling の cold-start 部分。日本語版: `0010-startup-file-open-routing.ja.md` / English: `0010-startup-file-open-routing.en.md` |
| ADR-0011 | Project-Local File Operations and Deletion Policy | Proposed | File Explorer における project-local な file / folder deletion の境界と安全条件を定義する。project deletion / project root / `.pergamum`（backup copy 含む）は削除不可（DEL-1〜3）。project root 配下の entry のみ、明示 command ＋ 確認 dialog ＋ 5 秒待機 ＋ 対象の表形式列挙（先頭/末尾10文字 preview）を条件に削除可（DEL-4〜11）。silent deletion 禁止、OS ゴミ箱には送らず直接削除（DEL-6・DEL-8）。protected entry を subtree に含む folder はまるごと削除不可（DEL-12）。dirty/open editor と Recovery snapshot の silent loss 禁止（DEL-13・DEL-14、ADR-0009 S-48）。日本語版: `0011-project-local-file-operations-and-deletion-policy.ja.md` / English: `0011-project-local-file-operations-and-deletion-policy.en.md` |
| ADR-0012 | Application Instance and Launch Target Routing Policy | Proposed | Pergamum は複数 application instances を許容しつつ、OS file association / command line / Electron `second-instance` style launch target を可能な限り first-started primary instance へ route する方針を定義する。`.pergamum` は既存 window を置き換えず新しい project window を開く試みを行い、Markdown は project ownership により既存 project window / 新規 project window / standalone window / ambiguous rejection へ分類する。Recovery ownership、Session persistence ownership、Project write lock ownership は first-come-first-served とし、routing を理由に steal しない。日本語版（正本）: `0012-application-instance-and-launch-target-routing-policy.ja.md` / English: `0012-application-instance-and-launch-target-routing-policy.en.md` |

---

## ADR テンプレート

各 ADR は以下の構成を基本とする。

```markdown
# ADR-XXXX: Title

Status: Proposed | Accepted | Superseded

Date: YYYY-MM-DD

## Context

この判断が必要になった背景。

## Decision

採用する設計とその理由。

## Consequences

採用による利点・欠点・影響範囲。

## Alternatives Considered

検討した代替案と却下理由。

## Future Work

将来検討すべき事項。
```

---

## 設計原則

Pergamum は **Novel IDE** であり、Markdown エディタではない。

設計上の重要な判断は、個別 Issue や実装コードではなく ADR に記録し、プロジェクト全体で一貫した設計思想を維持する。

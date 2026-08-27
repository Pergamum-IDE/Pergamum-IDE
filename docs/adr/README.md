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
| ADR-0001 | Project Persistence Architecture | Accepted | プロジェクトの永続化方式（Markdown / SQLite / Assets）の基本方針を定義する。 |
| ADR-0002 | Structured Project Data and Glossary Model | Accepted | 構造化 Project Data の正本、Glossary entity/form model、UUIDv7、snapshot/restore 原則を定義する。 |
| ADR-0005 | Command Domain Taxonomy | Draft | Command ID domain の責務境界、built-in domain、reserved plugin namespace、collision policy を定義する。 |
| ADR-0006 | Durable State Categories and Settings Architecture | Proposed | settings / meta / session / recovery / runtime coordination のカテゴリ境界と Settings Catalog / resolution / validation 方針を定義する。日本語版: `0006-settings-architecture.ja.md` / English: `0006-settings-architecture.en.md` |
| ADR-0007 | Recovery and Runtime Coordination | Proposed | recovery storage / identity / restore と runtime coordination marker の非破壊・best-effort 方針を定義する。日本語版: `0007-recovery-and-runtime-coordination.ja.md` / English: `0007-recovery-and-runtime-coordination.en.md` |
| ADR-0008 | Project File, Project Root, and Project-Local Recovery Layout | Proposed（partially superseded by ADR-0009） | Defines the `.pergamum` project file, project root boundary, project metadata, and project-local recovery layout. working-copy Recovery を `.pergamum_recovery/` に置く判断のみ ADR-0009 が supersede（他の判断は有効）。日本語版: `0008-project_file-project_root-and-project_local-recovery-layout.ja.md` / English: `0008-project_file-project_root-and-project_local-recovery-layout.en.md` |
| ADR-0009 | Working Copy Persistence and Recovery Model | Accepted | Markdown document と Glossary Entry に共通する working-copy Recovery の契約（persisted state / working copy / baseline の境界、content fingerprint による baseline identity、dirty semantics、Recovery capture timing、snapshot lifecycle、safe restore / already persisted / conflict / deferred / unresolved / corrupt の分類、Recovery store の責務分離と障害時 semantics、Glossary specialization）を定義する。日本語版: `0009-working-copy-persistence-and-recovery-model.ja.md` / English: `0009-working-copy-persistence-and-recovery-model.en.md` |

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

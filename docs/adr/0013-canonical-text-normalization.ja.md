# ADR-0013: 文字表記統一が有効な場合は NFC 正規化後テキストを正本とする

**Status:** Proposed

**Date:** 2026-09-12

> Status について: 本 ADR は Issue #449 の policy / architecture decision を明文化する。実装範囲は Markdown 本文保存と Recovery snapshot の本文保存に限定し、ファイル名・リンク参照の診断/修復は後続 Issue で扱う。

---

## Context

Pergamum には、ADR-0004「本文非破壊原則と日本語テキスト処理方針」および ADR-0009「Working Copy Persistence and Recovery Model」により、本文・ユーザー入力を暗黙に正規化・置換しないという既存方針がある。

一方で Unicode には、見た目が同じでも内部表現が異なる文字列がある。たとえば、濁点付き文字が 1 文字として記録される場合と、基底文字 + 濁点として分離して記録される場合がある。

```text
が
か + ゙
```

この差異は、検索、語彙照合、ファイル参照、外部環境連携において、一致判定の失敗を引き起こす。作者から見ると同じ文字表記に見えるにもかかわらず、内部表現の違いだけで Pergamum 内の管理データや保存本文が揺れると、Novel IDE としての信頼性を損なう。

#446 で Application Setting `workbench.normalizeUnicodeToNfc` が追加された。この設定は Application Settings only であり、default は `true` である。

#439 では、Glossary Atom value の保存・重複判定に `workbench.normalizeUnicodeToNfc` が適用された。これにより、設定が有効な場合、見た目が同じ語彙 Atom value は NFC 正規化後の値で保存・比較される。

Issue #449 は、同じ正本方針を Markdown 本文保存と Recovery 本文 snapshot に適用する。

---

## Decision

`workbench.normalizeUnicodeToNfc` が有効な場合、Pergamum が保存・管理する Markdown 本文テキストおよび管理データは、NFC 正規化後の文字列を正本とする。

```text
workbench.normalizeUnicodeToNfc が有効な場合、Pergamum が保存・管理する Markdown本文テキストおよび管理データは、NFC正規化後の文字列を正本とする。
```

ADR-0004 / ADR-0009 における「原文データ尊重」は、入力バイト列や Unicode 正規化形式を完全保存するという意味ではなく、ユーザーが意図した表記内容を尊重するという意味として補足・再定義する。

```text
入力バイト列やUnicode正規化形式を完全保存するという意味ではなく、ユーザーが意図した表記内容を尊重するという意味である。
```

この判断は、すべての表記揺れ吸収を許可するものではない。NFC 正規化は、見た目が同じ文字表記の内部表現をそろえるための保存方針であり、全角/半角、ダッシュ種別、波ダッシュ、異体字、漢数字/算用数字などを自動変換する方針ではない。

---

## Consequences

- 設定 ON 時、Markdown 本文保存時に NFC 正規化を適用する。
- 設定 ON 時、Recovery snapshot も同じ方針に従う。
- 設定 OFF 時は Unicode 正規化を適用しない。
- 既存 Markdown ファイルの一括正規化は自動では行わない。
- 保存時に NFC 正規化が発生した場合、editor state / dirty state / session state は、保存済み本文と同じ NFC 正規化後本文を保存済み状態として扱う。
- Recovery から `.recovered.md` を出力する場合は、保存済み snapshot の本文をそのまま書き出す。
- ファイル名・リンク参照の診断/修復は別 Issue で扱う。
- 外部環境由来のファイル名表記ゆれは、Pergamum 側で検出・補助する対象とする。

Markdown 本文全体に NFC 正規化を適用すると、本文中のローカルファイルリンク destination も正規化され得る。

```markdown
![画像](images/がぞう.png)
```

このリンク文字列が保存時に変化した場合、実ファイル名が非 NFC のままだと参照先と一致しなくなる可能性がある。本 ADR はその caveat を認めるが、ファイル名・リンク参照の診断、警告、修復、衝突検出は本 Issue では実装しない。

---

## Alternatives Considered

### NFC 正規化を Markdown 本文には適用しない

ADR-0004 の従来解釈には最も近いが、Glossary Atom value と Markdown 本文で文字表記の正本方針が分かれ、見た目が同じ文字の一致判定失敗が残るため採用しない。

### 保存時ではなく検索・照合時だけ正規化する

検索や語彙照合の失敗は一部軽減できるが、保存本文、Recovery snapshot、管理データの内部表現は揺れたまま残る。Pergamum が管理する正本をそろえる方針にならないため採用しない。

### すべての表記揺れを自動統一する

全角/半角、ダッシュ種別、波ダッシュ、異体字などは作者の文体・組版意図・投稿先慣習と結びつく場合がある。これは ADR-0004 の本文非破壊原則を破壊するため採用しない。

---

## Future Work

- ファイル名・Markdown link destination の NFC 等価な表記ゆれ診断。
- 実ファイル名と本文中リンク destination が Unicode 正規化形式の差だけで一致しない場合の補助 UI。
- 外部環境由来のファイル名表記ゆれに対する安全な修復 flow。
- NFC 等価なファイル名衝突検出。

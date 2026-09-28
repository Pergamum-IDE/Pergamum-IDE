# Pergamum 開発者向けコマンド監査台帳 (Developer Command Audit Log)

本ドキュメントは、Pergamum に実装されているすべてのユーザー操作コマンド、ショートカット、Electron アプリケーションメニュー、隠しアクセラレータ、CodeMirror keymap、ツールバー操作、コンテキストメニュー、スペシャルタブ起動コマンドを現行ソースコードから棚卸しし、整理した開発者向けの監査台帳です。

---

## 1. 概要・統計 (Summary & Statistics)

- **総確認項目数**: 59 件
- **Command Registry 登録コマンド数**: 39 件
  - **コマンドパレット表示 (Registered in Palette)**: 19 件
  - **コマンドパレット非表示 (`palette: { visible: false }`)**: 10 件
  - **内部/デバッグ専用コマンド**: 10 件
- **Electron メニューアイテム数**: 25 件（うち隠しアクセラレータ 4 件）
- **キーボードショートカット割り当て項目数**: 33 件

---

## 2. コマンド監査一覧 (Full Command Audit Table)

> **ショートカット表記ルール**:
> - `Ctrl` / `CommandOrControl` / `CmdOrCtrl` / `macOS Command` は原則 **`Mod`** に正規化表記しています（例: `Mod+N`, `Mod+Shift+I`, `Mod+]`, `Mod+[`）。
> - アクセシビリティ脱出キー `Ctrl+M` は規格に基づき `Ctrl+M` と表記します。ファンクションキー（`F1`, `F2`, `F11`, `F12`）およびシーケンス（`Escape→Tab`）はそのまま表記します。

| Category | Command ID | Label JA | Label EN | Shortcut | Source | Surface | Enabled condition | Command Palette | Palette status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **File** | `workspace.project.create` | プロジェクトを作成 | Create Project | - | Main Menu / Command Registry | All | Always | Yes | Registered |  |
| **File** | `workspace.project.open` | プロジェクトを開く | Open Project | `Mod+Shift+O` | Main Menu / Command Registry | All | Always | Yes | Registered |  |
| **File** | `workspace.project.close` | プロジェクトを閉じる | Close Project | - | Main Menu / Command Registry | All | `project.isOpen` | Yes | Registered |  |
| **File** | `import.text.bulk.openDialog` | テキストファイルをまとめてインポート | Bulk Import Text Files | - | Main Menu / Command Registry | All | Always | No | Excluded by Design | ポップアップダイアログ用 |
| **File** | `editor.file.new` | 新規ファイル | New File | `Mod+N` | Main Menu / Command Registry | All | `project.isOpen` && `project.access.readWrite` | Yes | Registered |  |
| **File** | `editor.document.markdown.open` | Markdownファイルを開く | Open Markdown File | - | Main Menu / Command Registry | All | Always | Yes | Registered | `Mod+O` はプロジェクト内ファイル検索に割り当て |
| **File** | `editor.document.save` | 現在の文書を保存 | Save Current Document | `Mod+S` | Main Menu / Command Registry | Editor | `editor.hasDocument` && `editor.isDirty` && Read-Write | Yes | Registered | ツールバーにも配置 |
| **File** | `editor.saveAll` | すべて保存 | Save All | `Mod+Alt+S` | Main Menu / Command Registry | All | `canSaveAllDocuments()` | Yes | Registered |  |
| **File** | `editor.saveAs` | 名前を付けて保存... | Save As... | `Mod+Shift+S`, `F12` | Main Menu / Command Registry | Markdown Document | `editor.hasDocument` && `editor.kind.markdown` | Yes | Registered | `F12` は Main Menu 隠しアクセラレータ |
| **File** | `editor.close` | 現在の文書を閉じる | Close Current Tab | `Mod+W` | Main Menu / Command Registry | Workspace | `canCloseEditor()` | Yes | Registered | 引数に `editorId` を受け取り可能 |
| **File** | `project.settings.open` | プロジェクト設定を開く | Open Project Settings | - | Main Menu / Command Registry | All | `project.isOpen` | Yes | Registered |  |
| **File** | `workspace.applicationSettings.open` | アプリケーション設定を開く | Open Application Settings | `Mod+,` | Main Menu / Command Registry | All | Always | Yes | Registered | `Mod+,` は Main Menu 隠しアクセラレータ |
| **File** | `app.quit` | Pergamumを終了 | Quit Pergamum | `Mod+Q` | Main Menu / Command Registry | All | Always | Yes | Registered | macOS の場合は `Command+Q` |
| **Edit** | `editor.selection.cut` | 切り取り | Cut | `Mod+X` | Main Menu / Command Registry | Editor | `canDelegateNativeEditCommand` | Yes | Registered |  |
| **Edit** | `editor.selection.copy` | コピー | Copy | `Mod+C` | Main Menu / Command Registry | Editor | `canDelegateNativeEditCommand` | Yes | Registered |  |
| **Edit** | `editor.selection.paste` | 貼り付け | Paste | `Mod+V` | Main Menu / Command Registry | Editor | `canDelegateNativeEditCommand` | Yes | Registered |  |
| **Edit** | `editor.selection.selectAll` | すべて選択 | Select All | `Mod+A` | Main Menu / Command Registry | Editor | `canDelegateNativeEditCommand` | Yes | Registered |  |
| **Edit** | `search.project.openFromSelection` | 選択範囲からプロジェクト内検索を開く | Open Project Search from Selection | `Mod+Shift+F` | Main Menu / Command Registry | All | Always | No | Missing Candidate | 全画面の選択領域から検索を起動 |
| **Edit** | `search.project.replace.openFromSelection` | 選択範囲からプロジェクト内置換を開く | Open Project Replace from Selection | `Mod+Shift+H` | Main Menu / Command Registry | All | Always | No | Missing Candidate | 全画面の選択領域から置換を起動 |
| **Edit** | `editor.image.insert` | 画像を挿入... | Insert Image... | `Mod+Shift+I` | Command Registry / Global Keydown / Toolbar | Markdown, Glossary Description | `canInsertImage` (Project-owned Read-Write) | Yes | Registered | #595 にてショートカット配線完了 |
| **Edit** | - | アクティブ文書検索 | Active Document Search | `Mod+F` | CodeMirror Keymap Extension | Active Editor Surface | Active document mounted | No | Excluded by Design | Pergamum カスタム検索パネル起動 |
| **Edit** | - | アクティブ文書置換 | Active Document Replace | `Mod+H` | CodeMirror Keymap Extension | Active Editor Surface | Active document mounted | No | Excluded by Design | Pergamum カスタム置換パネル起動 |
| **Edit / Formatting** | - | 太字 | Bold | `Mod+B` | CodeMirror Keymap / Toolbar | Markdown Document | Markdown & Read-Write | No | Missing Candidate | ツールバーおよびショートカット |
| **Edit / Formatting** | - | 斜体 | Italic | `Mod+I` | CodeMirror Keymap / Toolbar | Markdown Document | Markdown & Read-Write | No | Missing Candidate | ツールバーおよびショートカット |
| **Edit / Formatting** | - | 打ち消し線 | Strikethrough | `Mod+Shift+X` | CodeMirror Keymap / Toolbar | Markdown Document | Markdown & Read-Write | No | Missing Candidate | ツールバーおよびショートカット |
| **Edit / Formatting** | - | 見出し挿入ポップアップ | Insert Heading | `Mod+L` | CodeMirror Keymap / Toolbar | Markdown Document | Markdown & Read-Write | No | Missing Candidate | ポップアップ選択 |
| **Edit / Formatting** | - | リンク挿入 | Insert Link | `Mod+K` | CodeMirror Keymap / Toolbar | Markdown Document | Markdown & Read-Write | No | Missing Candidate | ダイアログ起動 |
| **Edit / Formatting** | - | 水平線挿入 | Insert Horizontal Rule | `Mod+Shift+L` | CodeMirror Keymap / Toolbar | Markdown Document | Markdown & Read-Write | No | Missing Candidate |  |
| **Edit / Formatting** | - | コードブロック挿入 | Insert Code Block | `Mod+Shift+B` | CodeMirror Keymap / Toolbar | Markdown Document | Markdown & Read-Write | No | Missing Candidate |  |
| **Edit / Formatting** | - | 表を挿入 | Insert Table | `Mod+T` | CodeMirror Keymap / Toolbar | Markdown Document | Markdown & Read-Write | No | Missing Candidate | ポップアップダイアログ表示 |
| **Edit / Formatting** | - | ルビ挿入ダイアログ | Insert Ruby... | `Mod+R` | CodeMirror Keymap / Toolbar | Markdown, PlainText Document | Read-Write & Selection active | No | Missing Candidate | 選択文字列必須 |
| **Edit / Formatting** | - | 圏点挿入ダイアログ | Insert Emphasis Mark... | `Mod+.` | CodeMirror Keymap / Toolbar | Markdown, PlainText Document | Read-Write & Selection active | No | Missing Candidate | 選択文字列必須 |
| **Edit / Indent** | - | インデント | Indent | `Mod+]`, `Tab` | CodeMirror Keymap / Toolbar | Markdown, PlainText Document | `canIndentEditorState` | No | Missing Candidate | #593 にて toolbar enablement 共通化 |
| **Edit / Indent** | - | アウトデント | Outdent | `Mod+[`, `Shift+Tab` | CodeMirror Keymap / Toolbar | Markdown, PlainText Document | `canOutdentEditorState` | No | Missing Candidate | #593 にて toolbar enablement 共通化 |
| **Edit / Indent** | - | タブキャプチャ脱出 | Tab Capture Bypass | `Ctrl+M`, `Escape→Tab` | CodeMirror Keymap Extension | Editor | `captureTabInEditor` enabled | No | Excluded by Design | アクセシビリティ用 |
| **Navigation** | `workbench.commandPalette.open` | コマンドパレットを開く | Open Command Palette | `Mod+P`, `F1` | Main Menu / Command Registry | All | Always | Yes | Registered | `F1` は Main Menu 隠しアクセラレータ |
| **Navigation** | - | プロジェクトファイル検索 | Quick Open Project Files | `Mod+O` | Global Keydown / Toolbar Box | Workspace | `project.isOpen` | No | Excluded by Design | パレットのプレフィックスなしモード |
| **Navigation** | - | 見出しジャンプ検索 | Jump to Heading | `Mod+#` | Global Keydown / Toolbar Box | Markdown Document | Markdown document open | No | Excluded by Design | パレットの `#` モード |
| **Navigation** | - | 語彙ジャンプ検索 | Jump to Glossary | `Mod+@` | Global Keydown / Toolbar Box | Workspace | `project.isOpen` | No | Excluded by Design | パレットの `@` モード |
| **Navigation** | `editor.line.goTo` | 指定行へ移動 | Go to Line | `Mod+:` | Command Registry / Global Keydown | Markdown Document | `editor.kind.markdown` | No | Excluded by Design | パレットの `:` モード (行番号引数必須) |
| **Navigation** | - | プロジェクト内全文検索プレフィックス | Project Search Prefix | `Mod+%` | Global Keydown / Toolbar Box | Workspace | `project.isOpen` | No | Excluded by Design | パレットの `%` モード |
| **Navigation** | `workspace.files.toggle` | ファイルエクスプローラーの表示を切り替え | Toggle File Explorer | `Mod+Shift+E` | Command Registry / Global Keydown | Workspace | Always | Yes | Registered |  |
| **Navigation** | `workspace.search.focus` | 検索を表示 | Show Search | - | Command Registry | Workspace | Always | Yes | Registered |  |
| **Navigation** | `workspace.glossary.focus` | 語彙集を表示 | Show Glossary | `Mod+Shift+G` | Command Registry / Global Keydown | Workspace | Always | Yes | Registered |  |
| **Navigation** | `workspace.documentMap.focus` | 文書マップを表示 | Show Document Map | `Mod+Shift+M` | Command Registry / Global Keydown | Workspace | Always | Yes | Registered |  |
| **Navigation** | `workspace.documentMetrics.focus` | 文書統計を表示 | Show Document Metrics | `Mod+Shift+T` | Command Registry / Global Keydown | Workspace | Always | Yes | Registered |  |
| **Navigation** | - | タブ切り替え（前/次） | Switch Workspace Tab | `Alt+Left`, `Alt+Right` | Global Keydown (useTabSwitchShortcuts) | Workspace Tabs | Tabs > 1 && Not modal/text input | No | Excluded by Design | タブ順移動 |
| **View** | `app.zoom.in` | 拡大 | Zoom In | `Mod+=`, `Mod++` | Main Menu / Command Registry | All | Always | Yes | Registered | `Mod++` は Main Menu 隠しアクセラレータ |
| **View** | `app.zoom.out` | 縮小 | Zoom Out | `Mod+-` | Main Menu / Command Registry | All | Always | Yes | Registered |  |
| **View** | `app.zoom.reset` | ズームのリセット | Actual Size | `Mod+0` | Main Menu / Command Registry | All | Always | Yes | Registered |  |
| **View** | - | 開発者ツールの切り替え | Toggle Developer Tools | `Mod+Shift+D` | Main Menu (Role) | All | Always | No | Excluded by Design | Electron Role `toggleDevTools` |
| **View** | - | 全画面表示の切り替え | Toggle Full Screen | `F11` | Main Menu / Toolbar | All | Always | No | Excluded by Design | Electron Role `togglefullscreen` |
| **View** | - | プレビュー表示の切り替え | Toggle Preview | `Mod+Shift+P` | Global Keydown / Toolbar | Markdown Document | `canTogglePreview` | No | Missing Candidate | プレビュー開閉 |
| **Assist** | `assist.lineEndingDistribution.show` | 改行コード分布を表示 | Show Line Ending Distribution | - | Main Menu / Command Registry | Markdown Document | `editor.kind.markdown` | Yes | Registered |  |
| **Assist** | `assist.paragraphIndent.insert` | 段落字下げ一括挿入 | Insert Paragraph Indent | - | Main Menu / Command Registry | Markdown Document | `editor.kind.markdown` && Read-Write | Yes | Registered |  |
| **Assist** | `assist.paragraphIndent.remove` | 段落字下げ一括削除 | Remove Paragraph Indent | - | Main Menu / Command Registry | Markdown Document | `editor.kind.markdown` && Read-Write | Yes | Registered |  |
| **Glossary** | `glossary.tag.manage` | 語彙集: タグを管理 | Manage Glossary Tags | - | Main Menu / Command Registry | All | `project.isOpen` | Yes | Registered | スペシャルタブ起動 |
| **Glossary** | `glossary.entry.manage` | 語彙集: 語彙を管理 | Manage Glossary Entries | - | Main Menu / Command Registry | All | `project.isOpen` | Yes | Registered | スペシャルタブ起動 |
| **Glossary** | `glossary.openFromEditorSelection` | 選択範囲から語彙を開く | Open Glossary Entry from Selection | `Mod+G` | Command Registry / CodeMirror Keymap | Markdown Document | Markdown Editor Selection | No | Missing Candidate | 選択文字列から語彙作成/編集 |
| **Glossary** | `glossary.entry.open` | 語彙を開く | Open Glossary Entry | - | Command Registry | Workspace | Always | No | Excluded by Design | 引数 `entryId` 必須 |
| **Glossary** | `glossary.openCreateEntryPane` | 新しい語彙をタブで開く | Open New Glossary Entry Tab | - | Command Registry | Workspace | Always | No | Excluded by Design | 内部オプション引数 |
| **Glossary** | `glossary.openEditEntryPane` | 語彙をタブで開く | Open Glossary Entry Tab | - | Command Registry | Workspace | Always | No | Excluded by Design | 内部オプション引数 |
| **Glossary** | `glossary.occurrences.previous` | 前の使用箇所（追跡） | Previous Occurrence (Tracking) | - | Command Registry | Workspace | `glossary.occurrences.tracking.active` | Yes | Registered | 機能未実装 (no-op) |
| **Glossary** | `glossary.occurrences.next` | 次の使用箇所（追跡） | Next Occurrence (Tracking) | - | Command Registry | Workspace | `glossary.occurrences.tracking.active` | Yes | Registered | 機能未実装 (no-op) |
| **Glossary** | `glossary.occurrences.entry.open` | 追跡中の語彙を開く | Open Tracked Glossary Entry | - | Command Registry | Workspace | Always | Yes | Registered | 機能未実装 (no-op) |
| **Glossary** | `glossary.occurrences.tracking.close` | 使用箇所の追跡を閉じる | Close Occurrence Tracking | - | Command Registry | Workspace | `glossary.occurrences.tracking.active` | Yes | Registered | 機能未実装 (no-op) |
| **Help** | `workbench.showResumeHub` | 作業再開画面を表示 | Show Resume Hub | - | Main Menu / Command Registry | All | `project.isOpen` | Yes | Registered | #538 にて実装完了 |
| **Help** | `app.about.open` | Pergamum について | About Pergamum | - | Main Menu / Command Registry | All | Always | Yes | Registered | ダイアログ起動 |
| **Recovery** | `recovery.documents.show` | 未保存の編集内容を復元... | Restore Unsaved Documents... | - | Command Registry | Workspace | `recovery.owner` && `recovery.hasRecoverableCandidates` | Yes | Registered | 復元候補存在時のみ表示 |
| **Debug** | `debug.session.injectFailure.*` | [Debug] 自動保存の失敗を注入 | Inject Save Failure (Debug) | - | Command Registry | All | Always | Yes | Registered | デバッグ用 11 種のサブコマンド |
| **Debug** | `debug.session.clearInjection` | [Debug] 自動保存の失敗注入を解除 | Clear Save Failure Injection | - | Command Registry | All | Always | Yes | Registered | デバッグ用 |
| **Utility** | `workbench.utilityWindow.open` | 支援ウィンドウを開く | Open Utility Window | - | Command Registry | All | Always | Yes | Registered | サブウィンドウ用 |
| **Utility** | `workbench.utilityWindow.close` | 支援ウィンドウを閉じる | Close Utility Window | - | Command Registry | All | Always | Yes | Registered | サブウィンドウ用 |
| **Utility** | `workbench.utilityWindow.toggle` | 支援ウィンドウを切り替え | Toggle Utility Window | - | Command Registry | All | Always | Yes | Registered | サブウィンドウ用 |
| **Context Menu** | - | 名前を変更... | Rename... | `F2` | File Explorer Context Menu | File Explorer | Active item selected | No | Excluded by Design | ファイル名変更 |
| **Context Menu** | - | 新規 Markdown ファイルを作成 | Create New Markdown File | - | File Explorer Context Menu | File Explorer | Project open | No | Excluded by Design |  |
| **Context Menu** | - | 新規フォルダを作成 | Create New Folder | - | File Explorer Context Menu | File Explorer | Project open | No | Excluded by Design |  |
| **Context Menu** | - | エクスポート... | Export... | - | File Explorer Context Menu | File Explorer | Project open | No | Excluded by Design |  |

---

## 3. 分析・発見事項 (Findings)

### 3.1 コマンドパレット収録候補 (Command Palette Missing Candidates)

以下のコマンドおよび機能は、現在ユーザーが利用可能（ショートカットやツールバーで提供）ですが、Command Registry にコマンドとして登録されていないか、`palette: { visible: false }` と指定されており、コマンドパレットから直接検索・実行できません。

1. **`search.project.openFromSelection` (`Mod+Shift+F`) / `search.project.replace.openFromSelection` (`Mod+Shift+H`)**
   - 選択領域の文字列をシードにしてプロジェクト検索/置換を開くコマンド。ショートカット経由のみで実行可能であり、パレットには収録されていません。
2. **`glossary.openFromEditorSelection` (`Mod+G`)**
   - 選択範囲から語彙を作成/編集するコマンド。キーバインド専用として実装されているため、パレット非表示となっています。
3. **エディタ整形・挿入コマンド (`Mod+B`, `Mod+I`, `Mod+Shift+X`, `Mod+L`, `Mod+K`, `Mod+Shift+L`, `Mod+Shift+B`, `Mod+R`, `Mod+.`, `Mod+]`, `Mod+[`)**
   - 太字・斜体・打消線・見出し・リンク・水平線・コードブロック・ルビ・圏点・インデント・アウトデントなどの各種フォーマット操作は CodeMirror keymap およびツールバー直接操作のみで完結しており、コマンドパレットから検索して呼び出すことができません。
4. **`togglePreview` (`Mod+Shift+P`)**
   - プレビュー画面の開閉表示切り替え操作。ツールバーボタンおよびグローバルショートカットで提供されていますが、コマンドパレットには収録されていません。

### 3.2 コマンドパレット非表示推奨 (Should Not Show in Command Palette)

以下のコマンドは Command Registry に登録されていますが、引数が必須であるか、またはパレット以外からのコンテキスト依存呼び出しを前提としており、通常モードのコマンドパレット（`>` 検索）からは非表示（`palette: { visible: false }`）に維持すべき項目です。

1. **`editor.line.goTo` (`Mod+:`)**
   - 目的の行番号（数値引数）が必要なため、通常のコマンド一覧には表示せず、Quick Access `:` モードからのみ動的に呼び出されます。
2. **`glossary.entry.open` / `glossary.openCreateEntryPane` / `glossary.openEditEntryPane`**
   - `entryId` や内部生成オプションを必要とするため、UI からのプログラマティックな呼び出し専用です。
3. **`import.text.bulk.openDialog`**
   - メニュー経由のテキスト一括インポートダイアログ起動専用処理です。

### 3.3 ラベル調整・ガード強化が必要な項目 (Needs Label / Needs Guard)

1. **未実装の語彙追跡コマンド群**
   - `glossary.occurrences.previous`, `glossary.occurrences.next`, `glossary.occurrences.entry.open`, `glossary.occurrences.tracking.close` はコマンドパレットに表示されますが、説明文が「（未実装です）」となっており、実行しても no-op となります。将来の実装またはパレットからの一時的除外が検討されます。
2. **Debug セッション失敗注入コマンド群**
   - `debug.session.injectFailure.*` などの 11 件のデバッグコマンドはコマンドパレットに表示されます。開発者向けとしては有用ですが、通常ユーザー向けビルドでの可視性制御（フラグガード）の検討が推奨されます。

### 3.4 曖昧な定義・重複・競合 (Ambiguous Items / Conflicts / Duplicates)

1. **`Mod+O` の二重定義役割**
   - `Mod+O` はプロジェクトファイルクイックオープン（`projectFileQuickOpen`）のグローバルショートカットとして利用されており、通常の Markdown ファイルを開く `editor.document.markdown.open`（Electron メニュー）からはショートカットアクセラレータが解除されています。
2. **`Mod+Shift+P` と `Mod+P` の整理**
   - `Mod+P` が Pergamum の標準コマンドパレット起動、`Mod+Shift+P` がプレビュー表示切り替え（Toggle Preview）に割り当てられています（VSCode との意図的な相違点）。
3. **隠しアクセラレータ (Hidden Accelerators)**
   - Electron の仕様上、単一メニューアイテムに登録できるアクセラレータは 1 つのため、`F1` (Command Palette), `F12` (Save As), `Mod+Plus` (Zoom In), `Mod+,` (Application Settings) は非表示の隠しメニューアイテム（`visible: false`, `acceleratorWorksWhenHidden: true`）として登録・維持されています。

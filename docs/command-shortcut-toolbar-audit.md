# Command / Shortcut / Toolbar Audit Document

Issue: #587 (Slice 1 Audit Foundation)  
Date: 2026-09-26  
Branch: `feature/587-command-shortcut-toolbar-cleanup`

---

## 1. Overview & Audit Goals

This document consolidates the audit results for Pergamum's primary commands, menu items, keyboard shortcuts, and toolbar actions. The objective is to establish a unified routing foundation so that for any given operation, triggering it via Application Menu, Keyboard Shortcut, Toolbar, or Command Palette invokes the exact same command handler.

Existing command IDs defined in `src/shared/commandIds.ts` serve as the single source of truth for command identifiers across Main and Renderer processes.

---

## 2. Command / Shortcut / Toolbar Audit Matrix

| Command | Shortcut | Menu Location | Toolbar Button | Current Handler | Current Status | Identified Gap | Target Slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Save** | `Ctrl+S` | File > Save (`menu.save`) | N/A (Menu/Sidebar) | `App.tsx` `saveFile()` | Implemented | Clean | Slice 5 |
| **Save All** | `Alt+Ctrl+S` | File > Save All (`menu.saveAll`) | N/A | `App.tsx` `saveAllDocumentsCommandRef` | Implemented | Clean (Must keep `Alt+Ctrl+S`, not `Alt+Shift+S`) | Slice 5 |
| **Save As** | `Ctrl+Shift+S` | File > Save As... (`menu.saveAs`) | N/A | `App.tsx` `saveFile({ forceSaveAs: true })` | Implemented | Missing `F12` shortcut alias for Markdown/Text tabs | Slice 5 |
| **New File** | `Ctrl+N` | Missing in File Menu | File Explorer Toolbar (`+file` icon) | `FileExplorer.tsx` `openCreateDialog("file")` | Missing Command & Shortcut | `Ctrl+N` shortcut missing; Menu item missing; Extension dropdown (`.md`/`.txt`) missing | Slice 2 |
| **App Settings** | `Ctrl+,` | macOS App Menu / Edit Menu | Sidebar / Footer Gear Icon | `App.tsx` `setActiveSpecialTabId("settings")` | Implemented | Audit complete in Slice 1 | Slice 1 |
| **Insert Image** | `Ctrl+Shift+I` | Format > Insert Image | Editor Toolbar Image Icon | `editorMarkdownToolbarShortcuts.ts` / `MarkdownEditorSurface.tsx` | Implemented | Verify toolbar & shortcut handler unification in Slice 4 | Slice 4 |
| **Rename** | `F2` | File Explorer Context Menu ("リネーム") | File Explorer Toolbar Rename Icon | `FileExplorer.tsx` (explorer focus) / `DocumentTabBar.tsx` (tab focus) | Partial | `F2` is ignored when focus is inside CodeMirror editor body | Slice 3 |
| **Fullscreen** | `F11` | View > Toggle Full Screen (`menu.toggleFullScreen`) | Reserved slot in `EditorToolbar.tsx` | Main process native `role: "togglefullscreen"` | Partial | Missing renderer-side command ID and Toolbar button on `EditorToolbar.tsx` | Slice 4 |

---

## 3. Detailed Command Breakdown & Handoff Notes

### 3.1 Save / Save All / Save 
- **Save (`Ctrl+S`)**:
  - Command ID: `editorCommandIds.saveDocument` (`"editor.document.save"`)
  - Accelerator: `CommandOrControl+S` in `src/main/menu.ts` File menu definition.
  - Renderer Handler: `saveFile()` in `App.tsx`.
  - Target Surfaces: Active Markdown, Text, and Glossary Description tabs (when dirty or force-saved).
  - Behavioral Guards: Skipped on read-only project mode, special tabs, or during lifecycle commit barriers.
- **Save All (`Alt+Ctrl+S`)**:
  - Command ID: `editorCommandIds.saveAll` (`"editor.saveAll"`)
  - Accelerator: `CommandOrControl+Alt+S` in `src/main/menu.ts` File menu definition.
  - **Constraint**: Must strictly remain `Alt+Ctrl+S` (`CommandOrControl+Alt+S`). Must NOT be changed to `Alt+Shift+S`.
  - Renderer Handler: `saveAllDocumentsCommandRef` in `App.tsx`, which iterates over `openDocumentsState.documents` filtering dirty editors and calling `saveFile({ editorId })`.
  - Target Surfaces: All dirty open tabs (Markdown, Text, Glossary Description).
- **Save As (`Ctrl+Shift+S`)**:
  - Command ID: `editorCommandIds.saveAs` (`"editor.saveAs"`)
  - Accelerator: `CommandOrControl+Shift+S` in `src/main/menu.ts` File menu definition.
  - Renderer Handler: `handleSaveAs` -> `saveFile({ forceSaveAs: true })` in `App.tsx`.
  - Target Surfaces: File-backed Markdown and Text documents (`activeMarkdownDocument`). Non-file-backed tabs or Glossary Description tabs show warning dialog or return false.
  - **Slice 5 Handoff**: Add `F12` shortcut key binding as an alias for `Save As` on active Markdown/Text document tabs.

### 3.2 New File (`Ctrl+N`)
- **Current State**:
  - `Ctrl+N` is currently unbound in both Main menu and Renderer.
  - File menu currently lacks a "New File" menu item (only has "New Project" and "Open File").
  - File creation is currently triggered via FileExplorer's toolbar `+file` button, context menu, or empty workspace state button.
- **Slice 2 Handoff**:
  - Define/wire New File command (e.g. `editorCommandIds.newFile` or `workspaceCommandIds.newFile`).
  - Add File menu item `New File` with accelerator `CommandOrControl+N`.
  - Wire `Ctrl+N` to open the File Explorer creation dialog (or default new file prompt targeting the current active folder / project root).
  - Add extension selection dropdown (`.md` / `.txt`) in the file creation dialog based on `effectiveSettings.textFiles.enablePlainTextDocuments`.

### 3.3 Application Settings (`Ctrl+,`)
- **Current State**:
  - Command ID: `workspaceCommandIds.openApplicationSettings` (`"workspace.applicationSettings.open"`).
  - Accelerator: `Ctrl+,` / `CommandOrControl+,`.
  - Menu & UI: Accessible via macOS application menu, settings gear icons, and Command Palette.
  - Renderer Handler: Sets `activeSpecialTabId` to `"settings"`.
  - Audit complete in Slice 1.

### 3.4 Insert Image (`Ctrl+Shift+I`)
- **Current Observed Surfaces**:
  - Markdown document tabs.
- **Needs Verification in Slice 4**:
  - Whether the toolbar button (`EditorToolbar.tsx`) and `Ctrl+Shift+I` (`editorMarkdownToolbarShortcuts.ts`) share the exact same insertion route handler.
  - Whether Glossary Description tabs should share the same image insertion behavior.
- **Non-goals**:
  - Do not accidentally enable Markdown-only image insertion for plain Text tabs.

### 3.5 Rename / F2
- **Current State**:
  - FileExplorer focus: `FileExplorer.tsx` explorer keydown handler captures `F2` to trigger file/folder rename dialog for selected entry.
  - Tab header focus: `DocumentTabBar.tsx` tab keydown handler captures `F2` on tab headers to trigger active document rename.
  - Editor body focus: `F2` is currently unhandled / ignored when focus is inside the CodeMirror editor body.
  - Supported Surfaces: File-backed Markdown & Text documents, project folders, local image assets. Unsupported on Glossary Description tabs and special tabs.
- **Slice 3 Handoff**:
  - Wire `F2` keypress when focus is in editor body to trigger active file-backed document rename dialog (`handleRenameActiveDocument`).

### 3.6 Fullscreen / F11
- **Current State**:
  - Main Process: `roleItem("togglefullscreen", language, "menu.toggleFullScreen")` in `src/main/menu.ts`.
  - Accelerator: Native Electron `F11` (Windows/Linux) and `Ctrl+Cmd+F` (macOS).
  - Renderer Toolbar: Reserved comment present in `EditorToolbar.tsx` (`/* Right-end separator — reserved for a future fullscreen mode command. */`), but no button rendered.
  - Renderer Command: No Command ID currently registered in `src/shared/commandIds.ts`.
- **Slice 4 Handoff**:
  - Add command ID for Fullscreen toggle.
  - Add Fullscreen button to `EditorToolbar.tsx`.
  - Connect `F11` shortcut and toolbar button to the same Fullscreen toggle command handler via IPC.
  - **Native Electron Role Note**: For native Electron roles such as fullscreen toggle, the menu entry may remain a native role while renderer toolbar actions use IPC. The important invariant is that both routes produce the same BrowserWindow fullscreen toggle behavior.

---

## 4. Architectural Rules & Principles

1. **Single Command Routing**:
   Menu items, keyboard shortcuts, toolbar buttons, and Command Palette entries MUST execute the same command handler for the same operation.
   *Note for native Electron roles*: For native Electron roles such as fullscreen toggle, the menu entry may remain a native role while renderer toolbar actions use IPC. The important invariant is that both routes produce the same BrowserWindow fullscreen toggle behavior.
2. **Preserve Save & Recovery Invariants**:
   Never alter save semantics (atomic save, dirty working copy state model, project write lock, recovery system) during shortcut/toolbar cleanup.
3. **Save All Accelerator Integrity**:
   Save All shortcut MUST be `Alt+Ctrl+S` (`CommandOrControl+Alt+S`). Do not change to `Alt+Shift+S`.
4. **Scope Boundaries**:
   Project-wide Search / Replace is out of scope and untouched.

---

## 5. Verification

- `npm run typecheck`

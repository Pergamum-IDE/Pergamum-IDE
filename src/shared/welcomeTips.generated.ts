// Auto-generated from pergamum_welcome_tips.ja_en.json

export interface WelcomeTipTextContent {
  readonly title: string;
  readonly body: string;
}

export interface WelcomeTipLinkContent {
  readonly url: string;
  readonly label: {
    readonly ja: string;
    readonly en: string;
  };
}

export interface WelcomeTip {
  readonly id: string;
  readonly enabled: boolean;
  readonly category: string;
  readonly categoryKey: string;
  readonly weight: number;
  readonly icon: string;
  readonly iconPath: string;
  readonly text: {
    readonly ja: WelcomeTipTextContent;
    readonly en: WelcomeTipTextContent;
  };
  readonly link: WelcomeTipLinkContent | null;
  readonly notes?: string;
}

export interface WelcomeTipsData {
  readonly schemaVersion: number;
  readonly source: string;
  readonly modKeyPolicy: {
    readonly token: string;
    readonly windowsLinux: string;
    readonly macOS: string;
  };
  readonly iconPaths: Record<string, string>;
  readonly tips: readonly WelcomeTip[];
}

export const welcomeTipsData: WelcomeTipsData = {
  "schemaVersion": 1,
  "source": "pergamum_welcome_tips_filled_ja.xlsx",
  "modKeyPolicy": {
    "token": "Mod",
    "windowsLinux": "Ctrl",
    "macOS": "Command"
  },
  "iconPaths": {
    "project": "assets/icons/codicons/tips/project.svg",
    "file": "assets/icons/codicons/tips/file.svg",
    "command": "assets/icons/codicons/tips/terminal.svg",
    "editor": "assets/icons/codicons/tips/edit-sparkle.svg",
    "view": "assets/icons/codicons/tips/layout-sidebar-left-off.svg",
    "search": "assets/icons/codicons/tips/search.svg",
    "glossary": "assets/icons/codicons/tips/book.svg",
    "export": "assets/icons/codicons/tips/export.svg",
    "recovery": "assets/icons/svgrepo/tips/recovery.svg",
    "help": "assets/icons/codicons/tips/question.svg",
    "external": "assets/icons/codicons/tips/open-in-window.svg"
  },
  "tips": [
    {
      "id": "welcome.close-project-detaches",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 100,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "閉じるは削除ではありません",
          "body": "「プロジェクトを閉じる」は Pergamum から一時的に外す操作です。本文ファイルやプロジェクトフォルダを削除する操作ではありません。"
        },
        "en": {
          "title": "Close does not delete",
          "body": "“Close Project” only detaches the project from Pergamum for now. It does not delete your manuscript files or the project folder."
        }
      },
      "link": null,
      "notes": "Close Project = detach"
    },
    {
      "id": "welcome.project.create-open",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 100,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "まずはプロジェクトから",
          "body": "Pergamum の作業はプロジェクト単位です。新しく始めるときは「プロジェクトを作成」、続きからなら {key:Mod+Shift+O} で開けます。"
        },
        "en": {
          "title": "Start with a project",
          "body": "Pergamum work is organized by project. Create a new project when starting fresh, or open an existing one with {key:Mod+Shift+O}."
        }
      },
      "link": null,
      "notes": "workspace.project.create / workspace.project.open"
    },
    {
      "id": "welcome.markdown-source-of-truth",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 98,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "本文は Markdown が正本です",
          "body": "Pergamum の本文は Markdown ファイルが正本です。外部エディタで開いても読みやすく、プロジェクト内にそのまま残ります。"
        },
        "en": {
          "title": "Markdown is the source of truth",
          "body": "Pergamum stores manuscript text as Markdown files. They stay readable in external editors and remain directly inside the project."
        }
      },
      "link": null,
      "notes": "project principle"
    },
    {
      "id": "welcome.save-current",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 95,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "保存はこまめに",
          "body": "現在の文書は {kb:editor.document.save} で保存できます。保存できる変更があるときだけ有効になります。"
        },
        "en": {
          "title": "Save often",
          "body": "Save the current document with {kb:editor.document.save}. It is enabled only when there are changes that can be saved."
        }
      },
      "link": null
    },
    {
      "id": "welcome.new-file",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 92,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "新しい本文ファイル",
          "body": "新しいファイルは {kb:editor.file.new} で作成できます。小さく章や断片を分けておくと、あとで並べ替えや検索が楽になります。"
        },
        "en": {
          "title": "Create a new manuscript file",
          "body": "Create a new file with {kb:editor.file.new}. Splitting chapters or fragments into smaller files makes rearranging and searching easier later."
        }
      },
      "link": null
    },
    {
      "id": "welcome.save-all",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 88,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "まとめて保存",
          "body": "複数のタブを編集しているときは {kb:editor.saveAll} でまとめて保存できます。"
        },
        "en": {
          "title": "Save everything",
          "body": "When you have edited multiple tabs, use {kb:editor.saveAll} to save them together."
        }
      },
      "link": null,
      "notes": "Mod+Alt+S"
    },
    {
      "id": "welcome.save-as",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 75,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "名前を付けて保存",
          "body": "Markdown 文書は {kb:editor.saveAs} で別名保存できます。メニューの隠しアクセラレータとして {key:F12} も使えます。"
        },
        "en": {
          "title": "Save as",
          "body": "Markdown documents can be saved under another name with {kb:editor.saveAs}. The hidden menu accelerator {key:F12} is also available."
        }
      },
      "link": null
    },
    {
      "id": "welcome.settings-open",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 74,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "設定を開く",
          "body": "アプリケーション設定は {kb:workspace.applicationSettings.open} または {key:Mod+,} から開けます。プロジェクト固有の設定は「プロジェクト設定」から確認できます。"
        },
        "en": {
          "title": "Open settings",
          "body": "Open application settings with {kb:workspace.applicationSettings.open} or {key:Mod+,}. Project-specific settings can be checked from Project Settings."
        }
      },
      "link": null
    },
    {
      "id": "welcome.export-from-file-explorer",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 64,
      "icon": "export",
      "iconPath": "assets/icons/codicons/tips/export.svg",
      "text": {
        "ja": {
          "title": "エクスポートは右クリックから",
          "body": "本文のエクスポートは File Explorer の右クリックメニューから始められます。出力対象や順序を確認してから実行できます。"
        },
        "en": {
          "title": "Export from the context menu",
          "body": "Start manuscript export from the File Explorer context menu. You can confirm the output targets and order before running the export."
        }
      },
      "link": null,
      "notes": "file explorer context menu"
    },
    {
      "id": "welcome.html-export-images",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 57,
      "icon": "export",
      "iconPath": "assets/icons/codicons/tips/export.svg",
      "text": {
        "ja": {
          "title": "HTML エクスポートと画像",
          "body": "HTML エクスポートでは、プロジェクト内の画像だけが対象になります。外部フォルダの画像は必要に応じてプロジェクト内へ移してください。"
        },
        "en": {
          "title": "HTML export and images",
          "body": "HTML export includes only images inside the project. Move images into the project when you want export behavior to stay predictable."
        }
      },
      "link": null,
      "notes": "export asset policy"
    },
    {
      "id": "welcome.bold-italic-strike",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 88,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "基本の文字装飾",
          "body": "太字は {kb:editor.markdown.bold}、斜体は {kb:editor.markdown.italic}、打ち消し線は {kb:editor.markdown.strikethrough} で挿入できます。"
        },
        "en": {
          "title": "Basic text formatting",
          "body": "Insert bold with {kb:editor.markdown.bold}, italic with {kb:editor.markdown.italic}, and strikethrough with {kb:editor.markdown.strikethrough}."
        }
      },
      "link": null
    },
    {
      "id": "welcome.heading",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 86,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "見出しを使う",
          "body": "見出しは {kb:editor.markdown.heading} から挿入できます。章や節に見出しを付けると、見出しジャンプや文書マップが使いやすくなります。"
        },
        "en": {
          "title": "Use headings",
          "body": "Insert headings with {kb:editor.markdown.heading}. Adding headings to chapters and sections makes heading jump and the document map more useful."
        }
      },
      "link": null
    },
    {
      "id": "welcome.ruby",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 84,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "ルビを振る",
          "body": "ルビを振りたいテキストを選択して {kb:editor.markdown.insertRuby} を実行すると、ルビ挿入ダイアログを開けます。"
        },
        "en": {
          "title": "Add ruby text",
          "body": "Select the text you want to annotate, then run {kb:editor.markdown.insertRuby} to open the ruby insertion dialog."
        }
      },
      "link": null,
      "notes": "user-entered intent preserved"
    },
    {
      "id": "welcome.emphasis",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 83,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "傍点を振る",
          "body": "傍点を振りたいテキストを選択して {kb:editor.markdown.insertEmphasisMark} を実行すると、傍点挿入ダイアログを開けます。"
        },
        "en": {
          "title": "Add emphasis marks",
          "body": "Select the text you want to emphasize, then run {kb:editor.markdown.insertEmphasisMark} to open the emphasis mark dialog."
        }
      },
      "link": null,
      "notes": "user-entered intent preserved; fixed {Key:...}"
    },
    {
      "id": "welcome.callout",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 82,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "コールアウトを使う",
          "body": "コールアウトは Markdown 方言のひとつです。Pergamum では見やすく表示できますが、他の処理系ではそのまま表示されない場合があります。"
        },
        "en": {
          "title": "Use callouts",
          "body": "Callouts are a Markdown dialect. Pergamum can display them clearly, but other Markdown processors may not render them the same way."
        }
      },
      "link": null,
      "notes": "user-entered intent preserved"
    },
    {
      "id": "welcome.indent-outdent",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 80,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "インデントとアウトデント",
          "body": "インデントは {kb:editor.indent}、アウトデントは {kb:editor.outdent} で実行できます。リストやテキストの階層を整えるときに使います。"
        },
        "en": {
          "title": "Indent and outdent",
          "body": "Run {kb:editor.indent} to indent and {kb:editor.outdent} to outdent. Use them when arranging list or text hierarchy."
        }
      },
      "link": null
    },
    {
      "id": "welcome.image-insert",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 78,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "画像を挿入",
          "body": "画像は {kb:editor.image.insert} で挿入できます。エクスポート時の扱いを安定させるため、画像はプロジェクト内に置くのがおすすめです。"
        },
        "en": {
          "title": "Insert images",
          "body": "Insert images with {kb:editor.image.insert}. For stable export behavior, keep images inside the project."
        }
      },
      "link": null
    },
    {
      "id": "welcome.blockquote",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 72,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "引用ブロックを挿入",
          "body": "引用や作中資料を分けたいときは {kb:editor.markdown.insertBlockquote} で引用ブロックを挿入できます。"
        },
        "en": {
          "title": "Insert a blockquote",
          "body": "Use {kb:editor.markdown.insertBlockquote} to insert a blockquote when you want to separate quoted text or in-story documents."
        }
      },
      "link": null
    },
    {
      "id": "welcome.link",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 70,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "リンクを挿入",
          "body": "リンクは {kb:editor.markdown.link} から挿入できます。外部資料へのリンクは、本文に必要な範囲だけ置くのがおすすめです。"
        },
        "en": {
          "title": "Insert links",
          "body": "Insert links with {kb:editor.markdown.link}. For external references, include only the links that are useful to the manuscript."
        }
      },
      "link": null
    },
    {
      "id": "welcome.table",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 68,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "表を挿入",
          "body": "表は {kb:editor.markdown.insertTable} から挿入できます。行数はヘッダ行を除いた「本体行」として指定します。"
        },
        "en": {
          "title": "Insert tables",
          "body": "Insert tables with {kb:editor.markdown.insertTable}. Row count means body rows, excluding the header row."
        }
      },
      "link": null
    },
    {
      "id": "welcome.tab-capture-escape",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 58,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "Tab から抜ける",
          "body": "Tab をエディタ入力に使う設定でも、{key:Escape→Tab} や {key:Ctrl+M} でフォーカス移動へ戻せます。アクセシビリティ用の脱出手段です。"
        },
        "en": {
          "title": "Escape from Tab capture",
          "body": "Even when Tab is used for editor input, {key:Escape→Tab} or {key:Ctrl+M} returns to focus navigation. This is an accessibility escape hatch."
        }
      },
      "link": null
    },
    {
      "id": "welcome.horizontal-rule",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 55,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "区切り線を入れる",
          "body": "場面の切り替えや区切りを入れたいときは {kb:editor.markdown.insertHorizontalRule} で水平線を挿入できます。"
        },
        "en": {
          "title": "Insert a divider",
          "body": "Use {kb:editor.markdown.insertHorizontalRule} to insert a horizontal rule when you want to mark a scene break or separation."
        }
      },
      "link": null
    },
    {
      "id": "welcome.code-block",
      "enabled": true,
      "category": "Formatting / Insert",
      "categoryKey": "formatting",
      "weight": 50,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "コードブロックを挿入",
          "body": "コードや固定幅で見せたい断片は {kb:editor.markdown.insertCodeBlock} でコードブロックにできます。小説本文では必要な場面だけに使うと読みやすくなります。"
        },
        "en": {
          "title": "Insert a code block",
          "body": "Use {kb:editor.markdown.insertCodeBlock} for code or fragments that should appear in fixed-width text. In prose, use it only where it helps readability."
        }
      },
      "link": null
    },
    {
      "id": "welcome.command-palette",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 100,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "コマンドパレット",
          "body": "操作に迷ったら {kb:workbench.commandPalette.open} でコマンドパレットを開けます。登録済みの操作を名前で検索できます。"
        },
        "en": {
          "title": "Command Palette",
          "body": "When you are not sure where an action is, open the Command Palette with {kb:workbench.commandPalette.open}. You can search registered actions by name."
        }
      },
      "link": null,
      "notes": "Mod+P / F1"
    },
    {
      "id": "welcome.quick-open",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 94,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "ファイルをすばやく開く",
          "body": "プロジェクト内の文書を探すときは {key:Mod+O} を使います。通常の「ファイルを開く」とは別に、プロジェクト内検索に最適化されています。"
        },
        "en": {
          "title": "Open files quickly",
          "body": "Use {key:Mod+O} to find documents inside the project. This is optimized for project file search, separate from the normal file open action."
        }
      },
      "link": null
    },
    {
      "id": "welcome.heading-jump",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 87,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "見出しへジャンプ",
          "body": "Markdown 文書内の見出しへ移動したいときは {key:Mod+#} を使います。章や節を見出しで分けておくと効果的です。"
        },
        "en": {
          "title": "Jump to headings",
          "body": "Use {key:Mod+#} to move to headings in a Markdown document. It works best when chapters and sections are divided with headings."
        }
      },
      "link": null
    },
    {
      "id": "welcome.glossary-jump",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 86,
      "icon": "glossary",
      "iconPath": "assets/icons/codicons/tips/book.svg",
      "text": {
        "ja": {
          "title": "語彙へジャンプ",
          "body": "語彙項目へ移動したいときは {key:Mod+@} を使います。名前や用語を管理しているプロジェクトで便利です。"
        },
        "en": {
          "title": "Jump to glossary entries",
          "body": "Use {key:Mod+@} to move to glossary entries. It is useful in projects that manage character names, places, or special terms."
        }
      },
      "link": null
    },
    {
      "id": "welcome.activity-file-explorer",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 82,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "File Explorer を表示",
          "body": "ファイル一覧は {kb:workspace.files.toggle} で表示を切り替えられます。プロジェクト内の構成を確認したいときに使います。"
        },
        "en": {
          "title": "Show File Explorer",
          "body": "Toggle the file list with {kb:workspace.files.toggle}. Use it when you want to check the project structure."
        }
      },
      "link": null
    },
    {
      "id": "welcome.activity-glossary",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 81,
      "icon": "glossary",
      "iconPath": "assets/icons/codicons/tips/book.svg",
      "text": {
        "ja": {
          "title": "語彙集を表示",
          "body": "語彙集は {kb:workspace.glossary.focus} で表示できます。登場人物や地名、独自用語をまとめる場所です。"
        },
        "en": {
          "title": "Show the glossary",
          "body": "Show the glossary with {kb:workspace.glossary.focus}. It is the place to collect characters, places, and custom terms."
        }
      },
      "link": null
    },
    {
      "id": "welcome.activity-document-map",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 80,
      "icon": "view",
      "iconPath": "assets/icons/codicons/tips/layout-sidebar-left-off.svg",
      "text": {
        "ja": {
          "title": "文書マップを表示",
          "body": "文書マップは {kb:workspace.documentMap.focus} で表示できます。見出しや語彙の出現を俯瞰したいときに便利です。"
        },
        "en": {
          "title": "Show the document map",
          "body": "Show the document map with {kb:workspace.documentMap.focus}. It helps you overview headings and glossary occurrences."
        }
      },
      "link": null
    },
    {
      "id": "welcome.activity-document-metrics",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 79,
      "icon": "view",
      "iconPath": "assets/icons/codicons/tips/layout-sidebar-left-off.svg",
      "text": {
        "ja": {
          "title": "文書統計を表示",
          "body": "文書統計は {kb:workspace.documentMetrics.focus} で表示できます。文字数や構成の確認に使えます。"
        },
        "en": {
          "title": "Show document metrics",
          "body": "Show document metrics with {kb:workspace.documentMetrics.focus}. Use it to check character counts and structure."
        }
      },
      "link": null
    },
    {
      "id": "welcome.command-palette-order",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 78,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "コマンドは分類順に並びます",
          "body": "コマンドパレットを空のまま開くと、File、Edit、Formatting、Navigation などの分類順で表示されます。検索時は一致度が優先されます。"
        },
        "en": {
          "title": "Commands are grouped by category",
          "body": "When opened with an empty query, the Command Palette lists actions by categories such as File, Edit, Formatting, and Navigation. During search, match relevance comes first."
        }
      },
      "link": null,
      "notes": "#617 ordering policy"
    },
    {
      "id": "welcome.go-to-line",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 60,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "行番号へ移動",
          "body": "行番号が分かっているときは {key:Mod+:} で指定行へ移動できます。エラー位置やレビュー指摘を追うときに使えます。"
        },
        "en": {
          "title": "Go to a line number",
          "body": "Use {key:Mod+:} when you know the line number. It is useful for following error locations or review comments."
        }
      },
      "link": null
    },
    {
      "id": "welcome.tab-switching",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 58,
      "icon": "command",
      "iconPath": "assets/icons/codicons/tips/terminal.svg",
      "text": {
        "ja": {
          "title": "タブを行き来する",
          "body": "開いているタブは {key:Alt+Left} / {key:Alt+Right} で前後に移動できます。入力中のテキスト欄では誤動作しないようになっています。"
        },
        "en": {
          "title": "Move between tabs",
          "body": "Use {key:Alt+Left} / {key:Alt+Right} to move between open tabs. It is designed not to interfere while typing in text fields."
        }
      },
      "link": null
    },
    {
      "id": "welcome.active-find",
      "enabled": true,
      "category": "Search",
      "categoryKey": "search",
      "weight": 90,
      "icon": "search",
      "iconPath": "assets/icons/codicons/tips/search.svg",
      "text": {
        "ja": {
          "title": "開いている文書を検索",
          "body": "現在の文書内を探すときは {key:Mod+F} を使います。タブごとに検索語を持てるので、文書を移っても作業を続けやすくなっています。"
        },
        "en": {
          "title": "Search the open document",
          "body": "Use {key:Mod+F} to search within the current document. Each tab can keep its own query, making it easier to continue work after switching documents."
        }
      },
      "link": null
    },
    {
      "id": "welcome.project-search-prefix",
      "enabled": true,
      "category": "Search",
      "categoryKey": "search",
      "weight": 85,
      "icon": "search",
      "iconPath": "assets/icons/codicons/tips/search.svg",
      "text": {
        "ja": {
          "title": "プロジェクト全体を検索",
          "body": "プロジェクト全体を探したいときは {key:Mod+%} で検索モードを開けます。本文を横断して調べたいときに使います。"
        },
        "en": {
          "title": "Search the whole project",
          "body": "Use {key:Mod+%} to open project-wide search. It is useful when you want to search across manuscript files."
        }
      },
      "link": null
    },
    {
      "id": "welcome.active-replace",
      "enabled": true,
      "category": "Search",
      "categoryKey": "search",
      "weight": 76,
      "icon": "search",
      "iconPath": "assets/icons/codicons/tips/search.svg",
      "text": {
        "ja": {
          "title": "開いている文書を置換",
          "body": "現在の文書内で置換したいときは {key:Mod+H} を使います。置換は範囲と対象を確認しながら進めるのがおすすめです。"
        },
        "en": {
          "title": "Replace in the open document",
          "body": "Use {key:Mod+H} to replace text in the current document. Confirm the range and targets as you work."
        }
      },
      "link": null
    },
    {
      "id": "welcome.search-from-selection",
      "enabled": true,
      "category": "Search",
      "categoryKey": "search",
      "weight": 74,
      "icon": "search",
      "iconPath": "assets/icons/codicons/tips/search.svg",
      "text": {
        "ja": {
          "title": "選択範囲から検索",
          "body": "選択した文字列を使ってプロジェクト内検索を始めるには {key:Mod+Shift+F} を使います。似た表記の確認に便利です。"
        },
        "en": {
          "title": "Search from the selection",
          "body": "Use {key:Mod+Shift+F} to start project search with the selected text. It is handy for checking similar spellings or repeated terms."
        }
      },
      "link": null,
      "notes": "search.project.openFromSelection currently not in palette"
    },
    {
      "id": "welcome.replace-from-selection",
      "enabled": true,
      "category": "Search",
      "categoryKey": "search",
      "weight": 62,
      "icon": "search",
      "iconPath": "assets/icons/codicons/tips/search.svg",
      "text": {
        "ja": {
          "title": "選択範囲から置換",
          "body": "選択した文字列を使ってプロジェクト内置換を始めるには {key:Mod+Shift+H} を使います。実行前に対象範囲をよく確認してください。"
        },
        "en": {
          "title": "Replace from the selection",
          "body": "Use {key:Mod+Shift+H} to start project replace with the selected text. Check the target range carefully before applying replacements."
        }
      },
      "link": null,
      "notes": "search.project.replace.openFromSelection currently not in palette"
    },
    {
      "id": "welcome.preview-toggle",
      "enabled": true,
      "category": "View",
      "categoryKey": "view",
      "weight": 88,
      "icon": "view",
      "iconPath": "assets/icons/codicons/tips/layout-sidebar-left-off.svg",
      "text": {
        "ja": {
          "title": "プレビューを切り替える",
          "body": "Markdown の見え方を確認したいときは {kb:editor.preview.toggle} でプレビューを切り替えられます。"
        },
        "en": {
          "title": "Toggle preview",
          "body": "Use {kb:editor.preview.toggle} to toggle the preview when you want to check how Markdown will look."
        }
      },
      "link": null,
      "notes": "correct command id"
    },
    {
      "id": "welcome.syntax-checker",
      "enabled": true,
      "category": "View",
      "categoryKey": "view",
      "weight": 74,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "Markdown 構文チェック",
          "body": "Markdown 構文チェックは {kb:editor.markdown.toggleSyntaxChecker} で切り替えられます。小説本文でノイズになりやすい一部ルールは抑制されています。"
        },
        "en": {
          "title": "Markdown syntax check",
          "body": "Toggle Markdown syntax checking with {kb:editor.markdown.toggleSyntaxChecker}. Some rules that tend to be noisy for prose are suppressed."
        }
      },
      "link": null
    },
    {
      "id": "welcome.zoom",
      "enabled": true,
      "category": "View",
      "categoryKey": "view",
      "weight": 52,
      "icon": "view",
      "iconPath": "assets/icons/codicons/tips/layout-sidebar-left-off.svg",
      "text": {
        "ja": {
          "title": "表示倍率を調整",
          "body": "画面の表示倍率は {kb:app.zoom.in} / {kb:app.zoom.out} で調整できます。戻すときは {kb:app.zoom.reset} を使います。"
        },
        "en": {
          "title": "Adjust zoom",
          "body": "Adjust the display zoom with {kb:app.zoom.in} / {kb:app.zoom.out}. Use {kb:app.zoom.reset} to return to the default size."
        }
      },
      "link": null
    },
    {
      "id": "welcome.paragraph-indent",
      "enabled": true,
      "category": "Assist",
      "categoryKey": "assist",
      "weight": 60,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "段落字下げを整える",
          "body": "段落の字下げは「段落字下げ一括挿入」「段落字下げ一括削除」からまとめて調整できます。"
        },
        "en": {
          "title": "Clean up paragraph indents",
          "body": "Use “Insert Paragraph Indent” or “Remove Paragraph Indent” to adjust paragraph indentation in bulk."
        }
      },
      "link": null,
      "notes": "assist.paragraphIndent.insert/remove"
    },
    {
      "id": "welcome.line-ending-distribution",
      "enabled": true,
      "category": "Assist",
      "categoryKey": "assist",
      "weight": 56,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "改行コード分布を確認",
          "body": "改行コードが混在していないか確認したいときは「改行コード分布を表示」を使えます。外部ツールと併用するときの確認に便利です。"
        },
        "en": {
          "title": "Check line ending distribution",
          "body": "Use “Show Line Ending Distribution” to check whether line endings are mixed. This helps when working with external tools."
        }
      },
      "link": null,
      "notes": "assist.lineEndingDistribution.show"
    },
    {
      "id": "welcome.glossary-slot",
      "enabled": true,
      "category": "Assist",
      "categoryKey": "assist",
      "weight": 45,
      "icon": "external",
      "iconPath": "assets/icons/codicons/tips/open-in-window.svg",
      "text": {
        "ja": {
          "title": "語彙に迷ったら",
          "body": "名前や用語に迷ったら、外部ツールの語彙スロットも使えます。Pergamum のプロジェクトデータは送信しません。"
        },
        "en": {
          "title": "When you are stuck on terms",
          "body": "When you are stuck on names or terms, you can also use the external Vocabulary Slot tool. Pergamum does not send project data to it."
        }
      },
      "link": {
        "label": {
          "ja": "語彙スロットを開く",
          "en": "Open Vocabulary Slot"
        },
        "url": "https://goi-slot.technerd.workers.dev/"
      },
      "notes": "structured external URL; user-provided candidate"
    },
    {
      "id": "welcome.glossary-manage",
      "enabled": true,
      "category": "Glossary",
      "categoryKey": "glossary",
      "weight": 86,
      "icon": "glossary",
      "iconPath": "assets/icons/codicons/tips/book.svg",
      "text": {
        "ja": {
          "title": "語彙集を育てる",
          "body": "登場人物、地名、固有名詞は語彙集に登録できます。あとから表記揺れや出現箇所を確認しやすくなります。"
        },
        "en": {
          "title": "Grow your glossary",
          "body": "Register characters, places, and proper nouns in the glossary. It makes spelling variations and occurrences easier to check later."
        }
      },
      "link": null
    },
    {
      "id": "welcome.glossary-from-selection",
      "enabled": true,
      "category": "Glossary",
      "categoryKey": "glossary",
      "weight": 80,
      "icon": "glossary",
      "iconPath": "assets/icons/codicons/tips/book.svg",
      "text": {
        "ja": {
          "title": "選択範囲から語彙を開く",
          "body": "本文中の語句を選択して {kb:glossary.openFromEditorSelection} を実行すると、その語句を語彙候補として開けます。"
        },
        "en": {
          "title": "Open a glossary entry from the selection",
          "body": "Select a term in the manuscript and run {kb:glossary.openFromEditorSelection} to open that term as a glossary candidate."
        }
      },
      "link": null
    },
    {
      "id": "welcome.glossary-tags",
      "enabled": true,
      "category": "Glossary",
      "categoryKey": "glossary",
      "weight": 66,
      "icon": "glossary",
      "iconPath": "assets/icons/codicons/tips/book.svg",
      "text": {
        "ja": {
          "title": "語彙にタグを付ける",
          "body": "語彙タグを使うと、人物、地名、組織、道具などを分けて整理できます。タグ管理はコマンドパレットからも開けます。"
        },
        "en": {
          "title": "Tag glossary entries",
          "body": "Glossary tags help you organize people, places, organizations, tools, and other groups. Tag management can also be opened from the Command Palette."
        }
      },
      "link": null,
      "notes": "glossary.tag.manage"
    },
    {
      "id": "welcome.glossary-search-settings",
      "enabled": true,
      "category": "Glossary",
      "categoryKey": "glossary",
      "weight": 62,
      "icon": "glossary",
      "iconPath": "assets/icons/codicons/tips/book.svg",
      "text": {
        "ja": {
          "title": "語彙検索のされかた",
          "body": "語彙の「機械検索設定」で、語彙検索のされかたを調整できます。名前のゆらぎや表記違いを扱うときに役立ちます。"
        },
        "en": {
          "title": "How glossary search works",
          "body": "Use glossary machine-search settings to adjust how glossary search behaves. This helps with name variants and spelling differences."
        }
      },
      "link": null,
      "notes": "user-entered intent preserved"
    },
    {
      "id": "welcome.recovery",
      "enabled": true,
      "category": "Recovery",
      "categoryKey": "recovery",
      "weight": 90,
      "icon": "recovery",
      "iconPath": "assets/icons/svgrepo/tips/recovery.svg",
      "text": {
        "ja": {
          "title": "未保存の編集を復元",
          "body": "復元候補があるときは「未保存の編集内容を復元...」から確認できます。アプリケーションが突然終了したあとでも、まずは復元候補を見てください。"
        },
        "en": {
          "title": "Restore unsaved edits",
          "body": "When recoverable edits exist, check “Restore Unsaved Documents...”. After an unexpected exit, start by looking at recovery candidates."
        }
      },
      "link": null,
      "notes": "recovery.documents.show"
    },
    {
      "id": "welcome.resume-hub",
      "enabled": true,
      "category": "Help",
      "categoryKey": "help",
      "weight": 70,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "作業再開画面",
          "body": "プロジェクトを開いたあと、作業再開画面から前回の続きに戻れます。途中だった文書や確認項目を探す手間を減らせます。"
        },
        "en": {
          "title": "Resume hub",
          "body": "After opening a project, the resume hub helps you return to where you left off. It reduces the effort of finding unfinished documents or checks."
        }
      },
      "link": null,
      "notes": "workbench.showResumeHub"
    },
    {
      "id": "welcome.next-tip-cycle",
      "enabled": true,
      "category": "Help",
      "categoryKey": "help",
      "weight": 50,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "Next Tips で次へ送る",
          "body": "Next Tips は有効な Tips を順番に進め、最後の次は先頭へ戻ります。最初に表示する Tips はランダムに選べます。"
        },
        "en": {
          "title": "Move on with Next Tips",
          "body": "Next Tips advances through enabled tips and wraps from the last tip back to the first. The first displayed tip can be chosen at random."
        }
      },
      "link": null,
      "notes": "ring behavior"
    },
    {
      "id": "welcome.about",
      "enabled": true,
      "category": "Help",
      "categoryKey": "help",
      "weight": 40,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "Pergamum について",
          "body": "バージョンやライセンス情報を確認したいときは「Pergamum について」を開いてください。サードパーティ表記もここから確認できます。"
        },
        "en": {
          "title": "About Pergamum",
          "body": "Open “About Pergamum” to check version and license information. Third-party notices can also be checked there."
        }
      },
      "link": null
    },
    {
      "id": "welcome.import",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 100,
      "icon": "file",
      "iconPath": "assets/icons/codicons/tips/file.svg",
      "text": {
        "ja": {
          "title": "テキストファイルのインポート",
          "body": "既存テキストファイルをインポートできます。文字コードを確認しながら取り込めます。"
        },
        "en": {
          "title": "Import text files",
          "body": "You can import existing text files while checking their character encoding."
        }
      },
      "link": null
    },
    {
      "id": "welcome.settings",
      "enabled": true,
      "category": "File",
      "categoryKey": "file",
      "weight": 100,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "各種設定について",
          "body": "設定値は、プロジェクト設定、アプリケーション設定、既定値の順に参照されます。"
        },
        "en": {
          "title": "About settings",
          "body": "Settings are resolved in this order: project settings, application settings, then defaults."
        }
      },
      "link": null
    },
    {
      "id": "welcome.pergamum",
      "enabled": true,
      "category": "Help",
      "categoryKey": "help",
      "weight": 40,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "Pergamum とは",
          "body": "ギリシャ時代に大図書館を擁したトルコ西部の都市の名前が由来です。"
        },
        "en": {
          "title": "What is Pergamum?",
          "body": "The name comes from a city in western Turkey that had a great library in the Greek era."
        }
      },
      "link": null
    },
    {
      "id": "welcome.pergamum-pronunciation",
      "enabled": true,
      "category": "Help",
      "categoryKey": "help",
      "weight": 40,
      "icon": "help",
      "iconPath": "assets/icons/codicons/tips/question.svg",
      "text": {
        "ja": {
          "title": "Pergamum の読み方",
          "body": "ペルガモンと発音します。"
        },
        "en": {
          "title": "How to pronounce Pergamum",
          "body": "It is pronounced “Pergamon” in Japanese."
        }
      },
      "link": null
    },
    {
      "id": "welcome.document-map-export",
      "enabled": true,
      "category": "Navigation",
      "categoryKey": "navigation",
      "weight": 85,
      "icon": "export",
      "iconPath": "assets/icons/codicons/tips/export.svg",
      "text": {
        "ja": {
          "title": "文書マップをエクスポート",
          "body": "文書マップは透過PNG画像としてエクスポートできます。"
        },
        "en": {
          "title": "Export the document map",
          "body": "The document map can be exported as a transparent PNG image."
        }
      },
      "link": null
    },
    {
      "id": "welcome.glossary-description",
      "enabled": true,
      "category": "Glossary",
      "categoryKey": "glossary",
      "weight": 100,
      "icon": "glossary",
      "iconPath": "assets/icons/codicons/tips/book.svg",
      "text": {
        "ja": {
          "title": "語彙ごとの説明文",
          "body": "語彙ごとに、資料や関係性のメモをMarkdown形式で書き残せます。"
        },
        "en": {
          "title": "Descriptions for each glossary entry",
          "body": "You can write notes about sources, relationships, and other details for each glossary entry in Markdown."
        }
      },
      "link": null
    },
    {
      "id": "welcome.mermaid",
      "enabled": true,
      "category": "View",
      "categoryKey": "view",
      "weight": 99,
      "icon": "view",
      "iconPath": "assets/icons/codicons/tips/layout-sidebar-left-off.svg",
      "text": {
        "ja": {
          "title": "Mermaid記法",
          "body": "PergamumのMarkdownプレビューは、Mermaid記法による図表表示に対応しています。"
        },
        "en": {
          "title": "Mermaid notation",
          "body": "Pergamum’s Markdown preview supports diagrams written in Mermaid notation."
        }
      },
      "link": null
    },
    {
      "id": "welcome.katex",
      "enabled": true,
      "category": "View",
      "categoryKey": "view",
      "weight": 98,
      "icon": "view",
      "iconPath": "assets/icons/codicons/tips/layout-sidebar-left-off.svg",
      "text": {
        "ja": {
          "title": "KaTeX記法",
          "body": "PergamumのMarkdownプレビューは、KaTeX記法による数式表示に対応しています。"
        },
        "en": {
          "title": "KaTeX notation",
          "body": "Pergamum’s Markdown preview supports mathematical formulas written in KaTeX notation."
        }
      },
      "link": null
    }
  ]
} as const;

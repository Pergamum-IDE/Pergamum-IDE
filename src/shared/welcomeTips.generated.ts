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
  readonly iconPaths: Record<string, string>;
  readonly tips: readonly WelcomeTip[];
}

export const welcomeTipsData: WelcomeTipsData = {
  "schemaVersion": 1,
  "source": "pergamum_welcome_tips_filled_ja.xlsx",
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
          "body": "Pergamum の作業はプロジェクト単位です。新しく始めるときは「プロジェクトを作成」、続きから始めるなら「プロジェクトを開く」から選択できます。"
        },
        "en": {
          "title": "Start with a project",
          "body": "Pergamum work is organized by project. Create a new project when starting fresh, or select “Open Project” to continue existing work."
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
          "body": "現在の文書をこまめに保存しながら執筆を進められます。保存できる変更があるときだけ実行できます。"
        },
        "en": {
          "title": "Save often",
          "body": "You can save the current document as you write. The save action is enabled only when there are unsaved changes."
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
          "body": "新しい本文ファイルを追加して執筆を進められます。小さく章や断片を分けておくと、あとで並べ替えや検索が楽になります。"
        },
        "en": {
          "title": "Create a new manuscript file",
          "body": "You can add new manuscript files to organize your work. Splitting chapters or fragments into smaller files makes rearranging and searching easier later."
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
          "body": "複数のタブを並行して編集しているときは、未保存の文書をまとめて保存できます。"
        },
        "en": {
          "title": "Save everything",
          "body": "When you are editing across multiple tabs, you can save all modified documents together."
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
          "body": "Markdown 文書は別の名前で保存できます。下書きを分岐したいときや、別ファイルとして残したいときに利用できます。"
        },
        "en": {
          "title": "Save as",
          "body": "Markdown documents can be saved under a different name. Use this when you want to branch drafts or keep a separate file."
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
          "body": "アプリケーション設定はメニューやコマンドパレットからいつでも開けます。プロジェクト固有の設定は「プロジェクト設定」から確認できます。"
        },
        "en": {
          "title": "Open settings",
          "body": "You can open Application Settings from the menu or Command Palette. Project-specific settings can be checked from Project Settings."
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
          "body": "本文中に太字、斜体、打ち消し線などの基本的な文字装飾を挿入できます。書式ツールバーやMarkdown記法と合わせて活用できます。"
        },
        "en": {
          "title": "Basic text formatting",
          "body": "You can apply basic text formatting such as bold, italic, and strikethrough to your prose. Use the formatting toolbar or Markdown syntax."
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
          "body": "見出しを使って文章の構造を整理できます。章や節に見出しを付けておくと、見出しジャンプや文書マップによる全体把握がスムーズになります。"
        },
        "en": {
          "title": "Use headings",
          "body": "You can structure your documents using headings. Adding headings to chapters and sections makes heading navigation and the document map more useful."
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
          "body": "ルビを振りたいテキストを選択してメニューやツールバーから操作すると、親文字とルビを指定できるルビ挿入ダイアログを開けます。"
        },
        "en": {
          "title": "Add ruby text",
          "body": "Select text and choose the ruby action to open a dialog where you can set base text and ruby readings."
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
          "body": "強調したいテキストを選択して操作すると、傍点（圏点）の種類を選んで付与できる挿入ダイアログを開けます。"
        },
        "en": {
          "title": "Add emphasis marks",
          "body": "Select the text you want to emphasize to open a dialog where you can choose and apply emphasis dot marks."
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
          "body": "行のインデント（字下げ）やアウトデント（字上げ）を素早く行えます。リストやテキストの階層構造を整えるときに役立ちます。"
        },
        "en": {
          "title": "Indent and outdent",
          "body": "You can quickly indent and outdent lines. Use this to structure lists and organize text hierarchy."
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
          "body": "本文中に画像を挿入できます。エクスポートやプレビューの表示を安定させるため、画像ファイルはプロジェクト内に置くのがおすすめです。"
        },
        "en": {
          "title": "Insert images",
          "body": "You can insert images into your manuscript. For predictable preview and export behavior, keep image files inside the project."
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
          "body": "手紙や作中資料、引用文などを地の文と区別したいときは、引用ブロックを使って見やすく整えられます。"
        },
        "en": {
          "title": "Insert a blockquote",
          "body": "Use blockquotes when you want to visually set off quoted text, in-universe letters, or reference materials from narrative prose."
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
          "body": "本文中にハイパーリンクを挿入できます。取材メモや外部資料への参照リンクは、必要な範囲に絞って配置すると執筆に集中しやすくなります。"
        },
        "en": {
          "title": "Insert links",
          "body": "You can insert hyperlinks into your documents. Keeping external reference links focused makes it easier to stay in flow while writing."
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
          "body": "専用ダイアログから Markdown の表を挿入できます。行数はヘッダ行を除いた「本体行」として指定して作成します。"
        },
        "en": {
          "title": "Insert tables",
          "body": "You can insert Markdown tables using a dedicated dialog. Specify the row count as body rows, excluding the header row."
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
          "body": "Tab キーをエディタ入力に使う設定でも、フォーカス移動へ戻るための脱出手段が用意されています。詳しい操作はキーボードショートカット画面で確認できます。"
        },
        "en": {
          "title": "Escape from Tab capture",
          "body": "Even when Tab is configured for editor input, Pergamum provides a way to return to focus navigation. You can check the current operation in Keyboard Shortcuts."
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
          "body": "場面の切り替えや幕間などの区切りを入れたいときは、水平線を挿入して視覚的なブレイクを作れます。"
        },
        "en": {
          "title": "Insert a divider",
          "body": "You can insert a horizontal rule to mark scene transitions, intermissions, or visual breaks in your story."
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
          "body": "固定幅で見せたいテキストや引用断片は、コードブロックとして記述できます。小説本文では必要な場面に絞って活用できます。"
        },
        "en": {
          "title": "Insert a code block",
          "body": "You can format text in code blocks when you want monospace fragments or technical excerpts. In prose, use them where they best serve readability."
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
          "body": "コマンドパレットでは、登録済みの操作を名前で検索できます。メニューやボタンの場所に迷ったときにも便利です。"
        },
        "en": {
          "title": "Command Palette",
          "body": "In the Command Palette, you can search all registered actions by name. It is a quick way to find features when you are unsure where they live."
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
          "body": "クイックオープン機能を使うと、プロジェクト内の文書をファイル名で素早く検索して開けます。ファイル数が増えたときに重宝します。"
        },
        "en": {
          "title": "Open files quickly",
          "body": "Quick Open lets you search and jump to documents inside the project by name. It is especially handy as your manuscript grows."
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
          "body": "見出しジャンプ機能を使うと、文書内の章や節の一覧から目的の見出しへ素早く移動できます。長編の執筆で特に役立ちます。"
        },
        "en": {
          "title": "Jump to headings",
          "body": "Heading Jump lets you navigate directly to chapters and sections across your document. It is especially useful when writing longer stories."
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
          "body": "語彙ジャンプ機能を使うと、登録された登場人物や設定用語を検索してすぐに確認できます。執筆中に設定を確かめたいときに便利です。"
        },
        "en": {
          "title": "Jump to glossary entries",
          "body": "Glossary Jump lets you quickly search and jump to registered characters or worldbuilding terms while writing."
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
          "body": "File Explorer では、プロジェクト内のファイル構成を確認したり、文書を切り替えたりできます。サイドバーからいつでも表示できます。"
        },
        "en": {
          "title": "Show File Explorer",
          "body": "In the File Explorer, you can browse your project’s file hierarchy and switch documents from the sidebar at any time."
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
          "body": "語彙集サイドバーでは、登場人物や地名、作中の独自用語を一覧管理できます。執筆中の設定参照に役立ちます。"
        },
        "en": {
          "title": "Show the glossary",
          "body": "The Glossary sidebar lets you organize characters, places, and in-universe terms in one place for quick reference while writing."
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
          "body": "文書マップでは、文書内の見出し構成や登場人物・語彙の出現分布を俯瞰できます。物語の流れや展開の偏りを確認できます。"
        },
        "en": {
          "title": "Show the document map",
          "body": "The Document Map provides a visual overview of heading structure and glossary occurrences to help you analyze story pacing."
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
          "body": "文書統計サイドバーでは、文字数や行数、原稿用紙換算などの執筆進捗をリアルタイムに確認できます。"
        },
        "en": {
          "title": "Show document metrics",
          "body": "The Document Metrics sidebar lets you monitor character counts, lines, and manuscript page estimates in real time."
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
          "body": "行番号ジャンプ機能を使うと、指定した行へ素早く移動できます。校正指摘やレビュー位置の確認に便利です。"
        },
        "en": {
          "title": "Go to a line number",
          "body": "Go to Line lets you navigate directly to a specific line number. It is helpful when addressing proofreading feedback or review notes."
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
          "body": "開いている文書タブは前後に切り替えて移動できます。入力中のテキスト欄では誤動作しないよう配慮されています。"
        },
        "en": {
          "title": "Move between tabs",
          "body": "You can cycle through open document tabs. Tab switching is designed not to interfere while typing in active text fields."
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
          "body": "開いている文書内の語句を素早く検索できます。タブごとに検索語が保持されるため、複数の章を行き来しながらでも検索状態を維持できます。"
        },
        "en": {
          "title": "Search the open document",
          "body": "You can search for text within the active document. Each tab preserves its own query, so your search state remains intact when switching chapters."
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
          "body": "プロジェクト全体検索を使うと、すべての本文ファイルを横断して語句を探せます。作中での表記ゆれや伏線の確認に役立ちます。"
        },
        "en": {
          "title": "Search the whole project",
          "body": "Project-wide search lets you look across every manuscript file at once. It helps you check consistency and track motifs across chapters."
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
          "body": "開いている文書内のテキストを置換できます。対象や変更箇所を視覚的に確認しながら安全に置き換えを進められます。"
        },
        "en": {
          "title": "Replace in the open document",
          "body": "You can replace text within the active document, confirming matched instances visually as you update your manuscript."
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
          "body": "本文中で選択した文字列をそのまま検索語として、プロジェクト全体検索を開始できます。気になった用語の登場箇所を調べるのに便利です。"
        },
        "en": {
          "title": "Search from the selection",
          "body": "You can launch project search directly from selected text in the editor. It is a quick way to find all appearances of a term across files."
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
          "body": "選択した文字列を置換元として、プロジェクト全体の置換パネルを起動できます。キャラクター名や設定変更の一括反映に役立ちます。"
        },
        "en": {
          "title": "Replace from the selection",
          "body": "You can start project-wide replacement using your current selection. It helps you propagate character name or terminology updates across the manuscript."
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
          "body": "Markdown の仕上がりを確認したいときは、エディタの横にプレビュー画面を表示してリアルタイムに確認できます。"
        },
        "en": {
          "title": "Toggle preview",
          "body": "You can display a real-time preview alongside the editor whenever you want to check the rendered look of your Markdown text."
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
          "body": "Markdown 構文チェック機能を有効にすると、記述の誤りや注意点をエディタ上で確認できます。小説本文でノイズになりやすいルールは調整されています。"
        },
        "en": {
          "title": "Markdown syntax check",
          "body": "Enabling Markdown syntax checking highlights syntax issues directly in the editor, with prose-friendly tuning to minimize distraction."
        }
      },
      "link": null
    },
    {
      "id": "welcome.japanese-checker",
      "enabled": true,
      "category": "View",
      "categoryKey": "view",
      "weight": 75,
      "icon": "editor",
      "iconPath": "assets/icons/codicons/tips/edit-sparkle.svg",
      "text": {
        "ja": {
          "title": "日本語表記をチェック",
          "body": "日本語表記チェックには、ツールバーから実施するインスタントチェックと、ファイルの右クリックメニューから実施するチェックがあります。"
        },
        "en": {
          "title": "Check Japanese notation",
          "body": "There are two ways to check Japanese notation: an instant check from the toolbar and a check from the file's right-click menu."
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
          "body": "画面の表示倍率は拡大・縮小して調整できます。見やすい文字サイズに合わせて執筆環境をカスタマイズでき、いつでも標準倍率に戻せます。"
        },
        "en": {
          "title": "Adjust zoom",
          "body": "You can zoom the application in or out to fit your preferred reading size, and easily reset back to standard zoom at any time."
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
          "body": "本文中で気になる語句を選択して操作すると、その語句を語彙集の項目として直接開いたり登録したりできます。"
        },
        "en": {
          "title": "Open a glossary entry from the selection",
          "body": "Selecting a term in the manuscript lets you open or register it directly in the glossary for streamlined worldbuilding management."
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
          "body": "ギリシャ時代に大図書館を擁したトルコ西部に実在した都市名が由来です。"
        },
        "en": {
          "title": "What is Pergamum?",
          "body": "The name comes from an actual city in western Turkey that once had a great library in the Greek era."
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

# キーボードショートカット

Pergamum のキーボードショートカットの早見表と、ショートカットの変更方法です。

- 一覧は **Windows / Linux / macOS** ごとの、既定の割り当てです。
- 画面で確認・変更するには、メニューの **ファイル → キーボードショートカット...** を開きます。
- 設定は `keybindings.json` に保存されます。直接編集することもできます。

表記について:

- 多くの共通ショートカットでは、Windows / Linux の Ctrl に相当するキーを macOS では ⌘ と表記します。
- macOS では Command を ⌘、Option を ⌥、Control を ⌃、Shift を ⇧ などのキー記号で表記します。
- macOS では **Alt** キーを **Option** (⌥) と表記します。
- 「—」は、その OS では既定のキーが割り当てられていないことを表します。
- 「読み取り専用」のものは、OS・Electron・エディタの標準機能で、キーの変更や解除はできません。
- 既定のキーが割り当てられていないコマンド(リストの項目の挿入など)は、この表にはありません。画面から割り当てることができます。

## ショートカット一覧

### ファイル

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Open Project | プロジェクトを開きます。 | Ctrl+Shift+O | Ctrl+Shift+O | ⌘⇧O |  |
| New File | 新しい文書を作成します。 | Ctrl+N | Ctrl+N | ⌘N |  |
| Save | アクティブな文書を保存します。 | Ctrl+S | Ctrl+S | ⌘S |  |
| Save As | アクティブな文書を別のパスに保存します(F12 でも実行できます)。 | Ctrl+Shift+S / F12 | Ctrl+Shift+S / F12 | ⌘⇧S / F12 |  |
| Save All | 未保存の文書をすべて保存します。 | Ctrl+Alt+S | Ctrl+Alt+S | ⌘⌥S |  |
| Close Editor | アクティブな文書のタブを閉じます(ウィンドウは閉じません)。 | Ctrl+W | Ctrl+W | ⌘W |  |

### コマンドパレット

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Open Command Palette | コマンドパレットを開きます(F1 でも開けます)。 | Ctrl+P / F1 | Ctrl+P / F1 | ⌘P / F1 |  |
| Go to File | コマンドパレットをファイル検索モード(プレフィックスなし)で開きます。 | Ctrl+O | Ctrl+O | ⌘O |  |
| Go to Heading | コマンドパレットを見出しモード(# プレフィックス)で開きます。 | Ctrl+# | Ctrl+# | — | macOS では OS のスクリーンショットと重なるため未割当 |
| Go to Glossary Entry | コマンドパレットを語彙集モード(@ プレフィックス)で開きます。 | Ctrl+@ | Ctrl+@ | ⌘@ |  |
| Go to Line | コマンドパレットを行移動モード(: プレフィックス)で開きます。 | Ctrl+: | Ctrl+: | ⌘: |  |
| Search Project from Palette | コマンドパレットをプロジェクト検索モード(% プレフィックス)で開きます。 | Ctrl+% | Ctrl+% | — | macOS では OS のスクリーンショットと重なるため未割当 |

### 検索

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Find in Document | アクティブな文書内の検索パネルを開きます。 | Ctrl+F | Ctrl+F | ⌘F |  |
| Replace in Document | アクティブな文書内の置換パネルを開きます。 | Ctrl+H | Ctrl+H | ⌘⌥F | macOS では ⌘H(アプリを隠す)と重なるため別のキー |
| Find Next | 次の検索結果へ移動します。 | F3 | F3 | F3 |  |
| Find Previous | 前の検索結果へ移動します。 | Shift+F3 | Shift+F3 | ⇧F3 |  |
| Search Project for Selection | 選択範囲を初期値にしてプロジェクト検索を開きます。 | Ctrl+Shift+F | Ctrl+Shift+F | ⌘⇧F |  |
| Replace in Project for Selection | 選択範囲を初期値にしてプロジェクト置換を開きます。 | Ctrl+Shift+H | Ctrl+Shift+H | ⌘⇧H |  |

### マークダウン

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Bold | 選択範囲を太字にします。 | Ctrl+B | Ctrl+B | ⌘B |  |
| Italic | 選択範囲を斜体にします。 | Ctrl+I | Ctrl+I | ⌘I |  |
| Strikethrough | 選択範囲に取り消し線を付けます。 | Ctrl+Shift+X | Ctrl+Shift+X | ⌘⇧X |  |
| Insert Link | 選択範囲にリンクを付けるダイアログを開きます。 | Ctrl+K | Ctrl+K | ⌘K |  |
| Insert Heading | 見出しレベルの選択を開きます。 | Ctrl+L | Ctrl+L | ⌘L |  |
| Insert Horizontal Rule | 水平線を挿入します。 | Ctrl+Shift+L | Ctrl+Shift+L | ⌘⇧L |  |
| Insert Blockquote | 選択範囲を引用にします。 | Ctrl+Shift+Q | Ctrl+Shift+Q | ⌘⌥Q | macOS では ⌘⇧Q(ログアウト)と重なるため別のキー |
| Insert Code Block | コードブロックを挿入します。 | Ctrl+Shift+B | Ctrl+Shift+B | ⌘⇧B |  |
| Insert Ruby | 選択範囲にルビを付けるダイアログを開きます。 | Ctrl+R | Ctrl+R | ⌘R | 再読み込みは無効化されています(下記) |
| Insert Emphasis Mark | 選択範囲に傍点を付けます。 | Ctrl+. | Ctrl+. | ⌘. |  |
| Insert Table | 表の挿入ピッカーを開きます。 | Ctrl+T | Ctrl+T | ⌘T |  |
| Toggle Syntax Checker | Markdown の構文チェックを切り替えます。 | Ctrl+Shift+C | Ctrl+Shift+C | ⌘⇧C |  |
| Insert Image | 画像の挿入を開始します。 | Ctrl+Shift+I | Ctrl+Shift+I | ⌘⇧I |  |

### 語彙集

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Open Glossary Entry from Selection | 選択範囲の語彙集の項目を開きます。無ければ新規作成します。 | Ctrl+G | Ctrl+G | ⌘G |  |
| Open Glossary Completion | カーソル位置で語彙の補完を開きます。 | Ctrl+Space | Ctrl+Space | ⌥` | macOS では ⌃Space(入力ソース切替)と重なるため別のキー |

### 本文編集

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Rename Document | 本文編集中にアクティブな文書の名前を変更します。ファイルエクスプローラーの F2 とは別です。 | F2 | F2 | F2 | 本文にフォーカスがあるとき |
| Indent | 選択行をインデントします。 | Ctrl+] | Ctrl+] | ⌘] |  |
| Outdent | 選択行のインデントを戻します。 | Ctrl+[ | Ctrl+[ | ⌘[ |  |
| Toggle Tab Capture | エディタの Tab キャプチャ設定を切り替えます。 | Ctrl+M | Ctrl+M | ⌥⇧M | macOS では ⌘M(最小化)等を避けて別のキー |
| Bypass Tab Capture Once | Tab キャプチャが有効なとき、Escape で次の Tab / Shift+Tab だけを通常動作にします。 | Esc | Esc | Esc |  |
| Cursor to Line Start | カーソルを行頭へ移動します。 | Home | Home | ⌘← | 標準機能(読み取り専用) |
| Cursor to Line End | カーソルを行末へ移動します。 | End | End | ⌘→ | 標準機能(読み取り専用) |
| Cursor to Document Start | カーソルを文書の先頭へ移動します。 | Ctrl+Home | Ctrl+Home | ⌘↑ | 標準機能(読み取り専用) |
| Cursor to Document End | カーソルを文書の末尾へ移動します。 | Ctrl+End | Ctrl+End | ⌘↓ | 標準機能(読み取り専用) |
| Move Line Up | 行を上へ移動します。 | Alt+Up | Alt+Up | ⌥↑ | 標準機能(読み取り専用) |
| Move Line Down | 行を下へ移動します。 | Alt+Down | Alt+Down | ⌥↓ | 標準機能(読み取り専用) |
| Copy Line Up | 行を上へ複製します。 | Alt+Shift+Up | Alt+Shift+Up | ⌥⇧↑ | 標準機能(読み取り専用) |
| Copy Line Down | 行を下へ複製します。 | Alt+Shift+Down | Alt+Shift+Down | ⌥⇧↓ | 標準機能(読み取り専用) |
| Toggle Comment | 選択行のコメントを切り替えます。 | Ctrl+/ | Ctrl+/ | ⌘/ | 標準機能(読み取り専用) |
| Select Next Occurrence | 次に一致する部分を選択に追加します。 | Ctrl+D | Ctrl+D | ⌘D | 標準機能(読み取り専用) |
| Insert Blank Line | 空行を挿入します。 | Ctrl+Enter | Ctrl+Enter | ⌘Enter | 標準機能(読み取り専用) |
| Delete Line | 行を削除します。 | Ctrl+Shift+K | Ctrl+Shift+K | ⌘⇧K | 標準機能(読み取り専用) |
| Undo Selection | 選択範囲の変更を元に戻します。 | Ctrl+U | Ctrl+U | ⌘U | 標準機能(読み取り専用) |
| Go to Next Diagnostic | 次の診断(警告・エラー)へ移動します。 | F8 | F8 | F8 | 標準機能(読み取り専用) |

### 表示

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Toggle File Explorer | ファイルエクスプローラーのペインを表示・非表示します。 | Ctrl+Shift+E | Ctrl+Shift+E | ⌘⇧E |  |
| Toggle Glossary Pane | 語彙集のペインを表示・非表示します。 | Ctrl+Shift+G | Ctrl+Shift+G | ⌘⇧G |  |
| Toggle Document Map | 文書マップのペインを表示・非表示します。 | Ctrl+Shift+M | Ctrl+Shift+M | ⌘⇧M |  |
| Toggle Document Metrics | 文書統計のペインを表示・非表示します。 | Ctrl+Shift+T | Ctrl+Shift+T | ⌘⇧T |  |
| Toggle Preview | Markdown プレビューの表示と非表示を切り替えます。 | Ctrl+Shift+P | Ctrl+Shift+P | ⌘⇧P |  |
| Open Application Settings | アプリケーション設定のタブを開きます。 | Ctrl+, | Ctrl+, | ⌘, |  |
| Previous Tab | 前のタブへ切り替えます。 | Alt+Left | Alt+Left | ⌘⌥← | macOS では ⌥←(単語移動)を避けて別のキー |
| Next Tab | 次のタブへ切り替えます。 | Alt+Right | Alt+Right | ⌘⌥→ | macOS では ⌥→(単語移動)を避けて別のキー |
| Zoom In | 表示を拡大します。 | Ctrl+= / Ctrl++ | Ctrl+= / Ctrl++ | ⌘= / ⌘+ |  |
| Zoom Out | 表示を縮小します。 | Ctrl+- | Ctrl+- | ⌘- |  |
| Reset Zoom | 表示倍率を元に戻します。 | Ctrl+0 | Ctrl+0 | ⌘0 |  |

### ファイルエクスプローラー

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Rename File | 選択中のファイル・フォルダ(ファイルエクスプローラー)、またはフォーカス中のタブの文書名を変更します。本文中の F2 は「文書名を変更」です。 | F2 | F2 | F2 | ファイルエクスプローラーにフォーカスがあるとき |
| Copy File | 選択中のファイルエクスプローラーの項目をコピーします。 | Ctrl+C | Ctrl+C | ⌘C | ファイルエクスプローラーにフォーカスがあるとき |
| Cut File | 選択中のファイルエクスプローラーの項目を切り取ります。 | Ctrl+X | Ctrl+X | ⌘X | ファイルエクスプローラーにフォーカスがあるとき |
| Paste File | コピー・切り取り中の項目を現在の貼り付け先へ貼り付けます。 | Ctrl+V | Ctrl+V | ⌘V | ファイルエクスプローラーにフォーカスがあるとき |
| Delete File | 選択中のファイルエクスプローラーの項目を、確認ダイアログを経て削除します。 | Delete | Delete | Delete | ファイルエクスプローラーにフォーカスがあるとき |

### アプリケーション

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Quit | アプリケーションを終了します。未保存の文書がある場合は先に確認します。 | Ctrl+Q | Ctrl+Q | ⌘Q | OS / Electron 標準(読み取り専用) |
| Hide Application | アプリケーションを隠します(macOS)。OS 標準の動作です。 | — | — | ⌘H | OS / Electron 標準(読み取り専用) |
| Hide Others | ほかのアプリケーションを隠します(macOS)。OS 標準の動作です。 | — | — | ⌘⌥H | OS / Electron 標準(読み取り専用) |

### ウィンドウ

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Close Window | ウィンドウを閉じます(macOS では ⌘W をエディタ用に残すため ⌘⇧W です)。 | Alt+F4 | Alt+F4 | ⌘⇧W | OS / Electron 標準(読み取り専用) |
| Minimize Window | ウィンドウを最小化します。 | — | — | ⌘M | OS / Electron 標準(読み取り専用) |
| Toggle Full Screen | 全画面表示を切り替えます。 | F11 | F11 | ⌃⌘F | OS / Electron 標準(読み取り専用) |

### 開発者向け

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Toggle Developer Tools | 開発者ツールを開閉します。 | Ctrl+Shift+D | Ctrl+Shift+D | ⌘⇧D | OS / Electron 標準(読み取り専用) |

### 基本編集

| コマンド | 説明 | Windows | Linux | macOS | 備考 |
| --- | --- | --- | --- | --- | --- |
| Copy | 選択範囲をコピーします。 | Ctrl+C | Ctrl+C | ⌘C | OS / Electron 標準(読み取り専用) |
| Cut | 選択範囲を切り取ります。 | Ctrl+X | Ctrl+X | ⌘X | OS / Electron 標準(読み取り専用) |
| Paste | クリップボードの内容を貼り付けます。 | Ctrl+V | Ctrl+V | ⌘V | OS / Electron 標準(読み取り専用) |
| Select All | すべて選択します。 | Ctrl+A | Ctrl+A | ⌘A | OS / Electron 標準(読み取り専用) |
| Undo | 直前の編集を元に戻します。 | Ctrl+Z | Ctrl+Z | ⌘Z | OS / Electron 標準(読み取り専用) |
| Redo | 元に戻した操作をやり直します。 | Ctrl+Y | Ctrl+Y | ⌘⇧Z | OS / Electron 標準(読み取り専用) |

## Ctrl+R(⌘R)について

Pergamum では **Ctrl+R(macOS は ⌘R)はルビの挿入**です。ブラウザの「再読み込み」としては働きません。

また、誤って画面が再読み込みされないよう、次のキーも無効になっています。

- Ctrl+Shift+R(macOS は ⌘⇧R)
- F5、Ctrl+F5、Shift+F5

## ショートカットを変更する

1. メニューの **ファイル → キーボードショートカット...** を開きます。
2. 一覧でコマンドを探します。上部の検索欄、カテゴリ、「すべて / 変更済み / 未割当」で絞り込めます。
3. 目的の操作を行います。

   | やりたいこと | 操作 |
   | --- | --- |
   | キーを変更する | 行の「ショートカットを編集」を押し、新しいキーを押します。`Esc` でキャンセルできます。 |
   | キーを追加する | コマンドの「ショートカットを追加」を押し、追加するキーを押します。1 つのコマンドに複数のキーを割り当てられます。 |
   | キーを解除する | 行の「ショートカットを解除」を押します。 |
   | 既定値へ戻す | 行の「既定値に戻す」を押します。 |
   | すべて既定値へ戻す | 画面上部の「すべて既定値に戻す」を押します(下記)。 |

変更はすぐに反映されます。再起動は不要です。

「読み取り専用」と表示されるコマンド(コピー、貼り付け、元に戻す、OS の標準機能など)は変更できません。標準機能のキーを確認したいときは、「読み取り専用を表示する」を有効にします。

### 割り当てできないキー

- すでに同じ範囲で別のコマンドが使っているキーは、競合として割り当てできません。
- OS、Electron、Chromium、Pergamum の安全な動作に必要な一部のキーは予約されており、割り当てできません(例: F5、macOS の ⌘Space、⌘⇧3 / ⌘⇧4 / ⌘⇧5 など)。
- Ctrl+R(⌘R)は、ルビの挿入にだけ使えます。

### すべて既定値に戻す

`keybindings.json` に保存されたすべての変更を削除し、既定のショートカットに戻します。元に戻せないため、確認ダイアログが表示されます。誤操作を防ぐため、「既定値に戻す」ボタンは、ダイアログを開いてから 5 秒間は押せません。

`keybindings.json` が壊れていて読み込めないときも、この操作で正常な状態に戻せます。

## keybindings.json を直接編集する

画面上部の「keybindings.json の場所を開く」で、ファイルのあるフォルダーを開けます。ファイルはアプリケーション設定(`settings.json`)と同じフォルダーにあります。ファイルが無いときは、既定のショートカットがそのまま使われます。

外部のエディタで保存すると、**自動的に再読み込み**されます。再起動は不要です。

### 形式

`keybindings.json` は、ショートカットの定義を並べた **JSON の配列**です。

```json
[
  { "key": "Mod-Alt-9", "command": "editor.markdown.bold" },
  { "key": "Mod-b", "command": "-editor.markdown.bold" }
]
```

| 項目 | 説明 |
| --- | --- |
| `key` | キー(必須)。下記の表記で書きます。 |
| `command` | コマンド ID(必須)。コマンド ID は、画面の各行に表示されます。 |
| `when` | 省略できます。下記を参照してください。 |

上記以外の項目は無視されます(警告が表示されます)。

### キーの表記

- 修飾キーは `Mod`、`Ctrl`、`Alt`、`Shift` を `-` でつなぎます。例: `Mod-Shift-p`
- `Mod` は、Windows / Linux では Ctrl、macOS では Cmd になります。同じファイルを OS をまたいで使えます。
- 文字は小文字で書きます(`Mod-s`)。
- 名前のあるキーは `Enter`、`Escape`、`Tab`、`Space`、`Delete`、`Home`、`End`、`ArrowLeft` のように書きます。ファンクションキーは `F1` から `F24` です。
- 記号は、そのまま書きます(`Mod-,`、`Mod-.`)。

### 追加と解除

- コマンドにキーを**追加**するには、`command` にコマンド ID を書きます。同じコマンドに複数のキーを追加できます。
- 既定のキーを**解除**するには、`command` の先頭に `-` を付けます。上の例では、`Mod-b` による太字を解除し、`Mod-Alt-9` を追加しています。つまり、キーの「変更」は「解除してから追加」です。
- 解除は、そのコマンドに実際に割り当てられているキーに対してだけ効きます。

保存すると、解除、追加の順に既定の割り当てへ重ねられます。

### when について

`when` は、画面の「適用条件」に表示される、**対応済みの条件情報を識別するための項目**です。たとえば、同じコマンドに条件の違う既定のキーが複数ある場合に、どちらを解除するかを指定するために使えます。

現在、**任意の条件式を書いたり、評価したりすることには対応していません**。対応していない `when` を書いたショートカットの定義は、適用されません(診断に表示されます)。

### 間違いがあるとき

- JSON の形式が壊れているときは、**直前の有効な設定がそのまま使われ**、画面の上部に問題が表示されます。直して保存すれば、自動的に反映されます。
- 一部の定義だけに問題があるとき(存在しないコマンド、予約されたキー、競合など)は、その定義だけが適用されず、ほかは有効です。問題は画面上部に表示されます。
- ファイルを削除すると、既定のショートカットに戻ります。

## 既知の制限

- VS Code の `keybindings.json` との完全な互換はありません。
- `when` による任意の条件式の評価・編集には対応していません。
- 2 つのキーを続けて押すショートカット(コード)には対応していません。
- OS ごとに別々のキーを `keybindings.json` で指定することはできません(`Mod` により OS をまたいで共通の設定になります)。
- **Linux**: デスクトップ環境や入力メソッド(IME)によって、OS が使うキーが異なります。たとえば、IBus の既定では Ctrl+Space が入力の切り替えに使われ、Pergamum の語彙補完(Ctrl+Space)と重なる場合があります。そのときは、どちらかのキーを変更してください。
- **macOS**: JIS 配列と US 配列で、一部の記号キー(`` ` `` など)の位置が異なります。また、システム環境設定で変更したショートカットとは重なる場合があります。
- **AltGr**(欧州配列など): AltGr を押しながらの文字入力は Ctrl+Alt の操作とは見なされませんが、環境による差があります。

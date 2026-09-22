import { useState, type FC, type MouseEvent as ReactMouseEvent } from "react";
import type { Translate } from "../../shared/i18n";
import type { HeadingLevel } from "../../shared/markdownHeadingMarkup";
import { TableSizePopover } from "./TableSizePopover";
import { HeadingLevelPopover } from "./HeadingLevelPopover";
import headingIconRaw from "../../../assets/icons/pergamum/toolbar/heading.svg?raw";
import boldIconRaw from "../../../assets/icons/codicons/toolbar/bold.svg?raw";
import italicIconRaw from "../../../assets/icons/codicons/toolbar/italic.svg?raw";
import strikeIconRaw from "../../../assets/icons/pergamum/toolbar/strike.svg?raw";
import linkIconRaw from "../../../assets/icons/codicons/toolbar/link.svg?raw";
import horizontalRuleIconRaw from "../../../assets/icons/codicons/toolbar/horizontal-rule.svg?raw";
import codeBlockIconRaw from "../../../assets/icons/codicons/toolbar/code.svg?raw";
import tableIconRaw from "../../../assets/icons/codicons/toolbar/table.svg?raw";
import rubyIconRaw from "../../../assets/icons/pergamum/toolbar/ruby.svg?raw";
import emphasisIconRaw from "../../../assets/icons/pergamum/toolbar/emphasis.svg?raw";

export interface EditorToolbarProps {
  /** #529: shared enable gate for Heading / Bold / Italic / Strikethrough /
   *  Link — Markdown document, not a special tab, not read-only. */
  canUseMarkdownToolbarCommands: boolean;
  canInsertTable: boolean;
  onApplyBold: () => void;
  onApplyItalic: () => void;
  onApplyStrikethrough: () => void;
  isHeadingSelectorOpen: boolean;
  onToggleHeadingSelector: () => void;
  onCloseHeadingSelector: () => void;
  onSelectHeadingLevel: (level: HeadingLevel) => void;
  onOpenLinkDialog: (opener: Element) => void;
  onInsertHorizontalRule: () => void;
  onInsertCodeBlock: () => void;
  onInsertTable: (columns: number, rows: number) => void;
  /** #531: shared enable gate for Ruby / Emphasis Mark — unlike
   *  `canUseMarkdownToolbarCommands`, this stays true on `.txt` documents,
   *  matching the existing Ctrl+R / Ctrl+. shortcuts' own applicability. */
  hasEditableTextLikeDocument: boolean;
  onOpenRubyDialog: (opener: Element) => void;
  onOpenEmphasisDialog: (opener: Element) => void;
  translate: Translate;
}

export const EditorToolbar: FC<EditorToolbarProps> = ({
  canUseMarkdownToolbarCommands,
  canInsertTable,
  onApplyBold,
  onApplyItalic,
  onApplyStrikethrough,
  isHeadingSelectorOpen,
  onToggleHeadingSelector,
  onCloseHeadingSelector,
  onSelectHeadingLevel,
  onOpenLinkDialog,
  onInsertHorizontalRule,
  onInsertCodeBlock,
  onInsertTable,
  hasEditableTextLikeDocument,
  onOpenRubyDialog,
  onOpenEmphasisDialog,
  translate
}) => {
  const [isTablePopoverOpen, setIsTablePopoverOpen] = useState<boolean>(false);

  const handleSelectTableSize = (columns: number, rows: number) => {
    setIsTablePopoverOpen(false);
    onInsertTable(columns, rows);
  };

  const handleSelectHeadingLevel = (level: HeadingLevel) => {
    onCloseHeadingSelector();
    onSelectHeadingLevel(level);
  };

  const handleLinkButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onOpenLinkDialog(event.currentTarget);
  };

  const handleRubyButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onOpenRubyDialog(event.currentTarget);
  };

  const handleEmphasisButtonClick = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    onOpenEmphasisDialog(event.currentTarget);
  };

  return (
    <header className="editorToolbar">
      <div className="editorToolbarGroup">
        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={onToggleHeadingSelector}
            aria-label={translate("toolbar.insertHeading")}
            title={translate("toolbar.insertHeading")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: headingIconRaw }}
            />
          </button>

          {isHeadingSelectorOpen && canUseMarkdownToolbarCommands && (
            <HeadingLevelPopover
              onSelectHeadingLevel={handleSelectHeadingLevel}
              onClose={onCloseHeadingSelector}
              translate={translate}
            />
          )}
        </div>
      </div>

      <div className="editorToolbarSeparator" role="separator" aria-orientation="vertical" />

      <div className="editorToolbarGroup">
        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={onApplyBold}
            aria-label={translate("toolbar.bold")}
            title={translate("toolbar.bold")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: boldIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={onApplyItalic}
            aria-label={translate("toolbar.italic")}
            title={translate("toolbar.italic")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: italicIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={onApplyStrikethrough}
            aria-label={translate("toolbar.strikethrough")}
            title={translate("toolbar.strikethrough")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: strikeIconRaw }}
            />
          </button>
        </div>
      </div>

      <div className="editorToolbarSeparator" role="separator" aria-orientation="vertical" />

      <div className="editorToolbarGroup">
        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={handleLinkButtonClick}
            aria-label={translate("toolbar.insertLink")}
            title={translate("toolbar.insertLink")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: linkIconRaw }}
            />
          </button>
        </div>
      </div>

      <div className="editorToolbarSeparator" role="separator" aria-orientation="vertical" />

      <div className="editorToolbarGroup">
        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={onInsertHorizontalRule}
            aria-label={translate("toolbar.horizontalRule")}
            title={translate("toolbar.horizontalRule")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: horizontalRuleIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={onInsertCodeBlock}
            aria-label={translate("toolbar.codeBlock")}
            title={translate("toolbar.codeBlock")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: codeBlockIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canInsertTable}
            onClick={() => setIsTablePopoverOpen((prev) => !prev)}
            aria-label={translate("toolbar.insertTable")}
            title={translate("toolbar.insertTable")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: tableIconRaw }}
            />
          </button>

          {isTablePopoverOpen && canInsertTable && (
            <TableSizePopover
              onSelectTableSize={handleSelectTableSize}
              onClose={() => setIsTablePopoverOpen(false)}
              translate={translate}
            />
          )}
        </div>
      </div>

      <div className="editorToolbarSeparator" role="separator" aria-orientation="vertical" />

      <div className="editorToolbarGroup">
        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!hasEditableTextLikeDocument}
            onClick={handleRubyButtonClick}
            aria-label={translate("toolbar.ruby")}
            title={translate("toolbar.ruby")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: rubyIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!hasEditableTextLikeDocument}
            onClick={handleEmphasisButtonClick}
            aria-label={translate("toolbar.emphasisMark")}
            title={translate("toolbar.emphasisMark")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: emphasisIconRaw }}
            />
          </button>
        </div>
      </div>
    </header>
  );
};

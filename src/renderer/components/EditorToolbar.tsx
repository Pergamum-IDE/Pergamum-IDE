import { useState, type FC, type MouseEvent as ReactMouseEvent } from "react";
import type { Translate } from "../../shared/i18n";
import type { HeadingLevel } from "../../shared/markdownHeadingMarkup";
import type { MarkdownListKind } from "../../shared/markdownListMarkup";
import { TableSizePopover } from "./TableSizePopover";
import { HeadingLevelPopover } from "./HeadingLevelPopover";
import { ToolbarCommandBox } from "./ToolbarCommandBox";
import { PreviewRendererDropdown } from "./PreviewRendererDropdown";
import type { PreviewRendererId } from "../../shared/settings";
import type { QuickAccessPrefix } from "../quickAccessInputParser";
import headingIconRaw from "../../../assets/icons/pergamum/toolbar/heading.svg?raw";
import boldIconRaw from "../../../assets/icons/codicons/toolbar/bold.svg?raw";
import italicIconRaw from "../../../assets/icons/codicons/toolbar/italic.svg?raw";
import strikeIconRaw from "../../../assets/icons/pergamum/toolbar/strike.svg?raw";
import linkIconRaw from "../../../assets/icons/codicons/toolbar/link.svg?raw";
import horizontalRuleIconRaw from "../../../assets/icons/codicons/toolbar/horizontal-rule.svg?raw";
import codeBlockIconRaw from "../../../assets/icons/codicons/toolbar/code.svg?raw";
import imageIconRaw from "../../../assets/icons/feather/toolbar/image.svg?raw";
import tableIconRaw from "../../../assets/icons/codicons/toolbar/table.svg?raw";
import rubyIconRaw from "../../../assets/icons/pergamum/toolbar/ruby.svg?raw";
import emphasisIconRaw from "../../../assets/icons/pergamum/toolbar/emphasis.svg?raw";
import listUnorderedIconRaw from "../../../assets/icons/codicons/toolbar/list-unordered.svg?raw";
import listOrderedIconRaw from "../../../assets/icons/codicons/toolbar/list-ordered.svg?raw";
import checklistIconRaw from "../../../assets/icons/codicons/toolbar/checklist.svg?raw";
import outdentIconRaw from "../../../assets/icons/svgrepo/toolbar/outdent.svg?raw";
import indentIconRaw from "../../../assets/icons/svgrepo/toolbar/indent.svg?raw";
import togglePreviewIconRaw from "../../../assets/icons/codicons/toolbar/layout-sidebar-right-off.svg?raw";

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
  onApplyList: (kind: MarkdownListKind) => void;
  onOutdent: () => void;
  onIndent: () => void;
  onOpenLinkDialog: (opener: Element) => void;
  onInsertHorizontalRule: () => void;
  onInsertCodeBlock: () => void;
  /** #535: narrower than `canUseMarkdownToolbarCommands` — image insertion
   *  additionally requires the active document to be project-owned, since
   *  the inserted link's relative path only makes sense for one. */
  canInsertImage: boolean;
  onOpenImageInsertion: (opener: Element) => void;
  onInsertTable: (columns: number, rows: number) => void;
  /** #531: shared enable gate for Ruby / Emphasis Mark — unlike
   *  `canUseMarkdownToolbarCommands`, this stays true on `.txt` documents,
   *  matching the existing Ctrl+R / Ctrl+. shortcuts' own applicability. */
  hasEditableTextLikeDocument: boolean;
  onOpenRubyDialog: (opener: Element) => void;
  onOpenEmphasisDialog: (opener: Element) => void;
  /** #541: whether Preview is applicable at all for the current
   *  document/renderer — independent of `isPreviewVisible`, since the
   *  button must stay clickable while Preview is currently hidden. */
  canTogglePreview: boolean;
  /** #541: current Preview pane visibility — drives the button's
   *  `aria-pressed` state. */
  isPreviewVisible: boolean;
  onTogglePreview: () => void;
  selectedPreviewRenderer: PreviewRendererId;
  defaultPreviewRenderer: PreviewRendererId;
  onSelectPreviewRenderer: (renderer: PreviewRendererId) => void;
  isCommandPaletteOpen: boolean;
  commandPaletteLaunchAnimationDurationMs: number;
  /**
   * #542: Open the existing central Command Palette with the given initial
   * prefix. Use `""` for file mode (project file quick open) — the caller
   * must NOT collapse `""` to `">"`. Ctrl+P (#554) always uses `">"` directly
   * and is unaffected by the Command Box's local mode state.
   */
  onOpenCommandPalette: (initialPrefix: QuickAccessPrefix) => void;
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
  onApplyList,
  onOutdent,
  onIndent,
  onOpenLinkDialog,
  onInsertHorizontalRule,
  onInsertCodeBlock,
  canInsertImage,
  onOpenImageInsertion,
  onInsertTable,
  hasEditableTextLikeDocument,
  onOpenRubyDialog,
  onOpenEmphasisDialog,
  canTogglePreview,
  isPreviewVisible,
  onTogglePreview,
  selectedPreviewRenderer,
  defaultPreviewRenderer,
  onSelectPreviewRenderer,
  isCommandPaletteOpen,
  commandPaletteLaunchAnimationDurationMs,
  onOpenCommandPalette,
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

  const handleImageButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onOpenImageInsertion(event.currentTarget);
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
      <ToolbarCommandBox
        onOpenCommandPalette={onOpenCommandPalette}
        isCommandPaletteOpen={isCommandPaletteOpen}
        launchAnimationDurationMs={commandPaletteLaunchAnimationDurationMs}
        translate={translate}
      />

      <div className="editorToolbarSeparator" role="separator" aria-orientation="vertical" />

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
            onClick={() => onApplyList("unordered")}
            aria-label={translate("toolbar.unorderedList")}
            title={translate("toolbar.unorderedList")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: listUnorderedIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={() => onApplyList("ordered")}
            aria-label={translate("toolbar.orderedList")}
            title={translate("toolbar.orderedList")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: listOrderedIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canUseMarkdownToolbarCommands}
            onClick={() => onApplyList("checklist")}
            aria-label={translate("toolbar.checklist")}
            title={translate("toolbar.checklist")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: checklistIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!hasEditableTextLikeDocument}
            onClick={onOutdent}
            aria-label={translate("toolbar.outdent")}
            title={translate("toolbar.outdent")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: outdentIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!hasEditableTextLikeDocument}
            onClick={onIndent}
            aria-label={translate("toolbar.indent")}
            title={translate("toolbar.indent")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: indentIconRaw }}
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
            disabled={!canInsertImage}
            onClick={handleImageButtonClick}
            aria-label={translate("toolbar.insertImage")}
            title={translate("toolbar.insertImage")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: imageIconRaw }}
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

      <div className="editorToolbarSeparator" role="separator" aria-orientation="vertical" />

      <div className="editorToolbarGroup">
        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canTogglePreview}
            aria-pressed={isPreviewVisible}
            onClick={onTogglePreview}
            aria-label={translate("toolbar.togglePreview")}
            title={translate("toolbar.togglePreview")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: togglePreviewIconRaw }}
            />
          </button>
        </div>

        <div className="editorToolbarItem">
          <PreviewRendererDropdown
            selectedRenderer={selectedPreviewRenderer}
            defaultRenderer={defaultPreviewRenderer}
            disabled={!canTogglePreview || !isPreviewVisible}
            onSelectRenderer={onSelectPreviewRenderer}
            translate={translate}
          />
        </div>
      </div>

      {/* Right-end separator — reserved for a future fullscreen mode command. */}
      <div className="editorToolbarSeparator" role="separator" aria-orientation="vertical" />
    </header>
  );
};

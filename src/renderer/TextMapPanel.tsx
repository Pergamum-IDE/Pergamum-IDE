import type { DocumentMapSettings } from "../shared/documentMapSettings";
import type { GlossaryEntry } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import { GlossaryTextMinimapCanvas } from "./GlossaryTextMinimapCanvas";

interface TextMapPanelProps {
  /**
   * The active Markdown document's working text, or `null` when the active
   * surface is not a Markdown editor. An empty / whitespace-only string is
   * treated the same as `null` (nothing to map).
   */
  activeDocumentContent: string | null;
  /** All project glossary entries — Phase 1 has no tag filter. */
  glossaryEntries: readonly GlossaryEntry[];
  /**
   * The ACTIVE EDITOR's rendered width in CSS pixels. Drives the Text Map's
   * logical wrap width — NOT the left pane width. `null` uses a safe fallback.
   */
  editorWidth: number | null;
  /**
   * The active Markdown editor's on-screen document range. Drawn as a 1px
   * "you are here" rectangle over the map. `null` → no overlay.
   */
  editorVisibleRange?: EditorVisibleTextRange | null;
  /** #375 `documentMap` settings — draw colours + dialogue delimiter pairs. */
  documentMapSettings?: DocumentMapSettings;
  translate: Translate;
}

/**
 * #375 Text Map / 文書マップ — the left-pane panel. Header (fixed) + a
 * vertically scrolling body holding ONE tall {@link GlossaryTextMinimapCanvas}
 * (no virtualization). Empty state when there is nothing to map. Phase 2 will
 * add a tag selector above the scroll body.
 */
export function TextMapPanel({
  activeDocumentContent,
  glossaryEntries,
  editorWidth,
  editorVisibleRange = null,
  documentMapSettings,
  translate
}: TextMapPanelProps): JSX.Element {
  const hasContent =
    activeDocumentContent !== null && activeDocumentContent.trim().length > 0;

  return (
    <aside
      className="workspaceSidebarPanel textMapPanel"
      aria-label={translate("textMap.title")}
    >
      <div className="sidebarHeader">{translate("textMap.title")}</div>

      {hasContent ? (
        <div className="textMapBody">
          <GlossaryTextMinimapCanvas
            text={activeDocumentContent as string}
            entries={glossaryEntries}
            editorWidth={editorWidth}
            visibleRange={editorVisibleRange}
            documentMapSettings={documentMapSettings}
          />
        </div>
      ) : (
        <div className="workspacePlaceholderList">
          <div className="workspacePlaceholder">
            {translate("textMap.empty")}
          </div>
        </div>
      )}
    </aside>
  );
}

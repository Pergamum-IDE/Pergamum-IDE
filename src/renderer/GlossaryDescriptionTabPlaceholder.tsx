import type { Translate } from "../shared/i18n";
import type { GlossaryDescriptionCurrentEditor } from "./currentEditor";

interface GlossaryDescriptionTabPlaceholderProps {
  editor: GlossaryDescriptionCurrentEditor;
  translate: Translate;
}

/**
 * #573 Slice 1: the body of a glossary Description tab. Intentionally
 * read-only placeholder content — the Description editor / preview arrive in
 * a later slice.
 */
export function GlossaryDescriptionTabPlaceholder({
  editor,
  translate
}: GlossaryDescriptionTabPlaceholderProps): JSX.Element {
  return (
    <section
      className="glossaryDescriptionTab"
      data-glossary-entry-id={editor.entryId}
    >
      <p className="glossaryDescriptionTabHeading">
        {translate("glossaryDescriptionTab.placeholder.heading")}
      </p>
      <p className="glossaryDescriptionTabSurface">
        {editor.representativeSurface || editor.entryId}
      </p>
      <p className="glossaryDescriptionTabNotice">
        {translate("glossaryDescriptionTab.placeholder.notice")}
      </p>
    </section>
  );
}

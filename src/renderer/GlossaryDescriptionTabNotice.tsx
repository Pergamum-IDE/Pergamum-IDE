import type { Translate } from "../shared/i18n";

interface GlossaryDescriptionTabNoticeProps {
  translate: Translate;
}

/**
 * #573 Slice 3: a small, non-blocking note above a glossary Description tab's
 * editor. Edits live only in the tab's in-memory draft until save / dirty
 * tracking lands in a later slice, so the tab says so plainly.
 */
export function GlossaryDescriptionTabNotice({
  translate
}: GlossaryDescriptionTabNoticeProps): JSX.Element {
  return (
    <p className="glossaryDescriptionTabNotice" role="note">
      {translate("glossaryDescriptionTab.unsavedNotice")}
    </p>
  );
}

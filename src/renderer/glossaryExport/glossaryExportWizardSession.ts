import type { GlossaryExportEntry } from "../../shared/glossaryExportEntry";

/**
 * #695: how the Glossary Export Wizard was opened.
 *  - all:    from the Glossary Entry Manager - every entry, as before.
 *  - single: from a glossary Description tab - exactly one entry, the snapshot
 *            of that tab's current draft, fixed when the Wizard opened.
 */
export type GlossaryExportWizardSession =
  | { readonly kind: "all" }
  | { readonly kind: "single"; readonly snapshot: GlossaryExportEntry };

/**
 * #564: DOM-after-render Mermaid rendering for Markdown horizontal preview.
 *
 * Scans a live preview container for Mermaid placeholders (emitted by
 * `mermaidPreviewPlaceholder.ts` via the markdown-it fence rule) and, for
 * each one, calls `mermaid.render()` and swaps the placeholder for the
 * resulting SVG, an inline error card, or an "empty diagram" message.
 *
 * `mermaid` itself is loaded via a dynamic `import()`, cached after the
 * first call — most documents never use a Mermaid fence, so the (fairly
 * large, d3-based) library is never fetched/parsed for them.
 *
 * Stale-result protection (#564): `mermaid.render()` is asynchronous, and a
 * later preview update replaces the ENTIRE container's children
 * (`innerHTML = ...`) before an in-flight render settles. A placeholder
 * `<div>` captured by closure before that replacement becomes detached from
 * the live document — `Node.isConnected` reliably detects this for every
 * generation of staleness in one check, so it is used as the actual guard.
 * The `pergamum-mermaid-<generation>-<index>` id (required by mermaid.render
 * as a unique target id) additionally keys each render by an incrementing
 * generation counter supplied by the caller, per #564's requirement.
 *
 * Third-party license: mermaid is MIT licensed. See THIRD_PARTY_NOTICES.md
 * for the full license text.
 */

import type { Mermaid, MermaidConfig } from "mermaid";
import {
  MERMAID_BLOCK_CLASS,
  MERMAID_SOURCE_CLASS
} from "./mermaidPreviewPlaceholder";

/** Escapes the five HTML-special characters in a plain text string. */
function escapeHtmlForMermaidResult(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * #564: conservative, explicit settings. `startOnLoad` is never used —
 * rendering is always triggered explicitly from `renderMermaidDiagramsInContainer`.
 * The root-level `htmlLabels: false` takes precedence over every
 * diagram-specific `htmlLabels` setting (flowchart, sequence, ...) per
 * mermaid's own config typing, so this alone keeps HTML labels off across
 * diagram types. Theme is left at mermaid's default — no theme settings in
 * this issue.
 */
const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  htmlLabels: false
};

let mermaidModulePromise: Promise<Mermaid> | null = null;

function loadMermaid(): Promise<Mermaid> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((module) => {
      const instance = module.default;
      instance.initialize(MERMAID_CONFIG);
      return instance;
    });
  }
  return mermaidModulePromise;
}

export interface MermaidRenderSuccess {
  readonly svg: string;
  readonly bindFunctions?: (element: Element) => void;
}

/** Injectable so tests never depend on Mermaid's real (heavy) internals. */
export type MermaidRenderFn = (
  id: string,
  source: string
) => Promise<MermaidRenderSuccess>;

export const defaultMermaidRender: MermaidRenderFn = async (id, source) => {
  const mermaid = await loadMermaid();
  return mermaid.render(id, source);
};

export interface MermaidPreviewMessages {
  readonly emptyMessage: string;
  readonly errorMessage: string;
  readonly errorHint: string;
  readonly showDetailsLabel: string;
}

function findMermaidPlaceholderContainers(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`.${MERMAID_BLOCK_CLASS}`));
}

function readMermaidSource(block: HTMLElement): string {
  return block.querySelector(`.${MERMAID_SOURCE_CLASS}`)?.textContent ?? "";
}

function applyMermaidEmptyState(
  block: HTMLElement,
  messages: MermaidPreviewMessages
): void {
  block.innerHTML = `<p class="markdownMermaidEmpty">${escapeHtmlForMermaidResult(messages.emptyMessage)}</p>`;
}

function applyMermaidSuccessState(
  block: HTMLElement,
  result: MermaidRenderSuccess
): void {
  block.innerHTML = `<div class="markdownMermaidDiagram">${result.svg}</div>`;
  // Official mermaid usage: bindFunctions attaches interactive event
  // listeners onto the just-inserted SVG. #564 does not implement
  // click/zoom/pan, but calling it (when present) costs nothing and keeps
  // this integration point ready for a later issue to build on.
  const diagramElement = block.querySelector(".markdownMermaidDiagram");
  if (diagramElement) {
    result.bindFunctions?.(diagramElement);
  }
}

function applyMermaidErrorState(
  block: HTMLElement,
  source: string,
  error: unknown,
  messages: MermaidPreviewMessages
): void {
  const rawErrorMessage = error instanceof Error ? error.message : String(error);
  block.innerHTML =
    `<div class="markdownMermaidError">` +
    `<p class="markdownMermaidErrorMessage">${escapeHtmlForMermaidResult(messages.errorMessage)}</p>` +
    `<p class="markdownMermaidErrorHint">${escapeHtmlForMermaidResult(messages.errorHint)}</p>` +
    `<details class="markdownMermaidErrorDetails">` +
    `<summary>${escapeHtmlForMermaidResult(messages.showDetailsLabel)}</summary>` +
    `<pre class="markdownMermaidErrorReason">${escapeHtmlForMermaidResult(rawErrorMessage)}</pre>` +
    `<pre class="markdownMermaidErrorSource">${escapeHtmlForMermaidResult(source)}</pre>` +
    `</details>` +
    `</div>`;
}

/**
 * Scans `container` for Mermaid placeholders and renders each one. Safe to
 * call unconditionally — a container with no placeholders is a no-op.
 *
 * `generation` must be a value the caller increments once per live preview
 * DOM commit (e.g. once per `useLayoutEffect` run that sets
 * `container.innerHTML`), so that concurrently in-flight renders from an
 * older commit can never be confused with the current one even before the
 * `isConnected` check runs.
 */
export function renderMermaidDiagramsInContainer(
  container: HTMLElement,
  generation: number,
  messages: MermaidPreviewMessages,
  renderFn: MermaidRenderFn = defaultMermaidRender
): void {
  const blocks = findMermaidPlaceholderContainers(container);

  blocks.forEach((block, index) => {
    const source = readMermaidSource(block).trim();

    if (source.length === 0) {
      applyMermaidEmptyState(block, messages);
      return;
    }

    const diagramId = `pergamum-mermaid-${generation}-${index}`;

    void renderFn(diagramId, source)
      .then((result) => {
        if (!block.isConnected) {
          // A newer preview commit already replaced this placeholder's
          // entire subtree — never insert a stale result (#564).
          return;
        }
        applyMermaidSuccessState(block, result);
      })
      .catch((error: unknown) => {
        if (!block.isConnected) {
          return;
        }
        applyMermaidErrorState(block, source, error, messages);
      });
  });
}

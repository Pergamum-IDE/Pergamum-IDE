import {
  Compartment,
  EditorState,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension
} from "@codemirror/state";
import {
  gutter,
  GutterMarker,
  type EditorView
} from "@codemirror/view";
import binocularsIcon from "../../../assets/icons/ionicons/editor/binoculars-outline.svg?raw";

// Shared across MarkdownEditor mount lifetimes so App-owned cached
// EditorStates can be reconfigured after EditorSurface unmount/remount.
export const activeFindGutterMarkerCompartment = new Compartment();

export interface ActiveFindGutterMarkerRange {
  readonly from: number;
  readonly to: number;
}

export interface ActiveFindGutterMarkerSpec {
  readonly matches: readonly ActiveFindGutterMarkerRange[];
}

export const setActiveFindGutterMarkersEffect =
  StateEffect.define<ActiveFindGutterMarkerSpec>();
export const clearActiveFindGutterMarkersEffect = StateEffect.define<null>();

class ActiveFindGutterMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-pergamum-findGutterMarker";
    element.setAttribute("aria-hidden", "true");
    element.innerHTML = binocularsIcon;
    return element;
  }
}

const activeFindGutterMarker = new ActiveFindGutterMarker();

function buildMarkerSet(
  spec: ActiveFindGutterMarkerSpec,
  state: EditorState
): RangeSet<GutterMarker> {
  const lineStarts = new Set<number>();

  for (const range of spec.matches) {
    const from = Math.max(0, Math.min(range.from, state.doc.length));
    const to = Math.max(from, Math.min(range.to, state.doc.length));

    if (to <= from) {
      continue;
    }

    const lastCoveredOffset = to - 1;
    let line = state.doc.lineAt(from);

    while (true) {
      lineStarts.add(line.from);

      if (line.to >= lastCoveredOffset || line.number === state.doc.lines) {
        break;
      }

      line = state.doc.line(line.number + 1);
    }
  }

  const builder = new RangeSetBuilder<GutterMarker>();

  for (const lineStart of [...lineStarts].sort((a, b) => a - b)) {
    builder.add(lineStart, lineStart, activeFindGutterMarker);
  }

  return builder.finish();
}

export const activeFindGutterMarkerField = StateField.define<
  RangeSet<GutterMarker>
>({
  create() {
    return RangeSet.empty;
  },
  update(value, transaction) {
    let next = transaction.docChanged ? value.map(transaction.changes) : value;

    for (const effect of transaction.effects) {
      if (effect.is(setActiveFindGutterMarkersEffect)) {
        next = buildMarkerSet(effect.value, transaction.state);
      } else if (effect.is(clearActiveFindGutterMarkersEffect)) {
        next = RangeSet.empty;
      }
    }

    return next;
  },
  provide: (field) =>
    gutter({
      class: "cm-pergamum-findGutter",
      markers: (view: EditorView) => view.state.field(field),
      initialSpacer: () => activeFindGutterMarker
    })
});

export function createActiveFindGutterMarkerExtension(enabled: boolean): Extension {
  return enabled ? activeFindGutterMarkerField : [];
}

export function hasActiveFindGutterMarkers(state: EditorState): boolean {
  return (state.field(activeFindGutterMarkerField, false)?.size ?? 0) > 0;
}

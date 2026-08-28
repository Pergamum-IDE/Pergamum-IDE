/**
 * #273: compile-time checks that `EditorViewState` stays plain, JSON-safe
 * data — no `EditorView` / `EditorState` / CodeMirror selection object /
 * transaction / DOM node / function / class instance in the shape — and
 * that the three `applyEditorViewState` outcomes stay distinguishable.
 */

import type {
  ApplyEditorViewStateResult,
  EditorViewState,
  SerializableEditorSelection,
  SerializableScrollState
} from "./editorViewState";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

// A representative EditorViewState literal must be expressible purely as
// JSON. Adding a CodeMirror object, a function, or a class instance to any
// of these shapes would break one of these assignments.
const forwardSelectionState = {
  contentDigest: { algorithm: "sha256", digest: "0".repeat(64) },
  selection: { anchor: 2, head: 8 },
  scroll: { top: 120, left: 0 }
} satisfies EditorViewState;

const caretOnlyState = {
  contentDigest: { algorithm: "sha256", digest: "0".repeat(64) },
  selection: { anchor: 0, head: 0 },
  scroll: null
} satisfies EditorViewState;

const forwardSelectionStateAsJson: JsonValue = forwardSelectionState;
const caretOnlyStateAsJson: JsonValue = caretOnlyState;
void forwardSelectionStateAsJson;
void caretOnlyStateAsJson;

const selectionAsJson: JsonValue = {
  anchor: 0,
  head: 4
} satisfies SerializableEditorSelection;
void selectionAsJson;

const scrollAsJson: JsonValue = {
  top: 0,
  left: 0
} satisfies SerializableScrollState;
void scrollAsJson;

// The digest algorithm is a fixed literal, never an arbitrary string.
// @ts-expect-error "md5" is not a supported digest algorithm.
const wrongAlgorithm: EditorViewState["contentDigest"]["algorithm"] = "md5";
void wrongAlgorithm;

// A later Session Restore caller must be able to tell the outcomes apart.
function describeResult(result: ApplyEditorViewStateResult): string {
  switch (result.status) {
    case "applied":
      return "applied";
    case "contentMismatch":
      return "contentMismatch";
    case "fallback":
      return result.reasons.join(",");
  }
}
void describeResult;

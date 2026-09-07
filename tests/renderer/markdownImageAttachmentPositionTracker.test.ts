import { describe, expect, it } from "vitest";
import { EditorState, type ChangeSpec } from "@codemirror/state";
import {
  addPendingImageAttachmentPosition,
  clearPendingImageAttachmentPosition,
  createMarkdownImageAttachmentPositionTrackingExtension,
  resolvePendingImageAttachmentPosition
} from "../../src/renderer/markdownImageAttachmentPositionTracker";

function baseState(doc = "abcdef"): EditorState {
  return EditorState.create({
    doc,
    extensions: [createMarkdownImageAttachmentPositionTrackingExtension()]
  });
}

function addMarker(
  state: EditorState,
  id: string,
  position: number
): EditorState {
  return state.update({
    effects: addPendingImageAttachmentPosition.of({ id, position })
  }).state;
}

function change(state: EditorState, changes: ChangeSpec): EditorState {
  return state.update({ changes }).state;
}

describe("markdown image attachment position tracking (#407 B3)", () => {
  it("keeps the initial paste position when a marker is added", () => {
    const state = addMarker(baseState(), "pending-1", 3);

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 3,
      position: 3
    });
  });

  it("moves forward when text is inserted before the paste position", () => {
    const state = change(addMarker(baseState(), "pending-1", 3), {
      from: 0,
      to: 0,
      insert: "xx"
    });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 3,
      position: 5
    });
  });

  it("does not move when text is inserted after the paste position", () => {
    const state = change(addMarker(baseState(), "pending-1", 3), {
      from: 5,
      to: 5,
      insert: "xx"
    });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 3,
      position: 3
    });
  });

  it("stays associated with the character before the paste point for same-position insertions", () => {
    const state = change(addMarker(baseState(), "pending-1", 3), {
      from: 3,
      to: 3,
      insert: "xx"
    });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 3,
      position: 3
    });
  });

  it("moves backward when text before the paste position is deleted", () => {
    const state = change(addMarker(baseState(), "pending-1", 4), {
      from: 1,
      to: 3,
      insert: ""
    });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 4,
      position: 2
    });
  });

  it("marks the pending position unresolved when deletion covers it", () => {
    const state = change(addMarker(baseState(), "pending-1", 3), {
      from: 2,
      to: 4,
      insert: ""
    });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: false,
      id: "pending-1",
      initialPosition: 3,
      reason: "deleted"
    });
  });

  it("does not mark deleted when a deletion ends exactly at the marker position", () => {
    const state = change(addMarker(baseState(), "pending-1", 3), {
      from: 1,
      to: 3,
      insert: ""
    });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 3,
      position: 1
    });
  });

  it("does not mark deleted when a deletion starts exactly at the marker position", () => {
    const state = change(addMarker(baseState(), "pending-1", 3), {
      from: 3,
      to: 5,
      insert: ""
    });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 3,
      position: 3
    });
  });

  it("returns null for a state without the position tracking extension", () => {
    const state = EditorState.create({ doc: "abcdef" });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toBeNull();
  });

  it("clears a marker by pending id", () => {
    const state = addMarker(baseState(), "pending-1", 3).update({
      effects: clearPendingImageAttachmentPosition.of("pending-1")
    }).state;

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toBeNull();
  });

  it("tracks multiple pending image positions independently", () => {
    const withMarkers = addMarker(
      addMarker(baseState(), "pending-1", 1),
      "pending-2",
      5
    );
    const state = change(withMarkers, {
      from: 2,
      to: 2,
      insert: "xxx"
    });

    expect(resolvePendingImageAttachmentPosition(state, "pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 1,
      position: 1
    });
    expect(resolvePendingImageAttachmentPosition(state, "pending-2")).toEqual({
      ok: true,
      id: "pending-2",
      initialPosition: 5,
      position: 8
    });
  });
});

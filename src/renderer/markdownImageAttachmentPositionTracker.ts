import {
  MapMode,
  StateEffect,
  StateField,
  type EditorState,
  type Extension
} from "@codemirror/state";

export interface PendingImageAttachmentPosition {
  readonly id: string;
  readonly initialPosition: number;
  readonly position: number;
  readonly status: "active" | "deleted";
}

export type PendingImageAttachmentPositionResolution =
  | {
      readonly ok: true;
      readonly id: string;
      readonly initialPosition: number;
      readonly position: number;
    }
  | {
      readonly ok: false;
      readonly id: string;
      readonly initialPosition: number;
      readonly reason: "deleted";
    }
  | null;

export interface AddPendingImageAttachmentPosition {
  readonly id: string;
  readonly position: number;
}

export const addPendingImageAttachmentPosition =
  StateEffect.define<AddPendingImageAttachmentPosition>();

export const clearPendingImageAttachmentPosition =
  StateEffect.define<string>();

export const pendingImageAttachmentPositionField = StateField.define<
  ReadonlyMap<string, PendingImageAttachmentPosition>
>({
  create: () => new Map(),
  update: (value, transaction) => {
    let next: Map<string, PendingImageAttachmentPosition> | null = null;

    function mutable(): Map<string, PendingImageAttachmentPosition> {
      if (!next) {
        next = new Map(value);
      }
      return next;
    }

    if (transaction.docChanged && value.size > 0) {
      next = new Map();
      for (const marker of value.values()) {
        if (marker.status === "deleted") {
          next.set(marker.id, marker);
          continue;
        }

        // Paste is an insertion point, associated with the character before it:
        // insertions at the exact point land after the marker, while deletions
        // crossing the point return null and make the marker unresolved.
        const mappedPosition = transaction.changes.mapPos(
          marker.position,
          -1,
          MapMode.TrackDel
        );

        next.set(
          marker.id,
          mappedPosition === null
            ? { ...marker, status: "deleted" }
            : { ...marker, position: mappedPosition }
        );
      }
    }

    for (const effect of transaction.effects) {
      if (effect.is(addPendingImageAttachmentPosition)) {
        const docLength = transaction.state.doc.length;
        const position = Math.max(
          0,
          Math.min(effect.value.position, docLength)
        );

        mutable().set(effect.value.id, {
          id: effect.value.id,
          initialPosition: position,
          position,
          status: "active"
        });
      } else if (effect.is(clearPendingImageAttachmentPosition)) {
        mutable().delete(effect.value);
      }
    }

    return next ?? value;
  }
});

export function createMarkdownImageAttachmentPositionTrackingExtension(): Extension {
  return pendingImageAttachmentPositionField;
}

export function resolvePendingImageAttachmentPosition(
  state: EditorState,
  id: string
): PendingImageAttachmentPositionResolution {
  const marker = state
    .field(pendingImageAttachmentPositionField, false)
    ?.get(id);

  if (!marker) {
    return null;
  }

  if (marker.status === "deleted") {
    return {
      ok: false,
      id: marker.id,
      initialPosition: marker.initialPosition,
      reason: "deleted"
    };
  }

  return {
    ok: true,
    id: marker.id,
    initialPosition: marker.initialPosition,
    position: marker.position
  };
}

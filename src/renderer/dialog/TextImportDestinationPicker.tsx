import { useCallback, useEffect, useState } from "react";
import type { Translate } from "../../shared/i18n";
import { InfoDialog } from "./InfoDialog";

/**
 * #420 Step 3: a lazy, project-scoped folder tree for choosing the bulk text
 * import destination. It never touches the filesystem itself — every level is
 * fetched through {@link listFolders} (the `projects:listFileExplorerChildren`
 * IPC, which is the real containment / protected-path boundary and already
 * hides `.pergamum*` and other reserved entries). Only folders are shown;
 * files can never be selected. The project root is always selectable.
 */
export interface TextImportDestinationFolder {
  readonly name: string;
  readonly relativePath: string;
}

export type TextImportFolderListing =
  | { readonly ok: true; readonly folders: readonly TextImportDestinationFolder[] }
  | { readonly ok: false };

export interface TextImportDestinationPickerProps {
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onCancel: () => void;
  /** Called with the chosen project-relative folder path (`""` = root). */
  readonly onConfirm: (destinationFolderProjectRelativePath: string) => void;
  readonly listFolders: (
    directoryRelativePath: string | null
  ) => Promise<TextImportFolderListing>;
}

interface FolderNode {
  readonly relativePath: string;
  readonly children: readonly TextImportDestinationFolder[] | "loading" | "failed";
}

export function TextImportDestinationPicker({
  translate,
  opener,
  onCancel,
  onConfirm,
  listFolders
}: TextImportDestinationPickerProps): JSX.Element {
  const [selected, setSelected] = useState<string>("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [nodes, setNodes] = useState<Record<string, FolderNode>>({});

  const loadFolder = useCallback(
    async (relativePath: string) => {
      setNodes((current) => ({
        ...current,
        [relativePath]: { relativePath, children: "loading" }
      }));
      const listing = await listFolders(
        relativePath.length === 0 ? null : relativePath
      );
      setNodes((current) => ({
        ...current,
        [relativePath]: {
          relativePath,
          children: listing.ok ? listing.folders : "failed"
        }
      }));
    },
    [listFolders]
  );

  useEffect(() => {
    void loadFolder("");
  }, [loadFolder]);

  const toggle = useCallback(
    (relativePath: string) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(relativePath)) {
          next.delete(relativePath);
        } else {
          next.add(relativePath);
          if (!nodes[relativePath]) {
            void loadFolder(relativePath);
          }
        }
        return next;
      });
    },
    [loadFolder, nodes]
  );

  const renderChildren = (parentRelativePath: string, depth: number): JSX.Element => {
    const node = nodes[parentRelativePath];
    if (!node || node.children === "loading") {
      return (
        <p
          className="textImportDestinationPickerLoading"
          style={{ paddingInlineStart: `${depth * 16}px` }}
        >
          {translate("textImport.dialog.checkingTargets")}
        </p>
      );
    }
    if (node.children === "failed") {
      return (
        <p
          className="textImportDestinationPickerFailed"
          role="alert"
          style={{ paddingInlineStart: `${depth * 16}px` }}
        >
          {translate("textImport.dialog.destinationPickerLoadFailed")}
        </p>
      );
    }
    return (
      <ul className="textImportDestinationPickerList" role="group">
        {node.children.map((folder) => {
          const isExpanded = expanded.has(folder.relativePath);
          const isSelected = selected === folder.relativePath;
          return (
            <li key={folder.relativePath}>
              <div
                className="textImportDestinationPickerRow"
                style={{ paddingInlineStart: `${depth * 16}px` }}
              >
                <button
                  type="button"
                  className="textImportDestinationPickerTwisty"
                  aria-label={translate(
                    isExpanded
                      ? "textImport.dialog.destinationPickerCollapse"
                      : "textImport.dialog.destinationPickerExpand",
                    { name: folder.name }
                  )}
                  aria-expanded={isExpanded}
                  onClick={() => toggle(folder.relativePath)}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={
                    isSelected
                      ? "textImportDestinationPickerName isSelected"
                      : "textImportDestinationPickerName"
                  }
                  data-destination-path={folder.relativePath}
                  onClick={() => setSelected(folder.relativePath)}
                  onDoubleClick={() => onConfirm(folder.relativePath)}
                >
                  {folder.name}
                </button>
              </div>
              {isExpanded ? renderChildren(folder.relativePath, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <InfoDialog
      title={translate("textImport.dialog.destinationPickerTitle")}
      opener={opener}
      onClose={onCancel}
      className="textImportDestinationPickerDialog"
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton"
            onClick={onCancel}
          >
            {translate("textImport.dialog.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm textImportDestinationPickerConfirm"
            onClick={() => onConfirm(selected)}
          >
            {translate("textImport.dialog.destinationPickerConfirm")}
          </button>
        </div>
      }
    >
      <div
        className="textImportDestinationPickerTree"
        role="radiogroup"
        aria-label={translate("textImport.dialog.destinationPickerTitle")}
      >
        <button
          type="button"
          role="radio"
          aria-checked={selected === ""}
          className={
            selected === ""
              ? "textImportDestinationPickerName textImportDestinationPickerRoot isSelected"
              : "textImportDestinationPickerName textImportDestinationPickerRoot"
          }
          data-destination-path=""
          onClick={() => setSelected("")}
          onDoubleClick={() => onConfirm("")}
        >
          {translate("textImport.dialog.destinationPickerRoot")}
        </button>
        {renderChildren("", 1)}
      </div>
    </InfoDialog>
  );
}

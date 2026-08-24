import type { AppDialogMessage } from "./appDialogTypes";

export interface DialogMessageProps {
  readonly id: string;
  readonly message: AppDialogMessage;
}

export function DialogMessage({
  id,
  message
}: DialogMessageProps): JSX.Element {
  if (message.kind === "plainText") {
    return (
      <p id={id} className="appDialogMessage">
        {message.text}
      </p>
    );
  }

  return (
    <div id={id} className="appDialogMessage appDialogMessage-blocks">
      {message.beforeText ? (
        <p className="appDialogMessageText">{message.beforeText}</p>
      ) : null}
      <div className="appDialogPathBlock">
        <div className="appDialogPathBlockLabel">{message.pathBlock.label}</div>
        <div className="appDialogPathBlockValue">
          {message.pathBlock.value}
        </div>
      </div>
      {message.afterText ? (
        <p className="appDialogMessageText">{message.afterText}</p>
      ) : null}
    </div>
  );
}

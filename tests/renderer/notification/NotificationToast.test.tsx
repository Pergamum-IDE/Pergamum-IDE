import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationToast } from "../../../src/renderer/notification/NotificationToast";

function render(
  props: Partial<React.ComponentProps<typeof NotificationToast>> = {}
): string {
  return renderToStaticMarkup(
    React.createElement(NotificationToast, {
      message: "プロジェクト外のファイルを開きました",
      closeButtonLabel: "通知を閉じる",
      onDismiss: () => undefined,
      ...props
    })
  );
}

describe("NotificationToast (#266)", () => {
  it("renders the message as plain text DOM", () => {
    const markup = render({ message: "hello world" });

    expect(markup).toContain(
      '<span class="notificationToastMessage">hello world</span>'
    );
  });

  it("renders a real, keyboard-operable close button with an accessible name from i18n", () => {
    const markup = render({ closeButtonLabel: "Dismiss notification" });

    expect(markup).toContain('type="button"');
    expect(markup).toContain('class="notificationToastClose"');
    expect(markup).toContain('aria-label="Dismiss notification"');
  });

  it("keeps the × glyph decorative (aria-hidden) so only the accessible name is announced", () => {
    const markup = render();

    expect(markup).toContain('<span aria-hidden="true">×</span>');
  });

  it("places the close button after the message content (inline-end of the toast)", () => {
    const markup = render();

    expect(markup.indexOf("notificationToastMessage")).toBeLessThan(
      markup.indexOf("notificationToastClose")
    );
  });

  it("does not set autofocus or tabindex on the toast or its button (a toast must not grab focus)", () => {
    const markup = render();

    expect(markup).not.toContain("autofocus");
    expect(markup).not.toContain("autoFocus");
    expect(markup).not.toContain("tabindex");
  });
});

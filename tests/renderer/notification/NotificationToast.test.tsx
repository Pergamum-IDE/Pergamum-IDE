import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NotificationToast,
  notificationToastPlacementStyle
} from "../../../src/renderer/notification/NotificationToast";

function render(
  props: Partial<React.ComponentProps<typeof NotificationToast>> = {}
): string {
  return renderToStaticMarkup(
    React.createElement(NotificationToast, {
      message: "プロジェクト外のファイルを開きました",
      icon: { kind: "none" },
      closeButtonLabel: "通知を閉じる",
      onDismiss: () => undefined,
      ...props
    })
  );
}

describe("NotificationToast (#266)", () => {
  it("renders the message as plain text DOM", () => {
    const markup = render({ message: "hello world" });

    expect(markup).toContain("notificationToastMessage");
    expect(markup).toContain("hello world");
    expect(markup).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders preset icons as decorative img elements and renders no icon area for none", () => {
    const withIcon = render({ icon: { kind: "preset", name: "pergamum" } });
    const withoutIcon = render({ icon: { kind: "none" } });

    expect(withIcon).toContain("notificationToastIcon");
    expect(withIcon).toContain('alt=""');
    expect(withIcon).toContain('aria-hidden="true"');
    expect(withoutIcon).not.toContain("notificationToastIcon");
  });

  it("maps the pergamum preset to the trusted bundled file-association asset and keeps credits compatible", () => {
    const source = readFileSync(
      "src/renderer/notification/NotificationToast.tsx",
      "utf8"
    );

    expect(source).toContain(
      "assets/icons/file-associations/pergamum/pergamum-scroll-file-icon.svg?url"
    );
    expect(source).toContain("pergamum: pergamumIconUrl");
    expect(source).toContain("credits: helpCircleIconUrl");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders detail rows as plain description-list text, not HTML or Markdown", () => {
    const markup = render({
      message: "Credits",
      detailRows: [
        { label: "System Architect", value: "ChatGPT" },
        { label: "Programmers", value: "Claude Code, Codex, Antigravity" }
      ]
    });

    expect(markup).toContain("notificationToastDetailRows");
    expect(markup).toContain("notificationToast-detailCard");
    expect(markup).toContain("<dt>System Architect</dt>");
    expect(markup).toContain("<dd>ChatGPT</dd>");
    expect(markup).not.toContain("dangerouslySetInnerHTML");
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

  it("renders an optional command action as a keyboard-operable button without dismissing by itself", () => {
    const markup = render({
      actionLabel: "Open",
      onAction: () => undefined
    });

    expect(markup).toContain('type="button"');
    expect(markup).toContain('class="notificationToastAction"');
    expect(markup).toContain(">Open</button>");
  });

  it("uses motion classes without inventing warning or error variants", () => {
    const markup = render({ motion: { kind: "fade" } });

    expect(markup).toContain("notificationToast-motionFade");
    expect(markup).not.toMatch(/warning|error/i);
  });

  it("marks anchored detail cards so they can use a calmer local animation", () => {
    const markup = render({
      motion: { kind: "fade" },
      placement: {
        kind: "anchorRect",
        rect: { x: 20, y: 30, width: 40, height: 50 },
        preferredPlacement: "below"
      },
      detailRows: [{ label: "Gopher / Dogfood Tester", value: "Kentaro Motoki" }]
    });

    expect(markup).toContain("notificationToast-detailCard");
    expect(markup).toContain("notificationToast-placementAnchor");
    expect(markup).toContain("notificationToast-motionFade");
    expect(markup).not.toContain("notificationToast-motionSlideUpFade");
  });

  it("does not set autofocus or tabindex on the toast or its button (a toast must not grab focus)", () => {
    const markup = render();

    expect(markup).not.toContain("autofocus");
    expect(markup).not.toContain("autoFocus");
    expect(markup).not.toContain("tabindex");
  });

  it("clamps anchorRect placement inside the viewport and falls back for viewport placement", () => {
    expect(
      notificationToastPlacementStyle({ kind: "viewportBottomEnd" }, {
        width: 800,
        height: 600
      })
    ).toBeUndefined();
    expect(
      notificationToastPlacementStyle(
        {
          kind: "anchorRect",
          rect: { x: 790, y: 590, width: 20, height: 20 },
          preferredPlacement: "below"
        },
        { width: 800, height: 600 }
      )
    ).toMatchObject({
      position: "fixed",
      insetInlineStart: "424px",
      insetBlockStart: "424px"
    });
    expect(
      notificationToastPlacementStyle(
        {
          kind: "anchorRect",
          rect: { x: 900, y: 590, width: 20, height: 20 },
          preferredPlacement: "below"
        },
        { width: 800, height: 600 }
      )
    ).toBeUndefined();
  });

  it("uses the wider detail-card estimate for anchored detail-row placement", () => {
    expect(
      notificationToastPlacementStyle(
        {
          kind: "anchorRect",
          rect: { x: 790, y: 590, width: 20, height: 20 },
          preferredPlacement: "below"
        },
        { width: 800, height: 600 },
        { detailCard: true }
      )
    ).toMatchObject({
      position: "fixed",
      insetInlineStart: "264px",
      insetBlockStart: "200px"
    });
  });

  it("styles detail-row toasts as wider cards without anywhere wrapping in the credits rows", () => {
    const css = readFileSync("src/renderer/styles.css", "utf8");
    const ruleBlock = (selector: string): string => {
      const start = css.indexOf(selector);
      const end = css.indexOf("\n}", start);

      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);

      return css.slice(start, end + 2);
    };

    const detailCardBlock = ruleBlock(".notificationToast-detailCard");
    const slideUpFadeBlock = ruleBlock(".notificationToast-motionSlideUpFade");
    const fadeBlock = ruleBlock(".notificationToast-motionFade");
    const anchoredDetailCardFadeBlock = ruleBlock(
      ".notificationToast-placementAnchor.notificationToast-detailCard.notificationToast-motionFade"
    );
    const detailRowsBlock = ruleBlock(
      ".notificationToastDetailRows dt,\n.notificationToastDetailRows dd"
    );
    const reduceMotionBlock = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("@keyframes notificationToastMarquee"))
    );

    expect(detailCardBlock).toContain("32.5rem");
    expect(slideUpFadeBlock).toContain(
      "animation: notificationToastSlideUpFade 160ms ease-out"
    );
    expect(fadeBlock).toContain("animation: notificationToastFade 160ms ease-out");
    expect(anchoredDetailCardFadeBlock).toContain(
      "animation: notificationToastDetailCardFade 220ms ease-out"
    );
    expect(anchoredDetailCardFadeBlock).toContain(
      "transform-origin: center top"
    );
    expect(detailRowsBlock).toContain("overflow-wrap: normal");
    expect(detailRowsBlock).not.toContain("overflow-wrap: anywhere");
    expect(reduceMotionBlock).toContain(".notificationToast-motionFade");
    expect(reduceMotionBlock).toContain(
      ".notificationToast-placementAnchor.notificationToast-detailCard.notificationToast-motionFade"
    );
    expect(reduceMotionBlock).toContain("animation: none");
  });
});

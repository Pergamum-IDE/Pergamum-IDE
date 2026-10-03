// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  handlePreviewLinkClick,
  type PreviewExternalLinkDeps
} from "../../src/renderer/previewExternalLink";
import { t } from "../../src/shared/i18n";

function preview(html: string): HTMLElement {
  document.body.innerHTML = `<article class="preview">${html}</article>`;
  return document.querySelector("article") as HTMLElement;
}

function click(target: Element, deps: PreviewExternalLinkDeps) {
  const event = {
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  };
  const handled = handlePreviewLinkClick(event, deps);

  return { event, handled };
}

function makeDeps(confirmed: boolean) {
  const confirmOpen = vi.fn(() => Promise.resolve(confirmed));
  const openExternal = vi.fn(() => Promise.resolve());

  return { confirmOpen, openExternal };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("handlePreviewLinkClick", () => {
  it.each(["http://example.com", "https://example.com"])(
    "%s: prevents navigation and asks for confirmation with the canonical URL",
    async (href) => {
      const root = preview(`<a href="${href}">Example</a>`);
      const deps = makeDeps(false);
      const { event, handled } = click(root.querySelector("a")!, deps);
      await flush();

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.confirmOpen).toHaveBeenCalledWith(`${href}/`);
    }
  );

  it("does nothing when the user cancels", async () => {
    const root = preview('<a href="https://example.com">x</a>');
    const deps = makeDeps(false);
    click(root.querySelector("a")!, deps);
    await flush();

    expect(deps.openExternal).not.toHaveBeenCalled();
  });

  it("opens exactly once, with the validated URL, when the user confirms", async () => {
    const root = preview('<a href="http://example.com/a">x</a>');
    const deps = makeDeps(true);
    click(root.querySelector("a")!, deps);
    await flush();

    expect(deps.openExternal).toHaveBeenCalledTimes(1);
    expect(deps.openExternal).toHaveBeenCalledWith("http://example.com/a");
  });

  it("finds the anchor when a nested element is clicked", async () => {
    const root = preview('<a href="https://example.com"><strong>bold</strong></a>');
    const deps = makeDeps(true);
    click(root.querySelector("strong")!, deps);
    await flush();

    expect(deps.openExternal).toHaveBeenCalledWith("https://example.com/");
  });

  it.each([
    "file:///C:/Windows/System32/notepad.exe",
    "mailto:test@example.com",
    "ftp://example.com/",
    "javascript:alert(1)",
    "data:text/html,x",
    "custom://thing",
    "./foo.md",
    "../bar.txt"
  ])("%s: navigation prevented, no dialog, nothing opened", async (href) => {
    const root = preview(`<a href="${href}">x</a>`);
    const deps = makeDeps(true);
    const { event } = click(root.querySelector("a")!, deps);
    await flush();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.confirmOpen).not.toHaveBeenCalled();
    expect(deps.openExternal).not.toHaveBeenCalled();
  });

  it("leaves a hash-only link alone (in-page anchor)", async () => {
    const root = preview('<a href="#heading">jump</a>');
    const deps = makeDeps(true);
    const { event, handled } = click(root.querySelector("a")!, deps);
    await flush();

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(deps.confirmOpen).not.toHaveBeenCalled();
  });

  it("ignores anchors outside a Preview surface and non-link clicks", () => {
    document.body.innerHTML = '<a id="out" href="https://example.com">x</a><article class="preview"><p id="p">t</p></article>';
    const deps = makeDeps(true);

    expect(click(document.getElementById("out")!, deps).handled).toBe(false);
    expect(click(document.getElementById("p")!, deps).handled).toBe(false);
    expect(deps.confirmOpen).not.toHaveBeenCalled();
  });
});

describe("external link confirmation dialog wiring", () => {
  it("has ja / en copy and reuses the common Cancel / Open labels", () => {
    expect(t("ja", "dialog.externalLink.title")).toBe("外部サイトを開く");
    expect(t("ja", "dialog.externalLink.message", { url: "https://example.com/" })).toBe(
      "外部サイトを開きます。\n\nURL: https://example.com/"
    );
    expect(t("ja", "common.cancel")).toBe("キャンセル");
    expect(t("ja", "common.open")).toBe("開く");
    expect(t("en", "dialog.externalLink.title")).toBe("Open External Site");
    expect(t("en", "dialog.externalLink.message", { url: "https://example.com/" })).toBe(
      "An external site will be opened.\n\nURL: https://example.com/"
    );
    expect(t("en", "common.cancel")).toBe("Cancel");
    expect(t("en", "common.open")).toBe("Open");
  });

  it("uses the external-link icon and a plain-text message in App", () => {
    const app = readFileSync("src/renderer/App.tsx", "utf8");
    const block = app.slice(app.indexOf("previewExternalLinkDepsRef.current = {"));
    const code = block.slice(0, block.indexOf("useEffect(() => {"));

    expect(code).toContain('kind: "externalLink"');
    expect(code).toContain('kind: "plainText"');
    expect(code).toContain('translate("common.open")');
    expect(code).not.toContain('kind: "warning"');
    expect(code).not.toContain('kind: "error"');
    expect(readFileSync("src/renderer/dialog/dialogIcons.ts", "utf8")).toContain(
      "assets/icons/codicons/dialog/link-external.svg?raw"
    );
  });
});

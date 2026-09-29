import type { CSSProperties } from "react";

export type MaskedIconProps = {
  /** Bundled SVG asset URL (a Vite `?url` import). */
  readonly url: string;
  readonly className?: string;
  readonly title?: string;
  /** Exposes the icon to assistive tech (default: decorative, hidden). */
  readonly label?: string;
} & {
  // `data-*` markers are passed straight through to the span.
  readonly [dataAttribute: `data-${string}`]: string | undefined;
};

/**
 * #623: theme-aware monochrome icon.
 *
 * `<img src="icon.svg">` renders an SVG as an isolated image: `currentColor`
 * inside it does not inherit from the page (it is always black), and
 * fixed-fill icons ignore CSS color entirely, so such icons vanish on a dark
 * theme. Here the SVG is used only as an alpha mask and the visible color is
 * the element's own `background-color: currentColor` (see `.maskedIcon` in
 * styles.css) — one mechanism that follows any theme, with no per-icon color
 * and no `filter: invert`. Use it for single-color icons only; multi-color
 * artwork (logo, file-association icon) stays an <img>.
 */
export function MaskedIcon({
  url,
  className,
  title,
  label,
  ...dataAttributes
}: MaskedIconProps): JSX.Element {
  const style = { "--masked-icon-url": `url("${url}")` } as CSSProperties;

  return (
    <span
      className={className ? `maskedIcon ${className}` : "maskedIcon"}
      style={style}
      title={title}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      {...dataAttributes}
    />
  );
}

import type { RubyMarkupRule } from "./settings";

export interface ApplyRubyMarkupOptions {
  readonly text: string;
  readonly rule: RubyMarkupRule;
  readonly rubyText: string;
}

/**
 * Pure ruby markup generator for Aozora Bunko.
 */
export function applyRubyMarkup(options: ApplyRubyMarkupOptions): string {
  const { text, rule, rubyText } = options;

  if (text.length === 0) {
    return "";
  }

  switch (rule) {
    case "aozora":
      return `｜${text}《${rubyText}》`;
  }
}

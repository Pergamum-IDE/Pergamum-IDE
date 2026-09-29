// textlint-rule-preset-japanese ships no type definitions. Only the surface
// the wrapper reads is declared; the rule objects stay opaque to us.
declare module "textlint-rule-preset-japanese" {
  const preset: {
    readonly rules: Readonly<Record<string, unknown>>;
    readonly rulesConfig: Readonly<Record<string, unknown>>;
  };
  export default preset;
}

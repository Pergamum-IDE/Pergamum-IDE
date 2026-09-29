import path from "node:path";

/**
 * Where kuromoji's dictionary lives, resolved in ONE place (the Linter Worker
 * Host hands the result to the Worker; the instant-check IPC uses it too).
 *
 * The dictionary is read from disk at runtime by kuromoji, so it is shipped
 * as an unpacked resource (forge.config.js `asar.unpack`), not inside the
 * asar archive:
 *   - packaged: <resourcesPath>/app.asar.unpacked/node_modules/kuromoji/dict
 *   - development: <appPath>/node_modules/kuromoji/dict
 * The Worker never resolves it itself (no `require.resolve("kuromoji")`).
 */
export interface JapaneseLintDictionaryEnvironment {
  readonly isPackaged: boolean;
  /** `process.resourcesPath` of the packaged app. */
  readonly resourcesPath: string;
  /** `app.getAppPath()`. */
  readonly appPath: string;
}

export const japaneseLintDictionaryProbeFile = "base.dat.gz";

export function resolveJapaneseLintDictionaryPath(
  environment: JapaneseLintDictionaryEnvironment
): string {
  return environment.isPackaged
    ? path.join(
        environment.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "kuromoji",
        "dict"
      )
    : path.join(environment.appPath, "node_modules", "kuromoji", "dict");
}

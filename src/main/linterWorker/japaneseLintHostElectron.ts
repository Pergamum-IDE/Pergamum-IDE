import {
  app,
  MessageChannelMain,
  utilityProcess,
  type MessagePortMain
} from "electron";
import path from "node:path";
import {
  createJapaneseLintHost,
  type JapaneseLintHost,
  type JapaneseLintHostChild,
  type JapaneseLintHostDeps,
  type JapaneseLintHostPort
} from "./japaneseLintHost";
import { resolveJapaneseLintDictionaryPath } from "./japaneseLintDictionary";

/**
 * The Electron wiring of the Linter Worker Host: a real `utilityProcess`, a
 * real `MessageChannelMain` port pair, and the packaged-app dictionary path.
 * Deliberately thin - all behavior is in japaneseLintHost.ts, which is tested
 * against an in-memory Worker.
 *
 * Foundation slice: nothing in the app creates this yet (the instant check
 * still runs textlint in-process); it exists so the next slices can.
 */

/** The Worker bundle sits next to main.js (`.vite/build`, inside app.asar). */
export function resolveJapaneseLintWorkerEntry(mainDirectory: string): string {
  return path.join(mainDirectory, "japaneseLintWorker.js");
}

export interface ElectronJapaneseLintHostOptions
  extends Pick<
    JapaneseLintHostDeps,
    "logger" | "getSettings" | "onExit" | "timeouts"
  > {
  /** Directory of the running main bundle (`__dirname` of main.js). */
  readonly mainDirectory?: string;
  /** Overrides the Electron-based dictionary path (for verification). */
  readonly resolveDictionaryPath?: () => string;
}

export function createElectronJapaneseLintHost(
  options: ElectronJapaneseLintHostOptions
): JapaneseLintHost {
  const mainDirectory = options.mainDirectory ?? __dirname;

  return createJapaneseLintHost({
    logger: options.logger,
    getSettings: options.getSettings,
    ...(options.onExit ? { onExit: options.onExit } : {}),
    ...(options.timeouts ? { timeouts: options.timeouts } : {}),
    fork: (): JapaneseLintHostChild => {
      // stdio "ignore": the Worker's raw stdout / stderr is never captured,
      // so nothing it prints can reach a log.
      const forked = utilityProcess.fork(
        resolveJapaneseLintWorkerEntry(mainDirectory),
        [],
        { serviceName: "Pergamum Japanese Linter", stdio: "ignore" }
      );

      return {
        get pid() {
          return forked.pid;
        },
        postMessage: (message, transfer) =>
          forked.postMessage(message, transfer as MessagePortMain[] | undefined),
        kill: () => forked.kill(),
        on: (event: "exit" | "error", listener: never) =>
          forked.on(event as "exit", listener)
      } as JapaneseLintHostChild;
    },
    createChannel: () => {
      const { port1, port2 } = new MessageChannelMain();

      return { port1, port2: port2 as unknown as JapaneseLintHostPort };
    },
    resolveDictionaryPath:
      options.resolveDictionaryPath ??
      (() =>
        resolveJapaneseLintDictionaryPath({
          isPackaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          appPath: app.getAppPath()
        }))
  });
}

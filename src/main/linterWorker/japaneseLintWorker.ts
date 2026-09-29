import { lintJapanese } from "../textlint/japaneseLintEngine";
import {
  createJapaneseLintWorkerCore,
  dictionaryDirectoryExists,
  type JapaneseLintWorkerCore
} from "./japaneseLintWorkerCore";

/**
 * Entry of the Japanese Linter Worker, run by the Main Process through
 * Electron's `utilityProcess.fork` (see japaneseLintHostElectron.ts). It is a
 * separate bundle (forge.config.js) and imports neither Electron nor the
 * app: a crash here can only ever end this process.
 *
 * Transport: the Host's first message hands over a MessagePort
 * (`{ type: "connect" }` + port); everything after that travels on it.
 *
 * textlint and kuromoji run HERE, never in the Main Process: a long lint (or
 * a crash) cannot freeze or take down the app.
 */

interface ParentPort {
  once(
    event: "message",
    listener: (event: { data: unknown; ports: MessagePortLike[] }) => void
  ): void;
}

interface MessagePortLike {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
  start(): void;
}

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort })
  .parentPort;

let core: JapaneseLintWorkerCore | null = null;

// An uncaught exception leaves the process in an unknown state: tell the Host
// (sanitized) and end. Without a connected port there is nobody to tell.
process.on("uncaughtException", (error) => {
  if (core !== null) {
    core.reportFatal("uncaught-exception", error);

    return;
  }

  process.exit(1);
});

// A leaked rejection (textlint rules do not always await every promise they
// create) is reported, but does not by itself end a healthy Worker; a job
// that really hangs is ended by the Host's timeout / cancel.
process.on("unhandledRejection", (reason) => {
  if (core !== null) {
    core.reportError("unhandled-rejection", reason);

    return;
  }

  process.exit(1);
});

if (parentPort === undefined) {
  process.exit(1);
} else {
  parentPort.once("message", (event) => {
    const port = event.ports[0];

    if (port === undefined) {
      process.exit(1);

      return;
    }

    core = createJapaneseLintWorkerCore({
      send: (response) => port.postMessage(response),
      // A message posted just before exit needs a moment to leave the port.
      exit: (code) => {
        setTimeout(() => process.exit(code), 50);
      },
      dictionaryExists: dictionaryDirectoryExists,
      // kuromojin reads its dictionary location from this variable; the Host
      // resolved the path, so nothing here looks for kuromoji on disk.
      setDictionaryPath: (dictionaryPath) => {
        process.env.KUROMOJIN_DIC_PATH = dictionaryPath;
      },
      lint: (source, { format, ext, rules }) =>
        format === "markdown"
          ? lintJapanese(source, {
              format: "markdown",
              ext: ext === ".markdown" ? ".markdown" : ".md",
              rules
            })
          : lintJapanese(source, { format: "text", ext: ".txt", rules })
    });
    port.on("message", (message) => {
      void core?.handleMessage(message.data);
    });
    port.start();
  });
}

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
 * Foundation slice: init / ping / shutdown only - no textlint yet.
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

// Without a connected port there is nobody to tell: just end the process.
function fatal(
  kind: "uncaught-exception" | "unhandled-rejection",
  error: unknown
): void {
  if (core !== null) {
    core.reportFatal(kind, error);

    return;
  }

  process.exit(1);
}

process.on("uncaughtException", (error) => fatal("uncaught-exception", error));
process.on("unhandledRejection", (reason) =>
  fatal("unhandled-rejection", reason)
);

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
      dictionaryExists: dictionaryDirectoryExists
    });
    port.on("message", (message) => {
      void core?.handleMessage(message.data);
    });
    port.start();
  });
}

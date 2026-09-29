import { EventEmitter } from "node:events";
import type {
  JapaneseLintHostChild,
  JapaneseLintHostDeps,
  JapaneseLintHostPort
} from "../../../src/main/linterWorker/japaneseLintHost";
import {
  createJapaneseLintWorkerCore,
  type JapaneseLintWorkerCore,
  type JapaneseLintWorkerCoreDeps
} from "../../../src/main/linterWorker/japaneseLintWorkerCore";
import type { JapaneseLintDiagnostic } from "../../../src/shared/japaneseLint";
import type { JapaneseLintWorkerResponse } from "../../../src/shared/japaneseLintWorkerProtocol";

/**
 * An in-memory stand-in for Electron's utilityProcess + MessageChannelMain:
 * the Host talks to the REAL Worker core (japaneseLintWorkerCore.ts) through a
 * pair of linked ports, with asynchronous delivery like a real MessagePort.
 * Behaviors a test can switch on:
 *   - `crash(code)`: the process dies (exit event), like a real crash.
 *   - `silent`: the Worker never answers (timeout tests).
 *   - `dictionaryExists`: false makes init answer dictionary-missing; a
 *     function is asked on every check (init AND each lint job), so a test can
 *     make the dictionary "disappear" after start.
 *   - `lint`: what the Worker's textlint does (default: finds nothing). A
 *     test can pass the real engine, a stub that records its arguments, or one
 *     that never finishes (a busy Worker).
 *   - `realDictionary`: when set, `setDictionaryPath` points the real
 *     engine (kuromojin) at it.
 */

class LinkedPort extends EventEmitter {
  peer: LinkedPort | null = null;
  closed = false;

  postMessage(message: unknown): void {
    const peer = this.peer;

    if (this.closed || peer === null || peer.closed) {
      return;
    }

    // Structured-clone semantics + async delivery, like a MessagePort.
    const cloned = structuredClone(message);

    setImmediate(() => {
      if (!peer.closed) {
        peer.emit("message", { data: cloned });
      }
    });
  }

  start(): void {
    /* delivery is always on */
  }

  close(): void {
    this.closed = true;
    this.emit("close");
  }
}

export type FakeLint = (
  source: string,
  options: {
    format: "markdown" | "text";
    ext: string;
    rules: readonly { id: string; options: Readonly<Record<string, number>> }[];
  }
) => Promise<readonly JapaneseLintDiagnostic[]>;

export interface FakeWorkerOptions {
  silent?: boolean;
  dictionaryExists?: boolean | (() => boolean);
  lint?: FakeLint;
  realDictionary?: string;
  /** Pid reported by the fake process. */
  pid?: number;
}

export class FakeChild extends EventEmitter implements JapaneseLintHostChild {
  readonly pid: number;
  killed = false;
  exited = false;
  core: JapaneseLintWorkerCore | null = null;
  /** Every message the Worker core sent to the Host. */
  readonly sent: JapaneseLintWorkerResponse[] = [];
  /** Every message the Host sent to the Worker (raw, as received). */
  readonly received: unknown[] = [];
  private port: LinkedPort | null = null;

  constructor(
    private readonly options: FakeWorkerOptions,
    pid: number
  ) {
    super();
    this.pid = pid;
  }

  postMessage(message: unknown, transfer?: unknown[]): void {
    if ((message as { type?: string }).type !== "connect") {
      return;
    }

    const port = transfer?.[0] as LinkedPort | undefined;

    if (port === undefined) {
      return;
    }

    this.port = port;

    const deps: JapaneseLintWorkerCoreDeps = {
      send: (response) => {
        this.sent.push(response);

        if (!this.options.silent) {
          port.postMessage(response);
        }
      },
      exit: (code) => {
        // Give the last message time to be delivered, then die.
        setImmediate(() => this.die(code));
      },
      dictionaryExists: async () => {
        const configured = this.options.dictionaryExists;

        return typeof configured === "function"
          ? configured()
          : (configured ?? true);
      },
      setDictionaryPath: () => {
        if (this.options.realDictionary !== undefined) {
          process.env.KUROMOJIN_DIC_PATH = this.options.realDictionary;
        }
      },
      lint: async (source, lintOptions) =>
        (this.options.lint ?? (async () => []))(source, lintOptions)
    };

    this.core = createJapaneseLintWorkerCore(deps);
    port.on("message", (event: { data: unknown }) => {
      this.received.push(event.data);

      if (!this.exited) {
        void this.core?.handleMessage(event.data);
      }
    });
  }

  /** The Worker sends arbitrary data to the Host (protocol violations). */
  sendRaw(data: unknown): void {
    this.port?.postMessage(data);
  }

  kill(): boolean {
    this.killed = true;
    setImmediate(() => this.die(1));

    return true;
  }

  /** The process dies without a goodbye. */
  crash(code = 1): void {
    this.die(code);
  }

  private die(code: number): void {
    if (this.exited) {
      return;
    }

    this.exited = true;
    this.emit("exit", code);
  }
}

export interface FakeWorkerWorld {
  readonly children: FakeChild[];
  readonly deps: Pick<
    JapaneseLintHostDeps,
    "fork" | "createChannel" | "resolveDictionaryPath"
  >;
}

export function createFakeWorkerWorld(
  options: FakeWorkerOptions = {}
): FakeWorkerWorld {
  const children: FakeChild[] = [];

  return {
    children,
    deps: {
      fork: () => {
        const child = new FakeChild(options, options.pid ?? 4242 + children.length);

        children.push(child);

        return child;
      },
      createChannel: () => {
        const port1 = new LinkedPort();
        const port2 = new LinkedPort();

        port1.peer = port2;
        port2.peer = port1;

        return { port1, port2: port2 as unknown as JapaneseLintHostPort };
      },
      resolveDictionaryPath: () => "C:\\fake\\dict"
    }
  };
}

import { describe, expect, it } from "vitest";
import {
  SANITIZED_STACK_MAX_FRAMES,
  sanitizeErrorForLog,
  sanitizeStackForLog,
  sanitizeStackFrame
} from "../../src/main/sanitizeErrorForLog";

const fakeUser = "tanaka_taro";
const fakeText = "吾輩は猫である。名前はまだ無い。";

function errorWith(stackLines: string[], message = fakeText): Error {
  const error = new Error(message);

  error.stack = [`Error: ${message}`, ...stackLines].join("\n");

  return error;
}

describe("sanitizeErrorForLog (#625 P1a)", () => {
  it("drops the message (line 1 of the stack): manuscript text never survives", () => {
    const sanitized = sanitizeErrorForLog(errorWith([]));
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain("吾輩");
    expect(serialized).not.toContain("名前はまだ");
    expect(sanitized.stack).toEqual([]);
  });

  it("does not leak text placed in the message even when it looks like a stack frame", () => {
    const sanitized = sanitizeErrorForLog(
      errorWith([], `boom\n    at ${fakeText} (C:\\Users\\${fakeUser}\\x.js:1:1)`)
    );

    expect(JSON.stringify(sanitized)).not.toContain("吾輩");
    expect(JSON.stringify(sanitized)).not.toContain(fakeUser);
  });

  it("cuts everything before app.asar, so a user-name path does not survive", () => {
    const sanitized = sanitizeErrorForLog(
      errorWith([
        `    at tokenize (C:\\Users\\${fakeUser}\\AppData\\Local\\Pergamum\\resources\\app.asar\\dist\\worker.js:120:15)`,
        `    at lintLine (/home/${fakeUser}/Pergamum/resources/app.asar/dist/worker.js:88:9)`
      ])
    );

    expect(sanitized.stack).toEqual([
      "    at tokenize (app.asar/dist/worker.js:120:15)",
      "    at lintLine (app.asar/dist/worker.js:88:9)"
    ]);
    expect(JSON.stringify(sanitized)).not.toContain(fakeUser);
    expect(JSON.stringify(sanitized)).not.toContain("Users");
    expect(JSON.stringify(sanitized)).not.toContain("AppData");
    expect(JSON.stringify(sanitized)).not.toContain("home");
  });

  it("keeps only allow-listed frames: fn (app.asar/...:line:col)", () => {
    const sanitized = sanitizeErrorForLog(
      errorWith([
        "    at tokenize (app.asar/dist/worker.js:120:15)",
        "    at async Object.run (app.asar/.vite/build/main.js:10:2)",
        "    at Object.<anonymous> (app.asar/dist/worker.js:1:1)",
        "    at node:internal/process/task_queues:95:5",
        "    at new Promise (<anonymous>)",
        "    at C:\\Users\\tanaka_taro\\dev\\src\\file.ts:3:4",
        "    at devFn (C:\\Users\\tanaka_taro\\dev\\src\\file.ts:3:4)",
        "just some text with 吾輩は猫である",
        "",
        "    at spaced name (app.asar/dist/worker.js:1:1)"
      ])
    );

    expect(sanitized.stack).toEqual([
      "    at tokenize (app.asar/dist/worker.js:120:15)",
      "    at Object.run (app.asar/.vite/build/main.js:10:2)"
    ]);
  });

  it("discards frames whose path after app.asar is not plain path characters", () => {
    expect(
      sanitizeStackFrame("    at fn (app.asar/dist/吾輩.js:1:2)")
    ).toBeNull();
    expect(
      sanitizeStackFrame("    at fn (app.asar/dist/my file.js:1:2)")
    ).toBeNull();
    expect(sanitizeStackFrame("    at fn (app.asar/../etc/x.js:1:2)")).toBeNull();
    expect(
      sanitizeStackFrame("    at fn (app.asar.unpacked/x/y.js:1:2)")
    ).toBeNull();
    expect(sanitizeStackFrame("    at fn (app.asar/dist/x.js:1:2)")).toBe(
      "    at fn (app.asar/dist/x.js:1:2)"
    );
  });

  it("drops frames outside app.asar (development paths, node internals)", () => {
    expect(
      sanitizeStackFrame("    at fn (C:\\dev\\Pergamum\\src\\x.ts:1:2)")
    ).toBeNull();
    expect(
      sanitizeStackFrame("    at fn (node:internal/modules/cjs/loader:1:2)")
    ).toBeNull();
  });

  it("keeps name and code only when they have a strict identifier shape", () => {
    const named = Object.assign(new TypeError("x"), { code: "ERR_INVALID_ARG" });

    expect(sanitizeErrorForLog(named)).toMatchObject({
      name: "TypeError",
      code: "ERR_INVALID_ARG"
    });

    const hostile = Object.assign(new Error("x"), {
      name: `Bad ${fakeText}`,
      code: `C:\\Users\\${fakeUser}\\novel.md`
    });
    const sanitized = sanitizeErrorForLog(hostile);

    expect(sanitized.name).toBe("Error");
    expect(sanitized.code).toBeUndefined();
    expect(JSON.stringify(sanitized)).not.toContain(fakeUser);
    expect(JSON.stringify(sanitized)).not.toContain("吾輩");
  });

  it("caps the number of frames", () => {
    const many = Array.from(
      { length: SANITIZED_STACK_MAX_FRAMES + 30 },
      (_, index) => `    at fn${index} (app.asar/dist/w.js:${index + 1}:1)`
    );

    expect(sanitizeStackForLog(many.join("\n"))).toHaveLength(
      SANITIZED_STACK_MAX_FRAMES
    );
  });

  it("copes with non-Error values without throwing or reading a message", () => {
    for (const value of [
      undefined,
      null,
      "吾輩は猫である",
      42,
      { message: fakeText },
      { name: "Custom", stack: 5 },
      () => undefined
    ]) {
      const sanitized = sanitizeErrorForLog(value);

      expect(JSON.stringify(sanitized), String(value)).not.toContain("吾輩");
      expect(sanitized.stack).toEqual([]);
    }
  });

  it("survives a hostile value whose property getters throw, and leaks nothing", () => {
    const error = new Error("x");

    Object.defineProperty(error, "message", {
      get() {
        throw new Error(fakeText);
      }
    });
    Object.defineProperty(error, "code", {
      get() {
        throw new Error(fakeText);
      }
    });

    const sanitized = sanitizeErrorForLog(error);

    expect(JSON.stringify(sanitized)).not.toContain("吾輩");
    expect(sanitized.code).toBeUndefined();
  });

  it("does not read error.message itself", () => {
    let reads = 0;
    const error = { name: "Custom" } as Record<string, unknown>;

    Object.defineProperty(error, "message", {
      get() {
        reads += 1;

        return fakeText;
      }
    });

    sanitizeErrorForLog(error);

    expect(reads).toBe(0);
  });

  it("handles CRLF stacks and very long lines", () => {
    const sanitized = sanitizeErrorForLog(
      errorWith([
        "    at fn (app.asar/dist/w.js:1:1)\r",
        `    at big (app.asar/${"a".repeat(600)}.js:1:1)`
      ])
    );

    expect(sanitized.stack).toEqual(["    at fn (app.asar/dist/w.js:1:1)"]);
  });
});

import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractColdStartLaunchTarget } from "../../src/main/startupLaunchTarget";

const packaged = { isPackaged: true };
const dev = { isPackaged: false };

describe("extractColdStartLaunchTarget (#274)", () => {
  it("extracts a `.pergamum` project target (packaged)", () => {
    expect(
      extractColdStartLaunchTarget(
        ["/opt/pergamum", "/home/w/Book/Book.pergamum"],
        packaged
      )
    ).toEqual({
      kind: "pergamum",
      filePath: path.resolve("/home/w/Book/Book.pergamum")
    });
  });

  it("extracts a Markdown target (.md / .markdown / .mkd / .mdown)", () => {
    for (const name of ["a.md", "a.markdown", "a.mkd", "a.mdown"]) {
      expect(
        extractColdStartLaunchTarget(["/opt/pergamum", `/x/${name}`], packaged)
      ).toEqual({ kind: "markdown", filePath: path.resolve(`/x/${name}`) });
    }
  });

  it("drops the dev-mode script path argument", () => {
    expect(
      extractColdStartLaunchTarget([process.execPath, ".", "/x/a.md"], dev)
    ).toEqual({ kind: "markdown", filePath: path.resolve("/x/a.md") });
  });

  it("ignores option flags", () => {
    expect(
      extractColdStartLaunchTarget(
        ["/opt/pergamum", "--pergamum-debug", "/x/a.md"],
        packaged
      )
    ).toEqual({ kind: "markdown", filePath: path.resolve("/x/a.md") });
  });

  it("returns null when there is no single positional target", () => {
    expect(extractColdStartLaunchTarget(["/opt/pergamum"], packaged)).toBeNull();
    expect(
      extractColdStartLaunchTarget(
        ["/opt/pergamum", "/x/a.md", "/x/b.md"],
        packaged
      )
    ).toBeNull();
  });

  it("returns null for a non-project, non-markdown argument", () => {
    expect(
      extractColdStartLaunchTarget(["/opt/pergamum", "/x/notes.txt"], packaged)
    ).toBeNull();
  });
});

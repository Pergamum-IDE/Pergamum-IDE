import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type PackageJson = {
  build?: {
    directories?: {
      output?: string;
    };
    files?: string[];
    win?: {
      target?: string;
      icon?: string;
      fileAssociations?: Array<{
        ext?: string;
        name?: string;
        description?: string;
        icon?: string;
      }>;
    };
    nsis?: {
      perMachine?: boolean;
    };
    fileAssociations?: unknown;
  };
  scripts?: Record<string, string>;
};

const packageJsonPath = path.join(process.cwd(), "package.json");

function readPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;
}

describe("Windows installer file association config", () => {
  it("builds the Windows NSIS installer with electron-builder", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.["build:installer"]).toBe(
      "npm run typecheck && electron-forge package && electron-builder --win nsis"
    );
    expect(packageJson.build?.directories?.output).toBe("dist-installer");
    expect(packageJson.build?.files).toEqual([".vite/**/*"]);
    expect(packageJson.build?.win?.target).toBe("nsis");
    expect(packageJson.build?.win?.icon).toBe("assets/icon.ico");
    expect(packageJson.build?.nsis?.perMachine).toBe(true);
  });

  it("registers only .pergamum as a Windows file association", () => {
    const packageJson = readPackageJson();

    expect(packageJson.build?.fileAssociations).toBeUndefined();
    expect(packageJson.build?.win?.fileAssociations).toEqual([
      {
        ext: "pergamum",
        name: "Pergamum Project",
        description: "Pergamum Project File",
        icon: "assets/icons/file-associations/pergamum/pergamum-scroll-file-icon.ico"
      }
    ]);

    const registeredExtensions =
      packageJson.build?.win?.fileAssociations?.map((association) =>
        association.ext?.toLowerCase()
      ) ?? [];

    expect(registeredExtensions).not.toContain("md");
    expect(registeredExtensions).not.toContain("markdown");
    expect(registeredExtensions).not.toContain("txt");
  });

  it("uses the provided .pergamum file icon asset", () => {
    const packageJson = readPackageJson();
    const association = packageJson.build?.win?.fileAssociations?.[0];

    expect(association?.icon).toBe(
      "assets/icons/file-associations/pergamum/pergamum-scroll-file-icon.ico"
    );
    expect(association?.icon).not.toBe(packageJson.build?.win?.icon);

    const iconPath = path.join(process.cwd(), association?.icon ?? "");

    expect(path.extname(iconPath).toLowerCase()).toBe(".ico");
    expect(fs.existsSync(iconPath)).toBe(true);
    expect(fs.statSync(iconPath).isFile()).toBe(true);
  });
});

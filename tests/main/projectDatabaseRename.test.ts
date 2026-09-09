import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProjectDatabase,
  openProjectDatabase,
  readProjectMetadata,
  updateProjectMetadataName,
  type ProjectDatabase
} from "../../src/main/projectDatabase";

describe("projectDatabase rename (#422)", () => {
  let projectRootPath: string;
  let database: ProjectDatabase | null = null;

  beforeEach(async () => {
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-project-db-rename-")
    );
  });

  afterEach(async () => {
    if (database) {
      await database.close();
      database = null;
    }

    await fs.rm(projectRootPath, {
      recursive: true,
      force: true
    });
  });

  it("updates metadata.project_name and metadata.updated_at, returning updated metadata", async () => {
    const projectFilePath = path.join(projectRootPath, "test.pergamum");
    database = await createProjectDatabase({
      projectFilePath,
      projectName: "Initial Project Name"
    });

    const initialMetadata = await readProjectMetadata(database);
    expect(initialMetadata.projectName).toBe("Initial Project Name");

    // Wait a brief moment to ensure updated_at timestamp progresses
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updatedMetadata = await updateProjectMetadataName(
      database,
      "  New Renamed Project  "
    );

    expect(updatedMetadata.projectName).toBe("New Renamed Project");
    expect(updatedMetadata.projectId).toBe(initialMetadata.projectId);
    expect(updatedMetadata.createdAt).toBe(initialMetadata.createdAt);
    expect(new Date(updatedMetadata.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(initialMetadata.updatedAt).getTime()
    );

    const reReadMetadata = await readProjectMetadata(database);
    expect(reReadMetadata.projectName).toBe("New Renamed Project");
  });

  it("rejects invalid project name and does not modify database", async () => {
    const projectFilePath = path.join(projectRootPath, "test.pergamum");
    database = await createProjectDatabase({
      projectFilePath,
      projectName: "Original Name"
    });

    const initialMetadata = await readProjectMetadata(database);

    await expect(
      updateProjectMetadataName(database, "   ")
    ).rejects.toThrow();

    await expect(
      updateProjectMetadataName(database, "Name\nWithNewline")
    ).rejects.toThrow();

    const afterFailedUpdate = await readProjectMetadata(database);
    expect(afterFailedUpdate.projectName).toBe("Original Name");
    expect(afterFailedUpdate.updatedAt).toBe(initialMetadata.updatedAt);
  });

  it("allows filename-invalid characters in project name", async () => {
    const projectFilePath = path.join(projectRootPath, "test.pergamum");
    database = await createProjectDatabase({
      projectFilePath,
      projectName: "Normal Name"
    });

    const complexName = "迷子たちと千年領主: Part 1 / Draft *Special* ?!";
    const updatedMetadata = await updateProjectMetadataName(
      database,
      complexName
    );

    expect(updatedMetadata.projectName).toBe(complexName);
  });

  it("persists renamed project name after closing and reopening database", async () => {
    const projectFilePath = path.join(projectRootPath, "persist.pergamum");
    database = await createProjectDatabase({
      projectFilePath,
      projectName: "Before Reopen"
    });

    await updateProjectMetadataName(database, "Persisted After Reopen");
    await database.close();
    database = null;

    // Reopen database
    const reopened = await openProjectDatabase(projectFilePath);
    database = reopened;

    const metadata = await readProjectMetadata(reopened);
    expect(metadata.projectName).toBe("Persisted After Reopen");
  });
});

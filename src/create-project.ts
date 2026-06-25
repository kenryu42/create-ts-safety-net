import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export type CreateProjectOptions = {
  cwd: string;
  name: string;
  workflow?: boolean;
};

export type CreateProjectResult = {
  projectDir: string;
};

const templateDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "base",
);
const workflowTemplateDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "workflow",
);
const execFileAsync = promisify(execFile);

export async function createProject(
  options: CreateProjectOptions,
): Promise<CreateProjectResult> {
  const projectDir = join(options.cwd, options.name);
  await assertProjectDirAvailable(projectDir);
  await copyTemplate(templateDir, projectDir, {
    projectName: options.name,
  });
  if (options.workflow) {
    await copyTemplate(workflowTemplateDir, projectDir, {
      projectName: options.name,
    });
    await addWorkflowScripts(projectDir);
  }
  await execFileAsync("git", ["init"], { cwd: projectDir });

  return { projectDir };
}

async function addWorkflowScripts(projectDir: string) {
  const packagePath = join(projectDir, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  packageJson.scripts = {
    ...packageJson.scripts,
    "publish:dry-run": "bun scripts/publish.ts --dry-run",
    changelog: "bun scripts/changelog.ts",
  };
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function copyTemplate(
  sourceDir: string,
  targetDir: string,
  variables: { projectName: string },
) {
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetName = templateFileName(entry);
    const targetPath = join(targetDir, targetName);
    const entryStat = await stat(sourcePath);

    if (entryStat.isDirectory()) {
      await copyTemplate(sourcePath, targetPath, variables);
      continue;
    }

    const content = await readFile(sourcePath, "utf8");
    await writeFile(
      targetPath,
      content.replaceAll("{{projectName}}", variables.projectName),
    );
  }
}

async function assertProjectDirAvailable(projectDir: string) {
  try {
    await stat(projectDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  throw new Error(`Project directory already exists: ${projectDir}`);
}

function templateFileName(entry: string) {
  if (entry === "_gitignore") {
    return ".gitignore";
  }

  if (entry === "_biome.json") {
    return "biome.json";
  }

  return entry;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

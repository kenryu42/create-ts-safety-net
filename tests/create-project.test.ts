import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProject } from "../src/create-project.js";

const createdRoots: string[] = [];

async function makeWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ts-safety-net-"));
  createdRoots.push(root);
  return root;
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    createdRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("createProject", () => {
  test("generates a Bun-first TypeScript project", async () => {
    const root = await makeWorkspace();

    const result = await createProject({ cwd: root, name: "demo-app" });

    expect(result.projectDir).toBe(join(root, "demo-app"));
    await expect(stat(join(result.projectDir, ".git"))).resolves.toBeDefined();

    const packageJson = await readJson(join(result.projectDir, "package.json"));
    expect(packageJson.scripts).toMatchObject({
      test: "bun test",
      "test:watch": "bun test --watch",
      coverage: "bun test --coverage",
      lint: "biome check .",
      "lint:ci": "biome ci .",
      typecheck: "tsc --noEmit",
      prepare: "lefthook install",
      "hooks:install": "lefthook install",
      knip: "knip",
      cpd: "cpd src tests --reporters ai --exit-code 1 --no-tips",
      check:
        "bun run lint && bun run typecheck && bun test && bun run knip && bun run cpd",
      "check:ci":
        "bun run lint:ci && bun run typecheck && bun test --coverage --coverage-reporter=lcov && bun run knip && bun run cpd",
    });
    expect(packageJson.devDependencies).toMatchObject({
      "@biomejs/biome": "latest",
      "@types/bun": "latest",
      cpd: "latest",
      knip: "latest",
      lefthook: "latest",
      typescript: "latest",
    });

    const lefthook = await readFile(
      join(result.projectDir, "lefthook.yml"),
      "utf8",
    );
    expect(lefthook).toContain("bun run lint:staged -- {staged_files}");
    expect(lefthook).toContain("bun run check");

    const cpdConfig = await readFile(
      join(result.projectDir, ".jscpd.json"),
      "utf8",
    );
    expect(cpdConfig).toContain('"**/.git/**"');

    const biome = await readJson(join(result.projectDir, "biome.json"));
    expect(biome.root).toBeUndefined();
    expect(biome.formatter).toMatchObject({
      indentStyle: "space",
      indentWidth: 2,
    });

    const sampleTest = await readFile(
      join(result.projectDir, "src/index.test.ts"),
      "utf8",
    );
    expect(sampleTest).toContain('from "bun:test"');
    expect(sampleTest).toContain('from "./index.js"');

    await expect(
      pathExists(join(result.projectDir, ".github/workflows/publish.yml")),
    ).resolves.toBe(false);
    await expect(
      pathExists(join(result.projectDir, "scripts/publish.ts")),
    ).resolves.toBe(false);
  });

  test("generates optional workflow automation", async () => {
    const root = await makeWorkspace();

    const result = await createProject({
      cwd: root,
      name: "demo-package",
      workflow: true,
    });

    const packageJson = await readJson(join(result.projectDir, "package.json"));
    expect(packageJson.scripts).toMatchObject({
      "lint:ci": "biome ci .",
      "check:ci":
        "bun run lint:ci && bun run typecheck && bun test --coverage --coverage-reporter=lcov && bun run knip && bun run cpd",
      "publish:dry-run": "bun scripts/publish.ts --dry-run",
      changelog: "bun scripts/changelog.ts",
    });

    await expect(
      pathExists(join(result.projectDir, ".github/workflows/publish.yml")),
    ).resolves.toBe(true);
    await expect(
      pathExists(join(result.projectDir, ".github/workflows/ci.yml")),
    ).resolves.toBe(true);
    await expect(
      pathExists(
        join(result.projectDir, ".github/workflows/lint-workflows.yml"),
      ),
    ).resolves.toBe(true);
    await expect(
      pathExists(join(result.projectDir, "scripts/publish.ts")),
    ).resolves.toBe(true);
    await expect(
      pathExists(join(result.projectDir, "scripts/changelog.ts")),
    ).resolves.toBe(true);

    const publishWorkflow = await readFile(
      join(result.projectDir, ".github/workflows/publish.yml"),
      "utf8",
    );
    expect(publishWorkflow).toContain("bun scripts/publish.ts");
    expect(publishWorkflow).not.toContain("bunx release-tools");

    const ciWorkflow = await readFile(
      join(result.projectDir, ".github/workflows/ci.yml"),
      "utf8",
    );
    expect(ciWorkflow).toContain("bun scripts/changelog.ts");
    expect(ciWorkflow).not.toContain("bunx release-tools");
  });

  test("rejects an existing project directory", async () => {
    const root = await makeWorkspace();
    await mkdir(join(root, "demo-app"));

    await expect(
      createProject({ cwd: root, name: "demo-app" }),
    ).rejects.toThrow("already exists");
  });
});

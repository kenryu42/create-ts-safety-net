import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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

    const packageJson = await readJson(join(result.projectDir, "package.json"));
    expect(packageJson.scripts).toMatchObject({
      test: "bun test",
      "test:watch": "bun test --watch",
      coverage: "bun test --coverage",
      lint: "biome check .",
      typecheck: "tsc --noEmit",
      "hooks:install": "lefthook install",
      knip: "knip",
      cpd: "cpd src tests --reporters ai --exit-code 1 --no-tips",
      check:
        "bun run lint && bun run typecheck && bun test && bun run knip && bun run cpd",
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
  });

  test("rejects an existing project directory", async () => {
    const root = await makeWorkspace();
    await mkdir(join(root, "demo-app"));

    await expect(
      createProject({ cwd: root, name: "demo-app" }),
    ).rejects.toThrow("already exists");
  });
});

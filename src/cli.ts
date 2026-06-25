#!/usr/bin/env bun
import { createProject } from "./create-project.js";

const args = process.argv.slice(2);
const workflow = args.includes("--workflow");
const name = args.find((arg) => !arg.startsWith("-"));

if (!name) {
  console.error("Usage: create-ts-safety-net <project-name> [--workflow]");
  process.exit(1);
}

const result = await createProject({ cwd: process.cwd(), name, workflow });

console.log(`Created ${result.projectDir}`);
console.log("Next steps:");
console.log(`  cd ${name}`);
console.log("  bun install");
console.log("  bun run check");

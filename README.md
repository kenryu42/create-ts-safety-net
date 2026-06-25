# create-ts-safety-net

Create a Bun-first TypeScript project with a small default quality gate.

It is meant to give coding agents a fast feedback loop: format, lint, typecheck,
test, unused-code detection, and duplicate-code detection all run through one
command.

It configures:

- TypeScript
- Biome
- Knip
- cpd
- Lefthook
- Bun test

## Usage

```sh
bun create ts-safety-net my-app
cd my-app
bun install
bun run check
```

You can also run the published binary directly:

```sh
bunx create-ts-safety-net my-app
```

To include GitHub Actions workflows plus local release scripts:

```sh
bun create ts-safety-net my-lib --workflow
```

## Generated Scripts

```sh
bun run lint
bun run typecheck
bun test
bun run knip
bun run cpd
bun run check
```

`bun run check` runs the full safety net: formatting/linting, type checking, tests, unused-code checks, and duplicate-code detection.

## Git Hooks

Lefthook runs Biome on staged JS/TS files before commit and runs the full check before push. The creator initializes Git, then the generated project's `prepare` script installs hooks when you run `bun install`.

To reinstall hooks manually:

```sh
bun run hooks:install
```

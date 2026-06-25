#!/usr/bin/env bun
import { $ } from "bun";

type CommandRunner = (
  strings: TemplateStringsArray,
  ...values: readonly string[]
) => { text: () => Promise<string> };

const DEFAULT_EXCLUDED_AUTHORS = ["actions-user", "github-actions[bot]"];
const DEFAULT_COMMIT_PATTERN = /^(feat|fix)(\([^)]+\))?:/i;

function isIncludedCommit(message: string) {
  return DEFAULT_COMMIT_PATTERN.test(message.replace(/^\w+\s+/, ""));
}

async function getRepo(runner: CommandRunner) {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  const remote = (await runner`git remote get-url origin`.text()).trim();
  const sshMatch = remote.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
  if (sshMatch?.[1]) return sshMatch[1];

  const httpsMatch = remote.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
  if (httpsMatch?.[1]) return httpsMatch[1];

  throw new Error(`Could not detect GitHub repo from origin: ${remote}`);
}

async function getLatestReleasedTag(runner: CommandRunner) {
  try {
    const tag =
      await runner`gh release list --exclude-drafts --exclude-pre-releases --limit 1 --json tagName --jq '.[0].tagName // empty'`.text();
    return tag.trim() || null;
  } catch {
    return null;
  }
}

async function generateChangelog(previousTag: string, runner: CommandRunner) {
  let log: string;
  try {
    log =
      await runner`git log ${previousTag}..HEAD --oneline --format="%h %s"`.text();
  } catch {
    try {
      log = await runner`git log HEAD --oneline --format="%h %s"`.text();
    } catch {
      return [];
    }
  }

  return log
    .split("\n")
    .filter((line) => line && isIncludedCommit(line))
    .map((commit) => `- ${commit}`);
}

async function getContributors(
  previousTag: string,
  repo: string,
  runner: CommandRunner,
) {
  const notes: string[] = [];

  try {
    const compare =
      await runner`gh api "/repos/${repo}/compare/${previousTag}...HEAD" --jq '.commits[] | {login: .author.login, message: .commit.message}'`.text();
    const contributors = new Map<string, string[]>();

    for (const line of compare.split("\n").filter(Boolean)) {
      const { login, message } = JSON.parse(line) as {
        login: string | null;
        message: string;
      };
      const title = message.split("\n")[0] ?? "";
      if (!isIncludedCommit(title)) continue;

      if (login && !DEFAULT_EXCLUDED_AUTHORS.includes(login)) {
        if (!contributors.has(login)) contributors.set(login, []);
        contributors.get(login)?.push(title);
      }
    }

    if (contributors.size > 0) {
      notes.push("");
      notes.push(
        `**Thank you to ${contributors.size} community contributor${contributors.size > 1 ? "s" : ""}:**`,
      );
      for (const [username, userCommits] of contributors) {
        notes.push(`- @${username}:`);
        for (const commit of userCommits) {
          notes.push(`  - ${commit}`);
        }
      }
    }
  } catch {
    // Contributor lookup is best effort.
  }

  return notes;
}

export async function buildReleaseNotes(runner: CommandRunner = $) {
  const previousTag = await getLatestReleasedTag(runner);
  if (!previousTag) {
    return ["Initial release"];
  }

  const repo = await getRepo(runner);
  const [changelog, contributors] = await Promise.all([
    generateChangelog(previousTag, runner),
    getContributors(previousTag, repo, runner),
  ]);

  return [
    ...(changelog.length > 0 ? changelog : ["No changes in this release"]),
    ...contributors,
  ];
}

if (import.meta.main) {
  const notes = await buildReleaseNotes();
  console.log(notes.join("\n"));
}

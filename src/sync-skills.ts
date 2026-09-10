import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { checkPortableSkills, syncPortableSkills } from "./portable-skills.ts";

const engRoot = resolve(import.meta.dir, "..");
const [mode, repoArg] = process.argv.slice(2);
const repoRoot = resolve(repoArg ?? process.cwd());

if (mode !== "sync" && mode !== "check") {
  console.error("usage: bun src/sync-skills.ts <sync|check> [repo-root]");
  process.exit(2);
}

if (mode === "check") {
  const { drift } = checkPortableSkills(engRoot, repoRoot);
  for (const line of drift) console.error(`drift: ${line}`);
  console.log(drift.length === 0 ? "portable skills: in sync" : `portable skills: ${drift.length} drift item(s)`);
  process.exitCode = drift.length === 0 ? 0 : 1;
} else {
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: engRoot, encoding: "utf8" }).trim();
  const { copied, removed } = syncPortableSkills(engRoot, repoRoot, sourceCommit);
  for (const name of removed) console.log(`removed .agents/skills/${name} (shadowed eng-mode skill)`);
  for (const name of copied) console.log(`synced .agents/skills/${name}`);
  console.log(`source eng-mode@${sourceCommit.slice(0, 7)}`);
}

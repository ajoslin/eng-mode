import { describe, expect, it } from "bun:test";
import type { ToolCallEvent } from "./extension-types.ts";
import { blocksRawGithub, evalUsesRawGithub, shellUsesRawGithub } from "./gh-guard.ts";

const call = (toolName: string, input: Record<string, unknown>): ToolCallEvent => ({ type: "tool_call", toolCallId: "1", toolName, input });

describe("shellUsesRawGithub", () => {
  it.each([
    "gh pr view 47",
    "gh pr checks 47 --watch --fail-fast",
    "gh api repos/o/r/pulls/1",
    "gh -R o/r pr merge 1",
    "gh stack view --json",
    "GH_TOKEN=$(gh auth token -u ajoslin) gh pr create --body-file b.md",
    "cd repo && gh run watch 123",
    "for i in 1 2; do gh api x; done",
    "x=$(gh pr view --json number)",
    "/opt/homebrew/bin/gh issue list",
    "env GH_TOKEN=t gh pr list",
    "timeout 30 gh pr checks 1",
    "pr-cockpit listen o/r#1",
    "curl -s https://api.github.com/repos/o/r",
    "bash -c 'gh pr view 1'",
    "eval \"gh api user\"",
    "gh",
    "echo \"$(gh pr view 47)\"",
    "TITLE=\"$(gh api user)\" bun run x.ts",
    "echo \"pr: `gh pr view 1`\"",
    "if gh pr view 1; then echo ok; fi",
    "while gh pr checks 1; do sleep 1; done",
    "until gh pr checks 1; do sleep 1; done",
    "! gh pr view 1",
  ])("blocks %s", (command) => {
    expect(shellUsesRawGithub(command)).toBe(true);
  });

  it.each([
    "gh auth token -u ajoslin",
    "gh auth status",
    "gh --version",
    "bun skills/eng-github/scripts/eng-github.ts snapshot o/r#1",
    "eng-github snapshot o/r#1",
    "eng-github api repos/o/r/pulls/1",
    "git commit -m 'stop using gh pr checks'",
    "echo \"run gh api later\"",
    "cat <<'EOF' > body.md\nWe replaced gh pr view and pr-cockpit.\nEOF",
    "rg 'gh stack' skills",
    "curl -s https://github.com/o/r/raw/main/README.md",
    "ghq list",
    "git log --grep gh",
    "echo '$(gh pr view 47)'",
    "if true; then echo gh; fi",
  ])("allows %s", (command) => {
    expect(shellUsesRawGithub(command)).toBe(false);
  });
});

describe("evalUsesRawGithub", () => {
  it("blocks spawning gh, notebook shell escapes, and direct API fetches", () => {
    expect(evalUsesRawGithub("await Bun.$`gh pr view 1`")).toBe(true);
    expect(evalUsesRawGithub("subprocess.run(['gh', 'api', 'user'])")).toBe(true);
    expect(evalUsesRawGithub("!gh pr list")).toBe(true);
    expect(evalUsesRawGithub("await fetch('https://api.github.com/user')")).toBe(true);
  });

  it("allows auth token reads and unrelated code", () => {
    expect(evalUsesRawGithub("subprocess.run(['gh', 'auth', 'token'])")).toBe(false);
    expect(evalUsesRawGithub("print('docs mention gh pr view')")).toBe(false);
    expect(evalUsesRawGithub("print('https://api.github.com')")).toBe(false);
    expect(evalUsesRawGithub("console.log('gh pr view 47')")).toBe(false);
  });

  it("blocks network and subprocess calls with GitHub arguments", () => {
    expect(evalUsesRawGithub("requests.get('https://api.github.com/user')")).toBe(true);
    expect(evalUsesRawGithub("os.system('gh pr view 1')")).toBe(true);
    expect(evalUsesRawGithub("spawnSync('gh', ['pr', 'view'])")).toBe(true);
    expect(evalUsesRawGithub("execSync(`gh api user`)")).toBe(true);
    expect(evalUsesRawGithub("await $`gh pr list`")).toBe(true);
  });
});

describe("blocksRawGithub", () => {
  it("routes every GitHub tool surface through eng-github", () => {
    expect(blocksRawGithub(call("github", { op: "pr_view" }))).toBe(true);
    expect(blocksRawGithub(call("read", { path: "pr://47" }))).toBe(true);
    expect(blocksRawGithub(call("read", { path: "issue://ajoslin/eng-mode/3" }))).toBe(true);
    expect(blocksRawGithub(call("write", { path: "xd://github", content: "{}" }))).toBe(true);
    expect(blocksRawGithub(call("read", { path: "skills/eng-github/SKILL.md" }))).toBe(false);
    expect(blocksRawGithub(call("edit", { input: "gh pr view" }))).toBe(false);
  });
});

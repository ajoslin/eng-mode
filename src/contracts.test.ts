import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeEngOrch } from "./extension.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

async function repository(
  newline: string,
  standardsClosing = "---"
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "eng-mode-contracts-"));
  roots.push(root);
  for (const name of ["project-standards", "verify-project"]) {
    const directory = join(root, ".agents", "skills", name);
    await mkdir(directory, { recursive: true });
    const lines = ["---", `name: ${name}`, "description: test"];
    if (name === "project-standards") lines.push("forge-provider: pr-cockpit");
    lines.push(
      name === "project-standards" ? standardsClosing : "---",
      "configured",
      ""
    );
    await writeFile(join(directory, "SKILL.md"), lines.join(newline));
  }
  return root;
}

describe("eng_orch contract frontmatter", () => {
  it("permits CRLF contracts with the same decision and provider as LF contracts", async () => {
    for (const newline of ["\n", "\r\n"]) {
      const repositoryRoot = await repository(newline);
      const result = await executeEngOrch({
        action: "contracts",
        repositoryRoot,
        mode: "code-producing",
      });
      expect(result).toMatchObject({
        decision: "proceed",
        forgeProvider: "pr-cockpit",
        contracts: [
          { name: "project-standards", parse: "ok" },
          { name: "verify-project", parse: "ok" },
        ],
      });
    }
  });

  it("blocks a closing frontmatter marker with a suffix", async () => {
    const repositoryRoot = await repository("\n", "---oops");
    const result = await executeEngOrch({
      action: "contracts",
      repositoryRoot,
      mode: "code-producing",
    });
    expect(result).toMatchObject({
      decision: "blocked-standards",
      forgeProvider: null,
      contracts: [
        { name: "project-standards", parse: "malformed" },
        { name: "verify-project", parse: "ok" },
      ],
    });
  });

  it("accepts quoted YAML scalars and inline provider comments", async () => {
    const repositoryRoot = await repository("\n");
    await writeFile(
      join(repositoryRoot, ".agents/skills/project-standards/SKILL.md"),
      '---\nname: "project-standards"\nforge-provider: "pr-cockpit" # selected provider\n---\nConfigured\n'
    );
    expect(
      await executeEngOrch({
        action: "contracts",
        repositoryRoot,
        mode: "code-producing",
      })
    ).toMatchObject({ decision: "proceed", forgeProvider: "pr-cockpit" });
  });

  it("rejects ambiguous or invalid YAML metadata", async () => {
    const repositoryRoot = await repository("\n");
    for (const metadata of [
      "name: project-standards\nname: other",
      "name: project-standards\nforge-provider: pr-cockpit\nforge-provider: github-graphite",
      "name: project-standards\nforge-provider: [pr-cockpit]",
      "name: [unterminated",
    ]) {
      await writeFile(
        join(repositoryRoot, ".agents/skills/project-standards/SKILL.md"),
        `---\n${metadata}\n---\nConfigured\n`
      );
      expect(
        await executeEngOrch({
          action: "contracts",
          repositoryRoot,
          mode: "code-producing",
        })
      ).toMatchObject({
        decision: "blocked-standards",
        contracts: [{ parse: "malformed" }, { parse: "ok" }],
      });
    }
  });
});

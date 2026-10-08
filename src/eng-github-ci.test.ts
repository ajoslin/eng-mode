import { describe, expect, test } from "bun:test";
import { excerpt } from "../skills/eng-github/scripts/commands/read.ts";

const stamp = (line: string) => `2026-10-08T00:29:50.3677130Z ${line}`;

describe("ci log excerpt", () => {
  test("failures buried before post-job cleanup lead the excerpt and cleanup noise is cut", () => {
    const passing = Array.from({ length: 500 }, (_, i) => stamp(`[core] (pass) case ${i}`));
    const cleanup = Array.from({ length: 60 }, (_, i) => stamp(`Post job cleanup ${i}`));
    const log = [
      stamp("[e2e] (fail) websocket e2e > connects [52ms]"),
      stamp(`[e2e] {"level":50,"err":"${"x".repeat(2000)}"}`),
      ...passing,
      stamp('error: script "test" exited with code 1'),
      stamp("##[error]Process completed with exit code 1."),
      ...cleanup,
    ].join("\n");
    const lines = excerpt(log).split("\n");
    expect(lines[0]).toBe("[e2e] (fail) websocket e2e > connects [52ms]");
    expect(lines.at(-1)).toBe("##[error]Process completed with exit code 1.");
    expect(lines).toContain('error: script "test" exited with code 1');
    expect(lines.some((line) => line.startsWith("Post job cleanup"))).toBe(false);
    expect(lines.some((line) => line.includes("x".repeat(400)))).toBe(false);
  });

  test("a log with no error marker keeps its last lines", () => {
    const log = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const lines = excerpt(log).split("\n");
    expect(lines.at(-1)).toBe("line 99");
    expect(lines).toHaveLength(30);
  });
});

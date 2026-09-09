import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const logger = join(import.meta.dir, "../skills/show-me-your-work/scripts/log.sh");

it("preserves both rows when a first writer pauses before publishing the header", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eng-log-race-"));
  const logfile = join(directory, "decisions.tsv");
  const hook = join(directory, "pause.bash");
  await writeFile(hook, `set -T
pause_header() {
  case "$BASH_COMMAND" in
    "printf 'ts"*)
      trap - DEBUG
      printf 'ready\\n'
      IFS= read -r resume
      ;;
  esac
}
trap pause_header DEBUG
`);
  const first = Bun.spawn(["/bin/bash", logger, logfile, "first", "=decision", "why", "line\tbreak\n", "ok"], {
    env: { ...process.env, BASH_ENV: hook },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    const reader = first.stdout.getReader();
    const ready = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(ready.value)).toBe("ready\n");
    const second = Bun.spawn(["/bin/bash", logger, logfile, "second", "decision", "why", "evidence", "ok"], {
      env: { ...process.env, BASH_ENV: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await second.exited).toBe(0);
    first.stdin.write("resume\n");
    first.stdin.end();
    expect(await first.exited).toBe(0);
    const lines = (await readFile(logfile, "utf8")).trimEnd().split("\n");
    expect(lines[0]).toBe("ts\tphase\tdecision\twhy\tevidence\tresult");
    expect(lines.slice(1).map((line) => line.split("\t").slice(1).join("\t"))).toEqual([
      "second\tdecision\twhy\tevidence\tok",
      "first\t'=decision\twhy\tline break \tok",
    ]);
  } finally {
    first.kill();
    await first.exited;
    await rm(directory, { recursive: true, force: true });
  }
});

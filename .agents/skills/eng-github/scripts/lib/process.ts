export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function run(
  argv: readonly string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; stdin?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  const proc = Bun.spawn([...argv], {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => proc.kill(), options.timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { code, stdout, stderr };
}

export async function git(args: readonly string[], cwd?: string): Promise<RunResult> {
  return run(["git", ...args], cwd === undefined ? {} : { cwd });
}

export async function gitOut(args: readonly string[], cwd?: string): Promise<string | undefined> {
  const result = await git(args, cwd);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

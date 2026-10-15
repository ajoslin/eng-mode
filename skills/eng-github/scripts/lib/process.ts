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
    detached: options.timeoutMs !== undefined,
  });
  const stdoutReader = proc.stdout.getReader();
  const stderrReader = proc.stderr.getReader();
  async function text(reader: { read(): Promise<{ done: true; value?: Uint8Array | undefined } | { done: false; value: Uint8Array }> }): Promise<string> {
    const decoder = new TextDecoder();
    let output = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return output + decoder.decode();
      output += decoder.decode(chunk.value, { stream: true });
    }
  }
  let timer: Timer | undefined;
  try {
    const completed = Promise.all([text(stdoutReader), text(stderrReader), proc.exited]).then(([stdout, stderr, code]) => ({ code, stdout, stderr }));
    if (options.timeoutMs === undefined) return await completed;
    const deadline = Promise.withResolvers<never>();
    timer = setTimeout(() => {
      deadline.reject(new Error(`process timed out after ${options.timeoutMs}ms`));
      try { process.kill(-proc.pid, "SIGKILL"); } catch {
        try { proc.kill("SIGKILL"); } catch {}
      }
      void stdoutReader.cancel().catch(() => {});
      void stderrReader.cancel().catch(() => {});
    }, options.timeoutMs);
    return await Promise.race([completed, deadline.promise]);
  } finally {
    clearTimeout(timer);
  }
}

export async function git(args: readonly string[], cwd?: string): Promise<RunResult> {
  return run(["git", ...args], cwd === undefined ? {} : { cwd });
}

export async function gitOut(args: readonly string[], cwd?: string): Promise<string | undefined> {
  const result = await git(args, cwd);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

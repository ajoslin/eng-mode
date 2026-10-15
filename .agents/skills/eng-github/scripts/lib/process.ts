export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function run(
  argv: readonly string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; stdin?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RunResult> {
  options.signal?.throwIfAborted();
  const proc = Bun.spawn([...argv], {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
    stdout: "pipe",
    stderr: "pipe",
    detached: options.timeoutMs !== undefined || options.signal !== undefined,
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
  const deadline = Promise.withResolvers<never>();
  const stop = (error: unknown) => {
    deadline.reject(error);
    try { process.kill(-proc.pid, "SIGKILL"); } catch {
      try { proc.kill("SIGKILL"); } catch {}
    }
    void stdoutReader.cancel().catch(() => {});
    void stderrReader.cancel().catch(() => {});
  };
  const abort = () => stop(options.signal?.reason);
  try {
    const completed = Promise.all([text(stdoutReader), text(stderrReader), proc.exited]).then(([stdout, stderr, code]) => ({ code, stdout, stderr }));
    if (options.timeoutMs === undefined && options.signal === undefined) return await completed;
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    if (options.timeoutMs !== undefined) {
      timer = setTimeout(() => stop(new Error(`process timed out after ${options.timeoutMs}ms`)), options.timeoutMs);
    }
    return await Promise.race([completed, deadline.promise]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export async function git(args: readonly string[], cwd?: string): Promise<RunResult> {
  return run(["git", ...args], cwd === undefined ? {} : { cwd });
}

export async function gitOut(args: readonly string[], cwd?: string): Promise<string | undefined> {
  const result = await git(args, cwd);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

export type ExtraModelRequest =
  | { readonly kind: "list"; readonly provider: "cliproxy" }
  | { readonly kind: "ask"; readonly provider: "cliproxy" | "codex"; readonly model: string; readonly prompt: string };

export class ExtraModelError extends Error {
  constructor(message: string, readonly exitCode: number) {
    super(message);
  }
}

const USAGE = `usage: eng-extra-model --provider cliproxy|codex --model MODEL [--prompt TEXT]   (prompt from stdin when --prompt is absent)
       eng-extra-model --provider cliproxy --list-models
cliproxy needs ENG_CLIPROXY_BASE_URL (for example http://host:8317) and reads ENG_CLIPROXY_API_KEY when the proxy requires a key.
codex needs the codex CLI on PATH and a logged-in codex account.`;

export async function parseArgs(argv: readonly string[], stdin: () => Promise<string>): Promise<ExtraModelRequest> {
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]!;
    if (flag === "--list-models" || flag === "--help") flags.set(flag, true);
    else if (flag === "--provider" || flag === "--model" || flag === "--prompt") {
      const value = argv[++index];
      if (value === undefined) throw new ExtraModelError(`${flag} needs a value\n${USAGE}`, 2);
      flags.set(flag, value);
    } else throw new ExtraModelError(`unknown argument ${flag}\n${USAGE}`, 2);
  }
  if (flags.has("--help")) throw new ExtraModelError(USAGE, 0);
  const provider = flags.get("--provider");
  if (provider !== "cliproxy" && provider !== "codex") throw new ExtraModelError(`--provider must be cliproxy or codex\n${USAGE}`, 2);
  if (flags.has("--list-models")) {
    if (provider !== "cliproxy") throw new ExtraModelError("--list-models is only supported for cliproxy", 2);
    return { kind: "list", provider };
  }
  const model = flags.get("--model");
  if (typeof model !== "string" || model.length === 0) throw new ExtraModelError(`--model is required\n${USAGE}`, 2);
  const promptFlag = flags.get("--prompt");
  const prompt = typeof promptFlag === "string" ? promptFlag : await stdin();
  if (prompt.trim().length === 0) throw new ExtraModelError("prompt is empty; pass --prompt or pipe text on stdin", 2);
  return { kind: "ask", provider, model, prompt };
}

function proxyBase(env: NodeJS.ProcessEnv): string {
  const base = env.ENG_CLIPROXY_BASE_URL;
  if (base === undefined || base.trim() === "") throw new ExtraModelError("cliproxy unavailable: ENG_CLIPROXY_BASE_URL is not set", 69);
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new ExtraModelError("cliproxy configuration: ENG_CLIPROXY_BASE_URL must be an HTTP(S) URL", 2);
  }
  if (url.username || url.password) throw new ExtraModelError("cliproxy configuration: URL credentials are not allowed; use ENG_CLIPROXY_API_KEY for bearer authentication", 2);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ExtraModelError("cliproxy configuration: ENG_CLIPROXY_BASE_URL must be an HTTP(S) URL", 2);
  return url.href.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function proxyHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  const key = env.ENG_CLIPROXY_API_KEY;
  return { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) };
}

async function proxyJson(url: string, init: RequestInit): Promise<unknown> {
  const origin = new URL(url).origin;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ExtraModelError(`cliproxy unavailable: ${origin}: request failed`, 69);
  }
  const text = await response.text();
  if (!response.ok) throw new ExtraModelError(`cliproxy ${origin} returned HTTP ${response.status}`, 1);
  try {
    return JSON.parse(text);
  } catch {
    throw new ExtraModelError(`cliproxy ${origin} returned non-JSON`, 1);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function completionText(body: unknown): string {
  const choice = isRecord(body) && Array.isArray(body.choices) ? body.choices[0] : undefined;
  const content = isRecord(choice) && isRecord(choice.message) ? choice.message.content : undefined;
  if (typeof content === "string" && content.length > 0) return content;
  throw new ExtraModelError(`cliproxy response has no choices[0].message.content: ${JSON.stringify(body).slice(0, 500)}`, 1);
}

export function modelIds(body: unknown): string[] {
  const data = isRecord(body) && Array.isArray(body.data) ? body.data : undefined;
  if (data === undefined) throw new ExtraModelError(`cliproxy /v1/models response has no data array: ${JSON.stringify(body).slice(0, 500)}`, 1);
  return data.flatMap((entry) => (isRecord(entry) && typeof entry.id === "string" ? [entry.id] : []));
}

async function runCodex(model: string, prompt: string): Promise<string> {
  if (Bun.which("codex") === null) throw new ExtraModelError("codex unavailable: the codex CLI is not on PATH", 69);
  const outFile = `${process.env.TMPDIR ?? "/tmp"}/eng-extra-model-${process.pid}-${Date.now()}.txt`;
  const child = Bun.spawn(["codex", "exec", "--model", model, "--skip-git-repo-check", "--sandbox", "read-only", "--output-last-message", outFile, "-"], {
    stdin: new TextEncoder().encode(prompt), stdout: "ignore", stderr: "pipe",
  });
  const [exit, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  const file = Bun.file(outFile);
  const answer = (await file.exists()) ? await file.text() : "";
  if (await file.exists()) await file.delete();
  if (exit !== 0) throw new ExtraModelError(`codex exec exited ${exit}: ${stderr.slice(-2000)}`, 1);
  if (answer.trim() === "") throw new ExtraModelError(`codex exec produced no final message: ${stderr.slice(-2000)}`, 1);
  return answer;
}

export async function execute(request: ExtraModelRequest, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (request.kind === "list") {
    return modelIds(await proxyJson(`${proxyBase(env)}/v1/models`, { headers: proxyHeaders(env) })).join("\n");
  }
  switch (request.provider) {
    case "cliproxy":
      return completionText(await proxyJson(`${proxyBase(env)}/v1/chat/completions`, {
        method: "POST", headers: proxyHeaders(env),
        body: JSON.stringify({ model: request.model, messages: [{ role: "user", content: request.prompt }] }),
      }));
    case "codex":
      return runCodex(request.model, request.prompt);
    default: {
      const _exhaustive: never = request;
      return _exhaustive;
    }
  }
}

if (import.meta.main) {
  try {
    const request = await parseArgs(Bun.argv.slice(2), () => Bun.stdin.text());
    process.stdout.write(`${await execute(request)}\n`);
  } catch (error) {
    if (!(error instanceof ExtraModelError)) throw error;
    (error.exitCode === 0 ? process.stdout : process.stderr).write(`${error.message}\n`);
    process.exit(error.exitCode);
  }
}

import { EngGithubError } from "./errors.ts";
import { run } from "./process.ts";
import { digest } from "./state.ts";

export type CredentialSource = "ENG_GITHUB_TOKEN" | "GH_TOKEN" | "GITHUB_TOKEN" | "gh";

export interface Credential {
  readonly host: string;
  readonly token: string;
  readonly source: CredentialSource;
  readonly account?: string;
  readonly fingerprint: string;
}

export async function resolveCredential(host = "github.com"): Promise<Credential> {
  const env = process.env;
  for (const source of ["ENG_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] as const) {
    const token = env[source]?.trim();
    if (token) return { host, token, source, fingerprint: `${host}:${digest(token)}` };
  }
  const account = env.ENG_GITHUB_ACCOUNT?.trim() || undefined;
  const argv = ["gh", "auth", "token", "--hostname", host, ...(account === undefined ? [] : ["--user", account])];
  let result;
  try {
    result = await run(argv, { env: { ...env, GH_PROMPT_DISABLED: "1", GH_DEBUG: "" }, timeoutMs: 10_000 });
  } catch {
    throw new EngGithubError("failure", "No GitHub token: set ENG_GITHUB_TOKEN or GH_TOKEN, or install gh and run `gh auth login`.");
  }
  const token = result.stdout.trim();
  if (result.code !== 0 || token === "") {
    const who = account === undefined ? "" : ` for account ${account}`;
    throw new EngGithubError("failure", `No GitHub token${who}: run \`gh auth login\`${account === undefined ? "" : ` and sign in as ${account}`}.`);
  }
  return { host, token, source: "gh", ...(account === undefined ? {} : { account }), fingerprint: `${host}:${digest(token)}` };
}

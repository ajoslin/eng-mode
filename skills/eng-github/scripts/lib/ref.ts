import { UsageError } from "./errors.ts";
import { gitOut } from "./process.ts";

export interface Repo {
  readonly owner: string;
  readonly name: string;
}

export interface PrRef extends Repo {
  readonly number: number;
}

const NAME = /^[A-Za-z0-9_.-]+$/;

export function repoSlug(repo: Repo): string {
  return `${repo.owner}/${repo.name}`;
}

export function refString(ref: PrRef): string {
  return `${ref.owner}/${ref.name}#${ref.number}`;
}

export function parseRepo(value: string): Repo {
  const [owner, name, ...rest] = value.trim().replace(/\.git$/, "").split("/");
  if (rest.length > 0 || owner === undefined || name === undefined || !NAME.test(owner) || !NAME.test(name)) {
    throw new UsageError(`not a repository: ${value}`);
  }
  return { owner, name };
}

export function repoFromRemoteUrl(url: string): Repo | undefined {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match?.[1] && match[2] ? { owner: match[1], name: match[2] } : undefined;
}

export async function currentRepo(cwd?: string): Promise<Repo> {
  const fromEnv = process.env.ENG_GITHUB_REPO ?? process.env.GH_REPO;
  if (fromEnv) return parseRepo(fromEnv);
  const url = await gitOut(["remote", "get-url", "origin"], cwd);
  const repo = url === undefined ? undefined : repoFromRemoteUrl(url);
  if (repo === undefined) throw new UsageError("no GitHub origin remote here; pass owner/repo#N or set ENG_GITHUB_REPO");
  return repo;
}

export async function parsePrRef(value: string, cwd?: string): Promise<PrRef> {
  const text = value.trim();
  const url = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(text);
  if (url?.[1] && url[2] && url[3]) return { ...parseRepo(`${url[1]}/${url[2]}`), number: Number(url[3]) };
  const full = /^([^/#\s]+)\/([^/#\s]+)#(\d+)$/.exec(text);
  if (full?.[1] && full[2] && full[3]) return { ...parseRepo(`${full[1]}/${full[2]}`), number: Number(full[3]) };
  const bare = /^#?(\d+)$/.exec(text);
  if (bare?.[1]) return { ...(await currentRepo(cwd)), number: Number(bare[1]) };
  throw new UsageError(`not a pull request reference: ${value} (use owner/repo#N, a PR URL, or N)`);
}

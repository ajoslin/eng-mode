import { resolveCredential, type Credential } from "./credentials.ts";
import { ApiError, EngGithubError, RateLimitedError, UsageError } from "./errors.ts";
import { StateStore, type CredentialState, type QuotaSnapshot } from "./state.ts";

const API_VERSION = "2022-11-28";
const GRAPHQL_RESERVE_RATIO = 0.1;
const RATE_LIMIT_SELECTION = "rateLimit { cost limit remaining resetAt }";
const FALLBACK_COOLDOWN_MS = 30_000;
const MAX_FALLBACK_COOLDOWN_MS = 15 * 60_000;
const MUTATION_SPACING_MS = 1_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export interface Clock {
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

const systemClock: Clock = { now: () => Date.now(), sleep: (ms) => Bun.sleep(ms) };

export type Priority = "interactive" | "background";

export interface RestRequest {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  readonly accept?: string;
  readonly priority?: Priority;
}

export interface RestResponse<T = unknown> {
  readonly status: number;
  readonly data: T;
  readonly text: string;
  readonly headers: Headers;
}

export interface GraphqlRequest {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
  readonly priority?: Priority;
}

interface GraphqlError {
  readonly type?: string;
  readonly message?: string;
  readonly path?: readonly (string | number)[];
}

export interface GraphqlResponse<T> {
  readonly data: T;
  readonly errors: readonly GraphqlError[];
}

export function apiRoot(host: string): { rest: string; graphql: string } {
  if (host === "github.com") return { rest: "https://api.github.com", graphql: "https://api.github.com/graphql" };
  if (host.endsWith(".ghe.com")) return { rest: `https://api.${host}`, graphql: `https://api.${host}/graphql` };
  return { rest: `https://${host}/api/v3`, graphql: `https://${host}/api/graphql` };
}

function isRead(document: string): boolean {
  const start = document.trimStart();
  return start.startsWith("query") || start.startsWith("{");
}

export function withRateLimitSelection(document: string): string {
  if (!isRead(document) || document.includes(RATE_LIMIT_SELECTION)) return document;
  const end = document.lastIndexOf("}");
  return end === -1 ? document : `${document.slice(0, end)}\n  ${RATE_LIMIT_SELECTION}\n${document.slice(end)}`;
}

function retryAtFromHeaders(headers: Headers, now: number): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return now + Math.max(0, seconds) * 1000;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return date;
  }
  const reset = Number(headers.get("x-ratelimit-reset")) * 1000;
  return Number.isFinite(reset) && reset > now ? reset : undefined;
}

export function isRateLimited(status: number, headers: Headers, body: string, errors: readonly GraphqlError[] | undefined): boolean {
  if (status === 429) return true;
  if (errors?.some((error) => error.type === "RATE_LIMITED")) return true;
  if (errors !== undefined && errors.length > 0 && headers.get("x-ratelimit-remaining") === "0") return true;
  if (errors?.some((error) => /rate limit (already )?exceeded/i.test(error.message ?? ""))) return true;
  return status === 403 && (headers.get("x-ratelimit-remaining") === "0" || headers.has("retry-after") || /rate limit/i.test(body));
}

function quotaFromHeaders(headers: Headers, previous: QuotaSnapshot | undefined): QuotaSnapshot | undefined {
  const limit = Number(headers.get("x-ratelimit-limit"));
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const reset = Number(headers.get("x-ratelimit-reset")) * 1000;
  if (![limit, remaining, reset].every(Number.isFinite) || limit <= 0) return previous;
  return { limit, remaining, resetAt: reset, cost: 1 };
}

function quotaFromGraphql(data: unknown): QuotaSnapshot | undefined {
  const rate = (data as { rateLimit?: { cost?: unknown; limit?: unknown; remaining?: unknown; resetAt?: unknown } } | null)?.rateLimit;
  if (rate === undefined || rate === null) return undefined;
  const { cost, limit, remaining, resetAt } = rate;
  if (typeof cost !== "number" || typeof limit !== "number" || typeof remaining !== "number" || typeof resetAt !== "string") return undefined;
  const reset = Date.parse(resetAt);
  return Number.isFinite(reset) && limit > 0 ? { cost, limit, remaining, resetAt: reset } : undefined;
}

function mergeQuota(previous: QuotaSnapshot | undefined, next: QuotaSnapshot): QuotaSnapshot {
  if (previous === undefined || next.resetAt > previous.resetAt) return next;
  if (next.resetAt < previous.resetAt) return previous;
  return next.remaining <= previous.remaining ? next : { ...previous, cost: next.cost };
}

export class GitHubClient {
  private readonly origin: string;

  constructor(
    readonly credential: Credential,
    private readonly store: StateStore,
    private readonly roots: { rest: string; graphql: string },
    private readonly clock: Clock = systemClock,
  ) {
    this.origin = new URL(roots.rest).origin;
  }

  static async create(host = "github.com"): Promise<GitHubClient> {
    const credential = await resolveCredential(host);
    return new GitHubClient(credential, new StateStore(credential.fingerprint), apiRoot(host));
  }

  state(): CredentialState {
    return this.store.read();
  }

  pausedUntil(now = this.clock.now()): number | undefined {
    const until = this.store.read().pauseUntil;
    return until !== undefined && until > now ? until : undefined;
  }

  private checkPause(state: CredentialState): void {
    if (state.pauseUntil !== undefined && state.pauseUntil > this.clock.now()) {
      throw new RateLimitedError(state.pauseUntil, state.pauseReason ?? "paused");
    }
  }

  private async admit(kind: { type: "mutation" } | { type: "read" } | { type: "graphql"; priority: Priority }): Promise<number> {
    let seq = 0;
    let slot: number | undefined;
    this.store.update((current) => {
      this.checkPause(current);
      seq = current.pauseSeq ?? 0;
      const now = this.clock.now();
      if (kind.type === "mutation") {
        slot = Math.max(now, (current.lastMutationAt ?? 0) + MUTATION_SPACING_MS);
        return { ...current, lastMutationAt: slot };
      }
      const graphql = current.graphql;
      if (kind.type === "read" || graphql === undefined || graphql.resetAt <= now) return current;
      const after = graphql.remaining - Math.max(1, graphql.cost);
      if (after < 0 || (kind.priority === "background" && after < graphql.limit * GRAPHQL_RESERVE_RATIO)) {
        throw new RateLimitedError(graphql.resetAt, `GraphQL budget at ${graphql.remaining}/${graphql.limit}${kind.priority === "background" ? ", keeping the 10% reserve for interactive work" : ""}`);
      }
      return { ...current, graphql: { ...graphql, remaining: after } };
    });
    if (slot !== undefined) {
      const wait = slot - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      this.checkPause(this.store.read());
    }
    return seq;
  }

  private recordRateLimit(headers: Headers, reason: string): never {
    const now = this.clock.now();
    const fromHost = retryAtFromHeaders(headers, now);
    const state = this.store.update((current) => {
      const backoffMs = fromHost === undefined ? Math.min((current.backoffMs ?? FALLBACK_COOLDOWN_MS / 2) * 2, MAX_FALLBACK_COOLDOWN_MS) : undefined;
      const deadline = fromHost ?? now + (backoffMs ?? FALLBACK_COOLDOWN_MS);
      const existing = current.pauseUntil !== undefined && current.pauseUntil > now ? current.pauseUntil : undefined;
      const keepExisting = existing !== undefined && existing >= deadline;
      const { backoffMs: _old, ...rest } = current;
      return {
        ...rest,
        pauseUntil: keepExisting ? existing : deadline,
        pauseReason: keepExisting ? (current.pauseReason ?? reason) : reason,
        pauseSeq: (current.pauseSeq ?? 0) + 1,
        ...(backoffMs === undefined ? {} : { backoffMs }),
      };
    });
    throw new RateLimitedError(state.pauseUntil ?? now + FALLBACK_COOLDOWN_MS, reason);
  }

  private clearBackoff(admittedSeq: number): void {
    const state = this.store.read();
    if (state.backoffMs === undefined && state.pauseUntil === undefined) return;
    this.store.update((current) => {
      if ((current.pauseSeq ?? 0) !== admittedSeq) return current;
      if (current.pauseUntil !== undefined && current.pauseUntil > this.clock.now()) return current;
      const { backoffMs: _b, pauseUntil: _p, pauseReason: _r, ...rest } = current;
      return rest;
    });
  }

  private resolveUrl(path: string): string {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(path)) return `${this.roots.rest}/${path.replace(/^\//, "")}`;
    let url: URL;
    try {
      url = new URL(path);
    } catch {
      throw new UsageError(`invalid URL: ${path}`);
    }
    if (url.protocol !== "https:" || url.origin !== this.origin) throw new UsageError(`refusing to send GitHub credentials to ${url.origin}; only ${this.origin} is allowed`);
    return url.href;
  }

  private async send(url: string, init: RequestInit): Promise<{ response: Response; github: boolean }> {
    const base = new Headers(init.headers);
    base.set("x-github-api-version", API_VERSION);
    base.set("user-agent", "eng-github");
    let target = url;
    let request: RequestInit = init;
    for (let hop = 0; ; hop++) {
      const authenticated = new URL(target).origin === this.origin && target.startsWith("https:");
      const headers = new Headers(base);
      if (authenticated) headers.set("authorization", `Bearer ${this.credential.token}`);
      else headers.delete("if-none-match");
      let response: Response;
      try {
        response = await fetch(target, { ...request, headers, redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (cause) {
        throw new EngGithubError("failure", `GitHub request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || response.status === 304 || location === null) return { response, github: authenticated };
      if (hop >= MAX_REDIRECTS) throw new EngGithubError("failure", `Too many redirects from ${url}`);
      target = new URL(location, target).href;
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && request.method !== "GET")) {
        const { body: _body, ...rest } = request;
        request = { ...rest, method: "GET" };
        base.delete("content-type");
      }
    }
  }

  async rest<T = unknown>(request: RestRequest): Promise<RestResponse<T>> {
    const method = request.method ?? "GET";
    const url = this.resolveUrl(request.path);
    const seq = await this.admit(method === "GET" ? { type: "read" } : { type: "mutation" });
    const headers = new Headers({ accept: request.accept ?? "application/vnd.github+json" });
    const cached = method === "GET" ? this.store.readEtag(url) : undefined;
    if (cached !== undefined) headers.set("if-none-match", cached.etag);
    const init: RequestInit = { method, headers };
    if (request.body !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(request.body);
    }
    const { response, github } = await this.send(url, init);
    if (response.status === 304 && cached !== undefined) {
      this.clearBackoff(seq);
      const headers = new Headers(response.headers);
      if (cached.link !== undefined) headers.set("link", cached.link);
      return { status: 200, data: parse<T>(cached.body), text: cached.body, headers };
    }
    const text = await response.text();
    const core = github ? quotaFromHeaders(response.headers, undefined) : undefined;
    if (core !== undefined) this.store.update((current) => ({ ...current, core }));
    if (github && isRateLimited(response.status, response.headers, text, undefined)) this.recordRateLimit(response.headers, `HTTP ${response.status} on ${method} ${request.path}`);
    this.clearBackoff(seq);
    const data = parse<T>(text);
    if (!response.ok) {
      const message = (data as { message?: string } | undefined)?.message ?? response.statusText;
      throw new ApiError(response.status, `GitHub ${method} ${request.path} returned ${response.status}: ${message}`, data);
    }
    const etag = response.headers.get("etag");
    if (method === "GET" && etag !== null && text.length < 4_000_000) this.store.writeEtag(url, etag, text, response.headers.get("link"));
    return { status: response.status, data, text, headers: response.headers };
  }

  async restPaginate<T>(path: string, priority: Priority = "interactive"): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = path.includes("per_page=") ? path : `${path}${path.includes("?") ? "&" : "?"}per_page=100`;
    while (next !== undefined) {
      const page: RestResponse<T[] | { [key: string]: unknown }> = await this.rest({ path: next, priority });
      const data = page.data;
      if (Array.isArray(data)) items.push(...data);
      else {
        const list = Object.values(data).find(Array.isArray) as T[] | undefined;
        if (list !== undefined) items.push(...list);
      }
      const link = /<([^>]+)>;\s*rel="next"/.exec(page.headers.get("link") ?? "")?.[1];
      if (link !== undefined && new URL(link, this.origin).origin !== this.origin) throw new EngGithubError("failure", `GitHub pagination pointed off-origin: ${new URL(link, this.origin).origin}`);
      next = link;
    }
    return items;
  }

  async graphql<T>(request: GraphqlRequest): Promise<GraphqlResponse<T>> {
    const read = isRead(request.query);
    const seq = await this.admit(read ? { type: "graphql", priority: request.priority ?? "interactive" } : { type: "mutation" });
    const query = withRateLimitSelection(request.query);
    const { response } = await this.send(this.roots.graphql, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables: request.variables ?? {} }),
    });
    const text = await response.text();
    const body = parse<{ data?: T; errors?: GraphqlError[] }>(text) ?? {};
    const errors = body.errors ?? [];
    if (isRateLimited(response.status, response.headers, text, errors)) this.recordRateLimit(response.headers, `GraphQL ${response.status}${errors[0]?.message ? `: ${errors[0].message}` : ""}`);
    this.clearBackoff(seq);
    const quota = quotaFromGraphql(body.data);
    if (quota !== undefined) this.store.update((current) => ({ ...current, graphql: mergeQuota(current.graphql, quota) }));
    if (!response.ok) throw new ApiError(response.status, `GitHub GraphQL returned ${response.status}`, body);
    if (body.data === undefined || body.data === null) {
      throw new ApiError(response.status, `GitHub GraphQL failed: ${errors.map((error) => error.message).join("; ") || "no data"}`, body);
    }
    return { data: body.data, errors };
  }
}

function parse<T>(text: string): T {
  if (text === "") return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

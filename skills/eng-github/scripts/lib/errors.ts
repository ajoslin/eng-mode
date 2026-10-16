export const EXIT = {
  ok: 0,
  failure: 1,
  usage: 2,
  conflict: 3,
  changed: 4,
  rateLimited: 75,
} as const;

export type ExitName = keyof typeof EXIT;

export class EngGithubError extends Error {
  constructor(
    readonly exit: ExitName,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class UsageError extends EngGithubError {
  constructor(message: string) {
    super("usage", message);
  }
}

export class RateLimitedError extends EngGithubError {
  constructor(
    readonly retryAt: number,
    reason: string,
  ) {
    super("rateLimited", `GitHub rate limit: ${reason}. Requests resume at ${new Date(retryAt).toISOString()}.`, {
      retryAt: new Date(retryAt).toISOString(),
    });
  }
}

export class ApiError extends EngGithubError {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super("failure", message, { status, body });
  }
}

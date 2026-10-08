import type { ParsedArgs } from "./args.ts";
import type { GitHubClient } from "./client.ts";

export interface CommandContext {
  readonly client: GitHubClient;
  readonly args: ParsedArgs;
  readonly cwd: string;
}

export interface Command {
  readonly booleans?: readonly string[];
  readonly run: (context: CommandContext) => Promise<unknown>;
}

export type CommandTable = Readonly<Record<string, Command>>;

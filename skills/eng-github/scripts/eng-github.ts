#!/usr/bin/env bun
import { parseArgs } from "./lib/args.ts";
import { GitHubClient } from "./lib/client.ts";
import type { CommandTable } from "./lib/command.ts";
import { EngGithubError, EXIT, UsageError } from "./lib/errors.ts";
import { mutationCommands } from "./commands/mutate.ts";
import { readCommands } from "./commands/read.ts";
import { stackCommands } from "./commands/stack.ts";

const commands: CommandTable = { ...readCommands, ...mutationCommands, ...stackCommands };

const USAGE = `usage: eng-github COMMAND [args]

commands: ${Object.keys(commands).sort().join(", ")}

See the eng-github skill for every command, its flags, and its JSON output.`;

function commandName(argv: readonly string[]): { name: string; rest: readonly string[] } {
  const [first, second, ...rest] = argv;
  if (first === undefined) throw new UsageError(USAGE);
  if (second !== undefined && commands[`${first} ${second}`] !== undefined) return { name: `${first} ${second}`, rest };
  return { name: first, rest: argv.slice(1) };
}

async function main(argv: readonly string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    console.log(USAGE);
    return EXIT.ok;
  }
  const { name, rest } = commandName(argv);
  const command = commands[name];
  if (command === undefined) throw new UsageError(`unknown command: ${name}\n\n${USAGE}`);
  const args = parseArgs(rest, command.booleans);
  const client = await GitHubClient.create();
  const result = await command.run({ client, args, cwd: process.cwd() });
  if (result !== undefined) console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  return EXIT.ok;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof EngGithubError) {
    console.error(`eng-github: ${error.message}`);
    if (error.details !== undefined) console.error(JSON.stringify(error.details));
    process.exitCode = EXIT[error.exit];
  } else {
    console.error(`eng-github: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    process.exitCode = EXIT.failure;
  }
}

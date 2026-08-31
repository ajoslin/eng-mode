import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { getAgentDir } from "@oh-my-pi/pi-utils";
import { parse, stringify } from "yaml";
import { join, resolve } from "node:path";

export const advisorFileNames = ["WATCHDOG.md", "WATCHDOG.yml"] as const;
export type AdvisorFileName = (typeof advisorFileNames)[number];
export type AdvisorFileStatus = "installed" | "unchanged" | "updated";

const ADVISOR_NAME = "Luna";
const MARKDOWN_START = "<!-- eng-mode:watchdog:start -->";
const MARKDOWN_END = "<!-- eng-mode:watchdog:end -->";

export interface AdvisorFileResult {
  readonly file: AdvisorFileName;
  readonly status: AdvisorFileStatus;
  readonly path: string;
}

export interface InstallEngAdvisorInput {
  readonly pluginRoot: string;
  readonly agentDir?: string;
}

export interface InstallEngAdvisorResult {
  readonly agentDir: string;
  readonly pluginRoot: string;
  readonly files: readonly AdvisorFileResult[];
}

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function writeAtomic(path: string, content: string): AdvisorFileStatus {
  const current = read(path);
  if (current === content) return "unchanged";
  mkdirSync(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.eng-mode-${process.pid}-${crypto.randomUUID()}`;
  writeFileSync(temporary, content);
  try {
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return current.length === 0 ? "installed" : "updated";
}

function markdownContent(source: string, destination: string): string {
  const section = `${MARKDOWN_START}\n${source.trim()}\n${MARKDOWN_END}`;
  const current = read(destination);
  const start = current.indexOf(MARKDOWN_START);
  const end = current.indexOf(MARKDOWN_END);
  if (start !== -1 && end >= start) {
    return `${current.slice(0, start)}${section}${current.slice(end + MARKDOWN_END.length)}`;
  }
  return current.trim().length === 0 ? `${section}\n` : `${current.trimEnd()}\n\n${section}\n`;
}

function yamlContent(source: string, destination: string): string {
  const sourceDoc = parse(source) as { advisors?: Array<Record<string, unknown>> } | null;
  const luna = sourceDoc?.advisors?.find((advisor) => advisor["name"] === ADVISOR_NAME);
  if (!luna) throw new Error(`shipped WATCHDOG.yml has no ${ADVISOR_NAME} advisor`);
  const current = read(destination);
  const parsed = current.trim().length === 0 ? {} : parse(current);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`existing WATCHDOG.yml must contain a YAML object: ${destination}`);
  }
  const doc = parsed as { advisors?: unknown } & Record<string, unknown>;
  const advisors = doc.advisors === undefined ? [] : doc.advisors;
  if (!Array.isArray(advisors)) throw new Error(`existing WATCHDOG.yml advisors must be an array: ${destination}`);
  const retained = advisors.filter((advisor) => (
    advisor === null || typeof advisor !== "object" || Array.isArray(advisor) ||
    (advisor as Record<string, unknown>)["name"] !== ADVISOR_NAME
  ));
  return stringify({ ...doc, advisors: [...retained, luna] });
}

export function installEngAdvisor(input: InstallEngAdvisorInput): InstallEngAdvisorResult {
  const pluginRoot = resolve(input.pluginRoot);
  const agentDir = resolve(input.agentDir ?? getAgentDir());
  const markdownPath = join(agentDir, "WATCHDOG.md");
  const yamlPath = join(agentDir, "WATCHDOG.yml");
  const markdownSource = join(pluginRoot, "WATCHDOG.md");
  const yamlSource = join(pluginRoot, "WATCHDOG.yml");
  if (!existsSync(markdownSource)) throw new Error(`missing advisor source ${markdownSource}`);
  if (!existsSync(yamlSource)) throw new Error(`missing advisor source ${yamlSource}`);
  const files: AdvisorFileResult[] = [
    { file: "WATCHDOG.md", path: markdownPath, status: writeAtomic(markdownPath, markdownContent(read(markdownSource), markdownPath)) },
    { file: "WATCHDOG.yml", path: yamlPath, status: writeAtomic(yamlPath, yamlContent(read(yamlSource), yamlPath)) },
  ];
  return { agentDir, pluginRoot: realpathSync(pluginRoot), files };
}

if (import.meta.main) {
  const pluginRoot = process.argv[2] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(installEngAdvisor({ pluginRoot }), null, 2)}\n`);
}

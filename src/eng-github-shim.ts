import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

export const SHIM_MARKER = "# eng-mode: eng-github shim";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

export interface ShimOptions {
  readonly packageRoot: string;
  readonly binDir: string;
  readonly bunCandidates: readonly string[];
}

export type ShimResult = "written" | "unchanged" | "foreign-file";

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function shimScript(packageRoot: string, bunCandidates: readonly string[]): string {
  const script = join(packageRoot, "skills", "eng-github", "scripts", "eng-github.ts");
  return `#!/bin/sh
${SHIM_MARKER}. The Eng Mode OMP extension rewrites this file on load.
script=${quote(script)}
if [ ! -f "$script" ]; then
  echo "eng-github: $script is missing; reinstall with: omp plugin install github:ajoslin/eng-mode" >&2
  exit 127
fi
PATH="\${PATH:+$PATH:}$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export PATH
bun_bin=$(command -v bun 2>/dev/null)
if [ -z "$bun_bin" ]; then
  for candidate in ${bunCandidates.map(quote).join(" ")}; do
    if [ -x "$candidate" ]; then bun_bin=$candidate; break; fi
  done
fi
if [ -z "$bun_bin" ]; then
  echo "eng-github: bun not found on PATH or in its usual install locations" >&2
  exit 127
fi
exec "$bun_bin" "$script" "$@"
`;
}

export function installEngGithubShim(options: ShimOptions): ShimResult {
  const target = join(options.binDir, "eng-github");
  const content = shimScript(options.packageRoot, options.bunCandidates);
  if (existsSync(target)) {
    const current = readFileSync(target, "utf8");
    if (current === content) return "unchanged";
    if (!current.includes(SHIM_MARKER)) return "foreign-file";
  }
  mkdirSync(options.binDir, { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, content);
  chmodSync(temporary, 0o755);
  renameSync(temporary, target);
  return "written";
}

function defaultBunCandidates(): string[] {
  const home = homedir();
  const candidates = [
    Bun.which("bun"),
    process.env.BUN_INSTALL === undefined ? undefined : join(process.env.BUN_INSTALL, "bin", "bun"),
    join(home, ".local", "bin", "bun"),
    join(home, ".bun", "bin", "bun"),
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
  ];
  return [...new Set(candidates.filter((candidate): candidate is string => candidate !== undefined && candidate !== null))];
}

export function registerEngGithubShim(): void {
  if (!PACKAGE_ROOT.includes(`${sep}node_modules${sep}`)) return;
  try {
    const result = installEngGithubShim({
      packageRoot: PACKAGE_ROOT,
      binDir: join(homedir(), ".local", "bin"),
      bunCandidates: defaultBunCandidates(),
    });
    if (result === "foreign-file") {
      console.warn("eng-mode: ~/.local/bin/eng-github exists and was not written by Eng Mode; leaving it alone");
    }
  } catch (error) {
    console.warn(`eng-mode: could not install ~/.local/bin/eng-github: ${error instanceof Error ? error.message : String(error)}`);
  }
}

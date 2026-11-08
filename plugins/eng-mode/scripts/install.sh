#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
command -v claude >/dev/null 2>&1 || { echo "install: claude CLI not on PATH" >&2; exit 69; }
command -v bun >/dev/null 2>&1 || { echo "install: bun not on PATH; the eng-mode hooks and helpers run with bun" >&2; exit 69; }
plugins=$(claude plugin list --json)
printf '%s' "$plugins" | grep -q '"id": *"pstack@pstack-claude"' || {
  echo "install: pstack@pstack-claude is not installed. Run: claude plugin marketplace add michael-denyer/pstack-claude && claude plugin install pstack@pstack-claude" >&2
  exit 69
}
registered=$(claude plugin marketplace list --json | bun -e 'const list = JSON.parse(await Bun.stdin.text()); const entry = list.find((m) => m.name === "eng-mode"); console.log(entry === undefined ? "" : entry.path ?? entry.installLocation ?? "?")')
if [ -n "$registered" ] && [ "$registered" != "$repo" ]; then
  echo "install: marketplace eng-mode points at $registered; repointing it to $repo" >&2
  claude plugin marketplace remove eng-mode
  registered=
fi
if [ -n "$registered" ]; then
  claude plugin marketplace update eng-mode
else
  claude plugin marketplace add "$repo"
fi
if printf '%s' "$plugins" | grep -q '"id": *"eng-mode@eng-mode"'; then
  claude plugin uninstall eng-mode@eng-mode --scope user
fi
claude plugin install eng-mode@eng-mode --scope user
source=$(claude plugin list --json | bun -e 'const entry = JSON.parse(await Bun.stdin.text()).find((p) => p.id === "eng-mode@eng-mode"); console.log(entry?.readFromFolder ?? "")')
[ "$source" = "$repo/plugins/eng-mode" ] || { echo "install: eng-mode@eng-mode reads from '$source', expected $repo/plugins/eng-mode" >&2; exit 1; }
echo "eng-mode@eng-mode installed from $repo. Start a new Claude Code session, then run /eng-mode TASK."

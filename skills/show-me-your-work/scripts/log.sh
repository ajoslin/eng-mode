#!/usr/bin/env bash
# Append a well-formed row to a show-me-your-work decision log (TSV).
# Usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>
set -euo pipefail

if [ "$#" -ne 6 ]; then
	printf 'usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>\n' >&2
	exit 1
fi

logfile="$1"
shift

logdir="$(dirname "$logfile")"
if [ -n "$logdir" ] && [ "$logdir" != "." ] && [ ! -d "$logdir" ]; then
	mkdir -p "$logdir"
fi

publish_header_atomically() {
	local header
	header="$(mktemp "${logfile}.init.XXXXXX")"
	trap 'rm -f "$header"' EXIT
	printf 'ts\tphase\tdecision\twhy\tevidence\tresult\n' > "$header"
	if ! ln "$header" "$logfile" 2>/dev/null && [ ! -f "$logfile" ]; then
		printf 'cannot initialize log: %s\n' "$logfile" >&2
		exit 1
	fi
	rm -f "$header"
	trap - EXIT
}

if [ ! -f "$logfile" ]; then
	publish_header_atomically
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
escape_tsv_cell_for_spreadsheets() {
	local v
	v=$(printf '%s' "$1" | tr '\t\n\r' '   ')
	case "$v" in
		=*|+*|-*|@*) printf "'%s" "$v" ;;
		*) printf '%s' "$v" ;;
	esac
}
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$ts" "$(escape_tsv_cell_for_spreadsheets "$1")" "$(escape_tsv_cell_for_spreadsheets "$2")" "$(escape_tsv_cell_for_spreadsheets "$3")" "$(escape_tsv_cell_for_spreadsheets "$4")" "$(escape_tsv_cell_for_spreadsheets "$5")" \
	>> "$logfile"

import type { AutocompleteItem } from "@oh-my-pi/pi-tui";
import type { DurableFinding } from "./types";

const COMMANDS: readonly { name: string; description: string; usage?: string }[] = [
	{ name: "status", description: "Show state, role, models, and open findings (default)" },
	{ name: "show", description: "Alias for status" },
	{ name: "on", description: "Resume automatic review and check pending material" },
	{ name: "off", description: "Pause automatic review and cancel active or queued reviews" },
	{ name: "review", description: "Review unreviewed material once, including while paused" },
	{ name: "refresh", description: "Revisit recent material once and re-emit unchanged open findings" },
	{ name: "primary", description: "Select the configured primary for this session" },
	{ name: "fallback", description: "Select the configured fallback for this session" },
	{ name: "reload", description: "Reload configuration and guidance; retry primary preference" },
	{ name: "dismiss", usage: "<key-prefix>", description: "Dismiss one uniquely matched open finding" },
	{ name: "help", description: "Show all commands and usage" },
];

export const ADVISOR_COMMAND_HELP = [
	"Eng-Advisor commands (bare /eng-advisor shows status):",
	...COMMANDS.map(command => `/eng-advisor ${command.name}${command.usage ? ` ${command.usage}` : ""} — ${command.description}`),
	"",
	"Review and refresh work once while paused without resuming automatic review.",
	"Refresh revisits the configured recent-message window; unchanged dismissed findings stay closed.",
	"Model selection and reload preserve pause state and findings. Reload reads configuration, not updated extension code; restart OMP after code updates.",
	"Type /eng-advisor followed by a space for options. After dismiss, autocomplete suggests open finding keys and summaries.",
].join("\n");

export function advisorArgumentCompletions(
	argumentPrefix: string,
	findings: readonly Pick<DurableFinding, "key" | "status" | "severity" | "note">[],
): AutocompleteItem[] | null {
	const prefix = argumentPrefix.trimStart();
	if (!/\s/u.test(prefix)) {
		const matches = COMMANDS.filter(command => command.name.startsWith(prefix.toLowerCase())).map(command => ({
			value: `${command.name} `,
			label: command.name,
			description: command.description,
			...(command.usage ? { hint: command.usage } : {}),
		}));
		return matches.length ? matches : null;
	}
	const dismiss = /^dismiss\s+(\S*)$/iu.exec(prefix);
	if (!dismiss) return null;
	const keyPrefix = dismiss[1]!.toLowerCase();
	const matches = findings.filter(finding => finding.status === "open" && finding.key.startsWith(keyPrefix)).map(finding => ({
		// Insert the full key so even findings sharing a displayed prefix stay unambiguous.
		value: `dismiss ${finding.key} `,
		label: finding.key.slice(0, 12),
		description: `[${finding.severity}] ${finding.note.replace(/\s+/gu, " ")}`,
	}));
	return matches.length ? matches : null;
}

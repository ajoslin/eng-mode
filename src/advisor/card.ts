import { Box, type BoxBorder, Spacer, Text } from "@oh-my-pi/pi-tui";
import type { EngAdvisorCardDetails } from "./types";

type CardTone = "muted" | "warning" | "error";

export interface EngAdvisorCardTheme {
	boxRound: BoxBorder["chars"];
	bold(text: string): string;
	fg(color: CardTone | "customMessageText", text: string): string;
	bg(color: "customMessageBg", text: string): string;
}

export function renderEngAdvisorCard(details: EngAdvisorCardDetails, theme: EngAdvisorCardTheme): Box {
	const { finding, suppressedRepeats } = details;
	const tone: CardTone =
		finding.severity === "blocker" ? "error" : finding.severity === "concern" ? "warning" : "muted";
	const repeats = suppressedRepeats > 0 ? ` · ${suppressedRepeats} repeats coalesced` : "";
	const box = new Box(1, 1, text => theme.bg("customMessageBg", text), {
		chars: theme.boxRound,
		color: text => theme.fg(tone, text),
	});
	box.setIgnoreTight(true);
	box.addChild(new Text(theme.fg(tone, theme.bold(`Eng-Advisor · ${finding.severity}${repeats}`)), 0, 0));
	box.addChild(new Spacer(1));
	box.addChild(new Text(theme.fg("customMessageText", finding.note), 0, 0));
	box.addChild(new Spacer(1));
	box.addChild(new Text(theme.fg("muted", `${finding.resource} · ${finding.key.slice(0, 12)}`), 0, 0));
	return box;
}

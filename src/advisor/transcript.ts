import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import type { CompiledEngAdvisorConfig } from "./config";
import type { ReviewBatch } from "./types";

const SHELL_TOOL_NAMES: Record<string, true> = { bash: true, shell: true, exec: true, terminal: true };

function bounded(value: unknown, max: number): string {
	const text = typeof value === "string" ? value : JSON.stringify(value);
	if (!text) return "";
	return text.length <= max ? text : `${text.slice(0, max)}\n[truncated]`;
}

function toolNameSegments(name: string): string[] {
	return name
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter(Boolean);
}
function isIgnoredToolName(name: string, config: CompiledEngAdvisorConfig): boolean {
	const normalized = name.toLowerCase();
	const segments = toolNameSegments(normalized);
	return (
		config.ignoredToolNames.some(blocked => segments.includes(blocked.toLowerCase())) ||
		config.ignoredToolNamePrefixes.some(prefix => normalized.startsWith(prefix.toLowerCase())) ||
		config.ignoredToolNameRegexes.some(pattern => pattern.test(normalized))
	);
}

function isIgnoredTool(name: string, input: Record<string, unknown>, config: CompiledEngAdvisorConfig): boolean {
	const segments = toolNameSegments(name.toLowerCase());
	if (isIgnoredToolName(name, config)) return true;
	if (!segments.some(segment => SHELL_TOOL_NAMES[segment])) return false;
	const command = [input.command, input.cmd, input.script].find(value => typeof value === "string");
	return typeof command === "string" && config.ignoredShellCommandRegexes.some(pattern => pattern.test(command));
}
function textBlocks(message: AgentMessage, max: number): string {
	if (!("content" in message)) return "";
	if (typeof message.content === "string") return bounded(message.content, max);
	if (!Array.isArray(message.content)) return "";
	return message.content
		.flatMap(block => {
			if (block.type === "text") return [bounded(block.text, max)];
			if (block.type === "thinking") return [bounded(block.thinking, max)];
			return [];
		})
		.join("\n");
}

function matchesTranscriptBlacklist(message: AgentMessage, config: CompiledEngAdvisorConfig): boolean {
	const text = textBlocks(message, config.maxFieldChars);
	return text.length > 0 && config.ignoredTranscriptRegexes.some(pattern => pattern.test(text));
}

function assistantCallIds(message: AgentMessage): string[] {
	if (message.role !== "assistant") return [];
	return message.content.flatMap(block => (block.type === "toolCall" ? [block.id] : []));
}

function assistantHasIgnoredCall(message: AgentMessage, config: CompiledEngAdvisorConfig): boolean {
	if (message.role !== "assistant") return false;
	return message.content.some(
		block => block.type === "toolCall" && isIgnoredTool(block.name, block.arguments, config),
	);
}

function formatAssistant(message: Extract<AgentMessage, { role: "assistant" }>, index: number, max: number): string {
	const parts = [`[message:${index}] agent`];
	for (const block of message.content) {
		if (block.type === "text") parts.push(bounded(block.text, max));
		else if (block.type === "thinking") parts.push(`[reasoning]\n${bounded(block.thinking, max)}`);
		else if (block.type === "toolCall") {
			parts.push(`[tool:${block.id}] ${block.name}(${bounded(block.arguments, max)})`);
		}
	}
	return parts.join("\n");
}

function formatMessage(message: AgentMessage, index: number, max: number): string {
	if (message.role === "assistant") return formatAssistant(message, index, max);
	if (message.role === "toolResult") {
		const details =
			"details" in message && message.details !== undefined ? `\n[details]\n${bounded(message.details, max)}` : "";
		return `[message:${index}] result:${message.toolName}:${message.toolCallId}\n${textBlocks(message, max)}${details}`;
	}
	if (message.role === "custom") {
		return `[message:${index}] context:${message.customType}\n${textBlocks(message, max)}`;
	}
	return `[message:${index}] ${message.role}\n${textBlocks(message, max)}`;
}

export function filterReviewBatch(
	messages: AgentMessage[],
	cursor: number,
	wip: boolean,
	config: CompiledEngAdvisorConfig,
	hiddenCallIds = new Set<string>(),
): ReviewBatch | null {
	const omitted = Math.max(0, messages.length - config.maxBatchMessages);
	const reviewMessages = messages.slice(omitted);
	const retained: { message: AgentMessage; index: number }[] = [];
	const groundingText = new Map<string, string>();
	for (const [offset, message] of reviewMessages.entries()) {
		const index = omitted + offset;
		if (message.role === "custom" && config.ignoredCustomMessageTypes.some(type => type === message.customType)) {
			continue;
		}
		if (matchesTranscriptBlacklist(message, config)) continue;
		if (assistantHasIgnoredCall(message, config)) {
			for (const id of assistantCallIds(message)) hiddenCallIds.add(id);
			continue;
		}
		if (
			message.role === "toolResult" &&
			(hiddenCallIds.delete(message.toolCallId) || isIgnoredToolName(message.toolName, config))
		) {
			continue;
		}
		retained.push({ message, index });
	}
	if (retained.length === 0) return null;
	const formatted = retained.map(({ message, index }) => ({
		message,
		locator: `message:${cursor + index}`,
		text: formatMessage(message, cursor + index, config.maxFieldChars),
	}));
	let totalChars = 0;
	let start = formatted.length;
	while (start > 0) {
		const candidate = formatted[start - 1];
		if (!candidate || totalChars + candidate.text.length > config.maxReviewChars) break;
		totalChars += candidate.text.length;
		start--;
	}
	const selected = formatted.slice(start);
	for (const item of selected) groundingText.set(item.locator, item.text);
	const text = [
		"### Session update",
		...selected.map(item => item.text),
		wip ? "[in progress — more steps follow]" : "",
	]
		.filter(Boolean)
		.join("\n\n");
	return {
		messages: selected.map(item => item.message),
		text,
		groundingText,
		wip,
		cursor: cursor + messages.length,
	};
}

import { expect, test } from "bun:test";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { CombinedAutocompleteProvider, type AutocompleteItem } from "@oh-my-pi/pi-tui";
import { registerEngAdvisor, type AdvisorExtensionAPI } from "../index";

function commands() {
  let handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  let completions: ((prefix: string) => AutocompleteItem[] | null) | undefined;
  const notices: Array<{message: string; level: string | undefined}> = [];
  const unexpected = () => { throw new Error("Status must not mutate or schedule work"); };
  registerEngAdvisor({
    registerCommand: (name: string, command: {handler: typeof handler; getArgumentCompletions?: typeof completions}) => {
      expect(name).toBe("eng-advisor");
      handler = command.handler;
      completions = command.getArgumentCompletions;
    },
    registerMessageRenderer: () => {},
    on: () => {},
    appendEntry: unexpected,
    sendMessage: unexpected,
  } as unknown as AdvisorExtensionAPI);
  const ctx = {
    ui: {notify: (message: string, level?: string) => notices.push({message, level})},
    setTimeout: unexpected,
  } as unknown as ExtensionContext;
  return {run: (args: string) => handler(args, ctx), complete: (prefix: string) => completions?.(prefix) ?? null, notices};
}

test.each(["", " ", "\t\n", "status", "show", " show "])("status command accepts %j without starting a review", async args => {
  const {run, notices} = commands();
  await run(args);
  expect(notices).toHaveLength(1);
  expect(notices[0]?.message).toStartWith("Eng-Advisor: enabled");
  expect(notices[0]?.level).toBe("info");
});

test("show reports the actual paused state", async () => {
  const {run, notices} = commands();
  await run("off");
  await run("show");
  expect(notices).toHaveLength(2);
  expect(notices[1]?.message).toStartWith("Eng-Advisor: paused");
});

test("unknown commands still produce a warning", async () => {
  const {run, notices} = commands();
  await run("shwo");
  expect(notices).toEqual([{message: "Unknown Eng-Advisor command: shwo. Use /eng-advisor help.", level: "warning"}]);
});

test.each(["help", "--help", "-h"])("%s explains commands without changing state or scheduling work", async args => {
  const c = commands();
  await c.run("off");await c.run(args);
  const help = c.notices.at(-1)?.message ?? "";
  expect(help).toContain("/eng-advisor dismiss <key-prefix>");
  expect(help).toContain("/eng-advisor review");
  expect(help).toContain("/eng-advisor refresh");
  expect(help).toContain("without resuming automatic review");
  await c.run("");
  expect(c.notices.at(-1)?.message).toStartWith("Eng-Advisor: paused");
});

test("completion lists described options and a dismissal argument hint without running commands", () => {
  const c = commands();
  const items = c.complete("") ?? [];
  expect(items.map(item => item.label)).toEqual(["status", "show", "on", "off", "review", "refresh", "primary", "fallback", "reload", "dismiss", "help"]);
  expect(items.every(item => (item.description?.length ?? 0) > 0)).toBe(true);
  expect(items.find(item => item.label === "dismiss")?.hint).toBe("<key-prefix>");
  expect(c.notices).toHaveLength(0);
});

test("native OMP completion filters options and inserts the selected argument", async () => {
  const c = commands();
  const provider = new CombinedAutocompleteProvider([{name: "eng-advisor", getArgumentCompletions: c.complete}]);
  const line = "/eng-advisor RE";
  const suggestions = await provider.getSuggestions([line], 0, line.length);
  expect(suggestions?.items.map(item => item.label)).toEqual(["review", "refresh", "reload"]);
  const selected = suggestions!.items.find(item => item.label === "refresh")!;
  const applied = provider.applyCompletion([line], 0, line.length, selected, suggestions!.prefix);
  expect(applied.lines).toEqual(["/eng-advisor refresh "]);
  expect(applied.cursorCol).toBe(applied.lines[0]!.length);
  expect(c.complete("review ")).toBeNull();
  expect(c.complete("unknown")).toBeNull();
  expect(c.complete("dismiss missing extra")).toBeNull();
  expect(c.notices).toHaveLength(0);
});

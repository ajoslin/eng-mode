import { expect, test } from "bun:test";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { registerEngAdvisor, type AdvisorExtensionAPI } from "../index";

function commands() {
  let handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  const notices: Array<{message: string; level: string | undefined}> = [];
  const unexpected = () => { throw new Error("Status must not mutate or schedule work"); };
  registerEngAdvisor({
    registerCommand: (name: string, command: {handler: (args: string, ctx: ExtensionContext) => Promise<void>}) => {
      expect(name).toBe("eng-advisor");
      handler = command.handler;
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
  return {run: (args: string) => handler(args, ctx), notices};
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
  expect(notices).toEqual([{message: "Unknown Eng-Advisor command: shwo", level: "warning"}]);
});

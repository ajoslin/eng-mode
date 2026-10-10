import { describe, expect, it } from "bun:test";
import { blocksProcessSignal } from "./process-signal-guard.ts";
import { loadExtensions } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/loader";

const call = (toolName: string, input: Record<string, unknown>) => ({ toolName, input });

describe("process signal guard", () => {
  it.each([
    "pkill -f 'bun.*backfill'", "killall bun", "/usr/bin/pkill -f backfill",
    "sudo /usr/bin/killall bun", "bash -lc 'pkill -f backfill'",
    "kill $(pgrep -f backfill)", "kill `pgrep -f backfill`",
    "pgrep -f backfill | xargs kill", "pgrep -f backfill | /usr/bin/xargs /bin/kill -9",
    "'pkill' -f backfill", "\"/usr/bin/killall\" bun",
    "python3 -c 'import os; os.system(\"pkill -f backfill\")'",
    "bun -e 'Bun.spawn([\"pkill\", \"-f\", \"backfill\"])'",
    "python -c 'import subprocess; subprocess.run([\"killall\", \"bun\"])'",
    "kill 0", "kill -- -0", "kill -9 -1", "kill -- -12345", "kill $pid", "kill $((pid))",
  ])("rejects %s", (command) => {
    expect(blocksProcessSignal(call("bash", { command }))).toBe(true);
  });
  it.each(["pgrep -af backfill", "kill -TERM 12345", "echo 'pkill -f backfill'"])("allows %s", (command) => {
    expect(blocksProcessSignal(call("bash", { command }))).toBe(false);
  });
  it("rejects eval subprocess and parallel payloads", () => {
    expect(blocksProcessSignal(call("eval", { code: "subprocess.run(['/usr/bin/pkill', '-f', 'backfill'])" }))).toBe(true);
    expect(blocksProcessSignal(call("eval", { code: "await Bun.$`kill $(pgrep -f backfill)`" }))).toBe(true);
    expect(blocksProcessSignal(call("multi_tool_use.parallel", { tool_uses: [{ recipient_name: "functions.bash", parameters: { command: "pkill -f backfill" } }] }))).toBe(true);
    for (const code of ["process.kill(0)", "process.kill(NaN)", "process.kill(pid)", "os.kill(-1, 9)"]) {
      expect(blocksProcessSignal(call("eval", { code }))).toBe(true);
    }
  });
  it("does not inspect read/write example code", () => {
    expect(blocksProcessSignal(call("read", { path: "pkill.md" }))).toBe(false);
    expect(blocksProcessSignal(call("write", { path: "example.ts", content: "pkill -f backfill" }))).toBe(false);
  });
});

it("loads the installed extension, blocks the incident, and permits an owned child PID", async () => {
  const path = new URL("./extension.ts", import.meta.url).pathname;
  const loaded = await loadExtensions([path], process.cwd());
  expect(loaded.errors).toEqual([]);
  const extension = loaded.extensions[0];
  expect(extension?.resolvedPath).toBe(path);
  const handlers = extension?.handlers.get("tool_call") ?? [];
  const handler = handlers.find((candidate) => {
    const result = candidate({ type: "tool_call", toolCallId: "incident", toolName: "bash", input: { command: "pkill -f 'bun.*backfill'" } }, undefined);
    return typeof result === "object" && result !== null && "reason" in result && typeof result.reason === "string" && result.reason.includes("owned recorded PID");
  });
  expect(handler).toBeDefined();
  if (!handler) throw new Error("Installed process signal handler missing");
  const blocked = await handler({ type: "tool_call", toolCallId: "incident", toolName: "bash", input: { command: "pkill -f apps/market-ingest/src/main.ts" } }, undefined);
  expect(blocked).toEqual({ block: true, reason: "Blocked: pattern-based process signalling can terminate unrelated or production processes. Never use pkill, killall, or pgrep-derived kill targets. Use only an owned recorded PID or your own process group, recorded when you spawned it." });
  const child = Bun.spawn(["/bin/sleep", "60"], { stdout: "ignore", stderr: "ignore" });
  const pid = child.pid;
  try {
    const command = `kill -TERM ${pid}`;
    expect(await handler({ type: "tool_call", toolCallId: "owned", toolName: "bash", input: { command } }, undefined)).toBeUndefined();
    const signal = Bun.spawn(["/bin/sh", "-c", command]);
    expect(await signal.exited).toBe(0);
    await child.exited;
    expect(child.signalCode).toBe("SIGTERM");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}, 30000);

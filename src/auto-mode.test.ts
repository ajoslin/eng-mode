import { describe, expect, it } from "bun:test";
import { registerAutoMode } from "./auto-mode.ts";
import type { ExtensionAPI, ExtensionContext } from "./extension-types.ts";

describe("auto mode", () => {
  it("fails open when classifier setup hangs", async () => {
    let handler: ((event: unknown, context: ExtensionContext) => Promise<unknown>) | undefined;
    const pi = {
      on: (_event: string, value: typeof handler) => {
        handler = value;
      },
    } as unknown as ExtensionAPI;
    registerAutoMode(
      pi,
      "expert guidance",
      {
        customType: "test",
        content: "expert guidance",
        display: false,
        attribution: "agent",
      },
      0,
    );
    const context = {
      models: { resolve: () => ({}) },
      modelRegistry: { getApiKey: () => new Promise<string>(() => {}) },
    } as unknown as ExtensionContext;

    await expect(
      handler?.({ prompt: "Choose the storage architecture" }, context),
    ).resolves.toEqual({});
  });
});

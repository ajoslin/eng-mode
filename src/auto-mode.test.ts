import { describe, expect, it } from "bun:test";
import { classifierOutputNeedsExpertGuidance, registerAutoMode } from "./auto-mode.ts";
import type { CustomMessagePayload, ExtensionAPI } from "./extension-types.ts";
import type { DangerVerdict, ExpertVerdict, OperationClassifier } from "./typesafe.ts";

const message: CustomMessagePayload = {
  customType: "test",
  content: "expert guidance",
  display: false,
  attribution: "agent",
};

function fakeClassifier(danger: DangerVerdict, expert: ExpertVerdict): OperationClassifier {
  return {
    classifyDanger: async () => danger,
    classifyExpert: async () => expert,
  };
}

type BeforeAgentStartHandler = (event: { prompt: string }) => Promise<{ message?: CustomMessagePayload }>;

function captureHandler(): { pi: ExtensionAPI; handler: BeforeAgentStartHandler | undefined } {
  let handler: BeforeAgentStartHandler | undefined;
  const pi = {
    on: (_event: string, value: (event: unknown) => unknown) => {
      handler = value as BeforeAgentStartHandler;
    },
  } as ExtensionAPI;
  return {
    pi,
    get handler() {
      return handler;
    },
  };
}

describe("classifierOutputNeedsExpertGuidance", () => {
  it("requires guidance only for the expert lens", () => {
    expect(classifierOutputNeedsExpertGuidance("ordinary")).toBeFalse();
    expect(classifierOutputNeedsExpertGuidance("expert")).toBeTrue();
    expect(classifierOutputNeedsExpertGuidance(undefined)).toBeFalse();
  });
});

describe("registerAutoMode", () => {
  it("injects the expert message when classified expert", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "expert" }));
    await expect(captured.handler?.({ prompt: "Choose the storage architecture" })).resolves.toEqual({ message });
  });

  it("does not inject for an ordinary lens", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "classified", lens: "ordinary" }));
    await expect(captured.handler?.({ prompt: "Fix this failing test" })).resolves.toEqual({});
  });

  it("fails open when the classifier is disabled", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "disabled" }));
    await expect(captured.handler?.({ prompt: "Review the architecture" })).resolves.toEqual({});
  });

  it("fails open when the classifier errors", async () => {
    const captured = captureHandler();
    registerAutoMode(captured.pi, "guidance", message, fakeClassifier({ kind: "error" }, { kind: "error" }));
    await expect(captured.handler?.({ prompt: "Review the architecture" })).resolves.toEqual({});
  });

  it("fails open when the classifier throws", async () => {
    const captured = captureHandler();
    const throwing: OperationClassifier = {
      classifyDanger: async () => ({ kind: "error" }),
      classifyExpert: async () => {
        throw new Error("boom");
      },
    };
    registerAutoMode(captured.pi, "guidance", message, throwing);
    await expect(captured.handler?.({ prompt: "Review the architecture" })).resolves.toEqual({});
  });

  it("skips classification when the prompt already carries the guidance", async () => {
    const captured = captureHandler();
    let calls = 0;
    const counting: OperationClassifier = {
      classifyDanger: async () => ({ kind: "error" }),
      classifyExpert: async () => {
        calls += 1;
        return { kind: "classified", lens: "expert" };
      },
    };
    registerAutoMode(captured.pi, "guidance", message, counting);
    await expect(captured.handler?.({ prompt: "do this guidance thing" })).resolves.toEqual({});
    expect(calls).toBe(0);
  });
});
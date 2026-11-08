import { afterAll, describe, expect, it } from "bun:test";
import { ExtraModelError, execute, parseArgs } from "../plugins/eng-mode/lib/extra-model.ts";

const noStdin = () => Promise.resolve("");

describe("eng-extra-model", () => {
  const seen: unknown[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/v1/models") return Response.json({ data: [{ id: "model-a" }, { id: "model-b" }] });
      if (url.pathname === "/v1/chat/completions") {
        seen.push({ auth: request.headers.get("authorization"), body: await request.json() });
        return Response.json({ choices: [{ message: { content: "ANSWER" } }] });
      }
      return new Response("nope", { status: 404 });
    },
  });
  afterAll(() => server.stop(true));
  const env = { ENG_CLIPROXY_BASE_URL: `http://127.0.0.1:${server.port}/v1/`, ENG_CLIPROXY_API_KEY: "k" };

  it("sends the prompt to the proxy and returns the completion", async () => {
    const request = await parseArgs(["--provider", "cliproxy", "--model", "model-a", "--prompt", "hi"], noStdin);
    expect(await execute(request, env)).toBe("ANSWER");
    expect(seen).toEqual([{ auth: "Bearer k", body: { model: "model-a", messages: [{ role: "user", content: "hi" }] } }]);
  });

  it("reads the prompt from stdin and lists models", async () => {
    const ask = await parseArgs(["--provider", "cliproxy", "--model", "model-b"], () => Promise.resolve("from stdin"));
    expect(ask).toEqual({ kind: "ask", provider: "cliproxy", model: "model-b", prompt: "from stdin" });
    expect(await execute(await parseArgs(["--provider", "cliproxy", "--list-models"], noStdin), env)).toBe("model-a\nmodel-b");
  });

  it("fails with exit 69 when the proxy is not configured or unreachable", async () => {
    const request = await parseArgs(["--provider", "cliproxy", "--model", "m", "--prompt", "hi"], noStdin);
    await expect(execute(request, {})).rejects.toMatchObject({ exitCode: 69 });
    await expect(execute(request, { ENG_CLIPROXY_BASE_URL: "http://127.0.0.1:1" })).rejects.toMatchObject({ exitCode: 69 });
  });

  it("rejects URL credentials without exposing them", async () => {
    await expect(execute({ kind: "list", provider: "cliproxy" }, { ENG_CLIPROXY_BASE_URL: "http://private-user:private-password@127.0.0.1:1" })).rejects.toMatchObject({
      exitCode: 2,
      message: "cliproxy configuration: URL credentials are not allowed; use ENG_CLIPROXY_API_KEY for bearer authentication",
    });
  });

  it("reports only the origin for failed endpoints with private paths and queries", async () => {
    await expect(execute({ kind: "list", provider: "cliproxy" }, { ENG_CLIPROXY_BASE_URL: "http://127.0.0.1:1/private-path?token=private-query" })).rejects.toMatchObject({
      exitCode: 69,
      message: "cliproxy unavailable: http://127.0.0.1:1: request failed",
    });
    await expect(execute({ kind: "list", provider: "cliproxy" }, { ENG_CLIPROXY_BASE_URL: `http://127.0.0.1:${server.port}/private-path?token=private-query` })).rejects.toMatchObject({
      exitCode: 1,
      message: `cliproxy http://127.0.0.1:${server.port} returned HTTP 404`,
    });
  });

  it("rejects an empty prompt and an unknown provider", async () => {
    await expect(parseArgs(["--provider", "cliproxy", "--model", "m"], noStdin)).rejects.toBeInstanceOf(ExtraModelError);
    await expect(parseArgs(["--provider", "gemini", "--model", "m"], noStdin)).rejects.toBeInstanceOf(ExtraModelError);
  });
});

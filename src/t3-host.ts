// T3 Code supplies PR tools and tracks PRs through MCP; eng-github exclusivity would conflict.
export function hostedByT3Code(env = process.env): boolean {
  return env.T3CODE_OMP_SESSION === "1";
}

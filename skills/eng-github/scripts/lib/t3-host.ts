// T3 Code supplies PR tools and tracks PRs through MCP; eng-github exclusivity would conflict.
// Lives inside the skill tree because the eng-github skill is copied verbatim into other repos.
export function hostedByT3Code(env = process.env): boolean {
  return env.T3CODE_OMP_SESSION === "1";
}

---
name: bro
description: Restate the user's last message as a precise task using repository domain language. Use for /bro, "what did you hear", or ambiguity before execution.
disable-model-invocation: true
---

# Bro

Restate only the user's latest request. Do not plan or solve it.

1. Read relevant `CONTEXT.md` vocabulary. It is a glossary, never a specification.
2. Use ASD-STE100 style: short declarative sentences, one meaning per term, no jargon when a repository term exists.
3. Separate outcome, constraints, exclusions, and proof.
4. Preserve uncertainty. Do not manufacture requirements.
5. Mention an ADR only when the request changes or depends on a hard-to-reverse, surprising decision with a real tradeoff.

Return one important ambiguity only when tools and repository evidence cannot settle it.

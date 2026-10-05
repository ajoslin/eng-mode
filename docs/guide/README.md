# Eng Mode operator guide

Eng Mode is a playbook-driven engineering system on OMP. Give it an outcome, constraints, and observable proof. Eng chooses one route, applies repository law, delegates bounded work, and verifies the real artifact.

Read once in order:

1. [Mental model](01-mental-model.md)
2. [Setup and runtime health](02-setup-and-health.md)
3. [Giving work and understanding code](03-give-work-to-aj.md)
4. [Design, delegation, and OMP workflows](05-design-and-delegation.md)
5. [Build, debug, verify, and deliver](06-build-debug-and-verify.md)
6. [Context and long runs](07-context-and-long-runs.md)
7. [Prove-outs and learning](09-evals-and-learning.md)
8. [Complex-monorepo adoption](worked-complex-monorepo.md)
9. [Troubleshooting](troubleshooting.md)

When you're stuck, or can't tell which skill fits, type `/eng-help` with your question:

```text
/eng-help which skill should i use to review this branch?
```

It answers, hands you a prompt to send, and links the skill or guide page the answer came from. It does not start the work, because an Eng Mode run spends real tokens, so you send the prompt when you're ready. It runs only when you type it.

## One rule

State the result and finish condition, not a ceremony:

```text
The retry path writes duplicate records. Reproduce it, fix the cause, replay the retry, and show exactly one persisted record.
```

Eng owns the route. The repository owns standards and proof.
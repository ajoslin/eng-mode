### Prototype

**You own the design decision, not the code.** A prototype is a non-shippable, throwaway instrument; the real build follows Feature. Use it to settle a concrete design choice before committing: layout, interaction, density, behavior, timing, or approach. No decision means no prototype; route to Feature.

1. Name the decision, its deciding observation, and 2–3 genuinely competing variants. Label every variant so the user can name it.
2. Read the `prototype` skill. If the direction is open, gather relevant prior art and summarize a small moodboard of themes, palettes, layouts, or interaction patterns; let available user direction narrow the variants before building. Skip this when the direction is already set. For visual work, use a local `frontend-design` skill only when `project-standards` names one; otherwise use Eng Mode's generic design procedure.
3. Follow the `prototype` skill's artifact law. Put UI prototypes in-app on the existing target surface when possible, or on a target-adjacent throwaway route when no host exists. Work only on a clearly named throwaway branch, mark the artifact as a prototype, and leave production behavior untouched. For behavioral questions, use the smallest target-adjacent executable that exposes the decision.
4. Put all variants behind one switch or key so they can be compared on the same surface. Keep the prototype deliberately disposable: no production hardening, tests, or abstractions.
5. Observe rather than assert. For UI, use the project-mapped `verify-project` flow when applicable, otherwise OMP `browser`; capture a matching-surface screenshot of every variant and drive the interaction being compared. For behavior or timing, run the executable and retain the relevant logs, outputs, timings, or direct observations. An unexercised mockup or expected result is not evidence.
6. Present the variants, evidence, tradeoffs, and recommendation. State plainly that the artifact is throwaway and non-shippable, and record the throwaway branch and artifact path.
7. Hand the selected direction to Feature for the production build, or to `architect` when the decision changes the module shape or interface. The prototype itself never becomes the production implementation.

**Reply:** decision; variants explored; evidence (per-variant matching-surface screenshots and driven interaction for UI, or observed logs/output/timing for behavior); tradeoffs; recommendation; selected direction; throwaway branch and artifact path; and a plain non-shippable/disposal statement.

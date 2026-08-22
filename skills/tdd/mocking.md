# Test boundaries without mocks

Tests follow the project test law named by `project-standards`: no module mocks, function mocks, spies, patched globals, or call-count assertions, including at system boundaries.

Exercise external behavior through deterministic local protocol implementations, disposable real resources, a test database, injected clocks, or a higher integration layer. If a boundary cannot be exercised honestly at the current layer, move the test rather than manufacturing a mock contract.

Do not mock:

- External APIs
- Databases
- Time or randomness via patched globals
- File systems
- Internal collaborators

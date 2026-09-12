# CaseDock development

- This product standardizes test assets and evidence for a testing team. The user's own agent controls the browser and evaluates semantic assertions.
- Use TypeScript. Keep shared business rules in src/core; CLI, HTTP, and future MCP interfaces call that core.
- Do not add a model SDK, agent loop, browser execution engine, or automatic test healing without an explicit scope change.
- Test cases are versioned YAML; run records and artifacts are local and ignored by Git. Never commit credentials or real test evidence.
- Preserve test/step/assertion identity and run snapshots. Missing evidence or interrupted execution must never become a passing result.
- Maintain Chinese user-facing copy. Clearly distinguish implemented capabilities from planned features.
- Run npm run check for code changes. Add meaningful tests as core behavior is implemented.
- Read docs/architecture.md for the proposed architecture and docs/roadmap.md for the current scope.

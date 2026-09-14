# CaseDock development

- This product standardizes how test cases, observations, verdicts, and evidence are persisted. The user's own agent keeps full control of browser execution and semantic judgment.
- Use TypeScript. Keep shared business rules in src/core; CLI, HTTP, and future MCP interfaces call that core.
- Do not add a model SDK, agent loop, browser execution engine, or automatic test healing without an explicit scope change.
- Tool source and user test-asset workspaces are separate. Examples may live under examples/, but the repository root is not a production asset workspace.
- Test cases are versioned YAML. Final run records and reviewed evidence may be tracked by Git; temporary inbox data stays under ignored `.casedock/`. In the current internal POC, user-provided test credentials are stored as plaintext run data; do not add real credentials to the tool source or examples.
- Preserve test/step/assertion identity and run snapshots. Missing evidence or interrupted execution must never become a passing result.
- Maintain Chinese user-facing copy. Clearly distinguish implemented capabilities from planned features.
- Run npm run check for code changes. Add meaningful tests as core behavior is implemented.
- Read docs/architecture.md for the proposed architecture and docs/roadmap.md for the current scope.
- 每个具名函数、方法、React 组件都必须有中文注释说明职责；核心算法、状态变更和并发处理块添加中文解释，避免逐行复述代码。
- 修改源码后运行 npm run format，保持统一格式。浏览器 UI 或交互修改后运行 npm run test:e2e。

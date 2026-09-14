# CaseDock

CaseDock 是跨 Agent 的测试资产与证据工作台。它不控制浏览器，也不规定 Agent 如何执行测试；它只统一保存测试用例、逐步观察、断言结论和截图等证据，让结果可以脱离聊天记录，通过普通文件和 Git 长期复用。

## 产品边界

用户可以选择 Codex、Claude、OpenCode、WorkBuddy 或其他具备测试能力的 Agent。CaseDock Skill 约束“测试资产怎么存”，Agent 自由决定“测试怎么做”。

```text
Agent ── 自己的浏览器能力 ── 被测网站
  │
  └── CaseDock Skill / CLI ── 独立测试资产目录
                                  │
本地浏览器 ── CaseDock Editor ────┘
```

CaseDock 不包含模型 SDK、Agent loop、浏览器执行引擎、定位器或自动修复逻辑。MCP 是未来可选的 Agent 接口，不是第一版运行条件。

## 当前 POC

- 任意目录可初始化为独立测试资产库，不依赖 CaseDock 源码位置。
- `casedock.yaml` 标识资产库；CLI 可从子目录向上自动发现。
- 用例保存在 `cases/`，运行、固定快照和最终证据保存在 `runs/`，均可由 Git 管理。
- `.casedock/` 只保存临时输入和写锁，默认忽略。
- Skill 可以安装到资产库的 `.agents/skills/casedock-testing/`。
- 本地编辑器打开指定资产库，提供结构化用例编辑、运行历史和证据阅读。
- 用例 revision、运行快照、幂等步骤记录、原子写入和证据哈希仍由共享内核保证。

## 开发环境

- Node.js 24 或更高版本
- npm 和 Git

```bash
npm ci
npm run check
```

## 使用独立资产目录体验 POC

先构建 CaseDock：

```bash
npm run build
```

在 CaseDock 源码目录之外创建资产库：

```bash
node <CaseDock目录>/build/cli.js --root <测试资产目录> init --name "团队回归测试"
node <CaseDock目录>/build/cli.js --root <测试资产目录> skill install
node <CaseDock目录>/build/cli.js --root <测试资产目录> open
```

`open` 默认自动选择空闲端口、启动本地服务并打开浏览器。也可以进入资产目录后省略 `--root`：

```bash
cd <测试资产目录>
node <CaseDock目录>/build/cli.js open
```

未来发布 npm 包后，用户只需：

```bash
cd <测试资产目录>
casedock open
```

开发者可运行 `npm start` 打开 `examples/sample-workspace/` 示例资产库；`npm run dev` 使用 Vite 热更新页面。

## 让 Agent 使用

资产库安装 Skill 后，在该目录启动 Agent 并提出正常测试需求，例如：

> 使用 CaseDock 执行登录回归测试。你可以自由使用现有浏览器能力；请把结构化用例、每个业务步骤的观察、结论和截图证据保存到当前测试资产库，最后告诉我 run ID 和结果。

Skill 会指导 Agent 查询或创建用例、在操作前冻结快照、逐步归档证据，并在结束或中断时保存最终状态。CLI 具体输入见 [接口参考](skills/casedock-testing/references/commands.md)。

## 资产目录

```text
casedock.yaml
cases/
  <case-id>.test.yaml
runs/
  <run-id>/
    case.snapshot.yaml
    result.json
    evidence/
      <artifact-id>.png
.casedock/
  inbox/
```

最终证据可以提交 Git；提交前应检查截图是否含敏感信息。大量二进制证据可使用 Git LFS，或在后续版本接入外部证据存储。

## CLI

```bash
casedock init
casedock skill install
casedock schema --json
casedock validate --json
casedock case list --json
casedock case get <id> --json
casedock case save --input <JSON文件>
casedock run list --json
casedock run start --input <JSON文件>
casedock artifact add --input <JSON文件>
casedock run record --input <JSON文件>
casedock run finish --input <JSON文件>
casedock open
```

复杂输入也接受 `--input -` 从 stdin 读取 JSON。CLI 与 HTTP API 共用 `src/core`，机器响应使用稳定的 JSON 信封和错误码。

## 验证

```bash
npm run check
npm run test:e2e
```

`check` 执行格式检查、内核/CLI/API 测试、类型检查和生产构建。`test:e2e` 在本机 Chrome 中验证用例保存、版本冲突和证据展示。

## 尚未实现

- Excel 批量导入体验与来源行追踪
- Agent 安装器的多宿主适配
- MCP 薄适配层
- 模块、环境和变量管理
- Git LFS/远端证据存储策略
- 运行结果导入导出及跨团队聚合

设计边界见 [架构](docs/architecture.md)，POC 计划见 [路线图](docs/roadmap.md)。

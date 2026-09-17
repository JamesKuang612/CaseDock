# CaseDock

CaseDock 是一份自包含的测试资产 Skill。它不规定 Agent 怎么测试，只统一保存每条用例、逐步观察、最终结论和截图证据，让结果脱离聊天记录后仍能由本地页面复核、由 Git 在团队内共享。

## 产品边界

```text
用户选择的 Agent ── 自己的浏览器/MCP ── 被测网站
       │                    或
       │          CaseDock 按需浏览器兜底
       │
       └── CaseDock Skill ── 独立测试资产库 ── Git
                    │               │
                    └── 本地只读页面 ┘
```

Agent 继续决定定位、等待、重试、恢复和语义判断。CaseDock 只负责低成本接收、校验、保存和展示已经完成的测试。项目不包含模型 SDK、Agent loop、自动修复或业务测试脚本。

## 给使用者

前置条件只有 Node.js 22+。将 [casedock-testing](skills/casedock-testing) 整个目录安装到 Agent 支持的 Skill 位置，例如团队测试仓库的：

```text
.agents/skills/casedock-testing/
```

安装的是一个完整 Skill 目录，不是单独复制 `SKILL.md`。其中已包含：

- `SKILL.md`：Agent 入口和行为边界；
- `references/`：按需读取的保存协议与兜底说明；
- `scripts/casedock.mjs`：自包含运行内核；
- `assets/ui/`：本地只读页面。

随后在资产目录打开 Agent，直接说：

> 使用 CaseDock 测试下面的场景，执行完成后保存用例、结果和截图证据。初始地址是……

无需全局安装 npm 包，也不要求用户先运行初始化命令。Skill 会在找不到资产库时创建 `casedock-tests/`，并在交付时给出本地查看地址或命令。

浏览器能力优先来自 Agent 自己的 MCP、Browser 或 Computer Use。缺失时，Skill 会先建议安装宿主官方能力；只有用户明确选择兜底后，才通过 npx 按需下载固定版本的官方 Playwright CLI 和 Chromium。Playwright 不随 Skill 安装。

## 测试资产

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

`cases/`、`runs/` 和最终证据可按团队约定提交 Git；`.casedock/` 是默认忽略的临时区。第一版按用户要求明文保存测试账号和密码，不提供凭证安全能力。用例名称可重复，Case ID 永不重复；除非用户明确指定 Case ID 重测，新测试不会读取或匹配已有用例。

## 给开发者

当前 `main` 和 `v0.1.0-beta.2` 保留旧的 npm 分发形态；本分支将 npm 仅用于源码开发和生成 Skill，不再发布用户运行包。

```bash
npm ci
npm run check
npm run test:e2e
```

`npm run build` 会：

1. 将 Core、CLI 和只读服务打成 `skills/casedock-testing/scripts/casedock.mjs`；
2. 将 React 页面输出到 `skills/casedock-testing/assets/ui/`；
3. 将许可证随 Skill 一同装配。

开发页面使用 `npm run dev`，查看示例资产使用 `npm start`。所有业务规则仍集中在 `src/core`，CLI、HTTP 与未来 MCP 都必须调用这一层。

## 内部运行接口

最终用户一般不必直接输入这些命令。Agent 会从 Skill 根目录调用：

```bash
node <skill-root>/scripts/casedock.mjs --root <资产目录> init
node <skill-root>/scripts/casedock.mjs --root <资产目录> doctor --json
node <skill-root>/scripts/casedock.mjs --root <资产目录> test submit --input <JSON文件>
node <skill-root>/scripts/casedock.mjs --root <资产目录> validate --json
node <skill-root>/scripts/casedock.mjs --root <资产目录> open
```

普通新测试结束后每个场景只调用一次 `test submit`；增量命令只用于用户明确指定 Case ID 的重测。详细输入见 [运行器接口](skills/casedock-testing/references/commands.md)。

## 验证范围

`npm run check` 包含格式、类型、Core/CLI/API 测试、生产构建，以及把完整 Skill 复制到没有源码和 `node_modules` 的临时目录后进行隔离验收。`npm run test:e2e` 在本机 Chrome 中验证用例列表、执行详情和截图展示。

当前架构边界见 [架构](docs/architecture.md)，npm 包与自包含 Skill 两套方案的完整演进见 [架构演进](docs/architecture-evolution.md)，后续计划见 [路线图](docs/roadmap.md)。

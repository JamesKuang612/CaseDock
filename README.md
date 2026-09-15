# CaseDock

CaseDock 是跨 Agent 的测试资产与证据工作台。它不规定 Agent 如何理解和执行测试；它统一保存测试用例、逐步观察、断言结论和截图等证据，让结果可以脱离聊天记录，通过普通文件和 Git 长期复用。对于没有交互式浏览器工具的 Agent，CaseDock 还提供可选的可见浏览器 CLI 作为兜底。

## 产品边界

用户可以选择 Codex、Claude、OpenCode、WorkBuddy 或其他具备测试能力的 Agent。CaseDock Skill 约束“测试资产怎么存”，Agent 自由决定“测试怎么做”。

```text
Agent ── 自己的浏览器能力 ── 被测网站
  │              或
  │       CaseDock Browser（可选兜底）
  │
  └── CaseDock Skill / CLI ── 独立测试资产目录
                                  │
本地浏览器 ── CaseDock Editor ────┘
```

CaseDock 不包含模型 SDK、Agent loop、定位决策或自动修复逻辑。可选的 CaseDock Browser 仅包装官方 Playwright CLI，提供打开、点击、输入和截图等机械能力，不接管 Agent 的测试判断。MCP 是未来可选的 Agent 接口，不是第一版运行条件。

## 当前 POC

- 任意目录可初始化为独立测试资产库，不依赖 CaseDock 源码位置。
- `casedock.yaml` 标识资产库；CLI 可从子目录向上自动发现。
- 用例保存在 `cases/`，运行、固定快照和最终证据保存在 `runs/`，均可由 Git 管理。
- `.casedock/` 只保存临时输入和写锁，默认忽略。
- Skill 可以安装到资产库的 `.agents/skills/casedock-testing/`。
- 本地只读页面打开指定资产库，展示用例、运行详情和证据；新建与修改统一由 Agent 完成。
- 自动记录测试时间并计算耗时；保存初始地址和本次使用的明文测试账密；宿主能提供准确数据时可记录 Token 总消耗。
- 用例 revision、运行快照、幂等步骤记录、原子写入和证据哈希仍由共享内核保证。
- `casedock doctor` 检查资产库和 CaseDock Browser；Agent 原生工具仍由 Agent 自己判断。
- `casedock browser` 为缺少原生交互工具的 Agent 提供可见浏览器兜底，不要求配置 MCP 或切换对话。
- 普通新测试结束后用一次 `casedock test submit` 校验并保存用例、Run 和全部截图，不要求 Agent 在测试过程中编排多条记录命令。

## 开发环境

- Node.js 22 或更高版本
- npm 和 Git

```bash
npm ci
npm run check
```

## 使用本地 npm 安装包体验 POC

开发中的版本可以先在源码目录生成真实安装包：

```bash
npm pack
npm install --global ./casedock-<version>.tgz
```

随后在 CaseDock 源码目录之外准备资产库：

```bash
mkdir <测试资产目录>
cd <测试资产目录>
casedock setup --name "团队回归测试"
casedock open
```

`setup` 一次创建资产目录结构、`.gitignore` 并安装仓库级 Skill；重复执行不会覆盖已有 Skill。`open` 默认自动选择空闲端口、启动本地服务并打开浏览器。

开发源码时也可以不安装本地包：

```bash
npm run build
node <CaseDock目录>/build/cli.js --root <测试资产目录> setup --name "团队回归测试"
node <CaseDock目录>/build/cli.js --root <测试资产目录> open
```

已发布版本可以直接安装：

```bash
npm install --global casedock@beta
```

开发者可运行 `npm start` 打开 `examples/sample-workspace/` 示例资产库；`npm run dev` 使用 Vite 热更新页面。

## 让 Agent 使用

资产库安装 Skill 后，在该目录启动 Agent 并提出正常测试需求，例如：

> 使用 CaseDock 执行登录回归测试。请把结构化用例、每个业务步骤的观察、结论和截图证据保存到当前测试资产库，最后告诉我 run ID 和结果。

Skill 会指导 Agent 先判断当前任务是否已经具有真正的点击、输入和截图能力。没有时不会直接启用兜底，而是先建议安装宿主官方支持的 MCP、插件或 Computer Use，由用户决定暂停安装还是使用 CaseDock Browser。测试完成后，Agent 只需提交一份清单，CaseDock 会一次生成具有唯一 ID 的用例、运行快照、结果和证据。只有用户明确指定 Case ID 时才读取并重测已有用例。CLI 具体输入见 [接口参考](skills/casedock-testing/references/commands.md)。

## 可选浏览器兜底

CaseDock Browser 不替代 Agent 自带的 Chrome、Browser、Computer Use 或 Playwright MCP。只有当前任务没有可交互浏览器工具时才使用：

```bash
casedock doctor
casedock browser install-browser chromium
casedock browser open https://example.com
casedock browser snapshot
casedock browser screenshot --filename=.casedock/inbox/result.png
casedock browser close
```

`open` 默认启动可见浏览器，用户可以实时观察。CaseDock Browser 安装完成后是普通 CLI，不需要重启 Agent；安装 Chromium 会产生额外下载，未经用户同意不应自动执行。完整的 Agent 使用方式见 [浏览器兜底](skills/casedock-testing/references/browser.md)。

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

最终证据和测试账号等测试数据可以按团队约定提交 Git。第一版不提供凭证脱敏、加密或密钥管理；大量二进制证据可使用 Git LFS，或在后续版本接入外部证据存储。

## CLI

```bash
casedock setup --name "团队回归测试"
casedock doctor --json
casedock browser --help
casedock init
casedock skill install
casedock schema --json
casedock validate --json
casedock test submit --input <JSON文件>
casedock case create --input <JSON文件>
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

`check` 执行格式检查、内核/CLI/API 测试、类型检查和生产构建。`test:e2e` 在本机 Chrome 中验证只读用例列表、执行详情和截图证据展示。

## 尚未实现

- Excel 批量导入体验与来源行追踪
- Agent 安装器的多宿主适配
- MCP 薄适配层
- 可复用模块和变量管理
- Git LFS/远端证据存储策略
- 运行结果导入导出及跨团队聚合
- 自动识别各 Agent 私有的浏览器工具；该判断目前由 Agent 根据当前工具清单完成

设计边界见 [架构](docs/architecture.md)，POC 计划见 [路线图](docs/roadmap.md)。

# CaseDock

为测试团队提供统一的测试资产工作台，使用你自己的 Agent 和模型执行测试。

## 当前状态

已实现第一版用例与执行记录闭环：

- 结构化用例编辑，YAML 文件保存，ID 和 Schema 校验，版本冲突检测。
- CLI 创建运行快照、提交步骤结果、归档 PNG/JPEG 或文本证据、汇总结果。
- 编辑器查看真实用例和运行，展示断言预期、实际观察及截图；每 4 秒更新列表。
- 项目 Skill 指导用户自己的 Agent 编写和执行用例，不绑定模型或浏览器工具。

仓库含一条可测试本地工作台的示例用例，初始状态为未验证。CaseDock 本身不执行浏览器操作，也不独立判断断言真伪。

## 环境

- Node.js 24 或更高版本
- npm 和 Git

## 本地开发

```bash
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 。Vite 将 `/api` 请求代理到本地 4310 端口。

## 构建与运行

```bash
npm run check
npm start
```

`npm start` 启动 http://127.0.0.1:4310 并打开浏览器。无自动打开模式：

```bash
node build/cli.js app --no-open
node build/cli.js app --port 4311 --no-open
```

此处端口均绑定 `127.0.0.1`。CLI 默认使用当前目录作为测试工作区，其他工作区使用 `node build/cli.js --root <目录> app`。

## 让 Agent 使用

让 Agent 读取 `skills/casedock-testing/SKILL.md`，并指定用例与目标环境。例如：

> 阅读项目的 casedock-testing Skill。对 http://127.0.0.1:4310 执行 casedock-workbench 用例，使用你已有的浏览器工具，并通过 CaseDock CLI 保存结果和截图。

现在需要显式指向 Skill 文件，尚未实现各 Agent 的自动安装。示例输入和完整流程见 [CLI 接口示例](skills/casedock-testing/references/commands.md)。

```bash
node build/cli.js init
node build/cli.js case list --json
node build/cli.js case get casedock-workbench --json
node build/cli.js schema --json
node build/cli.js validate --json
```

创建/更新用例使用 `case save --input <JSON文件>`；记录执行使用 `run start/record/finish --input <JSON文件>`；证据使用 `artifact add --input <JSON文件>`。这些命令也接受 `--input -` 从 stdin 读取 JSON。`run start` 只创建记录，不启动 Agent。

用例保存到 `cases/<id>.test.yaml`，第一版目录为平铺结构。`.casedock/inbox/` 用于 Agent 写入临时输入和原始截图，`.casedock/runs/` 保存结果与归档证据，默认忽略 Git。前置条件不满足、检查不完整和执行中断不能得到通过结论。历史运行不允许覆盖。

## 验证

```bash
npm run check
npm run test:e2e
```

`check` 运行格式检查、12 项内核/CLI/API 测试、类型检查和生产构建。修改代码后用 `npm run format` 统一格式。`test:e2e` 在本机 Chrome 中无头验证表单保存、版本冲突和截图展示；也可设置 `CASEDOCK_BROWSER_CHANNEL=msedge` 使用已安装的 Edge。Playwright 仅是 CaseDock 自身的开发测试依赖，不是产品执行引擎。

测试工作区位于 `.casedock/`，各测试结束时清理临时数据。浏览器验收截图保留在 `.casedock/browser-tests/`，不会进入 Git。

## 当前边界

MCP、模块复用、集中环境配置、运行包导入导出、Agent 自动安装及两种独立 Agent 的兼容性验证尚未实现。当前可通过指定 URL/环境运行；用例通过 Git 共享，运行记录留在本机。

工作区写锁在异常退出后可能遗留 `.casedock/write.lock`。遇到 BUSY 先重试；若持续存在，应在确认没有写入进程后人工移除锁目录。直接手写 YAML 后运行 `validate`；不要手写运行 JSON。

## 目录

```text
src/core/     共享业务规则
src/cli.ts    Agent 与用户的命令行入口
src/server/   本地 HTTP API 和静态页面服务
src/ui/       本地编辑器
skills/       给用户 Agent 的团队测试工作流
cases/        可进入 Git 的测试用例
tests/        内核、CLI、API 与浏览器验证
docs/         架构和开发计划
```

详见 [架构草案](docs/architecture.md) 和 [开发计划](docs/roadmap.md)。Momentic 公开资料仅用于设计参考，没有复制其源码、Skill 正文或品牌资产。

构建依赖通过 `overrides.esbuild` 固定到 0.28.2，以覆盖上游暂未升级的版本并修复 GHSA-g7r4-m6w7-qqqr。上游升级后可移除覆盖。

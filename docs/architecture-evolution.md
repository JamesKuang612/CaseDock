# CaseDock 架构演进：npm 包与自包含 Skill

## 1. 文档目的

CaseDock 曾经采用“发布 npm 包、全局安装 CLI、再由 CLI 安装 Skill”的交付方式，后来迁移为“一个目录即完整产品”的自包含 Skill。两套架构解决的是同一个问题，差异主要在安装、工具发现和运行时依赖，而不是测试资产模型被推翻重做。

本文用于：

- 还原两套架构各自的完整链路；
- 说明迁移时保留、替换和删除了什么；
- 作为维护旧版本、理解当前源码和评估未来分发方式的依据。

当前生效的产品架构以 [architecture.md](architecture.md) 为准。本文记录架构演进和历史决策。

## 2. 时间线与版本锚点

| 阶段 | Git 锚点 | 状态 |
| --- | --- | --- |
| npm 可安装化开始 | `c0f4f95` | 首次形成可打包、可安装、可由陌生目录使用的 npm 版本 |
| npm 架构最终版本 | `ddafbb6` / `main` / `v0.1.0-beta.2` | 已发布的历史版本，保留用于回溯和比较 |
| 自包含 Skill 重构 | `7400552` | 将运行内核与页面一起装入 Skill，停止面向用户发布 npm 运行包 |
| 当前架构 | 当前开发分支 | 自包含 Skill 是唯一推荐交付形态 |

旧版本没有被删除：`main` 分支和 `v0.1.0-beta.2` 标签保留 npm 交付形态。除非明确维护历史版本，新功能应继续在自包含 Skill 架构上开发。

## 3. 两次架构都没有改变的产品内核

无论采用哪种交付方式，CaseDock 的职责始终是：

1. Agent 使用自己的浏览器、MCP、Computer Use 或其他能力执行测试；
2. Agent 自己负责操作策略、语义判断、等待和重试；
3. CaseDock 接收结构化结果，校验用例、步骤、断言、结论和证据；
4. CaseDock 将结果保存到独立资产库，并提供本地只读页面；
5. 人类复核后，可以使用 Git 共享用例、运行记录和截图。

两套架构都不应演变成 Web Agent Harness，也不包含模型 SDK、Agent loop、自动测试规划或自动修复。

稳定的领域内核位于 `src/core`，包括：

- Schema 与输入校验；
- Case、Run、Step、Assertion 和 Artifact 的唯一身份；
- 用例 revision 与运行快照；
- 缺证据、中断和最终结论之间的约束；
- 原子写入、写锁、路径边界和证据哈希；
- 测试资产的目录与文件格式。

因此，架构迁移的本质可以概括为：

```text
领域内核、资产协议、查看页面保持不变
                  │
                  ▼
用户运行入口：全局 npm CLI  ──迁移──>  Skill 内置运行器
```

## 4. 第一套架构：npm 包作为产品交付物

### 4.1 定位

第一套架构把 `casedock` 发布为公开 npm 包。npm 包同时分发全局 CLI、业务内核、本地 Web 页面、Skill 文档以及可选的 Playwright 浏览器兜底。

用户首先安装软件，再由软件初始化资产库并把 Skill 安装到当前项目。这里的 Skill 主要负责告诉 Agent 何时、为什么以及怎样调用全局 `casedock` 命令；真正的运行能力来自 npm 全局安装目录。

### 4.2 组件关系

```text
npm registry
    │ npm install --global casedock
    ▼
全局 casedock CLI
    ├── setup/init ───────────────> 初始化独立测试资产库
    ├── skill install ────────────> 复制 Skill 到 .agents/skills/
    ├── case/run/artifact/test ───> Core ──> cases/、runs/、evidence/
    ├── open ─────────────────────> HTTP 服务 + React 只读页面
    └── browser ──────────────────> 随 npm 包安装的 Playwright CLI

Agent ──读取项目中的 SKILL.md──> 调用 PATH 中的 casedock
```

各部分职责如下：

| 组件 | 职责 |
| --- | --- |
| npm 包 | 版本发布、依赖安装和跨目录提供可执行命令 |
| 全局 `casedock` CLI | 向人和 Agent 暴露统一命令入口 |
| `setup` / `init` | 创建资产目录、配置文件和 `.gitignore` |
| `skill install` | 将随包分发的 Skill 复制到资产项目的 `.agents/skills/casedock-testing/` |
| Skill | 约束 Agent 的保存行为，并指导其调用全局 CLI |
| Core | 执行所有业务校验和文件写入 |
| HTTP + UI | 读取资产并提供本地只读复核页面 |
| CaseDock Browser | Agent 缺少原生浏览器工具时的 Playwright 兜底 |

### 4.3 用户安装与使用链路

历史版本的典型流程是：

```bash
npm install --global casedock@beta
mkdir team-tests
cd team-tests
casedock setup --name "团队测试资产"
```

`setup` 一次完成资产库初始化和 Skill 安装。随后用户在该目录打开 Agent，Agent 读取 `.agents/skills/casedock-testing/SKILL.md`，再调用系统 `PATH` 中的 `casedock`：

```text
用户提出测试任务
  → Agent 读取项目 Skill
  → Agent 使用自己的交互工具执行测试
  → Agent 调用全局 casedock 保存结果和证据
  → 用户执行 casedock open 查看
```

这个流程有两个必须分别成功的安装动作：

1. 操作系统中必须存在正确版本的全局 CLI；
2. 当前资产项目中必须存在 Agent 能发现的 Skill。

### 4.4 打包与发布链路

历史 `package.json` 使用：

- `bin.casedock = build/cli.js` 注册全局命令；
- `files` 将 `build/`、`skills/`、示例和文档放入 npm 包；
- `publishConfig.access = public` 允许公开发布；
- `prepack = npm run check` 在发布前验证源码。

当时的构建链路为：

```text
TypeScript CLI/Core/Server ──tsup──> build/cli.js
React UI                  ──Vite──> build/ui/
Skill 与示例              ────────> 原样进入 npm tarball
                                      │
                                      ▼
                                  npm publish
```

运行时依赖通过 npm 安装到全局包附近，其中包括固定版本的 `@playwright/cli`。所以只要全局安装成功，CLI、页面和浏览器兜底就一起存在。

### 4.5 优点

- 符合传统 CLI 工具的发布、升级和版本管理习惯；
- `casedock` 命令短，适合人类直接操作；
- npm 自动解决第三方依赖；
- CLI、Skill 和 UI 可以随一个 npm 版本同步发布；
- Playwright 兜底随包可用，不需要测试时再下载。

### 4.6 主要成本

- 用户必须理解 npm 全局安装、`PATH`、初始化和 Skill 安装；
- Volta、自定义 npm prefix、多个 Node 环境可能让“已安装”和“当前终端可见”不一致；
- CLI 与项目内 Skill 可能版本不一致；
- 不同 Agent 的 Skill 发现目录不同，`skill install` 很难覆盖全部宿主；
- 全局安装会影响用户环境，并引入较多依赖；
- 即使用户只需要保存资产，也会安装 Playwright 等较重能力；
- 对最终用户而言，CaseDock 看起来像“先装一个软件，再装一份 Skill”，产品边界不够直接。

## 5. 第二套架构：自包含 Skill 作为产品交付物

### 5.1 定位

第二套架构将完整运行能力装入 Skill 目录。用户安装的不是一个 npm CLI 加一份说明书，而是一份包含说明、执行内核和页面资源的完整 Skill。

npm 仍然存在，但只服务于源码开发、测试和生成交付物，不再是最终用户的安装渠道。

### 5.2 交付目录

```text
skills/casedock-testing/
├── SKILL.md
├── references/
│   ├── asset-format.md
│   ├── commands.md
│   ├── browser.md
│   └── jiandaoyun/
├── scripts/
│   └── casedock.mjs
├── assets/
│   └── ui/
└── LICENSE.txt
```

| 文件 | 职责 |
| --- | --- |
| `SKILL.md` | Agent 入口、产品边界、能力选择和保存主流程 |
| `references/` | 按需读取的协议、命令、浏览器兜底和内部产品知识 |
| `scripts/casedock.mjs` | 打包后的 Core、CLI、HTTP 服务与第三方运行依赖 |
| `assets/ui/` | 编译后的本地只读 React 页面 |
| `LICENSE.txt` | 产品及打包依赖所需的许可信息 |

### 5.3 组件关系

```text
完整 casedock-testing Skill 目录
    │ 安装/复制到宿主支持的 Skill 位置
    ▼
Agent 读取 SKILL.md
    ├── 按需读取 references/
    ├── 使用 Agent 原生浏览器/MCP 执行测试
    └── node <skill-root>/scripts/casedock.mjs
          ├── init/test/case/run/artifact ──> Core ──> 独立资产库
          ├── open ────────────────────────> HTTP 服务 + assets/ui
          └── browser（用户确认后）────────> npx 按需 Playwright 兜底
```

这里不再依赖系统中是否存在全局 `casedock` 命令。Agent 从自己正在读取的 Skill 根目录就能解析出运行器的绝对路径。

### 5.4 用户安装与使用链路

用户只需把完整 `casedock-testing` 目录安装到 Agent 支持的 Skill 位置，然后提出测试任务：

```text
用户安装一个完整 Skill 目录
  → Agent 读取 SKILL.md
  → 没有资产库时，运行器自动创建 casedock-tests/
  → Agent 使用自己的交互工具执行测试
  → Agent 调用 Skill 内置运行器一次提交每个新场景
  → Agent 返回本地查看地址或启动命令
```

最终用户无需：

- 全局安装 npm 包；
- 处理 npm prefix 或 `PATH`；
- 单独运行 `casedock setup`；
- 再执行一次 Skill 安装命令；
- 为普通新测试理解内部 JSON、YAML 或 CLI 细节。

Node.js 22+ 是运行器的基础运行时。普通新场景优先使用一次性的 `test submit` 完成校验和落盘，降低 Agent 多次调用工具的时间与失败概率。

### 5.5 源码到 Skill 的构建链路

开发者仍在可读的 TypeScript 和 React 源码中工作：

```text
src/core + src/cli + src/server
          │ tsup：单文件、无外部运行依赖
          ▼
build/casedock.mjs
          │ scripts/package-skill.mjs
          ▼
skills/casedock-testing/scripts/casedock.mjs

src/ui
  │ Vite
  ▼
build/ui
  │ scripts/package-skill.mjs
  ▼
skills/casedock-testing/assets/ui/
```

`scripts/casedock.mjs` 体积较大且不适合人工阅读，这是有意生成的交付文件。业务修改应发生在 `src/`，然后通过 `npm run build` 重新装配 Skill，不能直接维护打包产物。

隔离分发测试会把完整 Skill 复制到一个没有源码和 `node_modules` 的临时目录，验证初始化、提交、校验和页面启动，确保交付物没有偷偷依赖开发仓库。

### 5.6 浏览器能力的变化

当前架构仍坚持 Agent 自主执行，能力优先级为：

1. 用户指定的工具；
2. Agent 已加载的原生 MCP、Browser 或 Computer Use；
3. 提示用户安装宿主原生能力；
4. 用户明确接受后，使用 CaseDock Playwright 兜底；
5. 都不可用时快速结束并报告缺口。

Playwright 不再随交付物安装。只有用户选择兜底后，内置运行器才通过 `npx` 调用固定版本的官方 Playwright CLI，并按需安装 Chromium。这避免所有用户为一个低优先级能力承担体积和安装成本。

### 5.7 优点

- 一份目录同时包含 Agent 说明、机器能力和查看页面；
- 没有全局 CLI 与项目 Skill 的版本错配；
- 不依赖 npm prefix、`PATH` 或全局包管理器状态；
- 更符合“用户给任意 Agent 一份 Skill 即可使用”的产品定位；
- 宿主可以按自己的方式安装、共享或随测试仓库版本化 Skill；
- 运行依赖被打入单文件，分发测试可以直接证明交付物自包含；
- 重依赖的浏览器兜底改为按需获取。

### 5.8 主要成本

- 不再天然获得 npm registry 的搜索、安装和自动升级体验；
- 不同 Agent 仍然有不同的 Skill 安装位置，需要宿主侧完成安装；
- 单文件运行器可读性差，必须坚持“只改源码、不改产物”；
- Skill 压缩包或目录的版本信息、升级提示需要自行设计；
- 首次启用浏览器兜底时，`npx` 和 Chromium 下载仍可能耗时；
- 宿主若只支持纯文本 Skill、不允许附带脚本和资源，则无法使用完整能力。

## 6. 两套架构对照

| 维度 | npm 交付架构 | 自包含 Skill 架构 |
| --- | --- | --- |
| 最终交付物 | npm 包 | 完整 Skill 目录或 zip |
| 用户入口 | 全局 `casedock` 命令 | Agent 自动读取 `SKILL.md` |
| 运行器位置 | npm 全局安装目录中的 `build/cli.js` | Skill 内的 `scripts/casedock.mjs` |
| Skill 角色 | 调用外部全局 CLI 的行为说明 | 行为说明与内置运行能力的统一入口 |
| 初始化 | 用户执行 `casedock setup` | Agent 按需自动初始化 `casedock-tests/` |
| Skill 安装 | CLI 再复制到项目目录 | 用户或宿主直接安装完整目录 |
| 依赖解析 | npm 在安装时解析 | 构建时打入单文件运行器 |
| 浏览器兜底 | `@playwright/cli` 随 npm 包安装 | 用户确认后通过 `npx` 按需获取 |
| 页面资源 | npm 包内的构建产物 | Skill 的 `assets/ui/` |
| 升级方式 | `npm install -g casedock@...` | 替换/更新完整 Skill 目录 |
| 环境影响 | 写入全局 npm 环境和 PATH | 主要影响宿主 Skill 目录 |
| 隔离验证 | npm tarball 安装测试 | 无源码、无 `node_modules` 的 Skill 复制测试 |
| 当前定位 | 历史版本 | 推荐且持续维护 |

## 7. 迁移时保留、替换和移除的内容

### 7.1 原样保留的核心

- `src/core` 中的 Schema、业务规则和文件安全机制；
- 独立测试资产库以及 `cases/`、`runs/`、`evidence/` 模型；
- 用例 revision、运行快照和不可覆盖的历史 Run；
- React 只读页面与回环地址 HTTP 服务；
- Agent 自主操作、CaseDock 只管理资产的产品边界；
- CLI 作为 Core 的适配层这一内部设计。

### 7.2 被替换的交付机制

| 旧机制 | 新机制 |
| --- | --- |
| npm `bin` 注册全局命令 | Skill 内通过 Node.js 直接执行运行器 |
| `casedock setup` | Skill 首次使用时按需自动初始化 |
| `casedock skill install` | 直接安装完整 Skill 目录 |
| `build/cli.js` 与外部依赖 | 自包含 `scripts/casedock.mjs` |
| npm 包携带 UI | Skill `assets/ui/` 携带 UI |
| 随包安装 Playwright | 用户确认后按需 `npx` 获取 |
| npm tarball 验收 | Skill 隔离目录验收 |

### 7.3 从用户路径移除的内容

- `npm install --global casedock`；
- 手动执行 `casedock setup`；
- 使用 CLI 将 Skill 再安装一次；
- 排查全局 npm prefix、Volta shim 和 PATH；
- 普通新测试中多次调用增量保存命令。

这些能力有些仍作为内部接口存在，但不再构成普通用户的上手流程。

## 8. 为什么选择自包含 Skill

迁移不是因为 npm 无法实现功能，而是因为 npm 安装层与产品目标不匹配。

CaseDock 的目标用户首先是在 Agent 中发起测试，而不是主动学习一套 CLI。既然 Agent 已经能读取 Skill、执行 Node.js 命令和管理文件，那么让用户再完成全局安装、初始化和 Skill 安装，会产生重复的产品入口。

自包含 Skill 把边界收敛为：

> 安装一份 Skill，Agent 获得保存协议、可执行工具和查看页面；测试资产仍留在独立目录。

这也更准确地表达了 CaseDock 的竞争力：核心不是一个名为 `casedock` 的全局命令，而是可被不同 Agent 复用的测试资产协议、校验内核和本地审阅体验。

## 9. 当前维护规则

1. [architecture.md](architecture.md) 是当前架构的规范，本文只解释演进。
2. `src/core` 仍是业务规则唯一来源，不能在 Skill 文档、CLI 或未来 MCP 中复制第二套规则。
3. `skills/casedock-testing/scripts/casedock.mjs` 和 `assets/ui/` 是构建产物，不能手工维护。
4. npm 只用于开发依赖、构建和测试；当前 `package.json` 的 `private: true` 防止误发布。
5. `main` 与 `v0.1.0-beta.2` 保留历史 npm 版本，除非明确回溯，不在当前分支恢复全局安装路径。
6. 如果未来重新提供 registry 分发，应把它视为“Skill 的下载/升级渠道”，而不是恢复 CLI 与 Skill 两次安装的旧架构。
7. 未来 MCP 只能作为 Core 的结构化适配层，不能成为新的业务内核。

## 10. 一句话理解

```text
npm 版：先安装 CaseDock 软件，再让项目里的 Skill 调用它。
Skill 版：安装的 Skill 本身就是 CaseDock 软件。
```

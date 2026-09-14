# CaseDock POC 架构

## 产品定义

CaseDock 是测试资产与证据协议，不是 Web Agent Harness。它允许任意 Agent 使用自己的浏览器和推理能力执行测试，同时将输出保存成相同的可审阅文件结构。

核心不回答“如何点击页面”，只回答：

- 测试用例如何保存和版本化；
- 一次执行如何绑定固定用例；
- 每个业务步骤如何关联观察、结论和证据；
- 中断、缺证据和工具错误如何避免变成假通过；
- 人和其他 Agent 如何在未来重新读取这些资产。

## 工具与资产分离

```text
CaseDock 工具分发                  用户测试资产库
----------------                  --------------
Skill                             casedock.yaml
CLI / Recorder      ───────────▶  cases/*.test.yaml
Core                              runs/*/result.json
Local editor                     runs/*/evidence/*
未来 MCP                          .casedock/ 临时状态
```

CaseDock 源码仓库只包含工具、测试和示例。用户资产目录可以是团队 Git 仓库、个人 Git 仓库或普通私人目录。

## 接口分层

### Skill

Skill 是第一版产品入口，描述输出契约和必要的不变量。它明确放权给 Agent，不指定浏览器、定位、等待、重试或推理方式。详细 Schema 和 CLI 示例通过 references 渐进加载。

### Core

`src/core` 是唯一业务规则来源：Schema、稳定 ID、revision、运行快照、幂等写入、证据完整性和最终结论。任何传输层都不能绕过它。

### CLI

CLI 是跨 Agent 的最低公共接口。Agent 可通过 shell 使用，用户无需理解内部运行生命周期。复杂输入支持 JSON 文件或 stdin，避免 shell 转义。

### HTTP 与本地编辑器

一个本地进程同时提供 HTTP API 和编译后的 React 页面。它只监听回环地址，通过 Host、Origin 和随机会话令牌保护写操作。页面读取指定资产根目录，不需要数据库。

### MCP

后续 MCP 只应作为 Core 的结构化适配层，为支持 MCP 的 Agent 提供工具发现和类型化调用。它不应引入模型 SDK、Agent loop 或浏览器执行引擎。

## 资产生命周期

1. Agent 查找 `casedock.yaml`，或在用户授权的位置初始化资产库。
2. 用户输入可能来自已有 YAML、自然语言、文档或表格；Agent 将独立场景规范化为稳定用例。
3. 浏览器操作前创建 run，冻结用例内容与 revision。
4. Agent 自由执行一个业务步骤，然后立即登记观察、断言结论和证据。
5. CaseDock 将临时证据复制到 `runs/<run-id>/evidence/` 并记录摘要。
6. 正常完成、失败或中断均显式结束；历史 run 不可覆盖。
7. 人类通过本地编辑器复核资产，再决定是否提交 Git。

不同 Agent 的内部点击序列无需相同，结果通过 case、step 和 assertion ID 对齐。

## Git 边界

建议进入 Git：

- `casedock.yaml`
- `cases/`
- 经过审阅的 `runs/` 与最终证据
- 团队级 Skill 安装目录（如果团队选择仓库范围安装）

默认忽略：

- `.casedock/` 临时输入和锁
- 凭证、会话状态和未审查的敏感数据

二进制证据较多时使用 Git LFS；未来可配置远端对象存储，但结果文件仍保留可迁移引用和哈希。

## 安全与真实性边界

- 所有业务 ID 禁止路径片段；资产路径限制在工作区内并拒绝符号链接。
- 文件原子替换并使用工作区写锁；用例更新必须携带预期 revision。
- 证据校验格式、大小和 SHA-256；完成前重新验证。
- CaseDock 只能证明记录结构和文件完整性，不能证明截图内容或 Agent 语义判断真实。
- URL、用例和证据不得包含凭证；提交 Git 前由人类复核敏感信息。

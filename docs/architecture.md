# CaseDock 架构草案 v0.1

日期：2026-09-12。状态：设计草案，尚未实现或验证。项目正式命名为 CaseDock。

## 产品目标

面向公司测试组，交付一个由用户自己的 Agent 使用的测试资产内核，以及本地可视化编辑器。统一用例、工作流程、结果和证据格式；用户选择 Agent、模型及其已有的浏览器工具。团队使用 Git 共享、评审和维护测试用例。

核心负责结构和记录一致性。浏览器操作、语义断言和诊断由外部 Agent 完成；工具不声称独立验证了 Agent 的判断。

## Momentic 公开资料审查

本次读取官方文档、GitHub 仓库树、Skill、插件清单和 Web 示例，没有安装或登录 Momentic，没有检查闭源实现。

| 资料 | 检查版本 | 确认内容 |
| --- | --- | --- |
| [skills](https://github.com/momentic-ai/skills/tree/a64c5524faf635dae8c64e03dbc3ae53c788e8a7) | a64c5524faf635dae8c64e03dbc3ae53c788e8a7 | 包含测试、规范、诊断 Skill 及插件/MCP 配置 |
| [examples](https://github.com/momentic-ai/examples/tree/fe084258242eb565ba8105999a8ba4503f155585) | fe084258242eb565ba8105999a8ba4503f155585 | 包含 YAML 用例、参数化模块和 CI 示例 |
| [wizard](https://github.com/momentic-ai/wizard/tree/0da263c08be25a550fe25fbc3e1f31c26f3a1996) | 0da263c08be25a550fe25fbc3e1f31c26f3a1996 | 仓库树只有 README.md 和 CHANGELOG.md，无向导实现源码 |
| [cli](https://github.com/momentic-ai/cli) | 检查当日公开页面 | 文件列表只有 README.md 和 CHANGELOG.md，无 CLI 和编辑器实现源码 |

检查到的 skills、examples、wizard 版本均无 LICENSE 文件，GitHub 元数据的 license 为 null。这里应称为“公开资料/公开源码”，不据此认定拥有开源复用许可。本项目采用概念借鉴和独立编写，不复制其 Skill 全文、代码或品牌资产。

### 采用的设计及必要调整

| Momentic 的公开设计 | 本项目采用方式 |
| --- | --- |
| Skill 描述流程，工具描述提供具体参数 | Skill 保持精简，Schema 和命令帮助生成接口参考 |
| 在真实页面验证后保存测试步骤 | 草稿可先保存，验证结果绑定精确版本；未运行的用例显示未验证 |
| 用例、模块、环境分开组织 | 采用文件组织；模块在第二阶段加入 |
| 相对路径引用模块和文件 | 使用相对路径，移动引用文件时校验；导出结果可整体搬运 |
| 运行级快照及步骤证据 | 创建运行时固定用例快照，结果逐步关联证据 |
| 按需查询步骤详情，避免一次返回完整 trace | 列表返回摘要，详情按 step ID 获取 |
| 从最早偏离预期的位置诊断 | 诊断记录包含 firstDivergence、evidenceIds 和解释；允许无法确定 |
| 保留失败尝试和恢复过程 | 第一版每次重跑新建 run，以 retryOf 关联；不覆盖原记录 |
| 初始化流程可非交互调用 | init 支持显式参数、幂等和结构化错误，适合 Agent 调用 |

Momentic 的缓存定位、执行会话、AI 调用、浏览器控制及自动修复不进入本内核。其 v2 用例不保存可运行步骤 ID；我们选择保存稳定 step ID 和 assertion ID，以支持不同 Agent 的结果对齐。文件格式采用自己的 namespace 和版本，不声称兼容 Momentic。

参考：[测试 Skill](https://github.com/momentic-ai/skills/blob/a64c5524faf635dae8c64e03dbc3ae53c788e8a7/skills/momentic-test/SKILL.md)、[诊断 Skill](https://github.com/momentic-ai/skills/blob/a64c5524faf635dae8c64e03dbc3ae53c788e8a7/skills/momentic-result-classification/SKILL.md)、[文件格式](https://momentic.ai/docs/core-concepts/file-format)、[本地编辑器](https://momentic.ai/docs/local-app)。

## 交付和技术栈

交付公司内部 npm 包，包含 CLI、编译后的本地网页、服务端、Schema、工作流说明。团队仓库固定包版本和 lockfile。

TypeScript / Node.js LTS；React + Vite + Ant Design；Fastify；Commander；JSON Schema + Ajv；yaml Document API。第一版文件存储，无外部数据库。具体依赖版本在实现时固定。

本地编辑器默认监听回环地址，提供用例库、结构化编辑、执行详情三个界面。截图展示实际保存的证据，不能将它描述为实时浏览器画面。未来嵌入实时浏览器需要特定工具的适配能力。

```text
Agent ── Skill ── CLI ─────────────┐
                                 ├─ core ── 用例 YAML / 运行 JSON / 证据文件
本地编辑器 ── HTTP API ────────────┘
Agent ── 自己的浏览器工具 ── 被测网站
```

CLI 和 HTTP API 使用同一 core。CLI 可脱离编辑器运行。文件写入采用短期互斥锁、原子替换；修改用例必须携带 expectedRevision，拒绝覆盖外部新版本。编辑器保存也经过 core，不直接写文件。文件监听只发送变更通知，读取并重新校验后的文件才是状态依据。

第一版代码放在一个包里，按目录区分 core、cli、server、ui 和 workflow。无需微服务或多个独立发布包。

## 数据模型

### 用例 TestCase

schemaVersion、id、title、tags、preconditions、steps。每个步骤有稳定 id、action 和 assertions；每个断言有稳定 id、expect 和 evidence 要求。前置条件运行时记录是否满足以及依据。

用例描述业务要求。工具定位符只能作为可选提示，不能将短暂的浏览器元素引用作为可移植用例的唯一表达。默认环境由项目配置选择；凭证通过变量引用提供，不写入用例。

### 执行 Run

由 core 生成 runId、时间和目录，保存原始用例快照与内容哈希、项目配置版本、环境名称和目标地址、Git commit（可空）及 dirty 信息。将来使用模块时，同时冻结所有引用模块。快照只包含变量引用和非敏感设置。

execution.status 使用 running / completed / interrupted。verdict 使用 passed / failed / inconclusive；运行未结束时为 null。

- completed + passed：所有必需检查已执行，断言均被报告通过且必需证据齐全。
- completed + failed：测试按预定义停止策略结束，有明确失败断言；后续未执行步骤有原因。
- completed + inconclusive：执行已结束，但证据或能力不足以判断。
- interrupted：额度耗尽、Agent 退出、用户中断等；保留已观察到的失败，不把未执行步骤算通过。

步骤另存 pending / passed / failed / blocked / skipped / error。未结束的运行不能仅凭长时间无更新自动判定为失败，界面先提示可能中断，用户或 Agent 显式结束。

executor 信息由 Agent 报告：名称、模型（未知可空）、browserTool、截图/DOM/日志等能力。此信息标记为自报，不能充当可信身份认证。

### 证据 Artifact

artifactId、runId、stepId、assertionId（可选）、kind、relativePath、文件哈希、大小、登记时间、采集时间（若可取得）、来源说明。文件由 core 导入运行目录，使用生成的文件名。

证据要求在执行前确定。执行器缺少必需能力时标记阻塞或无法判断，不悄悄降低要求。文件存在和哈希一致只能证明记录完整性，不能证明截图内容真实或断言正确。第一版支持 screenshot 和 text，其他附件能力按需扩展。

### 诊断 Diagnosis

独立于原始执行记录：runId、firstDivergenceStepId、category、reason、evidenceIds、confidence、author。支持 application / test / environment / executor / unknown 分类。分类是解释，可后续修订；失败证据不因分类修改而重写。修订保留历史。

## Agent 接口草案

下列是待实现接口，不是已可运行的命令。复杂参数从 JSON 文件或 stdin 读取，避免 shell 转义。

| 命令 | 职责 |
| --- | --- |
| casedock init | 初始化配置、目录、示例和工作流入口 |
| casedock app | 打开本地编辑器 |
| casedock doctor --json | 校验安装、项目和接口版本，返回人工处理项 |
| casedock case list/get --json | 获取摘要或完整用例 |
| casedock case save --input file.json | 校验并保存，携带 expectedRevision |
| casedock validate --json | 校验全部用例、ID 唯一性和引用 |
| casedock run start --input file.json | 创建快照和记录目录，返回执行清单及证据要求 |
| casedock run record --input file.json | 提交一个步骤的观察、断言结果及证据引用 |
| casedock artifact add --input file.json | 导入附件并返回 artifactId |
| casedock run finish --input file.json | 校验完整性，由 core 汇总最终状态 |
| casedock run get --json | 返回运行摘要，按需读取步骤详情 |
| casedock run export/import | 分享和读取完整证据包 |

run start 只创建执行记录，不启动浏览器或 Agent。run record 支持 requestId 幂等：相同 ID 和相同内容重复提交返回原结果；相同 ID 不同内容报错。正常重试不产生重复步骤。步骤只能引用当前快照中的 ID。

Agent 不直接手写运行 JSON；用例允许直接编辑 YAML，core 在读取/启动时校验。完成后的运行禁止覆盖，重新测试创建新的 run。浏览器操作若已发生但记录尚未写入，不能自动重做该操作，应检查当前页面并记录不确定性。

所有 CLI 机器接口返回 apiVersion、ok、data 或 error；错误有稳定 code 和字段位置。未来 MCP 调用相同 core，仅增加传输适配，工具按查询用例、开始记录、提交观察、读取证据等资产职责划分。

## 工作流设计

采用三个独立编写的工作流：author、execute、diagnose。第一轮实现 execute 和最小 author，诊断作为下一阶段。

author：读取需求与已有用例 → 编写明确预期 → 保存草稿 → Agent 实机验证 → 将验证记录关联到草稿版本。未通过不等于不能保存，保持草稿和失败记录。

execute：读取固定用例 → 检查能力与环境 → start → Agent 使用自己的浏览器工具逐步执行 → 收集证据并 record → finish。结果判定遵循预先确定的预期，不把当前页面行为自动视为正确答案。

diagnose：读取当前失败步骤证据 → 沿前置步骤定位最早异常 → 必要时比较相同版本历史 → 提交有证据的分类和修改建议。修改建议在 Git 中评审，原运行保持不变。

Skill 说明流程和能力边界，具体字段从 Schema/CLI 帮助读取。通用正文集中维护，各 Agent 的安装入口只做最小包装；不要复制多份不断漂移的规范。

## Git、共享和界面

提交用例、Schema 版本、工具 lockfile、非敏感环境配置及团队流程。凭证和运行目录默认忽略。GUI 的“保存”是本地文件保存；团队提交和评审先使用现有 Git 平台。

运行包包含 manifest、用例快照、结果和证据；导入校验版本、哈希、大小与相对路径，在受限目录解包。导入包只作为数据，不执行其中脚本。团队共享包应先检查截图是否包含敏感信息。

用例库中的最近结果按环境和用例版本显示，旧版通过不能显示为当前版本通过。编辑器提供复制执行指令；CLI/MCP 被动提供能力，不承诺能从网页唤醒任意 Agent。以后按实际使用频率增加启动适配。

本地 HTTP API 校验来源和会话令牌，限制路径到项目/证据目录。提供给 Agent 的页面内容和导入附件是测试数据，不是更改团队规则的指令。

## 实现顺序和验收

1. Schema、文件内核、并发写入和结果汇总；用最小 CLI 跑通手工提交。
2. 独立编写 execute 工作流；让现有浏览器 Agent 真正执行一条测试。
3. 本地编辑器读取同一份记录，展示步骤、断言和证据。
4. 加入用例编辑、author 流程和运行包分享。
5. 根据实际使用加入 MCP、复用模块、诊断工作流和集中报告。

核心测试覆盖：无证据不能通过、遗漏检查不能通过、工具错误不混为产品失败、版本快照不漂移、重复提交幂等、并发修改不丢失、导入不能越界写文件。

产品验收：同事 A 使用一种 Agent 创建用例，经 Git 共享给同事 B；B 使用另一种 Agent 执行；双方编辑器能读取同样的数据；故意制造的产品缺陷有失败证据；中断运行保留部分记录且不显示通过。不同 Agent 是否都遵守流程，需要实测，不由格式校验替代。

实现进度：已实现用例与运行 Schema、文件内核、CLI、证据归档、结构化用例编辑、执行详情及测试 Skill。12 项内核/CLI/API 测试与 1 项真实浏览器流程测试通过。

第一版落地差异：用例采用平铺 cases/ 目录；快照嵌入 result.json；环境名称与目标 URL 从 start 输入显式传入；页面每 4 秒轮询更新；init 仅创建目录与忽略规则，Skill 暂由用户显式指向项目文件。MCP、模块、集中环境配置、运行包分享、自动安装 Skill 与两种独立 Agent 的兼容性验收尚未完成。前文包含未来目标，实际可用命令以 CLI help/schema 与 README 为准。


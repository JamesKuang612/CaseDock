# CaseDock POC 路线图

## POC：跨目录测试资产闭环

- [x] 工具源码与用户测试资产目录解耦。
- [x] 使用 `casedock.yaml` 标识并自动发现资产库。
- [x] 用例保存在 `cases/`，运行快照、结果和最终证据保存在 `runs/`。
- [x] `.casedock/` 仅保存临时数据。
- [x] 本地编辑器可打开任意资产库。
- [x] Skill 明确只约束输出，不控制 Agent 执行方式。
- [x] CLI 可将 Skill 安装到仓库级 Agent Skills 目录。
- [x] 新场景自动生成唯一 Case ID，不扫描或语义复用已有用例。
- [x] 用一个完全独立的临时 Git 仓库完成端到端打包验收。
- [x] `casedock setup` 一次完成资产库初始化、忽略规则和 Skill 安装。
- [x] npm 发布元数据与本地 `.tgz` 安装验收。
- [x] 提供可选的可见 CaseDock Browser CLI，作为 Agent 原生交互能力缺失时的兜底。
- [x] 增加资产库与浏览器兜底诊断，并在 Skill 中定义快速止损规则。

## 下一阶段：真实用户输入

- Excel/CSV 批量用例规范化与来源追踪。
- 草稿、人工已审阅、已执行版本的状态表达。
- 更简洁的 Agent 记录命令，隐藏 JSON 生命周期细节。
- 用两种不同 Agent 执行相同资产并比较输出兼容性。
- 验证 Agent 原生浏览器优先和 CaseDock Browser 兜底两条链路的耗时与可见性。
- Git diff 和可选 Git LFS 引导。

## 可选增强

- MCP Core 适配层。
- npm Registry 正式发布和多宿主 Skill 安装器。
- 可复用模块和变量引用。
- 运行包导入导出。
- 外部证据存储与团队汇总。

不会加入模型 SDK、Agent loop、定位决策或自动测试修复。CaseDock Browser 只维持官方 Playwright CLI 的可见会话与机械操作，不承担 Web Agent Harness 职责。

# CaseDock 资产格式

CaseDock 资产库是可以独立于工具源码存在的普通目录：

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

## 可版本化资产

- `casedock.yaml` 标识资产库和格式版本。
- `cases/` 保存团队长期维护的结构化用例。
- `runs/` 保存不可覆盖的执行记录、固定用例快照和最终证据。团队可以整体纳入 Git；截图较多时可使用 Git LFS 或后续的外部证据存储。

## 本地临时内容

`.casedock/` 只用于未归档输入、写锁和本地状态，默认加入 `.gitignore`。不要把凭证、会话令牌或未审查的敏感截图提交到 Git。

## 对齐规则

运行绑定用例文件的内容 revision。每个结果通过稳定的 case、step 和 assertion ID 对齐，不依赖某个 Agent 的内部点击顺序。运行结束后禁止覆盖；重新测试创建新 run。

证据文件存在、大小和哈希一致只表示记录没有损坏，不表示截图内容或 Agent 的判断一定正确。人类可通过本地编辑器复核后再提交团队仓库。

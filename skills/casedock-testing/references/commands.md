# CaseDock CLI 接口

仅在需要读写资产时阅读本页。已安装版本使用 `casedock`；在 CaseDock 源码仓库开发时使用 `node build/cli.js`。通过 `--root <目录>` 可显式指定资产库，否则 CLI 从当前目录向上寻找 `casedock.yaml`。

复杂输入保存到资产库的 `.casedock/inbox/`，通过 `--input <文件>` 提交，也可以使用 `--input -` 从 stdin 读取 JSON。用 `casedock schema` 获取当前精确 Schema。

## 初始化和读取

```text
casedock --root <目录> init --name <名称>
casedock case list --json
casedock case get <case-id> --json
casedock validate --json
```

初始化生成 `casedock.yaml`、`cases/`、`runs/` 和临时 `.casedock/inbox/`。

## 保存用例

`case save --input <JSON文件>` 接受：

```json
{
  "expectedRevision": null,
  "testCase": {
    "schemaVersion": 1,
    "id": "login-basic",
    "title": "有效账号登录",
    "tags": ["smoke"],
    "preconditions": ["存在可用测试账号"],
    "steps": [
      {
        "id": "submit-login",
        "action": "打开登录页并使用测试账号登录",
        "assertions": [
          {
            "id": "dashboard-visible",
            "expect": "进入工作台并显示账号名称",
            "evidence": ["screenshot"]
          }
        ]
      }
    ]
  }
}
```

首次创建传 `null`；更新先 `case get`，将返回的完整 `revision` 作为 `expectedRevision`。冲突后重新读取并合并，不能强制覆盖。

## 开始运行

`run start --input <JSON文件>`：

```json
{
  "caseId": "login-basic",
  "expectedRevision": "case get 返回的完整 revision",
  "environment": "staging",
  "targetUrl": "https://test.example",
  "executor": {
    "agent": "实际 Agent 名称",
    "model": null,
    "browserTool": "实际使用的工具",
    "capabilities": ["screenshot"]
  },
  "preconditions": [
    { "index": 0, "satisfied": true, "observation": "实际观察依据" }
  ]
}
```

前置条件为空时传空数组。目标 URL 必须为 HTTP(S) 且不能包含凭证。返回的 `data.id` 是 run ID；此命令只创建记录，不启动或控制浏览器。

## 证据和步骤结果

先把真实证据保存到 `.casedock/inbox/`，然后调用 `artifact add`：

```json
{
  "runId": "run-id",
  "stepId": "submit-login",
  "assertionId": "dashboard-visible",
  "kind": "screenshot",
  "source": ".casedock/inbox/dashboard.png"
}
```

支持 PNG、JPEG 和 UTF-8 文本，单文件最多 20 MiB。登记后使用返回的 artifact ID 提交步骤：

```json
{
  "runId": "run-id",
  "requestId": "login-submit-1",
  "stepId": "submit-login",
  "status": "passed",
  "observation": "页面进入工作台",
  "assertions": [
    {
      "assertionId": "dashboard-visible",
      "verdict": "passed",
      "observation": "账号名称和工作台标题可见",
      "artifactIds": ["artifact-id"]
    }
  ]
}
```

步骤状态为 `passed / failed / blocked / skipped / error`，断言结论为 `passed / failed / inconclusive`。同一 `requestId` 和相同内容可以安全重发；同一步骤不能换 ID 覆盖。

## 结束和查看

```json
{ "runId": "run-id", "status": "completed", "reason": "全部检查完成" }
```

通过 `run finish --input <文件>` 提交；中断时将状态改为 `interrupted` 并说明原因。使用 `run list`、`run get <run-id>` 查看记录，使用 `casedock open` 打开本地编辑器。禁止手改 `runs/*/result.json`。

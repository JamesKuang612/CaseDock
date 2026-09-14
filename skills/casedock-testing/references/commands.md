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
  "initialUrl": "https://test.example/login",
  "credentials": {
    "account": "qa@example.test",
    "password": "test-password"
  },
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

前置条件为空时传空数组。`initialUrl` 是用户最初提供、尚未发生页面跳转的 HTTP(S) 地址。测试账号与密码按用户提供的原值明文记录；不需要登录时 `credentials` 传 `null`。返回的 `data.id` 是 run ID；此命令只创建记录，不启动或控制浏览器。CaseDock 会自动记录开始时间。

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

支持 PNG 和 JPEG，单文件最多 20 MiB。页面文本、URL 等内容直接写入 observation，不创建文本附件。登记后使用返回的 artifact ID 提交步骤：

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
{
  "runId": "run-id",
  "status": "completed",
  "reason": "全部检查完成",
  "tokenUsage": { "total": 12345, "source": "宿主显示的本次任务用量" }
}
```

通过 `run finish --input <文件>` 提交；CaseDock 根据开始和结束时间计算测试耗时。只有宿主明确提供本次测试的准确 Token 数量时才提交 `tokenUsage`，无法取得时省略，禁止估算。中断时将状态改为 `interrupted` 并说明原因。使用 `run list`、`run get <run-id>` 查看记录，使用 `casedock open` 打开本地页面。禁止手改 `runs/*/result.json`。

# CLI 输入示例

以下接口在源码仓库中通过 `node build/cli.js` 调用。其他工作区使用 `node <CaseDock目录>/build/cli.js --root <工作区> ...`。所有业务命令返回 `{apiVersion:1,ok:true,data:...}`；错误写 stderr 并返回非零退出码。输出结构以 `schema --json` 为准。

## 创建用例

运行 `init` 后，将以下结构写到 JSON 文件，再执行 `case save --input <文件>`：

```json
{
  "expectedRevision": null,
  "testCase": {
    "schemaVersion": 1,
    "id": "login-basic",
    "title": "有效账号登录",
    "tags": ["smoke"],
    "preconditions": ["存在可用测试账号"],
    "steps": [{
      "id": "submit-login",
      "action": "打开登录页，使用测试账号登录",
      "assertions": [{"id":"dashboard-visible","expect":"进入工作台并显示账号名称","evidence":["screenshot"]}]
    }]
  }
}
```

更新使用 `case get login-basic` 返回的 revision；首次创建才传 null。文件保存到 `cases/<id>.test.yaml`，第一版用例目录为平铺结构。

## 开始运行

`run start --input <文件>`：

```json
{
  "caseId": "login-basic",
  "expectedRevision": "替换为 case get 返回的完整 revision",
  "environment": "staging",
  "targetUrl": "https://your-test-app.example",
  "executor": {"agent":"实际 Agent 名称","model":null,"browserTool":"实际工具名称","capabilities":["screenshot"]},
  "preconditions": [{"index":0,"satisfied":true,"observation":"填写真实观察依据"}]
}
```

未知模型填 null；前置条件为空时传空数组。`index` 对应快照中前置条件的零起始下标。返回 `data.id` 为 runId，`data.snapshot` 为固定执行要求。目标 URL 必须 HTTP(S) 且不能内嵌凭证。

## 登记证据和步骤

实际截图保存后，调用 `artifact add --input <文件>`：

```json
{"runId":"实际运行 ID","stepId":"submit-login","assertionId":"dashboard-visible","kind":"screenshot","source":".casedock/inbox/dashboard.png"}
```

`source` 必须是相对于测试工作区的文件路径。截图接受 PNG/JPEG，文本使用 `kind: text` 和 UTF-8 文件，每个文件最多 20 MiB。返回 `data.id` 为 artifactId。

`run record --input <文件>`：

```json
{
  "runId":"实际运行 ID",
  "requestId":"login-submit-record-1",
  "stepId":"submit-login",
  "status":"passed",
  "observation":"填写实际执行观察",
  "assertions":[{"assertionId":"dashboard-visible","verdict":"passed","observation":"填写断言依据","artifactIds":["实际证据 ID"]}]
}
```

步骤状态：passed / failed / blocked / skipped / error。断言结论：passed / failed / inconclusive。passed 要求全部断言均通过且必需证据齐全；failed 要求至少一个失败断言。工具不可用或尚未执行时可提交空 assertions，但状态不能为 passed/failed。

相同 requestId 与相同内容重发是幂等的；同一步骤已提交后不能换 requestId 覆盖。证据应尽量在失败时也保留，不能采集时如实解释。

## 结束运行

`run finish --input <文件>`：

```json
{"runId":"实际运行 ID","status":"completed","reason":"说明执行完成情况"}
```

中断时 status 改为 interrupted 并写明原因。未提交全部检查、前置条件不满足或发生执行错误时，完整通过不会成立。结论由内核计算，禁止手改 `.casedock/runs/*/result.json`。

## 查看

`case list` / `run list` / `run get <id>` 返回当前资产，`validate` 校验用例文件。`app` 打开可视化编辑器；第一版编辑器展示数据，执行仍在 Agent 中发起。

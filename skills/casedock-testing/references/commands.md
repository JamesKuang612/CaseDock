# CaseDock CLI 接口

仅在准备保存测试资产时阅读本页。已安装版本使用 `casedock`；在 CaseDock 源码仓库开发时使用 `node build/cli.js`。通过 `--root <目录>` 可显式指定资产库，否则 CLI 从当前目录向上寻找 `casedock.yaml`。

## 新测试：一次提交

把本场景截图保存到资产库的 `.casedock/inbox/`，再将一份 JSON 清单交给：

```text
casedock test submit --input .casedock/inbox/submit.json
```

也可使用 `--input -` 从 stdin 读取。清单示例：

```json
{
  "schemaVersion": 1,
  "testCase": {
    "title": "有效账号登录",
    "tags": ["smoke"],
    "preconditions": [
      {
        "description": "存在可用测试账号",
        "satisfied": true,
        "observation": "用户提供的账号成功登录"
      }
    ],
    "steps": [
      {
        "action": "打开登录页并使用测试账号登录",
        "assertions": [
          { "expect": "进入工作台并显示账号名称", "evidence": ["screenshot"] }
        ]
      }
    ]
  },
  "run": {
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
    "startedAt": "2026-09-15T06:00:00.000Z",
    "status": "completed",
    "reason": "全部检查完成",
    "tokenUsage": { "total": 12345, "source": "宿主显示的本次任务用量" }
  },
  "results": [
    {
      "step": 1,
      "status": "passed",
      "observation": "已进入工作台，当前地址为 https://test.example/dashboard",
      "assertions": [
        {
          "assertion": 1,
          "verdict": "passed",
          "observation": "工作台标题和账号名称可见",
          "evidence": [".casedock/inbox/dashboard.png"]
        }
      ]
    }
  ]
}
```

`step` 和 `assertion` 是从 1 开始的清单序号，不是 Agent 生成的 ID。CaseDock 自动生成所有稳定 ID。一个截图可以在多个断言的 `evidence` 中重复引用；CaseDock 会分别建立证据关联。截图支持 PNG/JPEG，单文件最多 20 MiB，路径必须相对于资产库且不能越界。

步骤状态为 `passed / failed / blocked / skipped / error`，断言结论为 `passed / failed / inconclusive`。中断时将 `run.status` 设为 `interrupted` 并说明原因；未执行的步骤可以不出现在 `results` 中，最终结论会是 `inconclusive`。通过步骤必须包含全部断言，通过断言必须附上规定截图。

`startedAt` 是开始实际测试时记录的 ISO 时间。`initialUrl` 始终保存用户最初提供的地址；测试账号和密码按原值明文记录，不需要登录时 `credentials` 传 `null`。只有宿主明确提供准确 Token 总量时才提交 `tokenUsage`，否则省略，禁止估算。

CaseDock 会先校验整份清单和全部截图，再发布用例与 Run；校验失败不会留下半成品。成功响应只包含 Case ID、Run ID、最终结论和资产路径。修正输入后可重新提交。每个新场景各调用一次；普通新测试不要调用 `case list` 或读取已有用例。

## 初始化和查看

```text
casedock --root <目录> init --name <名称>
casedock validate --json
casedock run get <run-id> --json
casedock open
```

初始化生成 `casedock.yaml`、`cases/`、`runs/` 和临时 `.casedock/inbox/`。用 `casedock schema` 获取当前精确 Schema。

## 明确指定 Case ID 的重测

只有用户明确要求重测某个 Case ID 时，才执行：

```text
casedock case get <case-id> --json
casedock run start --input <JSON文件>
casedock artifact add --input <JSON文件>
casedock run record --input <JSON文件>
casedock run finish --input <JSON文件>
```

这些增量命令保留现有用例 revision、步骤 ID 和断言 ID，详细字段以 `casedock schema` 为准。不要读取其他用例，不要覆盖历史 Run。普通新测试始终优先使用 `test submit`。

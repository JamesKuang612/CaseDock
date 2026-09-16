# CaseDock 运行器接口

仅在准备保存测试资产时读取。将 Skill 目录内的运行器记为：

```text
RUNNER=node "<skill-root>/scripts/casedock.mjs"
```

下文的 `<RUNNER>` 均表示这条命令。不要依赖全局 `casedock`，也不要运行 `npm install`。所有命令可用 `--root <资产目录>` 显式指定资产库。

## 新测试：一次提交

将截图保存到资产库 `.casedock/inbox/`，把单个场景整理成 JSON 清单，然后执行：

```text
<RUNNER> --root <资产目录> test submit --input <清单路径>
```

也可用 `--input -` 从 stdin 读取。推荐写临时 JSON 文件，避免 shell 转义。示例：

```json
{
  "schemaVersion": 1,
  "testCase": {
    "title": "有效账号登录",
    "source": "（可选）用户给出的原始测试描述原文，保留换行和格式",
    "tags": ["smoke"],
    "preconditions": [
      {
        "description": "存在可用测试账号",
        "satisfied": true,
        "observation": "用户提供了可用的测试账号"
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

`step` 和 `assertion` 是从 1 开始的清单序号。CaseDock 自动生成唯一 Case ID、Run ID、步骤 ID 和断言 ID。一个截图可以被多个断言引用；支持 PNG/JPEG，单文件最多 20 MiB，路径必须位于资产库内。

步骤状态：`passed / failed / blocked / skipped / error`。断言结论：`passed / failed / inconclusive`。中断时将 `run.status` 设为 `interrupted` 并填写原因。通过步骤必须包含全部断言，通过断言必须附上要求的截图。

`startedAt` 是实际测试开始时间。`initialUrl` 始终是用户提供的初始地址；测试账号和密码按原值明文记录，不需要登录时传 `null`。仅在宿主提供准确 Token 总量时提交 `tokenUsage`。

提交前会统一验证清单和截图；失败不会留下半成品。成功响应只返回 Case ID、Run ID、结论与资产路径。批量测试时每个新场景各提交一次，普通新测试不要调用 `case list`。多个场景可以在彼此隔离的浏览器会话中并行执行，但对同一资产目录的 `test submit` 必须逐条串行调用；不要让多个任务同时写入资产库。

## 初始化、校验和查看

```text
<RUNNER> --root <资产目录> init --name <名称>
<RUNNER> --root <资产目录> validate --json
<RUNNER> --root <资产目录> run get <run-id> --json
<RUNNER> --root <资产目录> open
```

用 `<RUNNER> schema` 获取当前精确 Schema。

## 明确指定 Case ID 的重测

只有用户明确要求重测某个 Case ID 时，才执行：

```text
<RUNNER> --root <资产目录> case get <case-id> --json
<RUNNER> --root <资产目录> run start --input <JSON文件>
<RUNNER> --root <资产目录> artifact add --input <JSON文件>
<RUNNER> --root <资产目录> run record --input <JSON文件>
<RUNNER> --root <资产目录> run finish --input <JSON文件>
```

这些命令保留原用例 revision、步骤 ID 和断言 ID，并新增不可覆盖的 Run。字段以 `<RUNNER> schema` 为准。不要读取其他用例。

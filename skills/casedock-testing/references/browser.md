# CaseDock Browser 兜底

仅当当前 Agent 没有能够点击、输入和截图的原生交互工具时读取本页。CaseDock Browser 是随 npm 包分发的官方 Playwright CLI 适配层，不负责理解用例、选择步骤或判断结果。

## 使用前检查

```text
casedock doctor --json
```

查看 `data.browserFallback.ready`：

- `true`：可以直接使用下面的命令。
- `false`：将 `data.browserFallback.installCommand` 原样告诉用户并等待授权。不要自行下载，不要改装其他 MCP 或测试产品。

用户同意后安装 Chromium：

```text
casedock browser install-browser chromium
```

这是普通 CLI 安装，完成后可在当前对话继续使用，不需要重开 Agent。

## 可见会话

使用本次 run ID 作为会话名，避免多个任务共享页面。`open` 会由 CaseDock 自动补充可见模式，用户可以实时观看：

```text
casedock browser -s=<run-id> open <initial-url>
casedock browser -s=<run-id> snapshot
casedock browser -s=<run-id> click <snapshot-ref>
casedock browser -s=<run-id> fill <snapshot-ref> <value>
casedock browser -s=<run-id> hover <snapshot-ref>
casedock browser -s=<run-id> press <key>
casedock browser -s=<run-id> screenshot --filename=.casedock/inbox/<name>.png
casedock browser -s=<run-id> close
```

运行 `casedock browser --help` 查看官方完整命令。默认复用同一会话；导航、弹窗或页面结构发生变化后再取 snapshot，连续填写稳定表单时不必重复读取。截图仍按 CaseDock 业务步骤和断言归档。

## 止损条件

- `open` 首次失败：报告原始错误和 `casedock doctor --json` 结果，不改写脚本绕过。
- 页面已经打开但命令无法点击或输入：这仍属于工具不可用，不要求用户手动代替 Agent 完成测试后再宣称通过。
- 用户明确选择其他执行工具时停止使用本兜底；CaseDock 只继续记录其真实结果和证据。

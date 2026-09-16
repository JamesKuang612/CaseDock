# CaseDock Browser 兜底

仅当当前 Agent 没有可交互的原生浏览器工具，并且用户已经明确选择 CaseDock 兜底时读取。兜底层只是固定版本的官方 Playwright CLI，不负责理解用例或判断结果。

将运行器记为：

```text
RUNNER=node "<skill-root>/scripts/casedock.mjs"
```

## 必须先询问

若本次对话尚未选择兜底，先暂停测试并简短询问：

> 当前 Agent 没有已加载的交互式浏览器工具。更推荐先安装这个 Agent 官方支持的 Playwright MCP、浏览器插件或 Computer Use，通常集成更自然、速度更快；安装后可能需要重启或新开对话。你希望先暂停安装，还是使用 CaseDock Browser 兜底？

等待答复，不要同时诊断、下载或开始写脚本。用户选择原生能力时停止并等待安装。用户选择兜底后再继续；同一对话不重复询问。

## 无副作用诊断与按需下载

```text
<RUNNER> --root <资产目录> doctor --json
```

`data.browserFallback.cliAvailable` 表示本机是否有 npx。该诊断不会探测或下载 Chromium，`ready` 固定为 `false`，避免把“可下载”误报为“已就绪”。

如果 npx 不可用，立即停止并建议安装 Node.js 22+ 或宿主原生工具。如果可用，明确告诉用户首次运行会通过 npx 下载固定版本的 Playwright CLI 和 Chromium；只有用户再次确认下载后才执行响应中的 `installCommand`：

```text
<RUNNER> browser install-browser chromium
```

下载完成后当前对话可继续，不要求重启 Agent。CaseDock Skill 本身不携带 Playwright 和浏览器。

## 可见持续会话

用唯一会话名隔离任务；可以使用临时 UUID，不必为了获得 Run ID 提前写入资产：

```text
<RUNNER> browser -s=<session-id> open <initial-url>
<RUNNER> browser -s=<session-id> snapshot
<RUNNER> browser -s=<session-id> click <snapshot-ref>
<RUNNER> browser -s=<session-id> fill <snapshot-ref> <value>
<RUNNER> browser -s=<session-id> hover <snapshot-ref>
<RUNNER> browser -s=<session-id> press <key>
<RUNNER> browser -s=<session-id> screenshot --filename=<资产目录>/.casedock/inbox/<name>.png
<RUNNER> browser -s=<session-id> close
```

`open` 自动使用可见模式，用户可实时观看。导航、弹窗或结构变化后再取 snapshot；连续填写稳定表单时不必反复读取。运行 `<RUNNER> browser --help` 查看官方命令。

## 止损

- 下载、`open` 或首次交互失败时，报告原始错误并停止，不生成自动化工程绕过。
- 页面只能打开但无法点击、输入或截图，仍属于能力不可用，不能让用户手动代做后宣称 Agent 通过。
- 用户改选其他工具时停止兜底，CaseDock 只保存其真实结果和证据。

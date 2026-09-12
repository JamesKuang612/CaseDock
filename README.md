# CaseDock

为测试团队提供统一的测试资产工作台，使用你自己的 Agent 和模型执行测试。

## 当前状态

已搭建 TypeScript 工程、CLI、本地 API 服务和 React 编辑器首页。当前首页是开发基线，尚未实现用例创建、浏览器测试、执行记录或证据存储。

## 环境

- Node.js 24 或更高版本
- npm 和 Git

## 本地开发

```bash
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 。Vite 将 `/api` 请求代理到本地 4310 端口。

## 构建与运行

```bash
npm run check
npm start
```

`npm start` 启动 http://127.0.0.1:4310 并打开浏览器。无自动打开模式：

```bash
node build/cli.js app --no-open
node build/cli.js app --port 4311 --no-open
```

此处端口均绑定 `127.0.0.1`。CLI 当前只提供 `app` 子命令，其余接口仍在设计中。

## 目录

```text
src/core/     共享业务规则
src/cli.ts    Agent 与用户的命令行入口
src/server/   本地 HTTP API 和静态页面服务
src/ui/       本地编辑器
docs/         架构和开发计划
```

详见 [架构草案](docs/architecture.md) 和 [开发计划](docs/roadmap.md)。Momentic 公开资料仅用于设计参考，没有复制其源码、Skill 正文或品牌资产。

构建依赖通过 `overrides.esbuild` 固定到 0.28.2，以覆盖上游暂未升级的版本并修复 GHSA-g7r4-m6w7-qqqr。上游升级后可移除覆盖。

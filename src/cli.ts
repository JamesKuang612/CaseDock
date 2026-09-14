#!/usr/bin/env node
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, InvalidArgumentError } from 'commander';
import open from 'open';
import { createServer } from './server/index.js';
import { createStore } from './core/store.js';
import { CoreError, schemas } from './core/schema.js';
import { findWorkspace, isFsError, readBounded, safePath } from './core/files.js';

/** 校验本地服务端口，防止把非法输入传入网络监听。 */
function parsePort(value: string) {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('端口必须是整数');
  const port = Number(value);
  if (port < 1 || port > 65535) throw new InvalidArgumentError('端口必须介于 1 和 65535');
  return port;
}
/** 从文件或 stdin 读取 JSON，避免 Agent 在 shell 中嵌套转义。 */
async function readInput(options: { input: string }): Promise<unknown> {
  let text: string;
  if (options.input === '-') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 1024 * 1024) throw new CoreError('FILE_SIZE', '输入超过 1 MiB');
      chunks.push(Buffer.from(chunk));
    }
    text = Buffer.concat(chunks).toString('utf8');
  } else text = (await readBounded(options.input, 1024 * 1024)).toString('utf8');
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new CoreError('VALIDATION', '输入必须是有效 JSON');
  }
}
/** 用稳定信封向 Agent 输出结果，业务命令不会向 stdout 混入日志。 */
function output(data: unknown) {
  console.log(JSON.stringify({ apiVersion: 1, ok: true, data }, null, 2));
}

const cli = new Command()
  .name('casedock')
  .description('CaseDock — 跨 Agent 的测试资产与证据工作台')
  .option('--root <path>', '测试资产库路径；默认从当前目录向上查找 casedock.yaml');

/** 解析显式目录或自动发现资产库；初始化允许使用尚无标记的当前目录。 */
async function workspaceRoot(allowUninitialized = false) {
  const explicit = cli.opts<{ root?: string }>().root;
  if (explicit) return resolve(explicit);
  return allowUninitialized ? process.cwd() : findWorkspace(process.cwd());
}

/** 为 CLI 命令创建已初始化的资产仓库，避免误写工具源码或普通项目目录。 */
async function store() {
  const repository = await createStore(await workspaceRoot());
  await repository.getWorkspace();
  return repository;
}

cli
  .command('open [path]')
  .alias('app')
  .description('打开指定测试资产库的本地查看页面')
  .option('-p, --port <number>', '本地端口；省略时自动选择空闲端口', parsePort, 0)
  .option('--no-open', '不自动打开浏览器')
  .option('--dev', '允许 Vite 开发页面访问')
  .action(
    async (path: string | undefined, options: { port: number; open: boolean; dev?: boolean }) => {
      const root = path ? resolve(path) : await workspaceRoot();
      const repository = await createStore(root);
      await repository.getWorkspace();
      const server = await createServer(root, options.dev);
      const address = await server.listen({ host: '127.0.0.1', port: options.port });
      console.error(`CaseDock: ${address}`);
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          void server.close().then(() => process.exit(0));
        });
      }
      if (options.open) {
        try {
          await open(address);
        } catch {
          console.error(`请在浏览器中打开 ${address}`);
        }
      }
    },
  );
cli
  .command('init')
  .description('将当前目录初始化为独立测试资产库')
  .option('--name <name>', '资产库显示名称')
  .action(async (options: { name?: string }) => {
    const repository = await createStore(await workspaceRoot(true));
    output(await repository.init(options.name));
  });
const skill = cli.command('skill').description('安装或定位 CaseDock 测试记录 Skill');
skill
  .command('install')
  .description('将 Skill 安装到当前资产库的开放 Agent Skills 目录')
  .option('--target <path>', '资产库内的目标目录', '.agents/skills/casedock-testing')
  .action(async (options: { target: string }) => {
    const root = await workspaceRoot();
    const source = fileURLToPath(new URL('../skills/casedock-testing/', import.meta.url));
    const destination = await safePath(root, options.target);
    try {
      await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
    } catch (error) {
      if (
        isFsError(error, 'EEXIST') ||
        (error as NodeJS.ErrnoException).code === 'ERR_FS_CP_EEXIST'
      )
        throw new CoreError('CONFLICT', '目标 Skill 已存在；请先审阅并自行合并更新');
      throw error;
    }
    output({ source, path: options.target });
  });
skill
  .command('path')
  .description('输出安装包内的 Skill 路径')
  .action(() =>
    output({
      path: fileURLToPath(new URL('../skills/casedock-testing/SKILL.md', import.meta.url)),
    }),
  );
cli
  .command('schema')
  .description('输出所有输入和资产的 JSON Schema')
  .option('--json')
  .action(() => output(schemas));
cli
  .command('validate')
  .description('校验工作区的全部用例')
  .option('--json')
  .action(async () => {
    const result = await (await store()).listCases();
    output({
      valid: result.errors.length === 0,
      count: result.cases.length,
      errors: result.errors,
    });
    if (result.errors.length) process.exitCode = 1;
  });
const cases = cli.command('case').description('读取和维护测试用例');
cases
  .command('list')
  .option('--json')
  .action(async () => output(await (await store()).listCases()));
cases
  .command('get <id>')
  .option('--json')
  .action(async (id: string) => output(await (await store()).getCase(id)));
cases
  .command('save')
  .requiredOption('--input <path>', 'JSON 文件，- 表示 stdin')
  .action(async (options) => output(await (await store()).saveCase(await readInput(options))));
const runs = cli.command('run').description('记录由用户 Agent 执行的测试');
runs
  .command('list')
  .option('--json')
  .action(async () => output(await (await store()).listRuns()));
runs
  .command('get <id>')
  .option('--json')
  .action(async (id: string) => output(await (await store()).getRun(id)));
runs
  .command('start')
  .requiredOption('--input <path>', 'JSON 文件或 -')
  .action(async (options) => output(await (await store()).startRun(await readInput(options))));
runs
  .command('record')
  .requiredOption('--input <path>', 'JSON 文件或 -')
  .action(async (options) => output(await (await store()).recordStep(await readInput(options))));
runs
  .command('finish')
  .requiredOption('--input <path>', 'JSON 文件或 -')
  .action(async (options) => output(await (await store()).finishRun(await readInput(options))));
cli
  .command('artifact')
  .description('登记截图证据')
  .command('add')
  .requiredOption('--input <path>', 'JSON 文件或 -')
  .action(async (options) => output(await (await store()).addArtifact(await readInput(options))));

await cli.parseAsync().catch((error: unknown) => {
  const known = error instanceof CoreError;
  console.error(
    JSON.stringify({
      apiVersion: 1,
      ok: false,
      error: {
        code: known ? error.code : 'IO_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: known ? error.details : undefined,
      },
    }),
  );
  process.exitCode = 1;
});

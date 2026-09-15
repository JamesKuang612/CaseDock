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
import { inspectBrowserFallback, runBundledBrowser } from './browser/adapter.js';

const defaultSkillTarget = '.agents/skills/casedock-testing';

interface SkillInstallation {
  source: string;
  path: string;
  status: 'installed' | 'existing';
}

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

/** 安装随 npm 包分发的 Skill；setup 重复运行时保留用户已有版本。 */
async function installBundledSkill(
  root: string,
  target: string,
  preserveExisting = false,
): Promise<SkillInstallation> {
  const normalizedTarget = target.replace(/[\\/]+$/, '');
  const source = fileURLToPath(new URL('../skills/casedock-testing/', import.meta.url));
  const destination = await safePath(root, normalizedTarget);
  if (preserveExisting) {
    try {
      await readBounded(await safePath(root, `${normalizedTarget}/SKILL.md`));
      return { source, path: normalizedTarget, status: 'existing' };
    } catch (error) {
      if (!isFsError(error, 'ENOENT')) throw error;
    }
  }
  try {
    await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
  } catch (error) {
    if (isFsError(error, 'EEXIST') || (error as NodeJS.ErrnoException).code === 'ERR_FS_CP_EEXIST')
      throw new CoreError('CONFLICT', '目标 Skill 已存在；请先审阅并自行合并更新');
    throw error;
  }
  return { source, path: normalizedTarget, status: 'installed' };
}

/** 输出面向首次使用者的 setup 结果和唯一必要的下一步操作。 */
function outputSetup(
  workspace: { root: string; casesDirectory: string; runsDirectory: string },
  skillInstallation: SkillInstallation,
) {
  const skillStatus = skillInstallation.status === 'installed' ? '已安装' : '已存在，未覆盖';
  console.log(
    [
      'CaseDock 测试资产库已准备完成',
      '',
      `资产目录：${workspace.root}`,
      `Skill：${skillStatus}（${skillInstallation.path}）`,
      `用例目录：${workspace.casesDirectory}/`,
      `执行目录：${workspace.runsDirectory}/`,
      '',
      '现在可以在该目录打开 Agent，并要求它使用 CaseDock 执行测试。',
      '首次测试前可运行 casedock doctor 检查浏览器兜底。',
    ].join('\n'),
  );
}

const cli = new Command()
  .name('casedock')
  .description('CaseDock — 跨 Agent 的测试资产与证据工作台')
  .enablePositionalOptions()
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

/** 检查当前目录能否识别资产库；doctor 不因尚未 setup 而整体失败。 */
async function inspectWorkspace() {
  try {
    const root = await workspaceRoot();
    const repository = await createStore(root);
    const workspace = await repository.getWorkspace();
    return { ready: true, root: workspace.root, name: workspace.name };
  } catch (error) {
    return {
      ready: false,
      root: null,
      name: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

cli
  .command('doctor')
  .description('检查资产库和可选的 CaseDock Browser 兜底能力')
  .option('--json', '输出机器可读结果')
  .action(async (options: { json?: boolean }) => {
    const result = {
      workspace: await inspectWorkspace(),
      browserFallback: inspectBrowserFallback(),
      nativeAgentBrowser: {
        detectable: false,
        detail: 'Agent 自带的交互工具只能由当前 Agent 根据自己的工具清单判断',
      },
    };
    if (options.json) output(result);
    else {
      const workspace = result.workspace.ready
        ? `可用（${result.workspace.root}）`
        : `不可用（${result.workspace.detail}）`;
      const browser = result.browserFallback.ready
        ? `可用（Playwright CLI ${result.browserFallback.cliVersion}）`
        : `不可用（${result.browserFallback.detail}）`;
      console.log(
        [
          'CaseDock 环境检查',
          '',
          `资产库：${workspace}`,
          `CaseDock Browser：${browser}`,
          'Agent 原生浏览器：请由当前 Agent 根据已加载工具判断',
          '',
          result.browserFallback.ready
            ? '浏览器兜底已准备完成。'
            : `安装命令：${result.browserFallback.installCommand}`,
        ].join('\n'),
      );
    }
  });

cli
  .command('browser [args...]')
  .description('调用随包分发的可见 Playwright CLI；仅在 Agent 没有更合适的原生工具时使用')
  .helpOption(false)
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .passThroughOptions()
  .action(async (args: string[]) => {
    const code = await runBundledBrowser(args);
    if (code !== 0) process.exitCode = code;
  });

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
  .command('setup')
  .description('一次完成测试资产库初始化和 Skill 安装')
  .option('--name <name>', '资产库显示名称')
  .option('--target <path>', '资产库内的 Skill 目标目录', defaultSkillTarget)
  .action(async (options: { name?: string; target: string }) => {
    const root = await workspaceRoot(true);
    const repository = await createStore(root);
    const workspace = await repository.init(options.name);
    const installation = await installBundledSkill(root, options.target, true);
    outputSetup(workspace, installation);
  });
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
  .option('--target <path>', '资产库内的目标目录', defaultSkillTarget)
  .action(async (options: { target: string }) => {
    const root = await workspaceRoot();
    output(await installBundledSkill(root, options.target));
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
const tests = cli.command('test').description('低成本提交 Agent 已完成的测试');
tests
  .command('submit')
  .description('一次校验并保存新用例、执行结果和截图证据')
  .requiredOption('--input <path>', 'JSON 文件，- 表示 stdin')
  .action(async (options) => output(await (await store()).submitTest(await readInput(options))));
const cases = cli.command('case').description('读取和维护测试用例');
cases
  .command('create')
  .description('创建具有自动唯一 ID 的全新用例')
  .requiredOption('--input <path>', 'JSON 文件，- 表示 stdin')
  .action(async (options) => output(await (await store()).createCase(await readInput(options))));
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

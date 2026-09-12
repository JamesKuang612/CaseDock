#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import open from 'open';
import { createServer } from './server/index.js';
import { createStore } from './core/store.js';
import { CoreError, schemas } from './core/schema.js';
import { readBounded } from './core/files.js';

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
  .description('CaseDock — 使用你自己的 Agent 的测试资产工作台')
  .option('--root <path>', '测试工作区路径', process.cwd());

/** 按全局 root 参数创建仓库，使 Agent 可以从任意目录调用。 */
async function store() {
  return createStore(cli.opts<{ root: string }>().root);
}

cli
  .command('app')
  .description('启动本地编辑器')
  .option('-p, --port <number>', '本地端口', parsePort, 4310)
  .option('--no-open', '不自动打开浏览器')
  .option('--dev', '允许 Vite 开发页面访问')
  .action(async (options: { port: number; open: boolean; dev?: boolean }) => {
    const server = await createServer(cli.opts<{ root: string }>().root, options.dev);
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
  });
cli
  .command('init')
  .description('初始化用例目录和本地运行目录')
  .action(async () => output(await (await store()).init()));
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
  .description('登记截图和文本证据')
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

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface BrowserFallbackStatus {
  cliAvailable: boolean;
  cliVersion: string | null;
  chromiumInstalled: boolean;
  ready: boolean;
  requiresDownload: boolean;
  installCommand: string;
  detail: string;
}

const playwrightCliPackage = '@playwright/cli@0.1.20';

interface NpxInvocation {
  command: string;
  prefixArguments: string[];
}

/** 在 Windows 上定位无需 shell 即可安全调用的 npx 入口。 */
function windowsNpxInvocation(): NpxInvocation | null {
  const executable = spawnSync('where.exe', ['npx.exe'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const executablePath = executable.stdout?.split(/\r?\n/).find(Boolean);
  if (executable.status === 0 && executablePath)
    return { command: executablePath, prefixArguments: [] };

  const npmEntrypoints = [process.env.npm_execpath];
  const npmCommands = spawnSync('where.exe', ['npm.cmd'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  for (const command of npmCommands.stdout?.split(/\r?\n/).filter(Boolean) ?? []) {
    npmEntrypoints.push(join(dirname(command), 'node_modules/npm/bin/npm-cli.js'));
  }
  for (const npmEntrypoint of npmEntrypoints) {
    if (!npmEntrypoint) continue;
    const npxEntrypoint = npmEntrypoint.replace(/npm-cli\.js$/i, 'npx-cli.js');
    if (existsSync(npxEntrypoint))
      return { command: process.execPath, prefixArguments: [npxEntrypoint] };
  }
  return null;
}

/** 返回当前平台无需 shell 即可启动的 npx 调用信息。 */
function npxInvocation(): NpxInvocation | null {
  if (process.platform === 'win32') return windowsNpxInvocation();
  return { command: 'npx', prefixArguments: [] };
}

/** 返回当前 Skill 运行器的绝对命令，供诊断结果直接交给 Agent 使用。 */
function runnerCommand() {
  const runner = resolve(process.argv[1] ?? 'casedock.mjs');
  return `node ${JSON.stringify(runner)}`;
}

/** 为兜底浏览器补充可见模式；其余参数保持原样交给官方 Playwright CLI。 */
export function normalizeBrowserArguments(args: string[]) {
  const normalized = args.length > 0 ? [...args] : ['--help'];
  const command = normalized.find((argument) => !argument.startsWith('-'));
  if (command === 'open' && !normalized.includes('--headed')) normalized.push('--headed');
  return normalized;
}

/** 生成按需调用官方 Playwright CLI 的进程参数，便于无网络副作用地验证转发规则。 */
export function browserProcessArguments(args: string[]) {
  return ['--yes', playwrightCliPackage, ...normalizeBrowserArguments(args)];
}

/** 只检查 npx 是否可用；此诊断不会下载 Playwright 或浏览器。 */
export function inspectBrowserFallback(): BrowserFallbackStatus {
  const invocation = npxInvocation();
  const probe = invocation
    ? spawnSync(invocation.command, [...invocation.prefixArguments, '--version'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5_000,
      })
    : null;
  const cliAvailable = probe?.status === 0;
  return {
    cliAvailable,
    cliVersion: null,
    chromiumInstalled: false,
    ready: false,
    requiresDownload: true,
    installCommand: `${runnerCommand()} browser install-browser chromium`,
    detail: cliAvailable
      ? '可按需下载并使用官方 Playwright CLI；尚未获得用户授权时不得启动下载'
      : '未找到 npx；CaseDock Browser 兜底不可用',
  };
}

/** 用户明确选择兜底后，通过 npx 按需运行固定版本的官方 Playwright CLI。 */
export function runBrowserFallback(args: string[]) {
  const invocation = npxInvocation();
  if (!invocation) throw new Error('未找到可安全调用的 npx；请安装 Node.js 22+');
  const child = spawn(
    invocation.command,
    [...invocation.prefixArguments, ...browserProcessArguments(args)],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      windowsHide: false,
    },
  );
  return new Promise<number>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveExit(code ?? 1));
  });
}

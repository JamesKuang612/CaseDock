import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';

export interface BrowserFallbackStatus {
  cliAvailable: boolean;
  cliVersion: string | null;
  chromiumInstalled: boolean;
  ready: boolean;
  installCommand: string;
  detail: string;
}

const require = createRequire(import.meta.url);

/** 定位 CaseDock npm 包依赖的 Playwright CLI，避免依赖资产库自己的 node_modules。 */
export function bundledPlaywrightCliPath() {
  return require.resolve('@playwright/cli/playwright-cli.js');
}

/** 为兜底浏览器补充可见模式；其余参数保持原样交给官方 Playwright CLI。 */
export function normalizeBrowserArguments(args: string[]) {
  const normalized = args.length > 0 ? [...args] : ['--help'];
  const command = normalized.find((argument) => !argument.startsWith('-'));
  if (command === 'open' && !normalized.includes('--headed')) normalized.push('--headed');
  return normalized;
}

/** 检查随 CaseDock 分发的 Playwright CLI 与 Chromium 是否已经可以直接使用。 */
export function inspectBrowserFallback(): BrowserFallbackStatus {
  try {
    const cliPath = bundledPlaywrightCliPath();
    const packagePath = require.resolve('@playwright/cli/package.json');
    const packageValue = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
    const playwrightRequire = createRequire(cliPath);
    const playwright = playwrightRequire('playwright') as {
      chromium: { executablePath(): string };
    };
    const executable = playwright.chromium.executablePath();
    const chromiumInstalled = existsSync(executable);
    return {
      cliAvailable: true,
      cliVersion: packageValue.version ?? null,
      chromiumInstalled,
      ready: chromiumInstalled,
      installCommand: 'casedock browser install-browser chromium',
      detail: chromiumInstalled ? 'CaseDock Browser 已就绪' : '尚未安装 Chromium',
    };
  } catch (error) {
    return {
      cliAvailable: false,
      cliVersion: null,
      chromiumInstalled: false,
      ready: false,
      installCommand: '重新安装 casedock 后执行 casedock browser install-browser chromium',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 在当前资产目录中运行随包分发的 Playwright CLI，并继承终端方便 Agent 读取快照。 */
export function runBundledBrowser(args: string[]) {
  const cliPath = bundledPlaywrightCliPath();
  const child = spawn(process.execPath, [cliPath, ...normalizeBrowserArguments(args)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });
  return new Promise<number>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveExit(code ?? 1));
  });
}

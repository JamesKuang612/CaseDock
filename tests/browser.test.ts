import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { inspectBrowserFallback, normalizeBrowserArguments } from '../src/browser/adapter.js';

test('浏览器兜底保留 Agent 参数并默认启用可见模式', () => {
  assert.deepEqual(normalizeBrowserArguments([]), ['--help']);
  assert.deepEqual(normalizeBrowserArguments(['snapshot']), ['snapshot']);
  assert.deepEqual(normalizeBrowserArguments(['-s=run-1', 'open', 'https://example.test']), [
    '-s=run-1',
    'open',
    'https://example.test',
    '--headed',
  ]);
  assert.deepEqual(normalizeBrowserArguments(['open', 'https://example.test', '--headed']), [
    'open',
    'https://example.test',
    '--headed',
  ]);
});

test('浏览器诊断能定位随 CaseDock 分发的 Playwright CLI', () => {
  const status = inspectBrowserFallback();
  assert.equal(status.cliAvailable, true);
  assert.match(status.cliVersion ?? '', /^0\.1\./);
  assert.equal(status.ready, status.chromiumInstalled);
  assert.match(status.installCommand, /^casedock browser install-browser chromium$/);
});

test('browser 命令将参数转发给包内 Playwright CLI', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', 'browser', '--version'],
    {
      cwd: process.cwd(),
      windowsHide: true,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^0\.1\.20\s*$/);
});

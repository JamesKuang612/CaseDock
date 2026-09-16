import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  browserProcessArguments,
  inspectBrowserFallback,
  normalizeBrowserArguments,
} from '../src/browser/adapter.js';

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

test('浏览器诊断只检查 npx，不会提前下载浏览器', () => {
  const status = inspectBrowserFallback();
  assert.equal(status.cliAvailable, true);
  assert.equal(status.cliVersion, null);
  assert.equal(status.ready, false);
  assert.equal(status.chromiumInstalled, false);
  assert.equal(status.requiresDownload, true);
  assert.match(status.installCommand, /^node .+ browser install-browser chromium$/);
});

test('browser 命令固定官方 CLI 版本并保留 Agent 参数', () => {
  assert.deepEqual(browserProcessArguments(['snapshot']), [
    '--yes',
    '@playwright/cli@0.1.20',
    'snapshot',
  ]);
});

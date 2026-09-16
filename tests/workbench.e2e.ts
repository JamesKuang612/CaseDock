import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from '../src/server/index.js';
import { createStore } from '../src/core/store.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

test('只读页面从用例列表进入详情并展示执行证据', async (t) => {
  const base = resolve('.casedock/browser-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'case-'));
  const store = await createStore(root);
  await store.init();
  const document = await store.createCase({
    schemaVersion: 1,
    title: '工作台基本流程',
    source: '测试用户原始输入：\n1. 打开工作台\n预期：显示测试用例',
    tags: [],
    preconditions: ['服务已经启动'],
    steps: [
      {
        id: 'step-1',
        action: '打开工作台',
        assertions: [
          {
            id: 'assert-1',
            expect: '能够查看测试用例',
            evidence: ['screenshot'],
          },
        ],
      },
      {
        id: 'step-2',
        action: '切换阅读视图',
        assertions: [
          {
            id: 'assert-2',
            expect: '能够切换至幻灯片视图',
            evidence: ['screenshot'],
          },
        ],
      },
    ],
  });
  const run = await store.startRun({
    caseId: document.testCase.id,
    expectedRevision: document.revision,
    initialUrl: 'http://127.0.0.1',
    credentials: [
      { account: 'qa@example.test', password: 'plain-password', role: '测试管理员' },
      { account: 'guest@example.test', password: 'guest-password', role: '访客' },
    ],
    executor: {
      agent: 'Playwright verification',
      model: null,
      browserTool: 'chromium',
      capabilities: ['screenshot'],
    },
    preconditions: [{ index: 0, satisfied: true, observation: '本地服务可以访问' }],
  });
  const inbox = '.casedock/inbox/workbench.png';
  await writeFile(join(root, inbox), png);
  const artifact1 = await store.addArtifact({
    runId: run.id,
    stepId: 'step-1',
    assertionId: 'assert-1',
    kind: 'screenshot',
    source: inbox,
  });
  const artifact2 = await store.addArtifact({
    runId: run.id,
    stepId: 'step-2',
    assertionId: 'assert-2',
    kind: 'screenshot',
    source: inbox,
  });
  await store.recordStep({
    runId: run.id,
    requestId: 'browser-check-1',
    stepId: 'step-1',
    status: 'passed',
    observation: '用例列表已显示',
    assertions: [
      {
        assertionId: 'assert-1',
        verdict: 'passed',
        observation: '页面显示一条测试用例',
        artifactIds: [artifact1.id],
      },
    ],
  });
  await store.recordStep({
    runId: run.id,
    requestId: 'browser-check-2',
    stepId: 'step-2',
    status: 'passed',
    observation: '视图可以平滑切换',
    assertions: [
      {
        assertionId: 'assert-2',
        verdict: 'passed',
        observation: '幻灯片模式正常工作',
        artifactIds: [artifact2.id],
      },
    ],
  });
  await store.finishRun({
    runId: run.id,
    status: 'completed',
    reason: '检查完成',
    tokenUsage: { total: 2048, source: 'Playwright fixture' },
  });

  const server = await createServer(root, false, resolve('build/ui'));
  const address = await server.listen({ host: '127.0.0.1', port: 0 });
  const browser = await chromium.launch({
    channel: process.env.CASEDOCK_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
  });
  t.after(async () => {
    await browser.close();
    await server.close();
    assert.ok(relative(base, root).startsWith('case-'));
    await rm(root, { recursive: true, force: true });
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(address);

  await expect(page.getByRole('heading', { name: '测试用例' })).toBeVisible();
  await expect(page.getByRole('button', { name: /工作台基本流程/ })).toBeVisible();
  await expect(page.getByText(document.testCase.id, { exact: true })).toBeVisible();
  await expect(page.getByText('2 个步骤 · 2 个检查点 · 1 次执行')).toBeVisible();
  await expect(page.getByText('YOUR TESTS. YOUR AGENT.')).toHaveCount(0);
  await expect(page.getByText('新建用例')).toHaveCount(0);
  await expect(page.getByText('编辑')).toHaveCount(0);
  await page.screenshot({
    path: resolve('.casedock/browser-tests/case-library.png'),
    fullPage: true,
    animations: 'disabled',
  });

  await page.getByRole('button', { name: /工作台基本流程/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`#\/cases\/${document.testCase.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
  );
  await expect(page.getByText(document.testCase.id, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '用例内容' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '原始内容' })).toBeVisible();
  await expect(page.getByText('测试用户原始输入：')).toBeVisible();
  await expect(page.getByRole('heading', { name: '用例结构' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: '服务已经启动' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '执行详情' })).toBeVisible();
  await expect(page.getByText('Token 消耗', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('2,048', { exact: true }).first()).toBeVisible();

  // 初始地址位于概览区并提供快捷操作
  await expect(page.getByText('初始地址', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制' }).first()).toBeVisible();

  // 测试账密项整合并支持点击弹窗
  await expect(page.getByText('测试账密', { exact: true })).toBeVisible();
  await expect(page.getByText('共 2 套账密')).toBeVisible();
  await page.getByRole('button', { name: '查看账密与复制' }).click();
  await expect(page.getByRole('heading', { name: '测试账密（共 2 套）' })).toBeVisible();
  await expect(page.getByText('测试管理员')).toBeVisible();
  await expect(page.getByText('qa@example.test')).toBeVisible();
  await expect(page.getByText('访客')).toBeVisible();
  await expect(page.getByText('guest@example.test')).toBeVisible();
  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByRole('heading', { name: '测试账密（共 2 套）' })).toHaveCount(0);

  // 验证模式切换与幻灯片翻页
  await expect(page.getByRole('button', { name: '◫ 幻灯片视图' })).toBeVisible();
  await page.getByRole('button', { name: '◫ 幻灯片视图' }).click();
  await expect(page.getByRole('tablist', { name: '步骤导航' })).toBeVisible();
  await expect(page.getByText('第 1 / 2 步')).toBeVisible();
  await page.getByRole('button', { name: '下一步 ›' }).click();
  await expect(page.getByText('第 2 / 2 步')).toBeVisible();
  await expect(page.getByText('视图可以平滑切换')).toBeVisible();

  await expect(page.getByText('目标地址', { exact: true })).toHaveCount(0);
  await expect(page.getByText('环境', { exact: true })).toHaveCount(0);
  const image = page.locator('.evidence-grid img').first();
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: resolve('.casedock/browser-tests/run-detail.png'),
    fullPage: true,
    animations: 'disabled',
  });
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
});

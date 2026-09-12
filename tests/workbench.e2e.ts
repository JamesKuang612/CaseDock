import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from '../src/server/index.js';
import { createStore } from '../src/core/store.js';

test('浏览器创建和编辑用例、处理外部冲突、查看真实截图与运行快照', async (t) => {
  const base = resolve('.casedock/browser-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'case-'));
  const store = await createStore(root);
  await store.init();
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
  await expect(page.getByText('服务已连接', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新建用例' }).click();
  await page.getByLabel('用例 ID').fill('browser-smoke');
  await page.getByLabel('用例名称').fill('工作台基本流程');
  await page.getByLabel('操作要求').fill('打开工作台并检查服务连接状态');
  await page.getByLabel('预期结果').fill('显示服务已连接');
  await page.getByRole('button', { name: '保存用例', exact: true }).click();
  await expect(page.getByText('用例已保存', { exact: true })).toBeVisible();
  const created = await store.getCase('browser-smoke');
  assert.equal(created.testCase.steps.length, 1);
  // 在编辑器保持打开时模拟另一个 Agent 修改同一文件，确认保存冲突不会覆盖它。
  await page.getByLabel('用例名称').fill('编辑器未保存标题');
  await store.saveCase({
    testCase: { ...created.testCase, title: '外部修改的标题' },
    expectedRevision: created.revision,
  });
  await page.getByRole('button', { name: '保存用例', exact: true }).click();
  await expect(page.getByText('用例已被其他窗口或 Agent 修改，请重新加载后保存')).toBeVisible();
  assert.equal((await store.getCase('browser-smoke')).testCase.title, '外部修改的标题');
  await page.locator('.ant-drawer-close').click();
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await page.getByRole('button', { name: /刷\s*新/ }).click();
  await expect(page.getByText('外部修改的标题', { exact: true })).toBeVisible();
  const doc = await store.getCase('browser-smoke');
  const run = await store.startRun({
    caseId: doc.testCase.id,
    expectedRevision: doc.revision,
    environment: 'browser-e2e',
    targetUrl: address,
    executor: {
      agent: 'Playwright verification',
      model: null,
      browserTool: 'chromium',
      capabilities: ['screenshot'],
    },
    preconditions: [],
  });
  await page.screenshot({ path: join(root, '.casedock/inbox/workbench.png') });
  const artifact = await store.addArtifact({
    runId: run.id,
    stepId: 'step-1',
    assertionId: 'assert-1',
    kind: 'screenshot',
    source: '.casedock/inbox/workbench.png',
  });
  await store.recordStep({
    runId: run.id,
    requestId: 'browser-check',
    stepId: 'step-1',
    status: 'passed',
    observation: '页面服务连接状态可见',
    assertions: [
      {
        assertionId: 'assert-1',
        verdict: 'passed',
        observation: '服务已连接文字已由浏览器断言检查',
        artifactIds: [artifact.id],
      },
    ],
  });
  await store.finishRun({ runId: run.id, status: 'completed', reason: '真实浏览器检查完成' });
  await page.getByRole('button', { name: '执行记录' }).click();
  await page.getByRole('button', { name: /刷\s*新/ }).click();
  await page.getByRole('button', { name: '查看证据', exact: true }).click();
  await expect(page.getByText('服务已连接文字已由浏览器断言检查')).toBeVisible();
  const image = page.locator('.evidence-grid img');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0);
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  // 仅保留 UI 验收截图；测试用例、运行及其临时附件在清理时移除。
  await expect
    .poll(async () => (await page.locator('.ant-drawer-content-wrapper').boundingBox())?.x ?? 1440)
    .toBeLessThan(600);
  await expect(page.getByText('用例已保存', { exact: true })).toBeHidden();
  await page.screenshot({
    path: resolve('.casedock/browser-tests/run-detail.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('.ant-drawer-close').click();
  await page.getByRole('button', { name: '测试用例' }).click();
  await page.screenshot({
    path: resolve('.casedock/browser-tests/case-library.png'),
    fullPage: true,
    animations: 'disabled',
  });
});

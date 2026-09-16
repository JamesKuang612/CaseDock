import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { createStore } from '../src/core/store.js';
import { CoreError } from '../src/core/schema.js';
import { findWorkspace, withWriteLock } from '../src/core/files.js';
import { createServer } from '../src/server/index.js';
import type { RecordInput, TestCase } from '../src/core/models.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

/** 为每个测试提供独立仓库，清理前校验目录位于测试专用范围内。 */
async function fixture(t: TestContext, evidence: 'screenshot'[] = ['screenshot']) {
  const base = resolve('.casedock/test-workspaces');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'case-'));
  t.after(async () => {
    assert.ok(relative(base, root).startsWith('case-'));
    await rm(root, { recursive: true, force: true });
  });
  const store = await createStore(root);
  await store.init();
  const testCase: TestCase = {
    schemaVersion: 1,
    id: 'login',
    title: '登录成功',
    tags: ['smoke'],
    preconditions: [],
    steps: [
      {
        id: 'submit',
        action: '登录',
        assertions: [{ id: 'welcome', expect: '显示欢迎页面', evidence }],
      },
    ],
  };
  const document = await store.saveCase({ testCase, expectedRevision: null });
  const start = {
    caseId: 'login',
    expectedRevision: document.revision,
    initialUrl: 'http://localhost:3000',
    credentials: null,
    executor: {
      agent: 'test-agent',
      model: null,
      browserTool: 'fixture',
      capabilities: ['screenshot'],
    },
    preconditions: [],
  };
  return { root, store, testCase, document, start };
}

/** 断言业务错误码，避免测试只依赖可能调整的提示文案。 */
function code(expected: string) {
  return (error: unknown) => error instanceof CoreError && error.code === expected;
}

/** 创建标准的通过步骤输入，用于检查不同记录边界。 */
function passed(runId: string, artifactIds: string[] = []): RecordInput {
  return {
    runId,
    requestId: 'request-1',
    stepId: 'submit',
    status: 'passed',
    observation: '页面进入工作台',
    assertions: [
      { assertionId: 'welcome', verdict: 'passed', observation: '欢迎信息可见', artifactIds },
    ],
  };
}

test('用例校验拒绝重复 ID 和未知字段，坏文件不会阻断其他用例', async (t) => {
  const { store, testCase, root } = await fixture(t);
  await assert.rejects(
    store.saveCase({
      testCase: { ...testCase, steps: [...testCase.steps, ...testCase.steps] },
      expectedRevision: null,
    }),
    code('DUPLICATE_ID'),
  );
  await assert.rejects(
    store.saveCase({ testCase: { ...testCase, typo: true }, expectedRevision: null }),
    code('VALIDATION'),
  );
  await writeFile(join(root, 'cases/broken.test.yaml'), 'steps: [');
  const list = await store.listCases();
  assert.equal(list.cases.length, 1);
  assert.equal(list.errors.length, 1);
});

test('运行列表忽略 .gitkeep 等非运行文件', async (t) => {
  const { root, store } = await fixture(t);
  await writeFile(join(root, 'runs/.gitkeep'), '');
  await writeFile(join(root, 'runs/README.txt'), '辅助说明');

  const list = await store.listRuns();
  assert.deepEqual(list, { runs: [], errors: [] });
});

test('自动创建允许同名用例并生成互不重复的 Case ID', async (t) => {
  const { store, testCase } = await fixture(t);
  const { id: _id, ...definition } = testCase;
  const first = await store.createCase(definition);
  const second = await store.createCase(definition);

  assert.match(first.testCase.id, /^case-[0-9a-f-]{36}$/);
  assert.match(second.testCase.id, /^case-[0-9a-f-]{36}$/);
  assert.notEqual(first.testCase.id, second.testCase.id);
  assert.equal(first.testCase.title, second.testCase.title);
  assert.equal((await store.listCases()).cases.length, 3);
  await assert.rejects(store.createCase({ ...definition, id: 'agent-chosen' }), code('VALIDATION'));
});

test('一次性提交在一条调用内生成用例、运行和全部截图关联', async (t) => {
  const { root, store } = await fixture(t);
  await writeFile(join(root, '.casedock/inbox/dashboard.png'), png);
  const startedAt = new Date(Date.now() - 5_000).toISOString();
  const submitted = await store.submitTest({
    schemaVersion: 1,
    testCase: {
      title: '一次性提交登录检查',
      tags: ['smoke'],
      preconditions: [
        { description: '测试账号可用', satisfied: true, observation: '账号已成功登录' },
      ],
      steps: [
        {
          action: '登录并检查工作台',
          assertions: [
            { expect: '工作台可见', evidence: ['screenshot'] },
            { expect: '账号名称可见', evidence: ['screenshot'] },
          ],
        },
      ],
    },
    run: {
      initialUrl: 'https://example.test/login',
      credentials: { account: 'tester', password: 'plain-password' },
      executor: {
        agent: 'test-agent',
        model: null,
        browserTool: 'native-browser',
        capabilities: ['screenshot'],
      },
      startedAt,
      status: 'completed',
      reason: '全部检查完成',
    },
    results: [
      {
        step: 1,
        status: 'passed',
        observation: '已进入工作台',
        assertions: [
          {
            assertion: 1,
            verdict: 'passed',
            observation: '工作台标题可见',
            evidence: ['.casedock/inbox/dashboard.png'],
          },
          {
            assertion: 2,
            verdict: 'passed',
            observation: '账号名称可见',
            evidence: ['.casedock/inbox/dashboard.png'],
          },
        ],
      },
    ],
  });

  assert.match(submitted.caseId, /^case-[0-9a-f-]{36}$/);
  assert.match(submitted.runId, /^run-[0-9a-f-]{36}$/);
  assert.equal(submitted.verdict, 'passed');
  assert.equal(submitted.artifactCount, 2);
  const testCase = await store.getCase(submitted.caseId);
  assert.equal(testCase.testCase.steps[0]?.id, 'step-1');
  assert.equal(testCase.testCase.steps[0]?.assertions[1]?.id, 'assertion-1-2');
  const run = await store.getRun(submitted.runId);
  assert.equal(run.startedAt, startedAt);
  assert.equal(run.steps.length, 1);
  assert.equal(run.artifacts.length, 2);
  assert.deepEqual((await store.readArtifact(run.id, run.artifacts[0]!.id)).bytes, png);
});

test('一次性提交保留原始测试输入 source，不传时向下兼容', async (t) => {
  const { root, store } = await fixture(t);
  await writeFile(join(root, '.casedock/inbox/shot.png'), png);
  const sourceText = '测试步骤：\n1. 打开登录页\n预期：登录成功';
  const base = {
    schemaVersion: 1 as const,
    testCase: {
      title: '原始内容测试',
      tags: [],
      preconditions: [{ description: '账号可用', satisfied: true, observation: '可用' }],
      steps: [
        {
          action: '登录',
          assertions: [{ expect: '成功', evidence: ['screenshot' as const] }],
        },
      ],
    },
    run: {
      initialUrl: 'https://example.test',
      credentials: null,
      executor: {
        agent: 'test-agent',
        model: null,
        browserTool: 'fixture',
        capabilities: ['screenshot' as const],
      },
      startedAt: new Date(Date.now() - 1_000).toISOString(),
      status: 'completed' as const,
      reason: '完成',
    },
    results: [
      {
        step: 1,
        status: 'passed' as const,
        observation: '已登录',
        assertions: [
          {
            assertion: 1,
            verdict: 'passed' as const,
            observation: '成功',
            evidence: ['.casedock/inbox/shot.png'],
          },
        ],
      },
    ],
  };

  // 传入 source 时保留到用例和快照
  const withSource = await store.submitTest({
    ...base,
    testCase: { ...base.testCase, source: sourceText },
  });
  const tc = await store.getCase(withSource.caseId);
  assert.equal(tc.testCase.source, sourceText);
  const run = await store.getRun(withSource.runId);
  assert.equal(run.snapshot.source, sourceText);

  // 不传 source 时向下兼容
  await writeFile(join(root, '.casedock/inbox/shot2.png'), png);
  const withoutSource = await store.submitTest({
    ...base,
    results: [
      {
        ...base.results[0]!,
        assertions: [
          {
            ...base.results[0]!.assertions[0]!,
            evidence: ['.casedock/inbox/shot2.png'],
          },
        ],
      },
    ],
  });
  const tc2 = await store.getCase(withoutSource.caseId);
  assert.equal(tc2.testCase.source, undefined);
});

test('source 超过 50000 字符时校验报错', async (t) => {
  const { store } = await fixture(t);
  await assert.rejects(
    store.submitTest({
      schemaVersion: 1,
      testCase: {
        title: '超长原始内容',
        source: 'x'.repeat(50001),
        tags: [],
        preconditions: [],
        steps: [
          {
            action: '操作',
            assertions: [{ expect: '预期', evidence: ['screenshot'] }],
          },
        ],
      },
      run: {
        initialUrl: 'https://example.test',
        credentials: null,
        executor: {
          agent: 'test-agent',
          model: null,
          browserTool: 'fixture',
          capabilities: ['screenshot'],
        },
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        status: 'completed',
        reason: '完成',
      },
      results: [],
    }),
    code('VALIDATION'),
  );
});

test('一次性提交在证据或结构无效时不留下半成品资产', async (t) => {
  const { store } = await fixture(t);
  const beforeCases = await store.listCases();
  await assert.rejects(
    store.submitTest({
      schemaVersion: 1,
      testCase: {
        title: '缺少证据',
        tags: [],
        preconditions: [],
        steps: [
          {
            action: '检查页面',
            assertions: [{ expect: '页面可见', evidence: ['screenshot'] }],
          },
        ],
      },
      run: {
        initialUrl: 'https://example.test',
        credentials: null,
        executor: {
          agent: 'test-agent',
          model: null,
          browserTool: 'native-browser',
          capabilities: ['screenshot'],
        },
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        status: 'completed',
        reason: '完成',
      },
      results: [
        {
          step: 1,
          status: 'passed',
          observation: '声称通过',
          assertions: [
            {
              assertion: 1,
              verdict: 'passed',
              observation: '没有截图',
              evidence: [],
            },
          ],
        },
      ],
    }),
    code('MISSING_EVIDENCE'),
  );
  assert.equal((await store.listCases()).cases.length, beforeCases.cases.length);
  assert.equal((await store.listRuns()).runs.length, 0);
});

test('初始地址与共用测试账密按原值记录，并拒绝废弃的环境字段', async (t) => {
  const { store, start } = await fixture(t);
  const initialUrl = 'https://example.test/login';
  const credentials = { account: 'tester@example.test', password: 'plain-password' };
  const run = await store.startRun({ ...start, initialUrl, credentials });
  assert.equal(run.initialUrl, initialUrl);
  assert.deepEqual(run.credentials, credentials);
  await assert.rejects(store.startRun({ ...start, environment: 'production' }), code('VALIDATION'));
});

test('测试账密支持多套凭据数组记录并支持指定角色', async (t) => {
  const { store, start } = await fixture(t);
  const multiCredentials = [
    { account: 'admin', password: 'admin-password', role: '管理员' },
    { account: 'user01', password: 'user-password' },
  ];
  const run = await store.startRun({ ...start, credentials: multiCredentials });
  assert.deepEqual(run.credentials, multiCredentials);
  const loaded = await store.getRun(run.id);
  assert.deepEqual(loaded.credentials, multiCredentials);
});

test('历史运行只有 targetUrl 且没有账密时仍可读取', async (t) => {
  const { root, store, start } = await fixture(t);
  const run = await store.startRun(start);
  const resultPath = join(root, `runs/${run.id}/result.json`);
  const legacy = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>;
  legacy.targetUrl = legacy.initialUrl;
  delete legacy.initialUrl;
  delete legacy.credentials;
  await writeFile(resultPath, JSON.stringify(legacy, null, 2));

  const loaded = await store.getRun(run.id);
  assert.equal(loaded.targetUrl, start.initialUrl);
  assert.equal(loaded.initialUrl, undefined);
  assert.equal(loaded.credentials, undefined);
});

test('新运行只接受截图证据，不再创建文本附件', async (t) => {
  const { root, store, start } = await fixture(t);
  const run = await store.startRun(start);
  await writeFile(join(root, '.casedock/inbox/observed.txt'), '页面文字');
  await assert.rejects(
    store.addArtifact({
      runId: run.id,
      stepId: 'submit',
      assertionId: 'welcome',
      kind: 'text',
      source: '.casedock/inbox/observed.txt',
    }),
    code('VALIDATION'),
  );
});

test('旧版本不能覆盖新版本，运行快照不随用例修改变化', async (t) => {
  const { store, start, document, testCase } = await fixture(t);
  const run = await store.startRun(start);
  const changed = await store.saveCase({
    testCase: { ...testCase, title: '新标题' },
    expectedRevision: document.revision,
  });
  assert.notEqual(changed.revision, document.revision);
  await assert.rejects(
    store.saveCase({ testCase, expectedRevision: document.revision }),
    code('CONFLICT'),
  );
  await assert.rejects(store.startRun(start), code('CONFLICT'));
  assert.equal((await store.getRun(run.id)).snapshot.title, '登录成功');
});

test('缺少必需证据不能通过，遗漏步骤的运行只能无法判断', async (t) => {
  const { store, start } = await fixture(t);
  const run = await store.startRun(start);
  await assert.rejects(store.recordStep(passed(run.id)), code('MISSING_EVIDENCE'));
  const done = await store.finishRun({
    runId: run.id,
    status: 'completed',
    reason: '没有完成检查',
  });
  assert.equal(done.verdict, 'inconclusive');
});

test('证据齐全时可通过，提交幂等且结束后不可修改', async (t) => {
  const { root, store, start } = await fixture(t);
  const run = await store.startRun(start);
  await writeFile(join(root, '.casedock/inbox/result.png'), png);
  const artifact = await store.addArtifact({
    runId: run.id,
    stepId: 'submit',
    assertionId: 'welcome',
    kind: 'screenshot',
    source: '.casedock/inbox/result.png',
  });
  const input = passed(run.id, [artifact.id]);
  assert.match(
    await readFile(join(root, 'runs', run.id, 'case.snapshot.yaml'), 'utf8'),
    /id: login/,
  );
  await store.recordStep(input);
  assert.equal((await store.recordStep(input)).steps.length, 1);
  await assert.rejects(
    store.recordStep({ ...input, observation: 'different' }),
    code('IDEMPOTENCY_CONFLICT'),
  );
  const finished = await store.finishRun({
    runId: run.id,
    status: 'completed',
    reason: '检查完成',
    tokenUsage: { total: 1234, source: '测试宿主统计' },
  });
  assert.equal(finished.verdict, 'passed');
  assert.deepEqual(finished.tokenUsage, { total: 1234, source: '测试宿主统计' });
  assert.equal((await store.recordStep(input)).steps.length, 1);
  await assert.rejects(
    store.recordStep({ ...input, requestId: 'new-request' }),
    code('RUN_CLOSED'),
  );
  assert.deepEqual((await store.readArtifact(run.id, artifact.id)).bytes, png);
});

test('证据不能跨运行关联，登记后被修改会阻止通过', async (t) => {
  const { root, store, start } = await fixture(t);
  const first = await store.startRun(start);
  const second = await store.startRun(start);
  await writeFile(join(root, '.casedock/inbox/result.png'), png);
  const artifact = await store.addArtifact({
    runId: first.id,
    stepId: 'submit',
    assertionId: 'welcome',
    kind: 'screenshot',
    source: '.casedock/inbox/result.png',
  });
  await assert.rejects(store.recordStep(passed(second.id, [artifact.id])), code('VALIDATION'));
  await store.recordStep(passed(first.id, [artifact.id]));
  await writeFile(join(root, 'runs', first.id, artifact.path), 'changed');
  await assert.rejects(
    store.finishRun({ runId: first.id, status: 'completed', reason: '完成' }),
    code('EVIDENCE_CHANGED'),
  );
  assert.equal((await store.getRun(first.id)).status, 'running');
});

test('中断、工具错误和不满足的前置条件不会变为产品通过', async (t) => {
  const { store, start, testCase, document } = await fixture(t, []);
  const interrupted = await store.startRun(start);
  await store.recordStep(passed(interrupted.id));
  assert.equal(
    (await store.finishRun({ runId: interrupted.id, status: 'interrupted', reason: '用户中断' }))
      .verdict,
    'inconclusive',
  );
  const error = await store.startRun(start);
  await store.recordStep({
    runId: error.id,
    requestId: 'error',
    stepId: 'submit',
    status: 'error',
    observation: '浏览器断开',
    assertions: [],
  });
  assert.equal(
    (await store.finishRun({ runId: error.id, status: 'completed', reason: '工具不可用' })).verdict,
    'inconclusive',
  );
  const changed = await store.saveCase({
    testCase: { ...testCase, preconditions: ['账号可用'] },
    expectedRevision: document.revision,
  });
  await assert.rejects(
    store.startRun({ ...start, expectedRevision: changed.revision }),
    code('VALIDATION'),
  );
  const blocked = await store.startRun({
    ...start,
    expectedRevision: changed.revision,
    preconditions: [{ index: 0, satisfied: false, observation: '账号不可用' }],
  });
  await store.recordStep(passed(blocked.id));
  assert.equal(
    (await store.finishRun({ runId: blocked.id, status: 'completed', reason: '完成记录' })).verdict,
    'inconclusive',
  );
});

test('真实失败断言汇总为失败，不能用其他状态掩盖', async (t) => {
  const { store, start } = await fixture(t);
  const run = await store.startRun(start);
  const result = {
    ...passed(run.id),
    status: 'failed',
    assertions: [
      { assertionId: 'welcome', verdict: 'failed', observation: '显示服务器错误', artifactIds: [] },
    ],
  };
  await assert.rejects(store.recordStep({ ...result, status: 'error' }), code('VALIDATION'));
  await store.recordStep(result);
  assert.equal(
    (await store.finishRun({ runId: run.id, status: 'completed', reason: '预期不满足' })).verdict,
    'failed',
  );
});

test('阻止路径越界、伪装截图和符号链接读写', async (t) => {
  const { store, root, start } = await fixture(t);
  const run = await store.startRun(start);
  const input = {
    runId: run.id,
    stepId: 'submit',
    assertionId: 'welcome',
    kind: 'screenshot',
    source: '../outside.png',
  };
  await assert.rejects(store.addArtifact(input), code('UNSAFE_PATH'));
  await writeFile(join(root, '.casedock/inbox/fake.png'), 'not an image');
  await assert.rejects(
    store.addArtifact({ ...input, source: '.casedock/inbox/fake.png' }),
    code('VALIDATION'),
  );
  await symlink(join(root, '.casedock/inbox'), join(root, 'linked'), 'junction');
  await assert.rejects(
    store.addArtifact({ ...input, source: 'linked/fake.png' }),
    code('UNSAFE_PATH'),
  );
});

test('并发写锁拒绝竞争写入，抛错也会释放锁', async (t) => {
  const { store, root, document, testCase } = await fixture(t);
  await withWriteLock(root, async () => {
    await assert.rejects(
      store.saveCase({ testCase, expectedRevision: document.revision }),
      code('BUSY'),
    );
  });
  await assert.rejects(
    withWriteLock(root, async () => {
      throw new Error('expected');
    }),
  );
  await store.saveCase({ testCase, expectedRevision: document.revision });
});

test('修改标题保留未变步骤注释，初始化重复运行不破坏忽略规则', async (t) => {
  const { root, store, testCase } = await fixture(t);
  const path = join(root, 'cases/login.test.yaml');
  const text = await readFile(path, 'utf8');
  await writeFile(path, text.replace('steps:', '# 团队的步骤说明\nsteps:'));
  const document = await store.getCase('login');
  await store.saveCase({
    testCase: { ...testCase, title: '改标题' },
    expectedRevision: document.revision,
  });
  assert.match(await readFile(path, 'utf8'), /团队的步骤说明/);
  const ignore = await readFile(join(root, '.gitignore'), 'utf8');
  assert.match(await readFile(join(root, 'casedock.yaml'), 'utf8'), /schemaVersion: 1/);
  assert.equal((await store.getWorkspace()).root, root);
  const nested = join(root, 'nested/project');
  await mkdir(nested, { recursive: true });
  assert.equal(await findWorkspace(nested), root);
  await store.init();
  assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), ignore);
});

test('用例支持通过 renameCase 修改标题，通过 deleteCase 安全删除', async (t) => {
  const { store } = await fixture(t);
  // 重命名
  const renamed = await store.renameCase('login', '新登录用例标题');
  assert.equal(renamed.testCase.title, '新登录用例标题');
  assert.equal((await store.getCase('login')).testCase.title, '新登录用例标题');
  await assert.rejects(store.renameCase('login', '   '), code('VALIDATION'));

  // 删除
  await store.deleteCase('login');
  await assert.rejects(store.getCase('login'), code('NOT_FOUND'));
  await assert.rejects(store.deleteCase('login'), code('NOT_FOUND'));
});

test('HTTP API 允许修改用例名称与删除用例，拒绝未授权的外站及非法写入', async (t) => {
  const { root } = await fixture(t);
  const server = await createServer(root);
  t.after(() => server.close());
  assert.equal(
    (await server.inject({ url: '/api/cases', headers: { host: 'attacker.example' } })).statusCode,
    403,
  );
  assert.equal(
    (await server.inject({ url: '/api/cases', headers: { origin: 'https://attacker.example' } }))
      .statusCode,
    403,
  );
  // POST 依然拒绝
  assert.equal(
    (await server.inject({ method: 'POST', url: '/api/cases', payload: {} })).statusCode,
    405,
  );
  // POST 到运行依然拒绝
  assert.equal(
    (await server.inject({ method: 'POST', url: '/api/runs', payload: {} })).statusCode,
    405,
  );

  // PATCH 重命名用例允许
  const patchRes = await server.inject({
    method: 'PATCH',
    url: '/api/cases/login',
    payload: { title: '通过 API 修改标题' },
  });
  assert.equal(patchRes.statusCode, 200);
  assert.equal(patchRes.json().testCase.title, '通过 API 修改标题');

  // DELETE 删除用例允许
  const delRes = await server.inject({
    method: 'DELETE',
    url: '/api/cases/login',
  });
  assert.equal(delRes.statusCode, 200);
  assert.equal(delRes.json().ok, true);

  const listRes = await server.inject('/api/cases');
  assert.equal(listRes.json().cases.length, 0);
});

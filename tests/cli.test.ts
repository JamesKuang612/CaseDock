import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

test('Skill 运行器可以在空目录初始化资产库并完成环境诊断', async (t) => {
  const base = resolve('.casedock/cli-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'setup-'));
  t.after(async () => {
    assert.ok(relative(base, root).startsWith('setup-'));
    await rm(root, { recursive: true, force: true });
  });
  const args = ['--import', 'tsx', 'src/cli.ts', '--root', root, 'init', '--name', '团队测试资产'];
  const first = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: 'utf8',
  });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /"ok": true/);
  assert.match(await readFile(join(root, 'casedock.yaml'), 'utf8'), /团队测试资产/);
  assert.match(await readFile(join(root, '.gitignore'), 'utf8'), /^\.casedock\/$/m);
  const doctor = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', '--root', root, 'doctor', '--json'],
    {
      cwd: process.cwd(),
      windowsHide: true,
      encoding: 'utf8',
    },
  );
  assert.equal(doctor.status, 0, doctor.stderr);
  const diagnosis = JSON.parse(doctor.stdout).data;
  assert.equal(diagnosis.workspace.ready, true);
  assert.equal(diagnosis.workspace.root, root);
  assert.equal(diagnosis.browserFallback.cliAvailable, true);
  assert.equal(diagnosis.nativeAgentBrowser.detectable, false);

  const second = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: 'utf8',
  });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /"ok": true/);
});

test('CLI 通过 stdin 串联创建、执行记录、截图证据和结束，失败返回机器错误', async (t) => {
  const base = resolve('.casedock/cli-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'case-'));
  t.after(async () => {
    assert.ok(relative(base, root).startsWith('case-'));
    await rm(root, { recursive: true, force: true });
  });
  /** 以独立进程调用真实 CLI，检查退出码、stdout 和 JSON 信封。 */
  function call(args: string[], input?: unknown) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/cli.ts',
        '--root',
        root,
        ...args,
        ...(input === undefined ? [] : ['--input', '-']),
      ],
      {
        cwd: process.cwd(),
        windowsHide: true,
        encoding: 'utf8',
        input: input === undefined ? undefined : JSON.stringify(input),
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.apiVersion, 1);
    assert.equal(envelope.ok, true);
    return envelope.data;
  }
  call(['init']);
  await writeFile(join(root, '.casedock/inbox/quick.png'), png);
  const quick = call(['test', 'submit'], {
    schemaVersion: 1,
    testCase: {
      title: '一次提交',
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
        agent: 'cli-test',
        model: null,
        browserTool: 'fixture',
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
        observation: '页面已显示',
        assertions: [
          {
            assertion: 1,
            verdict: 'passed',
            observation: '截图可见',
            evidence: ['.casedock/inbox/quick.png'],
          },
        ],
      },
    ],
  });
  assert.deepEqual(Object.keys(quick).sort(), [
    'artifactCount',
    'caseId',
    'casePath',
    'evidenceDirectory',
    'runId',
    'runPath',
    'verdict',
  ]);
  assert.equal(quick.verdict, 'passed');
  const document = call(['case', 'create'], {
    schemaVersion: 1,
    title: 'CLI 测试',
    tags: [],
    preconditions: [],
    steps: [
      {
        id: 'step',
        action: '检查模拟页面',
        assertions: [{ id: 'assertion', expect: '页面状态正确', evidence: ['screenshot'] }],
      },
    ],
  });
  assert.match(document.testCase.id, /^case-[0-9a-f-]{36}$/);
  const run = call(['run', 'start'], {
    caseId: document.testCase.id,
    expectedRevision: document.revision,
    initialUrl: 'http://localhost:3000',
    credentials: null,
    executor: {
      agent: 'cli-test',
      model: null,
      browserTool: 'fixture',
      capabilities: ['screenshot'],
    },
    preconditions: [],
  });
  await writeFile(join(root, '.casedock/inbox/observed.png'), png);
  const artifact = call(['artifact', 'add'], {
    runId: run.id,
    stepId: 'step',
    assertionId: 'assertion',
    kind: 'screenshot',
    source: '.casedock/inbox/observed.png',
  });
  call(['run', 'record'], {
    runId: run.id,
    requestId: 'request-1',
    stepId: 'step',
    status: 'passed',
    observation: '验证 CLI 记录链路',
    assertions: [
      {
        assertionId: 'assertion',
        verdict: 'passed',
        observation: '页面截图已保存',
        artifactIds: [artifact.id],
      },
    ],
  });
  assert.equal(
    call(['run', 'finish'], { runId: run.id, status: 'completed', reason: 'CLI 测试完成' }).verdict,
    'passed',
  );
  assert.equal(call(['run', 'get', run.id]).steps.length, 1);
  const invalid = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', '--root', root, 'case', 'create', '--input', '-'],
    { encoding: 'utf8', input: '{broken', windowsHide: true },
  );
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).error.code, 'VALIDATION');
});

test('CLI 支持通过 report submit 提交多用例批次报告，并可通过 report list/get 查看', async (t) => {
  const base = resolve('.casedock/cli-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'report-'));
  t.after(async () => {
    assert.ok(relative(base, root).startsWith('report-'));
    await rm(root, { recursive: true, force: true });
  });

  function call(args: string[], input?: unknown) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/cli.ts',
        '--root',
        root,
        ...args,
        ...(input === undefined ? [] : ['--input', '-']),
      ],
      {
        cwd: process.cwd(),
        windowsHide: true,
        encoding: 'utf8',
        input: input === undefined ? undefined : JSON.stringify(input),
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.apiVersion, 1);
    assert.equal(envelope.ok, true);
    return envelope.data;
  }

  call(['init']);
  await writeFile(join(root, '.casedock/inbox/shot.png'), png);

  const reportResult = call(['report', 'submit'], {
    title: 'CLI 批量测试报告',
    cases: [
      {
        title: '用例A',
        status: 'passed',
        summary: '用例A通过',
        steps: [
          {
            index: 1,
            action: '点击',
            expected: '成功',
            actual: '成功',
            status: 'passed',
            evidence: '.casedock/inbox/shot.png',
          },
        ],
      },
    ],
  });

  assert.ok(reportResult.runId.startsWith('report-'));
  assert.equal(reportResult.totals.total, 1);
  assert.equal(reportResult.totals.passed, 1);

  const list = call(['report', 'list', '--json']);
  assert.equal(list.reports.length, 1);
  assert.equal(list.reports[0].runId, reportResult.runId);

  const detail = call(['report', 'get', reportResult.runId, '--json']);
  assert.equal(detail.title, 'CLI 批量测试报告');
  assert.equal(detail.cases.length, 1);
});

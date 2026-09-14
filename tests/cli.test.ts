import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

test('CLI 通过 stdin 串联创建、执行记录、文本证据和结束，失败返回机器错误', async (t) => {
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
  call(['skill', 'install']);
  assert.match(
    await readFile(join(root, '.agents/skills/casedock-testing/SKILL.md'), 'utf8'),
    /CaseDock 约束测试资产如何保存，不约束测试如何执行/,
  );
  const document = call(['case', 'save'], {
    expectedRevision: null,
    testCase: {
      schemaVersion: 1,
      id: 'cli-smoke',
      title: 'CLI 测试',
      tags: [],
      preconditions: [],
      steps: [
        {
          id: 'step',
          action: '检查模拟文本',
          assertions: [{ id: 'assertion', expect: '有测试文本', evidence: ['text'] }],
        },
      ],
    },
  });
  const run = call(['run', 'start'], {
    caseId: 'cli-smoke',
    expectedRevision: document.revision,
    environment: 'fixture',
    targetUrl: 'http://localhost:3000',
    executor: { agent: 'cli-test', model: null, browserTool: 'fixture', capabilities: ['text'] },
    preconditions: [],
  });
  await writeFile(
    join(root, '.casedock/inbox/observed.txt'),
    '这是 CLI 集成测试的模拟文本证据，不是浏览器测试结果',
  );
  const artifact = call(['artifact', 'add'], {
    runId: run.id,
    stepId: 'step',
    assertionId: 'assertion',
    kind: 'text',
    source: '.casedock/inbox/observed.txt',
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
        observation: '文本存在',
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
    ['--import', 'tsx', 'src/cli.ts', '--root', root, 'case', 'save', '--input', '-'],
    { encoding: 'utf8', input: '{broken', windowsHide: true },
  );
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).error.code, 'VALIDATION');
});

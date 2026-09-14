import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

test('setup 一次初始化资产库并安装 Skill，重复执行不覆盖已有内容', async (t) => {
  const base = resolve('.casedock/cli-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'setup-'));
  t.after(async () => {
    assert.ok(relative(base, root).startsWith('setup-'));
    await rm(root, { recursive: true, force: true });
  });
  const args = ['--import', 'tsx', 'src/cli.ts', '--root', root, 'setup', '--name', '团队测试资产'];
  const first = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: 'utf8',
  });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /CaseDock 测试资产库已准备完成/);
  assert.match(first.stdout, /Skill：已安装/);
  assert.match(await readFile(join(root, 'casedock.yaml'), 'utf8'), /团队测试资产/);
  assert.match(await readFile(join(root, '.gitignore'), 'utf8'), /^\.casedock\/$/m);
  const skillPath = join(root, '.agents/skills/casedock-testing/SKILL.md');
  assert.match(await readFile(skillPath, 'utf8'), /CaseDock 测试资产记录/);

  await writeFile(skillPath, '用户保留的 Skill\n');
  const second = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: 'utf8',
  });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Skill：已存在，未覆盖/);
  assert.equal(await readFile(skillPath, 'utf8'), '用户保留的 Skill\n');
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
  call(['skill', 'install']);
  assert.match(
    await readFile(join(root, '.agents/skills/casedock-testing/SKILL.md'), 'utf8'),
    /CaseDock 约束测试资产如何保存，不约束测试如何执行/,
  );
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

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

/** 向操作系统申请一个空闲回环端口，随后立即释放给被测 Skill 服务。 */
async function freePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

/** 在不继承源码依赖的临时目录里调用最终 Skill 运行器。 */
function callRunner(runner: string, root: string, args: string[]) {
  const result = spawnSync(process.execPath, [runner, '--root', root, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).data;
}

/** 等待只读页面开始响应；超时意味着自包含服务无法从 Skill 资源启动。 */
async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // 服务启动前连接失败属于正常轮询状态。
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Skill 本地页面在 5 秒内未启动');
}

test('完整 Skill 离开源码与 node_modules 后仍能初始化、提交、校验和展示', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'casedock-skill-'));
  let pageServer: ReturnType<typeof spawn> | undefined;
  t.after(async () => {
    if (pageServer && pageServer.exitCode === null) {
      pageServer.kill();
      await once(pageServer, 'close');
    }
    await rm(sandbox, { recursive: true, force: true });
  });
  const skillRoot = join(sandbox, 'casedock-testing');
  const assetRoot = join(sandbox, 'team-assets');
  await cp('skills/casedock-testing', skillRoot, { recursive: true });
  const runner = join(skillRoot, 'scripts/casedock.mjs');

  assert.ok((await stat(runner)).size > 1_000_000);
  assert.match(await readFile(join(skillRoot, 'SKILL.md'), 'utf8'), /不约束测试怎么做/);
  assert.ok((await stat(join(skillRoot, 'assets/ui/index.html'))).isFile());

  await mkdir(assetRoot);
  callRunner(runner, assetRoot, ['init', '--name', '隔离验收资产库']);
  await writeFile(join(assetRoot, '.casedock/inbox/evidence.png'), png);
  const manifestPath = join(assetRoot, '.casedock/inbox/submit.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      testCase: {
        title: 'Skill 隔离运行',
        tags: ['distribution'],
        preconditions: [],
        steps: [
          {
            action: '检查自包含运行器',
            assertions: [{ expect: '运行器可以保存证据', evidence: ['screenshot'] }],
          },
        ],
      },
      run: {
        initialUrl: 'https://example.test',
        credentials: null,
        executor: {
          agent: 'distribution-test',
          model: null,
          browserTool: 'fixture',
          capabilities: ['screenshot'],
        },
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        status: 'completed',
        reason: '隔离验收完成',
      },
      results: [
        {
          step: 1,
          status: 'passed',
          observation: '单文件运行器已执行',
          assertions: [
            {
              assertion: 1,
              verdict: 'passed',
              observation: '证据已归档',
              evidence: ['.casedock/inbox/evidence.png'],
            },
          ],
        },
      ],
    }),
  );

  const submitted = callRunner(runner, assetRoot, ['test', 'submit', '--input', manifestPath]);
  assert.equal(submitted.verdict, 'passed');
  assert.equal(callRunner(runner, assetRoot, ['validate', '--json']).valid, true);

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  pageServer = spawn(
    process.execPath,
    [runner, '--root', assetRoot, 'open', '--port', String(port), '--no-open'],
    { cwd: assetRoot, windowsHide: true, stdio: 'ignore' },
  );
  await waitForServer(url);

  const page = await (await fetch(url)).text();
  const cases = (await (await fetch(`${url}/api/cases`)).json()) as {
    cases: Array<{ testCase: { title: string } }>;
  };
  assert.match(page, /<div id="root"><\/div>/);
  assert.equal(cases.cases[0]?.testCase.title, 'Skill 隔离运行');
});

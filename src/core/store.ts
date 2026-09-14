import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, realpath } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import type { Artifact, CaseDocument, Run, RunSummary, WorkspaceConfig } from './models.js';
import { CoreError, validate, validateCase, validateCaseIdentity } from './schema.js';
import {
  atomicWrite,
  canonical,
  digest,
  isFsError,
  optionalText,
  readBounded,
  safePath,
  withWriteLock,
} from './files.js';

/** 读取 Git 上下文，非 Git 项目或缺少 Git 时显式记录未知。 */
function gitContext(root: string): Run['git'] {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { commit, dirty: status.trim().length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

/** 验证作为文件名使用的业务 ID，禁止路径片段和特殊字符。 */
function checkId(id: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))
    throw new CoreError('VALIDATION', 'ID 只能包含小写字母、数字和连字符');
}

/** 创建一个绑定到真实工作区路径的测试资产仓库。 */
export async function createStore(root: string) {
  return new Store(await realpath(root));
}

/** 为 CLI 与只读页面提供统一的数据读取、写入、版本检查和结果汇总规则。 */
export class Store {
  /** 将实例绑定到工作区，不持有可过期的用例或运行内存副本。 */
  constructor(public readonly root: string) {}

  /** 读取资产库名称和格式版本，供 Agent 与本地页面确认当前目标目录。 */
  async getWorkspace(): Promise<WorkspaceConfig & { root: string }> {
    const content = await optionalText(await safePath(this.root, 'casedock.yaml'));
    if (content === null)
      throw new CoreError('WORKSPACE_NOT_FOUND', '当前目录还不是 CaseDock 测试资产库');
    const doc = parseDocument(content);
    if (doc.errors.length)
      throw new CoreError(
        'VALIDATION',
        'casedock.yaml 无法解析',
        doc.errors.map((error) => error.message),
      );
    return { ...validate('workspace', doc.toJS({ maxAliasCount: 20 })), root: this.root };
  }

  /** 枚举目录中的目标文件；尚未初始化的目录返回空列表。 */
  private async names(path: string, suffix: string) {
    try {
      return (await readdir(await safePath(this.root, path)))
        .filter((name) => name.endsWith(suffix))
        .sort();
    } catch (error) {
      if (isFsError(error, 'ENOENT')) return [];
      throw error;
    }
  }

  /** 读取用例并以原始文件内容计算 revision，捕获注释和外部编辑变化。 */
  async getCase(id: string): Promise<CaseDocument> {
    checkId(id);
    const path = `cases/${id}.test.yaml`;
    let bytes: Buffer;
    try {
      bytes = await readBounded(await safePath(this.root, path));
    } catch (error) {
      if (isFsError(error, 'ENOENT')) throw new CoreError('NOT_FOUND', `找不到用例 ${id}`);
      throw error;
    }
    const doc = parseDocument(bytes.toString('utf8'));
    if (doc.errors.length)
      throw new CoreError(
        'VALIDATION',
        'YAML 无法解析',
        doc.errors.map((error) => error.message),
      );
    const testCase = validateCase(doc.toJS({ maxAliasCount: 20 }));
    if (testCase.id !== id) throw new CoreError('VALIDATION', '用例 ID 必须与文件名一致');
    return { testCase, revision: digest(bytes), path };
  }

  /** 列出全部有效用例，并单独报告坏文件，使一个错误文件不会挡住工作台。 */
  async listCases() {
    const cases: CaseDocument[] = [];
    const errors: { path: string; message: string }[] = [];
    for (const name of await this.names('cases', '.test.yaml')) {
      try {
        cases.push(await this.getCase(name.slice(0, -10)));
      } catch (error) {
        errors.push({
          path: `cases/${name}`,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { cases, errors };
  }

  /** 创建全新用例并由内核生成唯一 ID，不读取或匹配资产库中的其他用例。 */
  async createCase(input: unknown): Promise<CaseDocument> {
    const value = validate('createCase', input);
    return withWriteLock(this.root, async () => {
      let id: string;
      let path: string;
      // UUID 冲突几乎不可能，但仍以文件是否存在为最终唯一性依据。
      do {
        id = `case-${randomUUID()}`;
        path = await safePath(this.root, `cases/${id}.test.yaml`);
      } while ((await optionalText(path)) !== null);
      const { schemaVersion, ...definition } = value;
      const testCase = validateCase({ schemaVersion, id, ...definition });
      const content = stringify(testCase);
      if (Buffer.byteLength(content) > 4 * 1024 * 1024)
        throw new CoreError('FILE_SIZE', '用例超过 4 MiB，请拆分成更小的用例');
      await atomicWrite(path, content);
      return this.getCase(id);
    });
  }

  /** 按预期版本保存用例；新建必须传 null，更新必须匹配当前 revision。 */
  async saveCase(input: unknown): Promise<CaseDocument> {
    const { testCase, expectedRevision } = validate('saveCase', input);
    validateCase(testCase);
    return withWriteLock(this.root, async () => {
      const path = await safePath(this.root, `cases/${testCase.id}.test.yaml`);
      const existing = await optionalText(path);
      if ((existing === null ? null : digest(existing)) !== expectedRevision)
        throw new CoreError('CONFLICT', '用例已被其他窗口或 Agent 修改，请重新加载后保存');
      const doc = parseDocument(existing ?? '');
      const previous = doc.toJS({ maxAliasCount: 20 }) as Record<string, unknown> | null;
      // 在已有 YAML 文档上更新字段，保留未改变字段的注释。
      for (const [key, value] of Object.entries(testCase)) {
        if (canonical(previous?.[key]) !== canonical(value)) doc.set(key, value);
      }
      validateCase(doc.toJS({ maxAliasCount: 20 }));
      const content = doc.toString();
      if (Buffer.byteLength(content) > 4 * 1024 * 1024)
        throw new CoreError('FILE_SIZE', '用例超过 4 MiB，请拆分成更小的用例');
      await atomicWrite(path, content);
      return this.getCase(testCase.id);
    });
  }

  /** 开始一次记录并冻结用例内容；此方法不会启动浏览器或 Agent。 */
  async startRun(input: unknown): Promise<Run> {
    const value = validate('startRun', input);
    let url: URL;
    try {
      url = new URL(value.initialUrl);
    } catch {
      throw new CoreError('VALIDATION', '初始地址必须是有效 HTTP(S) URL');
    }
    if (!['http:', 'https:'].includes(url.protocol))
      throw new CoreError('VALIDATION', '初始地址必须为 HTTP(S)');
    return withWriteLock(this.root, async () => {
      const doc = await this.getCase(value.caseId);
      if (doc.revision !== value.expectedRevision)
        throw new CoreError('CONFLICT', '用例版本已变化，请重新读取后开始');
      const indices = value.preconditions.map((item) => item.index);
      if (
        indices.length !== doc.testCase.preconditions.length ||
        new Set(indices).size !== indices.length ||
        indices.some((index) => index >= indices.length)
      ) {
        throw new CoreError('VALIDATION', '必须逐项记录当前用例的前置条件及实际观察');
      }
      const run: Run = {
        schemaVersion: 1,
        id: `run-${randomUUID()}`,
        caseId: value.caseId,
        caseRevision: doc.revision,
        snapshot: doc.testCase,
        initialUrl: value.initialUrl,
        credentials: value.credentials,
        executor: value.executor,
        preconditions: value.preconditions,
        git: gitContext(this.root),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: 'running',
        verdict: null,
        reason: null,
        tokenUsage: null,
        steps: [],
        artifacts: [],
        receipts: [],
      };
      await this.writeRun(run);
      await atomicWrite(
        await safePath(this.root, `runs/${run.id}/case.snapshot.yaml`),
        stringify(run.snapshot),
      );
      return run;
    });
  }

  /** 读取并校验运行文件，始终以记录中的快照展示历史。 */
  async getRun(id: string): Promise<Run> {
    checkId(id);
    try {
      const bytes = await readBounded(await safePath(this.root, `runs/${id}/result.json`));
      const run = validate('run', JSON.parse(bytes.toString('utf8')));
      if (run.id !== id || run.snapshot.id !== run.caseId)
        throw new CoreError('VALIDATION', '运行记录身份不一致');
      if (!run.initialUrl && !run.targetUrl)
        throw new CoreError('VALIDATION', '运行记录缺少初始地址');
      validateCaseIdentity(run.snapshot);
      return run;
    } catch (error) {
      if (isFsError(error, 'ENOENT')) throw new CoreError('NOT_FOUND', `找不到运行 ${id}`);
      throw error;
    }
  }

  /** 列出运行摘要与损坏记录，避免在列表中传输所有截图和观察。 */
  async listRuns() {
    const runs: RunSummary[] = [];
    const errors: { path: string; message: string }[] = [];
    for (const name of await this.names('runs', '')) {
      try {
        const run = await this.getRun(name);
        const {
          id,
          caseId,
          caseRevision,
          status,
          verdict,
          startedAt,
          finishedAt,
          tokenUsage,
          executor,
        } = run;
        runs.push({
          id,
          caseId,
          caseRevision,
          status,
          verdict,
          startedAt,
          finishedAt,
          tokenUsage,
          executor,
        });
      } catch (error) {
        errors.push({
          path: name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { runs: runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)), errors };
  }

  /** 校验运行并原子保存；写入总量与读取上限保持一致。 */
  private async writeRun(run: Run) {
    validate('run', run);
    const content = JSON.stringify(run, null, 2);
    if (Buffer.byteLength(content) > 4 * 1024 * 1024)
      throw new CoreError('FILE_SIZE', '运行记录超过 4 MiB，请缩短观察内容');
    await atomicWrite(await safePath(this.root, `runs/${run.id}/result.json`), content);
  }

  /** 阻止修改已经结束的运行，重测应新建运行。 */
  private requireRunning(run: Run) {
    if (run.status !== 'running')
      throw new CoreError('RUN_CLOSED', '运行已经结束，不能覆盖历史记录');
  }

  /** 导入工作区内的真实证据文件，验证类型并归档到当前断言。 */
  async addArtifact(input: unknown): Promise<Artifact> {
    const value = validate('addArtifact', input);
    return withWriteLock(this.root, async () => {
      const run = await this.getRun(value.runId);
      this.requireRunning(run);
      const step = run.snapshot.steps.find((item) => item.id === value.stepId);
      if (!step?.assertions.some((item) => item.id === value.assertionId))
        throw new CoreError('VALIDATION', '证据必须关联快照中的步骤和断言');
      const bytes = await readBounded(await safePath(this.root, value.source), 20 * 1024 * 1024);
      if (!bytes.length) throw new CoreError('VALIDATION', '不能登记空证据');
      let extension: 'png' | 'jpg';
      let mime: 'image/png' | 'image/jpeg';
      if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        extension = 'png';
        mime = 'image/png';
      } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
        extension = 'jpg';
        mime = 'image/jpeg';
      } else throw new CoreError('VALIDATION', '截图只接受 PNG 或 JPEG 文件');
      const artifact: Artifact = {
        id: `artifact-${randomUUID()}`,
        stepId: value.stepId,
        assertionId: value.assertionId,
        kind: value.kind,
        path: '',
        sha256: digest(bytes),
        bytes: bytes.length,
        createdAt: new Date().toISOString(),
        mime,
      };
      artifact.path = `evidence/${artifact.id}.${extension}`;
      await atomicWrite(await safePath(this.root, `runs/${run.id}/${artifact.path}`), bytes);
      run.artifacts.push(artifact);
      await this.writeRun(run);
      return artifact;
    });
  }

  /** 获取登记的证据并复核摘要，拒绝被替换或损坏的文件。 */
  async readArtifact(runId: string, artifactId: string) {
    const run = await this.getRun(runId);
    const artifact = run.artifacts.find((item) => item.id === artifactId);
    if (!artifact) throw new CoreError('NOT_FOUND', '找不到证据');
    // 只允许登记生成的文件名，不能通过修改 result.json 读取别的项目文件。
    if (!new RegExp(`^evidence/${artifact.id}\\.(png|jpg|txt)$`).test(artifact.path))
      throw new CoreError('UNSAFE_PATH', '证据路径无效');
    const bytes = await readBounded(
      await safePath(this.root, `runs/${run.id}/${artifact.path}`),
      20 * 1024 * 1024,
    );
    if (digest(bytes) !== artifact.sha256 || bytes.length !== artifact.bytes)
      throw new CoreError('EVIDENCE_CHANGED', '证据内容已改变或损坏');
    return { artifact, bytes };
  }

  /** 提交不可覆盖的步骤结果；请求 ID 支持安全重试，内容不同则拒绝。 */
  async recordStep(input: unknown): Promise<Run> {
    const value = validate('recordStep', input);
    return withWriteLock(this.root, async () => {
      const run = await this.getRun(value.runId);
      const requestDigest = digest(canonical(value));
      const receipt = run.receipts.find((item) => item.requestId === value.requestId);
      if (receipt) {
        if (receipt.digest !== requestDigest)
          throw new CoreError('IDEMPOTENCY_CONFLICT', '相同 requestId 不能提交不同内容');
        return run;
      }
      this.requireRunning(run);
      const step = run.snapshot.steps.find((item) => item.id === value.stepId);
      if (!step) throw new CoreError('VALIDATION', '步骤不在本次运行快照中');
      if (run.steps.some((item) => item.stepId === value.stepId))
        throw new CoreError('STEP_RECORDED', '该步骤已有结果，重测请新建运行');
      const resultIds = value.assertions.map((item) => item.assertionId);
      if (
        new Set(resultIds).size !== resultIds.length ||
        resultIds.some((id) => !step.assertions.some((item) => item.id === id))
      )
        throw new CoreError('VALIDATION', '断言重复或不在当前步骤中');
      if (
        value.status === 'passed' &&
        (resultIds.length !== step.assertions.length ||
          value.assertions.some((item) => item.verdict !== 'passed'))
      )
        throw new CoreError('INCOMPLETE', '步骤通过必须包含全部断言且全部通过');
      if (value.status === 'failed' && !value.assertions.some((item) => item.verdict === 'failed'))
        throw new CoreError('VALIDATION', '断言失败才使用 failed；工具异常请使用 error');
      if (value.status !== 'failed' && value.assertions.some((item) => item.verdict === 'failed'))
        throw new CoreError('VALIDATION', '存在失败断言时步骤状态必须为 failed');
      for (const result of value.assertions) {
        const artifacts = result.artifactIds.map((id) =>
          run.artifacts.find((item) => item.id === id),
        );
        if (
          artifacts.some(
            (item) => !item || item.stepId !== step.id || item.assertionId !== result.assertionId,
          )
        )
          throw new CoreError('VALIDATION', '证据必须来自本次运行的当前断言');
        const required = step.assertions.find((item) => item.id === result.assertionId)!.evidence;
        if (
          result.verdict === 'passed' &&
          required.some((kind) => !artifacts.some((item) => item?.kind === kind))
        )
          throw new CoreError('MISSING_EVIDENCE', '断言通过需要提供规定类型的证据');
        for (const artifact of artifacts) await this.readArtifact(run.id, artifact!.id);
      }
      const { runId: _runId, requestId: _requestId, ...record } = value;
      run.steps.push(record);
      run.receipts.push({ requestId: value.requestId, digest: requestDigest });
      await this.writeRun(run);
      return run;
    });
  }

  /** 结束记录并计算结论：中断或缺检查永远不能通过。 */
  async finishRun(input: unknown): Promise<Run> {
    const value = validate('finishRun', input);
    return withWriteLock(this.root, async () => {
      const run = await this.getRun(value.runId);
      const suppliedUsage = Object.prototype.hasOwnProperty.call(value, 'tokenUsage');
      if (
        run.status === value.status &&
        run.reason === value.reason &&
        (!suppliedUsage ||
          canonical(run.tokenUsage ?? null) === canonical(value.tokenUsage ?? null))
      )
        return run;
      this.requireRunning(run);
      // 完成前重新校验证据，避免记录后附件被删除却仍然汇总为通过。
      if (value.status === 'completed') {
        for (const step of run.steps)
          for (const assertion of step.assertions)
            for (const id of assertion.artifactIds) await this.readArtifact(run.id, id);
      }
      const failed = run.steps.some((step) =>
        step.assertions.some((assertion) => assertion.verdict === 'failed'),
      );
      const complete =
        run.steps.length === run.snapshot.steps.length &&
        run.steps.every((step) => step.status === 'passed') &&
        run.preconditions.every((item) => item.satisfied);
      run.status = value.status;
      run.verdict =
        value.status === 'interrupted'
          ? 'inconclusive'
          : failed
            ? 'failed'
            : complete
              ? 'passed'
              : 'inconclusive';
      run.reason = value.reason;
      run.tokenUsage = value.tokenUsage ?? null;
      run.finishedAt = new Date().toISOString();
      await this.writeRun(run);
      return run;
    });
  }

  /** 初始化独立测试资产库；用例、运行和最终证据均可由 Git 管理。 */
  async init(name = basename(this.root)) {
    return withWriteLock(this.root, async () => {
      const configPath = await safePath(this.root, 'casedock.yaml');
      const existingConfig = await optionalText(configPath);
      if (existingConfig === null) {
        const config: WorkspaceConfig = { schemaVersion: 1, name };
        validate('workspace', config);
        await atomicWrite(configPath, stringify(config));
      } else {
        const doc = parseDocument(existingConfig);
        if (doc.errors.length) throw new CoreError('VALIDATION', 'casedock.yaml 无法解析');
        validate('workspace', doc.toJS({ maxAliasCount: 20 }));
      }
      await mkdir(await safePath(this.root, 'cases'), { recursive: true });
      await mkdir(await safePath(this.root, 'runs'), { recursive: true });
      await mkdir(await safePath(this.root, '.casedock/inbox'), { recursive: true });
      const ignore = await safePath(this.root, '.gitignore');
      const current = (await optionalText(ignore)) ?? '';
      if (!current.split(/\r?\n/).includes('.casedock/'))
        await atomicWrite(ignore, `${current.trimEnd()}\n.casedock/\n`);
      return {
        ...(await this.getWorkspace()),
        casesDirectory: 'cases',
        runsDirectory: 'runs',
        inbox: '.casedock/inbox',
      };
    });
  }
}

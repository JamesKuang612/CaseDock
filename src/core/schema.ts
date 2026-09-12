import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import type {
  ArtifactInput,
  FinishInput,
  RecordInput,
  Run,
  SaveCaseInput,
  StartRunInput,
  TestCase,
} from './models.js';

const text = { type: 'string', minLength: 1, maxLength: 10000, pattern: '\\S' };
const id = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,79}$' };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const evidence = { type: 'string', enum: ['screenshot', 'text'] };
const verdict = { type: 'string', enum: ['passed', 'failed', 'inconclusive'] };

/** 创建禁止额外字段的对象 Schema，让拼错字段立即报错。 */
function object(properties: Record<string, unknown>) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
/** 创建有上限的数组 Schema，控制输入与工作区记录大小。 */
function array(items: unknown, minItems = 0, maxItems = 1000) {
  return { type: 'array', items, minItems, maxItems };
}
export const caseSchema = object({
  schemaVersion: { const: 1 },
  id,
  title: text,
  tags: { ...array(text), uniqueItems: true },
  preconditions: array(text),
  steps: array(
    object({
      id,
      action: text,
      assertions: array(
        object({ id, expect: text, evidence: { ...array(evidence), uniqueItems: true } }),
        1,
      ),
    }),
    1,
  ),
});
const executor = object({
  agent: text,
  model: { anyOf: [text, { type: 'null' }] },
  browserTool: text,
  capabilities: { ...array(evidence), uniqueItems: true },
});
const preconditions = array(
  object({
    index: { type: 'integer', minimum: 0 },
    satisfied: { type: 'boolean' },
    observation: text,
  }),
);
const stepProperties = {
  stepId: id,
  status: { enum: ['passed', 'failed', 'blocked', 'skipped', 'error'] },
  observation: text,
  assertions: array(
    object({
      assertionId: id,
      verdict,
      observation: text,
      artifactIds: { ...array(id), uniqueItems: true },
    }),
  ),
};
const artifactProperties = {
  id,
  stepId: id,
  assertionId: id,
  kind: evidence,
  path: text,
  sha256: hash,
  bytes: { type: 'integer', minimum: 1, maximum: 20 * 1024 * 1024 },
  createdAt: text,
  mime: { enum: ['image/png', 'image/jpeg', 'text/plain; charset=utf-8'] },
};
export const schemas = {
  testCase: caseSchema,
  saveCase: object({ testCase: caseSchema, expectedRevision: { anyOf: [hash, { type: 'null' }] } }),
  startRun: object({
    caseId: id,
    expectedRevision: hash,
    environment: text,
    targetUrl: text,
    executor,
    preconditions,
  }),
  recordStep: object({ runId: id, requestId: id, ...stepProperties }),
  addArtifact: object({ runId: id, stepId: id, assertionId: id, kind: evidence, source: text }),
  finishRun: object({ runId: id, status: { enum: ['completed', 'interrupted'] }, reason: text }),
  run: object({
    schemaVersion: { const: 1 },
    id,
    caseId: id,
    caseRevision: hash,
    snapshot: caseSchema,
    environment: text,
    targetUrl: text,
    executor,
    preconditions,
    git: object({
      commit: { anyOf: [text, { type: 'null' }] },
      dirty: { type: ['boolean', 'null'] },
    }),
    startedAt: text,
    finishedAt: { type: ['string', 'null'] },
    status: { enum: ['running', 'completed', 'interrupted'] },
    verdict: { anyOf: [verdict, { type: 'null' }] },
    reason: { type: ['string', 'null'] },
    steps: array(object(stepProperties)),
    artifacts: array(object(artifactProperties)),
    receipts: array(object({ requestId: id, digest: hash })),
  }),
};
interface Inputs {
  testCase: TestCase;
  saveCase: SaveCaseInput;
  startRun: StartRunInput;
  recordStep: RecordInput;
  addArtifact: ArtifactInput;
  finishRun: FinishInput;
  run: Run;
}
const ajv = new Ajv({ allErrors: true });
const validators = new Map<string, ValidateFunction>();

/** 使用稳定错误码携带可直接展示给 Agent 和编辑器的诊断。 */
export class CoreError extends Error {
  /** 初始化错误码和可读说明，不泄露底层系统路径或堆栈。 */
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
/** 校验机器输入并收窄类型；接口和磁盘读取共用同一规范。 */
export function validate<K extends keyof Inputs>(name: K, input: unknown): Inputs[K] {
  let validator = validators.get(name);
  if (!validator) {
    validator = ajv.compile(schemas[name]);
    validators.set(name, validator);
  }
  if (!validator(input)) throw new CoreError('VALIDATION', '数据格式不符合规范', validator.errors);
  return input as Inputs[K];
}
/** 验证用例内稳定 ID 的唯一性，防止结果关联到错误步骤。 */
export function validateCase(input: unknown): TestCase {
  const value = validate('testCase', input);
  const ids = new Set<string>();
  for (const step of value.steps) {
    for (const key of [step.id, ...step.assertions.map((assertion) => assertion.id)]) {
      if (ids.has(key)) throw new CoreError('DUPLICATE_ID', `用例内 ID 重复：${key}`);
      ids.add(key);
    }
  }
  return value;
}

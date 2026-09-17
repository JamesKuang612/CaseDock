export type EvidenceKind = 'screenshot' | 'text';
export type RequiredEvidenceKind = 'screenshot';
export type Verdict = 'passed' | 'failed' | 'inconclusive';
export interface WorkspaceConfig {
  schemaVersion: 1;
  name: string;
}
export interface Assertion {
  id: string;
  expect: string;
  evidence: RequiredEvidenceKind[];
}
export interface TestStep {
  id: string;
  action: string;
  assertions: Assertion[];
}
export interface TestCase {
  schemaVersion: 1;
  id: string;
  title: string;
  source?: string;
  tags: string[];
  preconditions: string[];
  steps: TestStep[];
}
export interface CaseDocument {
  testCase: TestCase;
  revision: string;
  path: string;
}
export type CreateCaseInput = Omit<TestCase, 'id'>;
export interface SaveCaseInput {
  testCase: TestCase;
  expectedRevision: string | null;
}
/** 单套测试凭据，支持可选的角色或用途说明。 */
export interface CredentialItem {
  account: string;
  password: string;
  role?: string;
}
/** 测试账密类型：支持单套凭据对象、多套凭据数组或无凭据。 */
export type Credentials = CredentialItem | CredentialItem[] | null;

export interface StartRunInput {
  caseId: string;
  expectedRevision: string;
  initialUrl: string;
  credentials: Credentials;
  executor: {
    agent: string;
    model: string | null;
    browserTool: string;
    capabilities: RequiredEvidenceKind[];
  };
  preconditions: { index: number; satisfied: boolean; observation: string }[];
}
export interface AssertionResult {
  assertionId: string;
  verdict: Verdict;
  observation: string;
  artifactIds: string[];
}
export interface StepResult {
  stepId: string;
  status: 'passed' | 'failed' | 'blocked' | 'skipped' | 'error';
  observation: string;
  assertions: AssertionResult[];
}
export interface RecordInput extends StepResult {
  runId: string;
  requestId: string;
}
export interface ArtifactInput {
  runId: string;
  stepId: string;
  assertionId: string;
  kind: RequiredEvidenceKind;
  source: string;
}
export interface Artifact {
  id: string;
  stepId: string;
  assertionId: string;
  kind: EvidenceKind;
  path: string;
  sha256: string;
  bytes: number;
  createdAt: string;
  mime: string;
}
export interface FinishInput {
  runId: string;
  status: 'completed' | 'interrupted';
  reason: string;
  tokenUsage?: { total: number; source: string } | null;
}
export interface SubmitTestInput {
  schemaVersion: 1;
  testCase: {
    title: string;
    source?: string;
    tags: string[];
    preconditions: {
      description: string;
      satisfied: boolean;
      observation: string;
    }[];
    steps: {
      action: string;
      assertions: {
        expect: string;
        evidence: RequiredEvidenceKind[];
      }[];
    }[];
  };
  run: {
    initialUrl: string;
    credentials: StartRunInput['credentials'];
    executor: StartRunInput['executor'];
    startedAt: string;
    status: 'completed' | 'interrupted';
    reason: string;
    tokenUsage?: { total: number; source: string } | null;
  };
  results: {
    step: number;
    status: StepResult['status'];
    observation: string;
    assertions: {
      assertion: number;
      verdict: Verdict;
      observation: string;
      evidence: string[];
    }[];
  }[];
}
export interface SubmitTestResult {
  caseId: string;
  runId: string;
  verdict: Verdict;
  casePath: string;
  runPath: string;
  evidenceDirectory: string;
  artifactCount: number;
}
export interface Run {
  schemaVersion: 1;
  id: string;
  caseId: string;
  caseRevision: string;
  snapshot: TestCase;
  environment?: string;
  initialUrl?: string;
  targetUrl?: string;
  credentials?: StartRunInput['credentials'];
  executor: StartRunInput['executor'];
  preconditions: StartRunInput['preconditions'];
  git: { commit: string | null; dirty: boolean | null };
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'completed' | 'interrupted';
  verdict: Verdict | null;
  reason: string | null;
  tokenUsage?: { total: number; source: string } | null;
  steps: StepResult[];
  artifacts: Artifact[];
  receipts: { requestId: string; digest: string }[];
}
export type RunSummary = Pick<
  Run,
  | 'id'
  | 'caseId'
  | 'caseRevision'
  | 'status'
  | 'verdict'
  | 'startedAt'
  | 'finishedAt'
  | 'tokenUsage'
  | 'executor'
>;

/** 批次测试报告状态 */
export type ReportStatus = 'passed' | 'failed' | 'blocked' | 'skipped';

/** 批次测试报告综合统计指标 */
export interface ReportTotals {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passRate: number;
}

/** 报告中用例的原始定义与前置数据 */
export interface ReportCaseDefinition {
  name: string;
  category: string;
  testData: string;
  steps: string[];
  assertions: string[];
}

/** 报告中用例的单步执行记录 */
export interface ReportStep {
  index: number;
  action: string;
  expected: string;
  actual: string;
  status: ReportStatus;
  screenshot?: string;
}

/** 报告中包含的独立测试用例及执行结果 */
export interface ReportCase {
  id: string;
  title: string;
  category: string;
  testData: string;
  definition: ReportCaseDefinition;
  status: ReportStatus;
  summary: string;
  startedAt?: string;
  durationMs?: number;
  steps: ReportStep[];
}

/** 报告输入来源描述 */
export interface ReportInputSource {
  sourceName: string;
  file: string;
  type: string;
}

/** 完整的批次测试报告实体对象 */
export interface Report {
  schemaVersion: 2;
  runId: string;
  title: string;
  status: ReportStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary: string;
  input: ReportInputSource;
  totals: ReportTotals;
  cases: ReportCase[];
}

/** 报告列表呈现的摘要信息 */
export type ReportSummary = Pick<
  Report,
  'runId' | 'title' | 'status' | 'startedAt' | 'summary' | 'totals' | 'input'
>;

/** 提交批次测试报告的入参清单格式 */
export interface SubmitReportInput {
  schemaVersion?: 2;
  title: string;
  input?: {
    sourceName?: string;
    file?: string;
    type?: string;
  };
  cases: {
    id?: string;
    title: string;
    category?: string;
    testData?: string;
    definition?: {
      name?: string;
      category?: string;
      testData?: string;
      steps?: string[];
      assertions?: string[];
    };
    status: ReportStatus;
    summary: string;
    startedAt?: string;
    durationMs?: number;
    steps: {
      index: number;
      action: string;
      expected: string;
      actual: string;
      status: ReportStatus;
      evidence?: string;
    }[];
  }[];
}

/** 提交测试报告的成功返回信息 */
export interface SubmitReportResult {
  runId: string;
  title: string;
  status: ReportStatus;
  reportPath: string;
  evidenceDirectory: string;
  totals: ReportTotals;
}

/** 全体用例库聚合项：整合用例集内小用例与独立用例的全局实体。 */
export interface UnifiedCaseItem {
  /** 小用例唯一标识（如 tc-plugin-001 或 case-xxx） */
  id: string;
  /** 小用例标题 */
  title: string;
  /** 所属业务分类或模块 */
  category?: string;
  /** 所属用例集 ID（如果是用例集内小用例） */
  suiteId?: string;
  /** 所属用例集标题（如果是用例集内小用例） */
  suiteTitle?: string;
  /** 当前或最新执行结论 */
  status: 'passed' | 'failed' | 'blocked' | 'skipped' | 'inconclusive' | 'pending';
  /** 步骤总数 */
  stepCount: number;
  /** 检查点总数 */
  assertionCount: number;
  /** 最近更新或执行时间 */
  updatedAt?: string;
  /** 用例来源类型：suite（来自用例集）或 standalone（来自根独立用例库） */
  sourceType: 'suite' | 'standalone';
}

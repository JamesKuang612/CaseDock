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
export interface StartRunInput {
  caseId: string;
  expectedRevision: string;
  initialUrl: string;
  credentials: { account: string; password: string } | null;
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

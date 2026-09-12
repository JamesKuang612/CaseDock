export type EvidenceKind = 'screenshot' | 'text';
export type Verdict = 'passed' | 'failed' | 'inconclusive';
export interface Assertion {
  id: string;
  expect: string;
  evidence: EvidenceKind[];
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
export interface SaveCaseInput {
  testCase: TestCase;
  expectedRevision: string | null;
}
export interface StartRunInput {
  caseId: string;
  expectedRevision: string;
  environment: string;
  targetUrl: string;
  executor: {
    agent: string;
    model: string | null;
    browserTool: string;
    capabilities: EvidenceKind[];
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
  kind: EvidenceKind;
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
}
export interface Run {
  schemaVersion: 1;
  id: string;
  caseId: string;
  caseRevision: string;
  snapshot: TestCase;
  environment: string;
  targetUrl: string;
  executor: StartRunInput['executor'];
  preconditions: StartRunInput['preconditions'];
  git: { commit: string | null; dirty: boolean | null };
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'completed' | 'interrupted';
  verdict: Verdict | null;
  reason: string | null;
  steps: StepResult[];
  artifacts: Artifact[];
  receipts: { requestId: string; digest: string }[];
}
export type RunSummary = Pick<
  Run,
  'id' | 'caseId' | 'caseRevision' | 'environment' | 'status' | 'verdict' | 'startedAt' | 'executor'
>;

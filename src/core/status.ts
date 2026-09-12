export interface WorkbenchStatus {
  name: 'CaseDock';
  phase: 'scaffold';
  capabilities: {
    cases: false;
    runs: false;
    artifacts: false;
  };
}

export function getWorkbenchStatus(): WorkbenchStatus {
  return {
    name: 'CaseDock',
    phase: 'scaffold',
    capabilities: { cases: false, runs: false, artifacts: false },
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaseDocument, Run, RunSummary } from '../core/models';
import { api } from './api';
import { RunDetails, formatDuration, formatTokenUsage, label, statusClass } from './RunDetails';

/** 从地址栏读取当前用例，使列表与详情成为可前进、后退的独立视图。 */
function caseIdFromLocation() {
  const match = window.location.hash.match(/^#\/cases\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** 将 ISO 时间显示为本地日期与分钟，避免列表信息过密。 */
function formatTime(value: string) {
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 提供只读的用例列表和用例执行详情，所有资产修改都由 Agent 完成。 */
export function App() {
  const [cases, setCases] = useState<CaseDocument[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(caseIdFromLocation);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const runId = useRef<string | null>(null);

  /** 静默刷新资产列表；详情打开时同步刷新当前运行。 */
  const refresh = useCallback(async () => {
    try {
      const [caseData, runData] = await Promise.all([
        api<{ cases: CaseDocument[]; errors: { path: string; message: string }[] }>('/cases'),
        api<{ runs: RunSummary[]; errors: { path: string; message: string }[] }>('/runs'),
      ]);
      setCases(caseData.cases);
      setRuns(runData.runs);
      setErrors(
        [...caseData.errors, ...runData.errors].map((item) => `${item.path}: ${item.message}`),
      );
      const id = runId.current;
      if (id) {
        const detail = await api<Run>(`/runs/${id}`);
        if (runId.current === id) setSelectedRun(detail);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    /** 串行轮询，避免慢请求期间叠加刷新。 */
    async function poll() {
      await refresh();
      if (!stopped) timer = setTimeout(poll, 4000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    /** 响应浏览器前进与后退，保持详情页可自然导航。 */
    function route() {
      setSelectedCaseId(caseIdFromLocation());
      runId.current = null;
      setSelectedRun(null);
    }
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);

  const selectedCase = cases.find((item) => item.testCase.id === selectedCaseId) ?? null;
  const caseRuns = useMemo(
    () => runs.filter((item) => item.caseId === selectedCaseId),
    [runs, selectedCaseId],
  );

  useEffect(() => {
    const firstRun = caseRuns[0];
    if (!selectedCase || !firstRun || runId.current) return;
    void openRun(firstRun.id);
  }, [selectedCaseId, selectedCase, caseRuns]);

  /** 加载一次执行详情，避免旧请求覆盖用户后来选择的记录。 */
  async function openRun(id: string) {
    runId.current = id;
    setSelectedRun(null);
    try {
      const detail = await api<Run>(`/runs/${id}`);
      if (runId.current === id) setSelectedRun(detail);
    } catch (error) {
      if (runId.current === id) setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  /** 打开用例详情页。 */
  function openCase(id: string) {
    window.location.hash = `/cases/${encodeURIComponent(id)}`;
  }

  /** 返回用例列表。 */
  function closeCase() {
    window.location.hash = '';
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={closeCase} aria-label="返回测试用例">
          CaseDock
        </button>
      </header>

      <main className="content">
        {errors.length > 0 && <div className="error-panel">{errors.join('；')}</div>}

        {!selectedCaseId ? (
          <section aria-labelledby="case-list-title">
            <div className="section-heading">
              <h1 id="case-list-title">测试用例</h1>
              <span>{cases.length} 个</span>
            </div>

            {!loaded ? (
              <div className="empty-state">正在读取…</div>
            ) : cases.length === 0 ? (
              <div className="empty-state">暂无测试用例</div>
            ) : (
              <div className="case-list">
                {cases.map((document) => {
                  const relatedRuns = runs.filter((item) => item.caseId === document.testCase.id);
                  const latest = relatedRuns[0];
                  const assertionCount = document.testCase.steps.reduce(
                    (count, step) => count + step.assertions.length,
                    0,
                  );
                  return (
                    <button
                      className="case-row"
                      key={document.testCase.id}
                      onClick={() => openCase(document.testCase.id)}
                    >
                      <span className="case-title">
                        <span className="case-name">
                          <strong>{document.testCase.title}</strong>
                          <span className="case-id">{document.testCase.id}</span>
                        </span>
                        <small>
                          {document.testCase.steps.length} 个步骤 · {assertionCount} 个检查点 ·{' '}
                          {relatedRuns.length} 次执行
                        </small>
                      </span>
                      <span className="case-latest">
                        {latest ? (
                          <>
                            <span
                              className={`status ${statusClass(latest.verdict ?? latest.status)}`}
                            >
                              {label(latest.verdict ?? latest.status)}
                            </span>
                            <small>{formatTime(latest.startedAt)}</small>
                          </>
                        ) : (
                          <small>尚未执行</small>
                        )}
                      </span>
                      <span className="chevron" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : selectedCase ? (
          <section>
            <button className="back-button" onClick={closeCase}>
              ← 返回测试用例
            </button>
            <div className="detail-heading">
              <div className="detail-title">
                <h1>{selectedCase.testCase.title}</h1>
                <span className="case-id">{selectedCase.testCase.id}</span>
              </div>
              <span>
                {selectedCase.testCase.steps.length} 个步骤 · {caseRuns.length} 次执行
              </span>
            </div>

            <section className="panel case-definition">
              <h2>用例内容</h2>
              {selectedCase.testCase.source && (
                <div className="source-block">
                  <h3>原始内容</h3>
                  <div className="source-content">{selectedCase.testCase.source}</div>
                </div>
              )}
              <div className={selectedCase.testCase.source ? 'parsed-block' : ''}>
                {selectedCase.testCase.source && <h3>用例结构</h3>}
                {selectedCase.testCase.preconditions.length > 0 && (
                  <div className="preconditions">
                    <h3>前置条件</h3>
                    <ul>
                      {selectedCase.testCase.preconditions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="definition-steps">
                  {selectedCase.testCase.steps.map((step, index) => (
                    <div className="definition-step" key={step.id}>
                      <span className="step-number">{index + 1}</span>
                      <div>
                        <strong>{step.action}</strong>
                        {step.assertions.map((assertion) => (
                          <p key={assertion.id}>{assertion.expect}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel">
              <h2>执行记录</h2>
              {caseRuns.length === 0 ? (
                <div className="empty-inline">尚未执行</div>
              ) : (
                <div className="run-list">
                  <div className="run-list-head" aria-hidden="true">
                    <span>结果</span>
                    <span>测试时间</span>
                    <span>测试耗时</span>
                    <span>Token 消耗</span>
                    <span>执行者</span>
                  </div>
                  {caseRuns.map((item) => (
                    <button
                      className={`run-row ${runId.current === item.id ? 'selected' : ''}`}
                      key={item.id}
                      onClick={() => void openRun(item.id)}
                    >
                      <span className={`status ${statusClass(item.verdict ?? item.status)}`}>
                        {label(item.verdict ?? item.status)}
                      </span>
                      <span>{formatTime(item.startedAt)}</span>
                      <span>{formatDuration(item.startedAt, item.finishedAt)}</span>
                      <span>{formatTokenUsage(item.tokenUsage)}</span>
                      <span>{item.executor.agent}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {runId.current && (
              <section className="panel run-panel">
                {selectedRun ? <RunDetails run={selectedRun} /> : <div>正在读取…</div>}
              </section>
            )}
          </section>
        ) : loaded ? (
          <div className="empty-state">
            找不到这个测试用例
            <button className="back-button" onClick={closeCase}>
              返回列表
            </button>
          </div>
        ) : (
          <div className="empty-state">正在读取…</div>
        )}
      </main>
    </div>
  );
}

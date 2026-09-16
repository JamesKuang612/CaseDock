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

/** 用例重命名模态弹窗，仅允许修改用例标题，唯一 Case ID 锁死不可变。 */
function RenameModal({
  caseDoc,
  onClose,
  onSuccess,
}: {
  caseDoc: CaseDocument;
  onClose: () => void;
  onSuccess: (updated: CaseDocument) => void;
}) {
  const [title, setTitle] = useState(caseDoc.testCase.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('用例名称不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api<CaseDocument>(`/cases/${caseDoc.testCase.id}`, {
        method: 'PATCH',
        body: { title: trimmed },
      });
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>修改用例名称</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-panel inline-error">{error}</div>}
            <div className="form-group">
              <label className="field-label" htmlFor="case-title-input">
                用例名称
              </label>
              <input
                id="case-title-input"
                type="text"
                className="text-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                placeholder="请输入新的用例名称"
                maxLength={1000}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="action-btn" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** 用例删除二次确认模态弹窗，提醒用户删除操作不可撤回。 */
function DeleteConfirmModal({
  caseDoc,
  onClose,
  onSuccess,
}: {
  caseDoc: CaseDocument;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await api(`/cases/${caseDoc.testCase.id}`, { method: 'DELETE' });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header danger-header">
          <h3>删除测试用例</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="error-panel inline-error">{error}</div>}
          <p className="danger-text">
            确定要彻底删除用例 <strong>“{caseDoc.testCase.title}”</strong> 吗？
          </p>
          <div className="locked-id-box">
            <code>{caseDoc.testCase.id}</code>
          </div>
          <p className="warning-hint">此操作将永久移除该用例定义文件（.test.yaml），且不可恢复。</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="action-btn" onClick={onClose} disabled={deleting}>
            取消
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={() => void handleConfirm()}
            disabled={deleting}
          >
            {deleting ? '删除中…' : '确定删除'}
          </button>
        </div>
      </div>
    </div>
  );
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

  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'passed' | 'failed' | 'running' | 'pending'
  >('all');
  const [renameTarget, setRenameTarget] = useState<CaseDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CaseDocument | null>(null);

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

  /** 计算用例各状态的统计数量。 */
  const statusCounts = useMemo(() => {
    const counts = { all: cases.length, passed: 0, failed: 0, running: 0, pending: 0 };
    for (const doc of cases) {
      const related = runs.filter((r) => r.caseId === doc.testCase.id);
      const latest = related[0];
      if (!latest) {
        counts.pending += 1;
      } else {
        const s = latest.verdict ?? latest.status;
        if (s === 'passed') counts.passed += 1;
        else if (s === 'failed') counts.failed += 1;
        else if (s === 'running') counts.running += 1;
        else counts.pending += 1;
      }
    }
    return counts;
  }, [cases, runs]);

  /** 根据搜索关键词与状态筛选过滤用例列表。 */
  const filteredCases = useMemo(() => {
    return cases.filter((doc) => {
      const related = runs.filter((r) => r.caseId === doc.testCase.id);
      const latest = related[0];
      const latestStatus = latest ? (latest.verdict ?? latest.status) : 'pending';

      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && latest) return false;
        if (statusFilter === 'passed' && latestStatus !== 'passed') return false;
        if (statusFilter === 'failed' && latestStatus !== 'failed') return false;
        if (statusFilter === 'running' && latestStatus !== 'running') return false;
      }

      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const matchTitle = doc.testCase.title.toLowerCase().includes(kw);
        const matchId = doc.testCase.id.toLowerCase().includes(kw);
        const matchTags = doc.testCase.tags?.some((t) => t.toLowerCase().includes(kw));
        if (!matchTitle && !matchId && !matchTags) return false;
      }

      return true;
    });
  }, [cases, runs, statusFilter, searchKeyword]);

  /** 处理用例重命名成功后的本地状态更新。 */
  function handleRenameSuccess(updated: CaseDocument) {
    setCases((prev) => prev.map((c) => (c.testCase.id === updated.testCase.id ? updated : c)));
    setRenameTarget(null);
  }

  /** 处理用例删除成功后的本地状态更新与路由返回。 */
  function handleDeleteSuccess(deletedId: string) {
    setCases((prev) => prev.filter((c) => c.testCase.id !== deletedId));
    setDeleteTarget(null);
    if (selectedCaseId === deletedId) {
      closeCase();
    }
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
              <span>
                {filteredCases.length === cases.length
                  ? `${cases.length} 个`
                  : `显示 ${filteredCases.length} / 共 ${cases.length} 个`}
              </span>
            </div>

            <div className="search-filter-bar">
              <div className="search-box">
                <span className="search-icon" aria-hidden="true">
                  🔍
                </span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="搜索用例标题、ID 或标签…"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                />
                {searchKeyword && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setSearchKeyword('')}
                    aria-label="清空搜索"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="status-filter-tabs" role="tablist" aria-label="用例状态筛选">
                <button
                  type="button"
                  className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  全部 <span>{statusCounts.all}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab ${statusFilter === 'passed' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('passed')}
                >
                  通过 <span>{statusCounts.passed}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab ${statusFilter === 'failed' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('failed')}
                >
                  失败 <span>{statusCounts.failed}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab ${statusFilter === 'running' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('running')}
                >
                  执行中 <span>{statusCounts.running}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab ${statusFilter === 'pending' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('pending')}
                >
                  未执行 <span>{statusCounts.pending}</span>
                </button>
              </div>
            </div>

            {!loaded ? (
              <div className="empty-state">正在读取…</div>
            ) : cases.length === 0 ? (
              <div className="empty-state">暂无测试用例</div>
            ) : filteredCases.length === 0 ? (
              <div className="empty-state">
                <span>未找到匹配的测试用例</span>
                {(searchKeyword || statusFilter !== 'all') && (
                  <button
                    type="button"
                    className="clear-filters-btn"
                    onClick={() => {
                      setSearchKeyword('');
                      setStatusFilter('all');
                    }}
                  >
                    重置搜索与筛选
                  </button>
                )}
              </div>
            ) : (
              <div className="case-list">
                {filteredCases.map((document) => {
                  const relatedRuns = runs.filter((item) => item.caseId === document.testCase.id);
                  const latest = relatedRuns[0];
                  const assertionCount = document.testCase.steps.reduce(
                    (count, step) => count + step.assertions.length,
                    0,
                  );
                  return (
                    <div className="case-row-wrapper" key={document.testCase.id}>
                      <button className="case-row" onClick={() => openCase(document.testCase.id)}>
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
                      <div className="case-item-actions">
                        <button
                          type="button"
                          className="item-action-btn"
                          title="修改用例名称"
                          aria-label="修改用例名称"
                          onClick={() => setRenameTarget(document)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="item-action-btn delete-action-btn"
                          title="删除用例"
                          aria-label="删除用例"
                          onClick={() => setDeleteTarget(document)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
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
                <div className="detail-actions">
                  <button
                    type="button"
                    className="detail-action-btn"
                    onClick={() => setRenameTarget(selectedCase)}
                  >
                    ✎ 修改名称
                  </button>
                  <button
                    type="button"
                    className="detail-action-btn delete-btn"
                    onClick={() => setDeleteTarget(selectedCase)}
                  >
                    🗑 删除用例
                  </button>
                </div>
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
        {renameTarget && (
          <RenameModal
            caseDoc={renameTarget}
            onClose={() => setRenameTarget(null)}
            onSuccess={handleRenameSuccess}
          />
        )}

        {deleteTarget && (
          <DeleteConfirmModal
            caseDoc={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onSuccess={() => handleDeleteSuccess(deleteTarget.testCase.id)}
          />
        )}
      </main>
    </div>
  );
}

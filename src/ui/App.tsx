import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CaseDocument,
  Report,
  ReportSummary,
  Run,
  RunSummary,
  UnifiedCaseItem,
} from '../core/models';
import { api } from './api';
import { RunDetails, formatDuration, formatTokenUsage, label, statusClass } from './RunDetails';
import {
  ReportDetails,
  formatReportTime,
  reportStatusLabel,
  copyToClipboard,
} from './ReportDetails';

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

/** 从当前 URL（参数或 hash）解析目标路由，支持解析指定的小用例定位参数。 */
function routeFromLocation():
  { type: 'report'; id: string; caseId?: string } | { type: 'case'; id: string } | null {
  const searchParams = new URLSearchParams(window.location.search);
  const runParam = searchParams.get('run');
  if (runParam) return { type: 'report', id: runParam };

  const hash = window.location.hash;
  const reportMatch = hash.match(/^#\/reports\/([^/?]+)(?:\?case=([^&]+))?$/);
  if (reportMatch) {
    return {
      type: 'report',
      id: decodeURIComponent(reportMatch[1]),
      caseId: reportMatch[2] ? decodeURIComponent(reportMatch[2]) : undefined,
    };
  }

  const caseMatch = hash.match(/^#\/cases\/([^/?]+)$/);
  if (caseMatch) return { type: 'case', id: decodeURIComponent(caseMatch[1]) };

  return null;
}

/** 用例重命名模态弹窗，仅允许修改用例标题。 */
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

/** 用例删除二次确认模态弹窗。 */
function DeleteModal({
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

/** 用例集重命名模态弹窗。 */
function RenameSuiteModal({
  reportSummary,
  onClose,
  onSuccess,
}: {
  reportSummary: ReportSummary;
  onClose: () => void;
  onSuccess: (updated: Report) => void;
}) {
  const [title, setTitle] = useState(reportSummary.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('用例集名称不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Report>(`/reports/${reportSummary.runId}`, {
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
          <h3>修改用例集名称</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-panel inline-error">{error}</div>}
            <div className="form-group">
              <label className="field-label" htmlFor="report-name-input">
                用例集名称
              </label>
              <input
                id="report-name-input"
                type="text"
                className="text-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
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

/** 提供测试报告流与独立用例库视图的主入口组件。 */
export function App() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [allCases, setAllCases] = useState<UnifiedCaseItem[]>([]);
  const [cases, setCases] = useState<CaseDocument[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /** 弹出全局 Toast 浮动提示。 */
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }

  // 路由状态
  const [currentRoute, setCurrentRoute] = useState(routeFromLocation);
  const [selectedReportDetail, setSelectedReportDetail] = useState<Report | null>(null);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  // 视图切换（默认为用例集流）
  const [activeTab, setActiveTab] = useState<'reports' | 'cases'>('reports');

  // 搜索与过滤
  const [reportSearch, setReportSearch] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatusFilter, setCaseStatusFilter] = useState<
    'all' | 'passed' | 'failed' | 'running' | 'pending'
  >('all');

  // 弹窗状态
  const [renameCaseTarget, setRenameCaseTarget] = useState<CaseDocument | null>(null);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<CaseDocument | null>(null);
  const [renameReportTarget, setRenameReportTarget] = useState<ReportSummary | null>(null);

  /** 静默刷新用例集、全体用例库与历史单用例资产。 */
  const refresh = useCallback(async () => {
    try {
      const [reportData, allCaseData, caseData, runData] = await Promise.all([
        api<{ reports: ReportSummary[]; errors: { path: string; message: string }[] }>('/reports'),
        api<{ cases: UnifiedCaseItem[]; errors: { path: string; message: string }[] }>(
          '/all-cases',
        ).catch(() => ({ cases: [], errors: [] })),
        api<{ cases: CaseDocument[]; errors: { path: string; message: string }[] }>('/cases'),
        api<{ runs: RunSummary[]; errors: { path: string; message: string }[] }>('/runs'),
      ]);
      setReports(reportData.reports);
      setAllCases(allCaseData.cases);
      setCases(caseData.cases);
      setRuns(runData.runs);
      setErrors([
        ...reportData.errors.map((e) => `${e.path}: ${e.message}`),
        ...allCaseData.errors.map((e) => `${e.path}: ${e.message}`),
        ...caseData.errors.map((e) => `${e.path}: ${e.message}`),
        ...runData.errors.map((e) => `${e.path}: ${e.message}`),
      ]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
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

  // 监听路由变化
  useEffect(() => {
    function handleLocationChange() {
      setCurrentRoute(routeFromLocation());
    }
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // 当处于报告路由时，加载报告完整详情
  useEffect(() => {
    if (currentRoute?.type === 'report') {
      const targetId = currentRoute.id;
      void api<Report>(`/reports/${encodeURIComponent(targetId)}`)
        .then((detail) => setSelectedReportDetail(detail))
        .catch((err) => {
          setErrors([`报告读取失败：${err instanceof Error ? err.message : String(err)}`]);
        });
    } else {
      setSelectedReportDetail(null);
    }
  }, [currentRoute]);

  const selectedCase =
    currentRoute?.type === 'case'
      ? (cases.find((item) => item.testCase.id === currentRoute.id) ?? null)
      : null;
  const caseRuns = useMemo(
    () => (selectedCase ? runs.filter((item) => item.caseId === selectedCase.testCase.id) : []),
    [runs, selectedCase],
  );

  // 当处于单用例路由时，加载最新运行详情
  useEffect(() => {
    const firstRun = caseRuns[0];
    if (!selectedCase || !firstRun || activeRunIdRef.current) return;
    activeRunIdRef.current = firstRun.id;
    void api<Run>(`/runs/${firstRun.id}`)
      .then((runDetail) => setSelectedRun(runDetail))
      .catch((err) =>
        setErrors([`运行读取失败：${err instanceof Error ? err.message : String(err)}`]),
      );
  }, [selectedCase, caseRuns]);

  /** 加载一次执行详情。 */
  async function openRun(id: string) {
    activeRunIdRef.current = id;
    setSelectedRun(null);
    try {
      const detail = await api<Run>(`/runs/${id}`);
      if (activeRunIdRef.current === id) setSelectedRun(detail);
    } catch (error) {
      if (activeRunIdRef.current === id)
        setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  /** 处理用例删除成功后的本地状态更新与路由返回。 */
  function handleDeleteSuccess(deletedId: string) {
    setCases((prev) => prev.filter((c) => c.testCase.id !== deletedId));
    setDeleteCaseTarget(null);
    if (currentRoute?.type === 'case' && currentRoute.id === deletedId) {
      handleBackToList();
    }
  }

  /** 处理用例重命名成功后的本地状态更新。 */
  function handleRenameSuccess(updated: CaseDocument) {
    setCases((prev) => prev.map((c) => (c.testCase.id === updated.testCase.id ? updated : c)));
    setRenameCaseTarget(null);
  }

  /** 打开指定的测试报告详情。 */
  function openReport(runId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('run', runId);
    url.hash = '';
    window.history.pushState({}, '', url.toString());
    setCurrentRoute({ type: 'report', id: runId });
  }

  /** 返回报告或用例列表。 */
  function handleBackToList() {
    const url = new URL(window.location.href);
    url.searchParams.delete('run');
    url.hash = '';
    window.history.pushState({}, '', url.toString());
    setCurrentRoute(null);
  }

  /** 删除某份报告。 */
  async function handleDeleteReport(runId: string) {
    if (!confirm(`确定彻底删除该测试报告及其所有关联证据吗？`)) return;
    try {
      await api(`/reports/${runId}`, { method: 'DELETE' });
      setReports((prev) => prev.filter((r) => r.runId !== runId));
      if (currentRoute?.type === 'report' && currentRoute.id === runId) {
        handleBackToList();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  // 过滤报告列表
  const filteredReports = useMemo(() => {
    const kw = reportSearch.trim().toLowerCase();
    return reports.filter((r) => {
      if (reportStatusFilter === 'passed' && r.status !== 'passed') return false;
      if (reportStatusFilter === 'failed' && r.status !== 'failed') return false;
      if (!kw) return true;
      return [r.title, r.summary, r.runId].join(' ').toLowerCase().includes(kw);
    });
  }, [reports, reportSearch, reportStatusFilter]);

  // 过滤全体用例库列表
  const filteredAllCases = useMemo(() => {
    return allCases.filter((item) => {
      if (caseStatusFilter !== 'all') {
        if (caseStatusFilter === 'pending' && item.status !== 'pending') return false;
        if (caseStatusFilter === 'passed' && item.status !== 'passed') return false;
        if (caseStatusFilter === 'failed' && item.status !== 'failed') return false;
      }

      if (caseSearch.trim()) {
        const kw = caseSearch.trim().toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(kw);
        const matchId = item.id.toLowerCase().includes(kw);
        const matchCategory = item.category?.toLowerCase().includes(kw);
        const matchSuiteTitle = item.suiteTitle?.toLowerCase().includes(kw);
        const matchSuiteId = item.suiteId?.toLowerCase().includes(kw);
        if (!matchTitle && !matchId && !matchCategory && !matchSuiteTitle && !matchSuiteId) {
          return false;
        }
      }

      return true;
    });
  }, [allCases, caseStatusFilter, caseSearch]);

  /** 打开全体用例库中的某个用例：属于用例集的跳转到用例集指挥舱并定位，独立用例进入单用例页面。 */
  function handleOpenAllCase(item: UnifiedCaseItem) {
    if (item.sourceType === 'suite' && item.suiteId) {
      window.location.hash = `/reports/${encodeURIComponent(item.suiteId)}?case=${encodeURIComponent(item.id)}`;
    } else {
      window.location.hash = `/cases/${encodeURIComponent(item.id)}`;
    }
  }

  // 如果处于测试报告详情路由
  if (currentRoute?.type === 'report' && selectedReportDetail) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <button className="wordmark" onClick={handleBackToList} aria-label="返回首页">
            <span className="wordmark-logo-icon">CD</span>
            <span className="wordmark-text">CaseDock</span>
            <span className="wordmark-badge">COCKPIT</span>
          </button>
        </header>
        <main className="content">
          <ReportDetails
            report={selectedReportDetail}
            initialCaseId={currentRoute.caseId}
            onBack={handleBackToList}
            onReportDeleted={() => {
              setReports((prev) => prev.filter((r) => r.runId !== selectedReportDetail.runId));
              handleBackToList();
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="wordmark"
          onClick={handleBackToList}
          aria-label={currentRoute?.type === 'case' ? '返回测试用例' : '返回首页'}
        >
          <span className="wordmark-logo-icon">CD</span>
          <span className="wordmark-text">CaseDock</span>
          <span className="wordmark-badge">COCKPIT</span>
        </button>

        {/* 仅在未进入详情时展示主导航 Tab */}
        {!currentRoute && (
          <div className="nav-tabs" role="tablist">
            <button
              type="button"
              className={`nav-tab ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              测试用例集 <span>{reports.length}</span>
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === 'cases' ? 'active' : ''}`}
              onClick={() => setActiveTab('cases')}
            >
              全体用例库 <span>{allCases.length}</span>
            </button>
          </div>
        )}
      </header>

      <main className="content">
        {errors.length > 0 && <div className="error-panel">{errors.join('；')}</div>}

        {/* 视图一：测试用例集卡片流（默认主页） */}
        {!currentRoute && activeTab === 'reports' && (
          <section className="reports-page" aria-labelledby="reports-title">
            <div className="section-heading">
              <div>
                <p className="page-subhead">TEST SUITES</p>
                <h1 id="reports-title">测试用例集</h1>
              </div>
              <span>{reports.length} 个用例集</span>
            </div>

            <div className="search-filter-bar report-filter-row">
              <div className="search-box">
                <span className="search-icon" aria-hidden="true">
                  🔍
                </span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="搜索用例集名称、摘要或 ID…"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                />
                {reportSearch && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setReportSearch('')}
                    aria-label="清空搜索"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="report-filter-pills" role="group" aria-label="用例集状态筛选">
                <button
                  type="button"
                  className={`report-filter-pill ${reportStatusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setReportStatusFilter('all')}
                >
                  全部 ({reports.length})
                </button>
                <button
                  type="button"
                  className={`report-filter-pill ${reportStatusFilter === 'passed' ? 'active' : ''}`}
                  onClick={() => setReportStatusFilter('passed')}
                >
                  全通过 ({reports.filter((r) => r.status === 'passed').length})
                </button>
                <button
                  type="button"
                  className={`report-filter-pill ${reportStatusFilter === 'failed' ? 'active' : ''}`}
                  onClick={() => setReportStatusFilter('failed')}
                >
                  含失败 ({reports.filter((r) => r.status === 'failed').length})
                </button>
              </div>
            </div>

            {!loaded ? (
              <div className="empty-state">正在读取测试用例集…</div>
            ) : reports.length === 0 ? (
              <div className="empty-state">
                <span>暂无测试用例集</span>
                <p style={{ marginTop: '8px', color: '#6b7280', fontSize: '14px' }}>
                  使用 Agent 执行测试并调用 <code>test submit</code> 或 <code>report submit</code>{' '}
                  即可生成首个用例集。
                </p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="empty-state">
                <span>未找到匹配的测试用例集</span>
                <button
                  type="button"
                  className="clear-filters-btn"
                  onClick={() => {
                    setReportSearch('');
                    setReportStatusFilter('all');
                  }}
                >
                  重置筛选条件
                </button>
              </div>
            ) : (
              <div className="report-grid">
                {filteredReports.map((report) => (
                  <article
                    key={report.runId}
                    className={`report-card ${
                      report.status === 'failed'
                        ? 'suite-failed'
                        : report.status === 'passed'
                          ? 'suite-passed'
                          : ''
                    }`}
                  >
                    <div className="report-card-head">
                      <div>
                        <div className="card-meta-line">
                          <p className="card-timestamp">{formatReportTime(report.startedAt)}</p>
                          <span className="card-suite-tag">用例集</span>
                          <span className="card-suite-id">ID: {report.runId}</span>
                        </div>
                        <h2 className="card-title">{report.title}</h2>
                      </div>
                      <span className={`badge ${report.status}`}>
                        {reportStatusLabel(report.status)}
                      </span>
                    </div>

                    <p className="card-summary">{report.summary}</p>

                    {/* 多段测试进度胶囊条 */}
                    <div
                      className="card-progress-bar"
                      title={`通过: ${report.totals.passed}, 失败: ${report.totals.failed}, 阻塞: ${report.totals.blocked}, 跳过: ${report.totals.skipped}`}
                    >
                      {report.totals.passed > 0 && (
                        <div
                          className="bar-seg bar-passed"
                          style={{
                            width: `${(report.totals.passed / (report.totals.total || 1)) * 100}%`,
                          }}
                        />
                      )}
                      {report.totals.failed > 0 && (
                        <div
                          className="bar-seg bar-failed"
                          style={{
                            width: `${(report.totals.failed / (report.totals.total || 1)) * 100}%`,
                          }}
                        />
                      )}
                      {report.totals.blocked > 0 && (
                        <div
                          className="bar-seg bar-blocked"
                          style={{
                            width: `${(report.totals.blocked / (report.totals.total || 1)) * 100}%`,
                          }}
                        />
                      )}
                      {report.totals.skipped > 0 && (
                        <div
                          className="bar-seg bar-skipped"
                          style={{
                            width: `${(report.totals.skipped / (report.totals.total || 1)) * 100}%`,
                          }}
                        />
                      )}
                    </div>

                    <div className="card-metrics-row">
                      <span>
                        <b>{report.totals.total}</b> 个小用例
                      </span>
                      <span className="passed">
                        <b>{report.totals.passed}</b> 通过
                      </span>
                      <span className="failed">
                        <b>{report.totals.failed}</b> 失败
                      </span>
                      <span className="blocked">
                        <b>{report.totals.blocked}</b> 阻塞
                      </span>
                      <span className="skipped">
                        <b>{report.totals.skipped}</b> 跳过
                      </span>
                      <span className="pass-rate">
                        <b>{report.totals.passRate}%</b> 通过率
                      </span>
                    </div>

                    <div className="card-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openReport(report.runId)}
                      >
                        进入用例集
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          void copyToClipboard(report.runId).then((ok) => {
                            if (ok) showToast(`已复制用例集 ID: ${report.runId}`);
                          })
                        }
                      >
                        复制 ID
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setRenameReportTarget(report)}
                      >
                        修改
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void handleDeleteReport(report.runId)}
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 视图二：全体用例库列表（聚合全部用例集内小用例及独立用例） */}
        {!currentRoute && activeTab === 'cases' && (
          <section aria-labelledby="case-list-title">
            <div className="section-heading">
              <div>
                <p className="page-subhead">ALL TEST CASES</p>
                <h1 id="case-list-title">全体用例库</h1>
              </div>
              <span>共 {allCases.length} 个用例（聚合全部用例集及独立用例）</span>
            </div>

            <div className="search-filter-bar">
              <div className="search-box">
                <span className="search-icon" aria-hidden="true">
                  🔍
                </span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="搜索小用例标题、ID、分类或所属用例集…"
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                />
                {caseSearch && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setCaseSearch('')}
                    aria-label="清空搜索"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="status-filter-tabs" role="tablist" aria-label="用例状态筛选">
                <button
                  type="button"
                  className={`filter-tab ${caseStatusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setCaseStatusFilter('all')}
                >
                  全部 ({allCases.length})
                </button>
                <button
                  type="button"
                  className={`filter-tab ${caseStatusFilter === 'passed' ? 'active' : ''}`}
                  onClick={() => setCaseStatusFilter('passed')}
                >
                  通过 ({allCases.filter((c) => c.status === 'passed').length})
                </button>
                <button
                  type="button"
                  className={`filter-tab ${caseStatusFilter === 'failed' ? 'active' : ''}`}
                  onClick={() => setCaseStatusFilter('failed')}
                >
                  失败 ({allCases.filter((c) => c.status === 'failed').length})
                </button>
              </div>
            </div>

            {!loaded ? (
              <div className="empty-state">正在读取全体用例库…</div>
            ) : allCases.length === 0 ? (
              <div className="empty-state">暂无测试用例</div>
            ) : filteredAllCases.length === 0 ? (
              <div className="empty-state">
                <span>未找到匹配的测试用例</span>
                <button
                  type="button"
                  className="clear-filters-btn"
                  onClick={() => {
                    setCaseSearch('');
                    setCaseStatusFilter('all');
                  }}
                >
                  重置搜索与筛选
                </button>
              </div>
            ) : (
              <div className="case-list">
                {filteredAllCases.map((item) => {
                  return (
                    <div
                      key={`${item.sourceType}-${item.suiteId ?? 'root'}-${item.id}`}
                      className="case-row-wrapper"
                    >
                      <div
                        className="case-row"
                        onClick={() => handleOpenAllCase(item)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenAllCase(item);
                          }
                        }}
                      >
                        <span className="case-title">
                          <span className="case-name">
                            <strong>{item.title}</strong>
                            <span className="case-id">{item.id}</span>
                            {item.suiteId ? (
                              <span
                                className="case-suite-link-tag"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.location.hash = `/reports/${encodeURIComponent(item.suiteId!)}?case=${encodeURIComponent(item.id)}`;
                                }}
                                title={`所属用例集：${item.suiteTitle || item.suiteId}（点击跳转并定位）`}
                              >
                                🏷️ {item.suiteTitle || item.suiteId}
                              </span>
                            ) : (
                              <span className="case-standalone-tag">独立用例</span>
                            )}
                          </span>
                          <small>
                            {item.stepCount} 个步骤 · {item.assertionCount} 个检查点
                            {item.category && ` · 分类: ${item.category}`}
                          </small>
                        </span>

                        <div className="case-row-right">
                          <span className="case-latest">
                            <span className={`status ${statusClass(item.status)}`}>
                              {label(item.status)}
                            </span>
                            {item.updatedAt ? (
                              <small>{formatTime(item.updatedAt)}</small>
                            ) : (
                              <small>尚未执行</small>
                            )}
                          </span>
                          <button
                            type="button"
                            className="row-copy-id-btn"
                            title="复制小用例 ID"
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyToClipboard(item.id).then((ok) => {
                                if (ok) showToast(`已复制小用例 ID: ${item.id}`);
                              });
                            }}
                          >
                            📋 复制 ID
                          </button>
                          <span className="chevron" aria-hidden="true">
                            ›
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 视图三：单用例详情视图 */}
        {currentRoute?.type === 'case' &&
          (selectedCase ? (
            <section>
              <button className="back-button" onClick={handleBackToList}>
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
                      onClick={() => setRenameCaseTarget(selectedCase)}
                    >
                      ✎ 修改名称
                    </button>
                    <button
                      type="button"
                      className="detail-action-btn delete-btn"
                      onClick={() => setDeleteCaseTarget(selectedCase)}
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
                        className={`run-row ${activeRunIdRef.current === item.id ? 'selected' : ''}`}
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

              {selectedRun && (
                <section className="panel run-panel">
                  <RunDetails run={selectedRun} />
                </section>
              )}
            </section>
          ) : loaded ? (
            <div className="empty-state">
              找不到这个测试用例
              <button className="back-button" onClick={handleBackToList}>
                返回列表
              </button>
            </div>
          ) : (
            <div className="empty-state">正在读取…</div>
          ))}
      </main>

      {/* 弹窗挂载 */}
      {renameReportTarget && (
        <RenameSuiteModal
          reportSummary={renameReportTarget}
          onClose={() => setRenameReportTarget(null)}
          onSuccess={(upd) => {
            setReports((prev) =>
              prev.map((r) => (r.runId === upd.runId ? { ...r, title: upd.title } : r)),
            );
            setRenameReportTarget(null);
          }}
        />
      )}
      {renameCaseTarget && (
        <RenameModal
          caseDoc={renameCaseTarget}
          onClose={() => setRenameCaseTarget(null)}
          onSuccess={handleRenameSuccess}
        />
      )}
      {deleteCaseTarget && (
        <DeleteModal
          caseDoc={deleteCaseTarget}
          onClose={() => setDeleteCaseTarget(null)}
          onSuccess={() => handleDeleteSuccess(deleteCaseTarget.testCase.id)}
        />
      )}

      {/* 浮动 Toast 提示 */}
      {toastMessage && (
        <div className="casedock-toast" role="status">
          <span className="toast-icon">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

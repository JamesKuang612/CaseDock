import { useState, useEffect, useMemo } from 'react';
import type { Report, ReportCase, ReportStep } from '../core/models';
import { api } from './api';

/** 格式化持续时间为易读秒数或毫秒。 */
export function formatDurationMs(milliseconds?: number) {
  if (milliseconds === undefined || milliseconds === null) return '—';
  const sec = Math.max(0, Math.round(Number(milliseconds) / 1000));
  return `${sec} 秒`;
}

/** 将 ISO 时间转换为本地日期时间文本。 */
export function formatReportTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** 状态对应的中文标签。 */
export function reportStatusLabel(status: string) {
  const map: Record<string, string> = {
    passed: '通过',
    failed: '失败',
    blocked: '阻塞',
    skipped: '跳过',
    inconclusive: '无法判断',
    running: '执行中',
  };
  return map[status] || status;
}

/** 复制文本到剪贴板，兼容旧环境。 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  }
}

/** 重跑用例模态弹窗，提供 Agent 专用重跑提示词与一键复制。 */
function RerunModal({
  testCase,
  report,
  onClose,
}: {
  testCase: ReportCase;
  report: Report;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const promptText = useMemo(() => {
    const originalCase = {
      id: testCase.id,
      title: testCase.title,
      category: testCase.category,
      testData: testCase.testData,
      definition: testCase.definition,
    };
    return [
      `请使用 CaseDock 重测以下用例。`,
      '',
      `测试报告：${report.title} (ID: ${report.runId})`,
      `用例名称：${testCase.title}`,
      '',
      `原始用例信息：`,
      JSON.stringify(originalCase, null, 2),
    ].join('\n');
  }, [testCase, report]);

  async function handleCopy() {
    const success = await copyToClipboard(promptText);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-medium" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>重跑用例提示词</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-description">
            将以下内容复制并直接发送给 Agent，即可精准重测当前用例并保留原始参数：
          </p>
          <div className="form-group">
            <textarea className="rerun-textarea" readOnly rows={10} value={promptText} />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="btn btn-primary" onClick={handleCopy}>
            {copied ? '已复制到剪贴板！' : '一键复制'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 修改用例名称弹窗。 */
function RenameCaseModal({
  reportId,
  testCase,
  onClose,
  onSuccess,
}: {
  reportId: string;
  testCase: ReportCase;
  onClose: () => void;
  onSuccess: (updatedReport: Report) => void;
}) {
  const [title, setTitle] = useState(testCase.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const updated = await api<Report>(`/reports/${reportId}/cases/${testCase.id}`, {
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
              <label className="field-label" htmlFor="case-rename-input">
                用例名称
              </label>
              <input
                id="case-rename-input"
                type="text"
                className="text-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** 修改报告名称弹窗。 */
function RenameReportModal({
  report,
  onClose,
  onSuccess,
}: {
  report: Report;
  onClose: () => void;
  onSuccess: (updatedReport: Report) => void;
}) {
  const [title, setTitle] = useState(report.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('报告名称不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Report>(`/reports/${report.runId}`, {
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
          <h3>修改报告名称</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-panel inline-error">{error}</div>}
            <div className="form-group">
              <label className="field-label" htmlFor="report-rename-input">
                报告名称
              </label>
              <input
                id="report-rename-input"
                type="text"
                className="text-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** 图片大图灯箱预览组件。 */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="lightbox-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className="lightbox-image" />
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="关闭预览">
          ×
        </button>
      </div>
    </div>
  );
}

/** 完整测试报告双栏详情大盘。 */
export function ReportDetails({
  report: initialReport,
  onBack,
  onReportDeleted,
}: {
  report: Report;
  onBack: () => void;
  onReportDeleted: (deletedRunId: string) => void;
}) {
  const [report, setReport] = useState<Report>(initialReport);
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'final' | 'slides'>('final');
  const [slideIndex, setSlideIndex] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null);

  // 弹窗状态
  const [showRerunModal, setShowRerunModal] = useState(false);
  const [showRenameCaseModal, setShowRenameCaseModal] = useState(false);
  const [showRenameReportModal, setShowRenameReportModal] = useState(false);

  useEffect(() => {
    setReport(initialReport);
    setSelectedCaseIndex(0);
    setSlideIndex(0);
  }, [initialReport]);

  const currentCase: ReportCase | undefined = report.cases[selectedCaseIndex] || report.cases[0];

  // 当切换选中的用例时，重置步骤幻灯片索引
  function handleSelectCase(index: number) {
    setSelectedCaseIndex(index);
    setSlideIndex(0);
  }

  // 获取证据图片的完整 URL
  function getEvidenceUrl(path?: string) {
    if (!path) return '';
    const filename = path.replace(/^evidence\//, '');
    return `/api/reports/${encodeURIComponent(report.runId)}/evidence/${encodeURIComponent(filename)}`;
  }

  // 删除报告确认
  async function handleDeleteReport() {
    if (!confirm(`确定删除报告“${report.title}”及其全部运行数据吗？此操作不可撤销。`)) return;
    try {
      await api(`/reports/${report.runId}`, { method: 'DELETE' });
      onReportDeleted(report.runId);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  // 删除当前用例确认
  async function handleDeleteCurrentCase() {
    if (!currentCase) return;
    if (!confirm(`确定删除用例“${currentCase.title}”吗？此操作不可撤销。`)) return;
    try {
      const updated = await api<Report>(`/reports/${report.runId}/cases/${currentCase.id}`, {
        method: 'DELETE',
      });
      setReport(updated);
      setSelectedCaseIndex(0);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  if (!currentCase) {
    return (
      <div className="detail-page empty">
        <button type="button" className="back-link" onClick={onBack}>
          ← 返回报告列表
        </button>
        <p>该报告中暂无用例</p>
      </div>
    );
  }

  // 寻找最终证据步骤（最后一个有截图的步骤）
  const finalEvidenceStep = [...currentCase.steps].reverse().find((s) => Boolean(s.screenshot));
  const activeStep: ReportStep | undefined = currentCase.steps[slideIndex] || currentCase.steps[0];

  return (
    <section className="detail-page report-dashboard">
      {/* 顶部返回导航 */}
      <button type="button" className="back-link" onClick={onBack}>
        ← 返回报告列表
      </button>

      {/* 报告头部与主操作 */}
      <div className="report-head">
        <h1>{report.title}</h1>
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowRenameReportModal(true)}
          >
            修改报告名称
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDeleteReport}>
            删除报告
          </button>
        </div>
      </div>

      {/* 报告时间与总状态 */}
      <div className="timing-bar">
        <span>
          开始 <b>{formatReportTime(report.startedAt)}</b>
        </span>
        <span className={`badge ${report.status}`}>{reportStatusLabel(report.status)}</span>
      </div>

      {/* 6 大指标看板卡片 */}
      <div className="metrics-grid">
        <div className="metric-box">
          <b>{report.totals.total}</b>
          <span>用例总数</span>
        </div>
        <div className="metric-box">
          <b className="passed">{report.totals.passed}</b>
          <span>通过</span>
        </div>
        <div className="metric-box">
          <b className="failed">{report.totals.failed}</b>
          <span>失败</span>
        </div>
        <div className="metric-box">
          <b className="blocked">{report.totals.blocked}</b>
          <span>阻塞</span>
        </div>
        <div className="metric-box">
          <b className="skipped">{report.totals.skipped}</b>
          <span>跳过</span>
        </div>
        <div className="metric-box pass-rate-box">
          <b>{report.totals.passRate}%</b>
          <span>通过率</span>
        </div>
      </div>

      {/* 报告概括文本 */}
      <p className="report-summary-text">{report.summary}</p>

      {/* 左右双栏大盘主体 */}
      <div className="report-main-layout">
        {/* 左侧用例列表导航 */}
        <nav className="case-nav-list" aria-label="用例列表导航">
          {report.cases.map((c, idx) => (
            <button
              key={c.id || idx}
              type="button"
              className={`case-nav-item ${idx === selectedCaseIndex ? 'active' : ''}`}
              onClick={() => handleSelectCase(idx)}
            >
              <span className="case-nav-title">{c.title}</span>
              <span className={`badge badge-sm ${c.status}`}>{reportStatusLabel(c.status)}</span>
            </button>
          ))}
        </nav>

        {/* 右侧选中用例详情面板 */}
        <div className="case-detail-panel">
          {/* 用例级操作栏 */}
          <div className="case-action-bar">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowRerunModal(true)}
            >
              重跑
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowRenameCaseModal(true)}
            >
              修改用例名称
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDeleteCurrentCase}>
              删除用例
            </button>
          </div>

          {/* 分类与标题 */}
          <div className="case-title-block">
            <p className="case-category">{currentCase.category || '未分类'}</p>
            <div className="case-title-row">
              <h2>{currentCase.title}</h2>
              <span className={`badge ${currentCase.status}`}>
                {reportStatusLabel(currentCase.status)}
              </span>
            </div>
          </div>

          {/* 用例执行时间与用时 */}
          <div className="case-meta-row">
            <span>开始 {formatReportTime(currentCase.startedAt)}</span>
            <span>用时 {formatDurationMs(currentCase.durationMs)}</span>
          </div>

          {/* 用例定义折叠组件 */}
          {currentCase.definition && (
            <details className="case-definition-details">
              <summary>▶ 用例定义</summary>
              <div className="definition-content">
                <div className="def-row">
                  <span className="def-label">名称：</span>
                  <span>{currentCase.definition.name}</span>
                </div>
                <div className="def-row">
                  <span className="def-label">分类：</span>
                  <span>{currentCase.definition.category}</span>
                </div>
                {currentCase.definition.testData && (
                  <div className="def-row">
                    <span className="def-label">测试数据：</span>
                    <pre className="def-pre">{currentCase.definition.testData}</pre>
                  </div>
                )}
                {currentCase.definition.steps?.length > 0 && (
                  <div className="def-section">
                    <h4>执行步骤</h4>
                    <ol>
                      {currentCase.definition.steps.map((st, i) => (
                        <li key={i}>{st}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {currentCase.definition.assertions?.length > 0 && (
                  <div className="def-section">
                    <h4>预期断言</h4>
                    <ol>
                      {currentCase.definition.assertions.map((asrt, i) => (
                        <li key={i}>{asrt}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* 用例观察与结论 */}
          {currentCase.summary && <p className="case-summary-box">{currentCase.summary}</p>}

          {/* 证据呈现 Tab 切换：最终证据 vs 逐步记录 */}
          <div className="evidence-tab-bar">
            <button
              type="button"
              className={`evidence-tab ${viewMode === 'final' ? 'active' : ''}`}
              onClick={() => setViewMode('final')}
            >
              最终证据
            </button>
            <button
              type="button"
              className={`evidence-tab ${viewMode === 'slides' ? 'active' : ''}`}
              onClick={() => setViewMode('slides')}
            >
              逐步记录
            </button>
          </div>

          {/* 视图一：最终证据 */}
          {viewMode === 'final' && (
            <div className="final-evidence-view">
              {finalEvidenceStep?.screenshot ? (
                <figure className="evidence-figure">
                  <img
                    src={getEvidenceUrl(finalEvidenceStep.screenshot)}
                    alt={`步骤 ${finalEvidenceStep.index} 最终截图`}
                    className="evidence-img clickable"
                    onClick={() =>
                      setLightboxSrc({
                        src: getEvidenceUrl(finalEvidenceStep.screenshot),
                        alt: `步骤 ${finalEvidenceStep.index} 最终截图`,
                      })
                    }
                  />
                  <figcaption>最终证据（步骤 {finalEvidenceStep.index}）</figcaption>
                </figure>
              ) : (
                <div className="empty-evidence">该用例暂未包含截图证据</div>
              )}
            </div>
          )}

          {/* 视图二：逐步记录幻灯片 */}
          {viewMode === 'slides' && activeStep && (
            <div className="slides-view">
              <div className="slide-controls">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={slideIndex === 0}
                  onClick={() => setSlideIndex((prev) => Math.max(0, prev - 1))}
                >
                  ← 上一步
                </button>
                <span className="slide-counter">
                  <b>{slideIndex + 1}</b> / {currentCase.steps.length}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={slideIndex >= currentCase.steps.length - 1}
                  onClick={() =>
                    setSlideIndex((prev) => Math.min(currentCase.steps.length - 1, prev + 1))
                  }
                >
                  下一步 →
                </button>
              </div>

              <article className="step-card">
                {activeStep.screenshot ? (
                  <div className="step-screenshot-wrap">
                    <img
                      src={getEvidenceUrl(activeStep.screenshot)}
                      alt={`步骤 ${activeStep.index} 截图`}
                      className="step-screenshot clickable"
                      onClick={() =>
                        setLightboxSrc({
                          src: getEvidenceUrl(activeStep.screenshot),
                          alt: `步骤 ${activeStep.index} 截图`,
                        })
                      }
                    />
                  </div>
                ) : (
                  <div className="empty-step-shot">本步骤无截图</div>
                )}
                <div className="step-info-col">
                  <div className="step-card-header">
                    <h3>步骤 {activeStep.index}</h3>
                    <span className={`badge badge-sm ${activeStep.status}`}>
                      {reportStatusLabel(activeStep.status)}
                    </span>
                  </div>
                  <dl className="step-dl">
                    <dt>执行：</dt>
                    <dd>{activeStep.action}</dd>
                    {activeStep.expected && (
                      <>
                        <dt>期望：</dt>
                        <dd>{activeStep.expected}</dd>
                      </>
                    )}
                    <dt>实际：</dt>
                    <dd>{activeStep.actual}</dd>
                  </dl>
                </div>
              </article>
            </div>
          )}
        </div>
      </div>

      {/* 模态弹窗挂载 */}
      {showRerunModal && (
        <RerunModal
          testCase={currentCase}
          report={report}
          onClose={() => setShowRerunModal(false)}
        />
      )}
      {showRenameCaseModal && (
        <RenameCaseModal
          reportId={report.runId}
          testCase={currentCase}
          onClose={() => setShowRenameCaseModal(false)}
          onSuccess={(upd) => {
            setReport(upd);
            setShowRenameCaseModal(false);
          }}
        />
      )}
      {showRenameReportModal && (
        <RenameReportModal
          report={report}
          onClose={() => setShowRenameReportModal(false)}
          onSuccess={(upd) => {
            setReport(upd);
            setShowRenameReportModal(false);
          }}
        />
      )}
      {lightboxSrc && (
        <Lightbox
          src={lightboxSrc.src}
          alt={lightboxSrc.alt}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </section>
  );
}

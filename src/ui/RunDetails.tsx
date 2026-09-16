import { useCallback, useEffect, useState } from 'react';
import type { CredentialItem, Run, TestStep } from '../core/models';

/** 将运行和步骤状态转换为测试人员使用的中文结果。 */
export function label(status: string | null) {
  return (
    (
      {
        running: '执行中',
        completed: '已结束',
        interrupted: '已中断',
        passed: '通过',
        failed: '失败',
        inconclusive: '无法判断',
        blocked: '阻塞',
        skipped: '跳过',
        error: '执行错误',
        pending: '未执行',
      } as Record<string, string>
    )[status ?? ''] ?? '未判定'
  );
}

/** 为结果提供稳定的视觉状态类名。 */
export function statusClass(status: string | null) {
  if (status === 'passed') return 'status-passed';
  if (status === 'failed' || status === 'error') return 'status-failed';
  if (status === 'running') return 'status-running';
  return 'status-neutral';
}

/** 根据 Run 的起止时间计算测试耗时，进行中的 Run 不伪造结束时间。 */
export function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return '进行中';
  const seconds = Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

/** 格式化宿主提供的准确 Token 总量；缺失时明确显示未记录。 */
export function formatTokenUsage(tokenUsage: Run['tokenUsage']) {
  return tokenUsage ? tokenUsage.total.toLocaleString() : '未记录';
}

/** 将可能的单套或多套账密统一标准化为数组，便于列表与弹窗一致渲染。 */
function normalizeCredentials(creds: unknown): CredentialItem[] {
  if (!creds) return [];
  if (Array.isArray(creds)) return creds as CredentialItem[];
  if (typeof creds === 'object' && 'account' in creds && 'password' in creds) {
    return [creds as CredentialItem];
  }
  return [];
}

/** 将文本安全写入系统剪贴板。 */
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
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}

/** 测试账密详情模态弹窗组件，列出每套账密并支持独立一键复制与明文掩码切换。 */
function CredentialsModal({
  credentials,
  onClose,
}: {
  credentials: CredentialItem[];
  onClose: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    /** 监听 Escape 快捷键关闭模态窗。 */
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /** 复制指定字段文本并展示 1.5 秒成功状态。 */
  async function handleCopy(key: string, text: string) {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  /** 一键复制所有套账密为文本清单。 */
  async function handleCopyAll() {
    const text = credentials
      .map((c, idx) => `[${c.role || `账套 ${idx + 1}`}]\n账号: ${c.account}\n密码: ${c.password}`)
      .join('\n\n');
    await handleCopy('all', text);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>测试账密（共 {credentials.length} 套）</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭弹窗">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="credentials-list">
            {credentials.map((item, index) => {
              const showPassword = !!showPasswordMap[index];
              const accountKey = `acc-${index}`;
              const passwordKey = `pwd-${index}`;

              return (
                <div className="credential-card" key={index}>
                  <div className="credential-card-title">
                    <span className="badge">套号 {index + 1}</span>
                    {item.role && <strong className="credential-role">{item.role}</strong>}
                  </div>

                  <div className="credential-field">
                    <span className="field-label">账号</span>
                    <span className="field-value selectable">{item.account}</span>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => void handleCopy(accountKey, item.account)}
                    >
                      {copiedKey === accountKey ? '已复制 ✓' : '复制账号'}
                    </button>
                  </div>

                  <div className="credential-field">
                    <span className="field-label">密码</span>
                    <span className="field-value selectable">
                      {showPassword ? item.password : '••••••••'}
                    </span>
                    <div className="field-actions">
                      <button
                        type="button"
                        className="toggle-pwd-btn"
                        onClick={() =>
                          setShowPasswordMap((prev) => ({ ...prev, [index]: !prev[index] }))
                        }
                      >
                        {showPassword ? '隐藏' : '显示'}
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => void handleCopy(passwordKey, item.password)}
                      >
                        {copiedKey === passwordKey ? '已复制 ✓' : '复制密码'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          {credentials.length > 1 && (
            <button type="button" className="action-btn" onClick={() => void handleCopyAll()}>
              {copiedKey === 'all' ? '全部已复制 ✓' : '复制全部账密'}
            </button>
          )}
          <button type="button" className="primary-btn" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

/** 展示一次执行的实际观察与证据，不用当前用例覆盖历史快照。 */
export function RunDetails({ run }: { run: Run }) {
  const [showCredsModal, setShowCredsModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'slide'>(() => {
    try {
      return (localStorage.getItem('casedock_step_view_mode') as 'slide') || 'list';
    } catch {
      return 'list';
    }
  });
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const credentialList = normalizeCredentials(run.credentials);
  const initialUrl = run.initialUrl ?? run.targetUrl ?? '未记录';
  const steps = run.snapshot.steps;
  const totalSteps = steps.length;

  /** 切换阅读视图模式并写入本地存储记忆。 */
  function handleModeChange(mode: 'list' | 'slide') {
    setViewMode(mode);
    try {
      localStorage.setItem('casedock_step_view_mode', mode);
    } catch {
      // 忽略隐私模式下的存储异常
    }
  }

  /** 复制初始访问地址。 */
  async function handleCopyUrl(url: string) {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1500);
    }
  }

  /** 响应键盘方向键切换幻灯片步骤。 */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (viewMode !== 'slide') return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowRight') {
        setCurrentStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentStepIndex((prev) => Math.max(0, prev - 1));
      }
    },
    [viewMode, totalSteps],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  /** 确保当前步索引不超出步骤数量范围。 */
  const safeIndex = Math.min(Math.max(0, currentStepIndex), Math.max(0, totalSteps - 1));

  /** 渲染单个步骤的内容（在平铺列表与幻灯片模式中复用）。 */
  function renderStep(step: TestStep, index: number) {
    const result = run.steps.find((item) => item.stepId === step.id);

    return (
      <article className="result-step" key={step.id}>
        <div className="result-step-heading">
          <span className="step-number">{index + 1}</span>
          <strong>{step.action}</strong>
          <span className={`status ${statusClass(result?.status ?? 'pending')}`}>
            {label(result?.status ?? 'pending')}
          </span>
        </div>
        {result?.observation && <p className="step-observation">{result.observation}</p>}
        {step.assertions.map((assertion) => {
          const observed = result?.assertions.find((item) => item.assertionId === assertion.id);
          return (
            <div className="assertion-result" key={assertion.id}>
              <div className="assertion-heading">
                <strong>{assertion.expect}</strong>
                <span className={`status ${statusClass(observed?.verdict ?? null)}`}>
                  {label(observed?.verdict ?? null)}
                </span>
              </div>
              <p>{observed?.observation ?? '尚未检查'}</p>
              <div className="evidence-grid">
                {observed?.artifactIds.map((id) => {
                  const artifact = run.artifacts.find((item) => item.id === id);
                  if (!artifact) return null;
                  const url = `/api/runs/${run.id}/artifacts/${id}`;
                  return artifact.kind === 'screenshot' ? (
                    <a
                      className="evidence-link"
                      href={url}
                      key={id}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="在新窗口查看截图原图"
                    >
                      <img src={url} alt={`${step.action}：${assertion.expect}`} loading="lazy" />
                    </a>
                  ) : null;
                })}
              </div>
            </div>
          );
        })}
      </article>
    );
  }

  return (
    <div className="run-detail">
      <div className="run-detail-heading">
        <h2>执行详情</h2>
        <span className={`status status-large ${statusClass(run.verdict ?? run.status)}`}>
          {label(run.verdict ?? run.status)}
        </span>
      </div>

      <dl className="run-summary">
        <div>
          <dt>测试时间</dt>
          <dd>{new Date(run.startedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>测试耗时</dt>
          <dd>{formatDuration(run.startedAt, run.finishedAt)}</dd>
        </div>
        <div>
          <dt>Token 消耗</dt>
          <dd title={run.tokenUsage?.source}>{formatTokenUsage(run.tokenUsage)}</dd>
        </div>
        <div>
          <dt>执行者</dt>
          <dd>{run.executor.agent}</dd>
        </div>
        <div>
          <dt>模型</dt>
          <dd>{run.executor.model ?? '—'}</dd>
        </div>
        <div className="summary-url">
          <dt>初始地址</dt>
          <dd className="url-cell" title={initialUrl}>
            <span className="url-text">{initialUrl}</span>
            {initialUrl !== '未记录' && (
              <span className="url-actions">
                <button
                  type="button"
                  className="copy-chip"
                  onClick={() => void handleCopyUrl(initialUrl)}
                >
                  {copiedUrl ? '已复制 ✓' : '复制'}
                </button>
                <a
                  href={initialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="link-chip"
                  title="在新标签页打开"
                >
                  访问 ↗
                </a>
              </span>
            )}
          </dd>
        </div>
        <div className="summary-wide summary-credentials">
          <dt>测试账密</dt>
          <dd className="credentials-cell">
            {credentialList.length === 0 ? (
              <span>未记录</span>
            ) : (
              <div className="credentials-row">
                <span className="credentials-info">
                  共 <strong>{credentialList.length}</strong> 套账密
                  {credentialList.length === 1 && (
                    <span className="account-preview">（账号：{credentialList[0].account}）</span>
                  )}
                </span>
                <button
                  type="button"
                  className="view-creds-btn"
                  onClick={() => setShowCredsModal(true)}
                >
                  查看账密与复制
                </button>
              </div>
            )}
          </dd>
        </div>
      </dl>

      {run.reason && <p className="run-reason">{run.reason}</p>}

      {run.snapshot.preconditions.length > 0 && (
        <section className="result-group">
          <h3>前置条件</h3>
          {run.snapshot.preconditions.map((condition, index) => {
            const check = run.preconditions.find((item) => item.index === index);
            return (
              <div className="precondition-result" key={index}>
                <span className={`status ${check?.satisfied ? 'status-passed' : 'status-neutral'}`}>
                  {check?.satisfied ? '满足' : '不满足'}
                </span>
                <div>
                  <strong>{condition}</strong>
                  {check?.observation && <p>{check.observation}</p>}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="result-group">
        <div className="result-group-header">
          <h3>步骤与证据</h3>
          {totalSteps > 1 && (
            <div className="view-mode-toggle" role="group" aria-label="阅读视图切换">
              <button
                type="button"
                className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleModeChange('list')}
              >
                ≡ 列表视图
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewMode === 'slide' ? 'active' : ''}`}
                onClick={() => handleModeChange('slide')}
              >
                ◫ 幻灯片视图
              </button>
            </div>
          )}
        </div>

        {viewMode === 'list' ? (
          <div className="step-list-view">
            {steps.map((step, index) => renderStep(step, index))}
          </div>
        ) : (
          <div className="step-slide-view">
            <div className="step-nav-bar" role="tablist" aria-label="步骤导航">
              {steps.map((step, index) => {
                const result = run.steps.find((item) => item.stepId === step.id);
                const isCurrent = index === safeIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    className={`step-nav-pill ${isCurrent ? 'active' : ''}`}
                    onClick={() => setCurrentStepIndex(index)}
                  >
                    <span className="pill-index">{index + 1}</span>
                    <span className="pill-text">{step.action}</span>
                    <span
                      className={`pill-dot ${statusClass(result?.status ?? 'pending')}`}
                      title={label(result?.status ?? 'pending')}
                    />
                  </button>
                );
              })}
            </div>

            <div className="slide-content-card">
              {steps[safeIndex] && renderStep(steps[safeIndex], safeIndex)}
            </div>

            <div className="slide-footer-nav">
              <button
                type="button"
                className="nav-btn prev-btn"
                disabled={safeIndex === 0}
                onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
              >
                ‹ 上一步
              </button>
              <span className="slide-progress">
                第 <strong>{safeIndex + 1}</strong> / {totalSteps} 步
                <small>（支持键盘 ← → 翻页）</small>
              </span>
              <button
                type="button"
                className="nav-btn next-btn"
                disabled={safeIndex === totalSteps - 1}
                onClick={() => setCurrentStepIndex((prev) => Math.min(totalSteps - 1, prev + 1))}
              >
                下一步 ›
              </button>
            </div>
          </div>
        )}
      </section>

      {showCredsModal && (
        <CredentialsModal credentials={credentialList} onClose={() => setShowCredsModal(false)} />
      )}
    </div>
  );
}

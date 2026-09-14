import { Image } from 'antd';
import type { Run } from '../core/models';

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

/** 展示一次执行的实际观察与证据，不用当前用例覆盖历史快照。 */
export function RunDetails({ run }: { run: Run }) {
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
        <div>
          <dt>测试账号</dt>
          <dd>{run.credentials?.account ?? '未记录'}</dd>
        </div>
        <div>
          <dt>测试密码</dt>
          <dd>{run.credentials?.password ?? '未记录'}</dd>
        </div>
        <div className="summary-wide">
          <dt>初始地址</dt>
          <dd>{run.initialUrl ?? run.targetUrl ?? '未记录'}</dd>
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
        <h3>步骤与证据</h3>
        {run.snapshot.steps.map((step, index) => {
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
                const observed = result?.assertions.find(
                  (item) => item.assertionId === assertion.id,
                );
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
                          <Image
                            key={id}
                            src={url}
                            alt={`${step.action}：${assertion.expect}`}
                            width="100%"
                          />
                        ) : null;
                      })}
                    </div>
                  </div>
                );
              })}
            </article>
          );
        })}
      </section>
    </div>
  );
}

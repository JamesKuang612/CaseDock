import { Alert, Image, Tag } from 'antd';
import type { Run } from '../core/models';

/** 将运行和步骤状态转换为测试人员使用的中文标签。 */
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
/** 展示冻结的测试要求、逐步观察和证据，不用当前用例覆盖历史内容。 */
export function RunDetails({ run }: { run: Run }) {
  return (
    <div>
      <h2>{run.snapshot.title}</h2>
      <div className="run-meta">
        <Tag>{label(run.status)}</Tag>
        <Tag
          color={run.verdict === 'passed' ? 'green' : run.verdict === 'failed' ? 'red' : 'default'}
        >
          {label(run.verdict)}
        </Tag>
        <span>
          {run.environment} · {run.executor.agent} · {run.executor.model ?? '模型未知'}
        </span>
      </div>
      <p className="muted">{run.targetUrl}</p>
      <p className="muted">
        运行 ID：{run.id}
        <br />
        用例版本：{run.caseRevision.slice(0, 12)} · {new Date(run.startedAt).toLocaleString()}
      </p>
      <Alert
        type="info"
        showIcon
        title="判断来自执行 Agent，CaseDock 校验记录完整性。请结合证据复核。"
      />
      {run.reason && <p>结束说明：{run.reason}</p>}
      {run.snapshot.preconditions.length > 0 && (
        <section className="result-step">
          <h3>前置条件</h3>
          {run.snapshot.preconditions.map((condition, index) => {
            const check = run.preconditions.find((item) => item.index === index);
            return (
              <p key={index}>
                <Tag color={check?.satisfied ? 'green' : 'orange'}>
                  {check?.satisfied ? '满足' : '不满足'}
                </Tag>
                {condition}
                <br />
                <span className="muted">{check?.observation}</span>
              </p>
            );
          })}
        </section>
      )}
      {run.snapshot.steps.map((step, index) => {
        const result = run.steps.find((item) => item.stepId === step.id);
        return (
          <section className="result-step" key={step.id}>
            <div className="row-between">
              <h3>
                {index + 1}. {step.action}
              </h3>
              <Tag>{label(result?.status ?? 'pending')}</Tag>
            </div>
            <p className="observation">{result?.observation ?? '尚未提交观察结果'}</p>
            {step.assertions.map((assertion) => {
              const observed = result?.assertions.find((item) => item.assertionId === assertion.id);
              return (
                <div className="assertion-result" key={assertion.id}>
                  <p>
                    <strong>预期：</strong>
                    {assertion.expect}
                  </p>
                  <p>
                    <strong>实际：</strong>
                    {observed?.observation ?? '尚未检查'}
                  </p>
                  <Tag
                    color={
                      observed?.verdict === 'passed'
                        ? 'green'
                        : observed?.verdict === 'failed'
                          ? 'red'
                          : 'default'
                    }
                  >
                    {label(observed?.verdict ?? null)}
                  </Tag>
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
                      ) : (
                        <a key={id} href={url} target="_blank" rel="noreferrer">
                          查看文本证据
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

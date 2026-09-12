import { useEffect, useState } from 'react';
import { Alert, Tag } from 'antd';
import type { WorkbenchStatus } from '../core/status';

export function App() {
  const [status, setStatus] = useState<WorkbenchStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/workbench', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Service unavailable');
        return response.json() as Promise<WorkbenchStatus>;
      })
      .then(setStatus)
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);

  return <div className="shell">
    <aside>
      <div className="brand"><span className="mark">C</span>CaseDock</div>
      <div className="workspace-label">团队测试工作台</div>
      <div className="nav-current">工作台概览</div>
      <div className="sidebar-foot">统一测试资产<br />使用你自己的 Agent</div>
    </aside>
    <main>
      <header><span>本地工作区</span><Tag color={error ? 'red' : status ? 'green' : 'default'}>
        {error ? '服务连接失败' : status ? '本地服务已连接' : '正在连接服务'}
      </Tag></header>
      <section className="intro">
        <div className="eyebrow">YOUR TESTS. YOUR AGENT.</div>
        <h1>让每一次测试，<br />成为团队的共同资产。</h1>
        <p>在你熟悉的 Agent 中测试，在 CaseDock 中整理用例、查看执行结果，<br className="desktop-break" />通过 Git 与同事一起维护。</p>
      </section>
      {error && <Alert type="error" showIcon title="无法连接本地服务" description="请确认 API 服务已经启动，然后刷新页面。" />}
      <section className="cards" aria-label="工作台规划">
        <article><span className="number">01</span><h2>测试用例</h2><p>统一前置条件、操作步骤和预期结果，让用例可以阅读、修改和复用。</p></article>
        <article><span className="number">02</span><h2>执行记录</h2><p>每一次运行关联到明确的用例版本，保留实际观察和断言结论。</p></article>
        <article><span className="number">03</span><h2>证据与协作</h2><p>把截图关联到具体步骤，让同事可以检查结果、定位问题。</p></article>
      </section>
      <div className="milestone"><Tag>开发基线</Tag><span>工程已就绪。用例管理与执行记录功能将在下一阶段接入。</span></div>
    </main>
  </div>;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, Modal, Table, Tag, message } from 'antd';
import type { CaseDocument, Run, RunSummary } from '../core/models';
import { api } from './api';
import { CaseEditor } from './CaseEditor';
import { RunDetails, label } from './RunDetails';

/** 展示真实用例与运行；轮询刷新列表但不覆盖正在编辑的草稿。 */
export function App() {
  const [cases, setCases] = useState<CaseDocument[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<'cases' | 'runs'>('cases');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ document: CaseDocument | null } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const runId = useRef<string | null>(null);
  const dirty = useRef(false);
  const [modal, modalContext] = Modal.useModal();
  const [notice, noticeContext] = message.useMessage();
  /** 刷新服务器列表及打开的运行详情，保留独立的用例编辑缓冲。 */
  const refresh = useCallback(async () => {
    try {
      const [caseData, runData] = await Promise.all([
        api<{ cases: CaseDocument[]; errors: { path: string; message: string }[] }>('/cases'),
        api<{ runs: RunSummary[]; errors: { path: string; message: string }[] }>('/runs'),
      ]);
      setCases(caseData.cases);
      setRuns(runData.runs);
      setConnected(true);
      setErrors(
        [...caseData.errors, ...runData.errors].map((item) => `${item.path}: ${item.message}`),
      );
      const id = runId.current;
      if (id) {
        const detail = await api<Run>(`/runs/${id}`);
        if (runId.current === id) setRun(detail);
      }
    } catch (error) {
      setConnected(false);
      setErrors([error instanceof Error ? error.message : String(error)]);
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
    /** 在用户关闭页面前提示未保存的用例更改。 */
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  /** 关闭编辑器前确认是否放弃草稿，防止无声丢失输入。 */
  function closeEditor() {
    if (dirty.current)
      modal.confirm({
        title: '放弃未保存的修改？',
        content: '关闭后将丢弃当前编辑内容。',
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: () => {
          dirty.current = false;
          setEditor(null);
        },
      });
    else setEditor(null);
  }
  /** 复制包含具体用例和版本的执行指令，交给用户选择的 Agent。 */
  async function copyPrompt(document: CaseDocument) {
    try {
      await navigator.clipboard.writeText(
        `使用项目的 casedock-testing Skill，执行用例 ${document.testCase.id}。先读取当前用例（参考版本 ${document.revision}），确认测试环境和前置条件，使用你已有的浏览器工具执行，通过 CaseDock CLI 逐步记录结果与证据。不要为了通过而修改用例；中断时保留部分结果。`,
      );
      void notice.success('执行指令已复制，可粘贴给你的 Agent');
    } catch {
      void notice.error('剪贴板不可用，请在 Agent 中指定用例 ID 执行');
    }
  }
  /** 打开指定运行，同时防止旧请求覆盖后来选择的运行。 */
  async function openRun(id: string) {
    runId.current = id;
    try {
      const detail = await api<Run>(`/runs/${id}`);
      if (runId.current === id) setRun(detail);
    } catch (error) {
      void notice.error(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <div className="shell">
      {modalContext}
      {noticeContext}
      <aside>
        <div className="brand">
          <span className="mark">C</span>CaseDock
        </div>
        <div className="workspace-label">团队测试工作台</div>
        <button
          className={`nav-button ${tab === 'cases' ? 'active' : ''}`}
          onClick={() => setTab('cases')}
        >
          测试用例 <span>{cases.length}</span>
        </button>
        <button
          className={`nav-button ${tab === 'runs' ? 'active' : ''}`}
          onClick={() => setTab('runs')}
        >
          执行记录 <span>{runs.length}</span>
        </button>
        <div className="sidebar-foot">
          统一测试资产
          <br />
          使用你自己的 Agent
        </div>
      </aside>
      <main>
        <header>
          <span>本地工作区 · Git 管理用例</span>
          <Tag color={connected ? 'green' : 'orange'}>
            {connected ? '服务已连接' : '正在连接 / 服务不可用'}
          </Tag>
        </header>
        <section className="page-heading">
          <div>
            <div className="eyebrow">YOUR TESTS. YOUR AGENT.</div>
            <h1>{tab === 'cases' ? '团队的测试资产' : '每一次执行，都有据可查'}</h1>
            <p>测试由你的 Agent 执行，CaseDock 保存规范、结果和证据。</p>
          </div>
          {tab === 'cases' && (
            <Button
              type="primary"
              size="large"
              onClick={() => {
                dirty.current = false;
                setEditor({ document: null });
              }}
            >
              新建用例
            </Button>
          )}
        </section>
        {errors.length > 0 && (
          <Alert type="error" showIcon title="部分数据无法读取" description={errors.join('；')} />
        )}
        <div className="toolbar">
          <Input.Search
            aria-label="搜索用例或运行"
            placeholder="搜索 ID、名称、标签或环境"
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button onClick={() => void refresh()}>刷新</Button>
        </div>
        {tab === 'cases' ? (
          <Table
            rowKey={(row) => row.testCase.id}
            dataSource={cases.filter((row) =>
              `${row.testCase.id} ${row.testCase.title} ${row.testCase.tags.join(' ')}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )}
            locale={{
              emptyText: (
                <Empty description="还没有测试用例。新建一个用例，或让 Agent 通过 CLI 保存。" />
              ),
            }}
            pagination={{ pageSize: 8 }}
            columns={[
              {
                title: '用例',
                render: (_, row: CaseDocument) => (
                  <>
                    <strong>{row.testCase.title}</strong>
                    <div className="muted">{row.testCase.id}</div>
                  </>
                ),
              },
              {
                title: '标签',
                render: (_, row: CaseDocument) =>
                  row.testCase.tags.map((tag) => <Tag key={tag}>{tag}</Tag>),
              },
              { title: '步骤', render: (_, row: CaseDocument) => row.testCase.steps.length },
              {
                title: '当前版本最近运行',
                render: (_, row: CaseDocument) => {
                  const latest = runs.find(
                    (run) => run.caseId === row.testCase.id && run.caseRevision === row.revision,
                  );
                  return latest ? (
                    <>
                      <Tag>{label(latest.verdict ?? latest.status)}</Tag>
                      <span className="muted">{latest.environment}</span>
                    </>
                  ) : (
                    <span className="muted">未验证</span>
                  );
                },
              },
              {
                title: '操作',
                render: (_, row: CaseDocument) => (
                  <div className="table-actions">
                    <Button
                      onClick={() => {
                        dirty.current = false;
                        setEditor({ document: row });
                      }}
                    >
                      编辑
                    </Button>
                    <Button type="link" onClick={() => void copyPrompt(row)}>
                      复制执行指令
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <Table
            rowKey="id"
            dataSource={runs.filter((item) =>
              `${item.caseId} ${item.environment} ${item.id}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: <Empty description="尚无执行记录。请从 Agent 发起测试。" /> }}
            columns={[
              { title: '用例', dataIndex: 'caseId' },
              { title: '环境', dataIndex: 'environment' },
              { title: '执行者', render: (_, row: RunSummary) => row.executor.agent },
              {
                title: '状态',
                render: (_, row: RunSummary) => (
                  <Tag>
                    {label(row.verdict ?? row.status)}
                    {row.status === 'interrupted' ? ' · 已中断' : ''}
                  </Tag>
                ),
              },
              {
                title: '开始时间',
                render: (_, row: RunSummary) => new Date(row.startedAt).toLocaleString(),
              },
              {
                title: '详情',
                render: (_, row: RunSummary) => (
                  <Button onClick={() => void openRun(row.id)}>查看证据</Button>
                ),
              },
            ]}
          />
        )}
        <p className="footnote">
          用例保存在 cases/，运行和证据保存在 .casedock/。页面每 4 秒检查更新。
        </p>
      </main>
      <Drawer
        title={editor?.document ? '编辑用例' : '新建用例'}
        open={editor !== null}
        onClose={closeEditor}
        size={780}
        destroyOnHidden
      >
        {editor && (
          <CaseEditor
            key={editor.document?.revision ?? 'new'}
            document={editor.document}
            onDirty={() => {
              dirty.current = true;
            }}
            onSaved={(document) => {
              dirty.current = false;
              setEditor({ document });
              void refresh();
              void notice.success('用例已保存');
            }}
          />
        )}
      </Drawer>
      <Drawer
        title="执行详情与证据"
        open={run !== null}
        size={880}
        onClose={() => {
          runId.current = null;
          setRun(null);
        }}
        destroyOnHidden
      >
        {run && <RunDetails run={run} />}
      </Drawer>
    </div>
  );
}

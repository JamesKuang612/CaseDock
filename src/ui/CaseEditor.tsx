import { useState } from 'react';
import { Alert, Button, Form, Input, Select, Space } from 'antd';
import type { CaseDocument, TestCase } from '../core/models';
import { api } from './api';

interface Props {
  document: CaseDocument | null;
  onSaved: (document: CaseDocument) => void;
  onDirty: () => void;
}
interface EditorValues extends Omit<TestCase, 'preconditions'> {
  preconditionsText: string;
}

/** 提供结构化的步骤和断言编辑，并携带旧 revision 检测外部修改冲突。 */
export function CaseEditor({ document, onSaved, onDirty }: Props) {
  const [form] = Form.useForm<EditorValues>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const testCase = document?.testCase;
  /** 将表单转为标准用例，保存失败时保留用户未提交的编辑。 */
  async function save(values: EditorValues) {
    setBusy(true);
    setError('');
    try {
      const { preconditionsText, ...fields } = values;
      const result = await api<CaseDocument>('/cases', {
        testCase: {
          ...fields,
          schemaVersion: 1,
          tags: fields.tags ?? [],
          preconditions: preconditionsText
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        },
        expectedRevision: document?.revision ?? null,
      });
      onSaved(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={save}
      onValuesChange={onDirty}
      initialValues={{
        ...testCase,
        preconditionsText: testCase?.preconditions.join('\n') ?? '',
        steps: testCase?.steps ?? [
          {
            id: 'step-1',
            action: '',
            assertions: [{ id: 'assert-1', expect: '', evidence: ['screenshot'] }],
          },
        ],
      }}
    >
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          description="输入已保留。若版本冲突，请复制未保存内容，关闭编辑器后重新加载再合并。"
        />
      )}
      <div className="form-grid">
        <Form.Item
          label="用例 ID"
          name="id"
          rules={[
            { required: true },
            { pattern: /^[a-z0-9][a-z0-9-]{0,79}$/, message: '使用小写字母、数字和连字符' },
          ]}
        >
          <Input disabled={Boolean(document)} placeholder="login-basic" />
        </Form.Item>
        <Form.Item label="用例名称" name="title" rules={[{ required: true, whitespace: true }]}>
          <Input placeholder="使用有效账号登录" />
        </Form.Item>
      </div>
      <Form.Item label="标签" name="tags">
        <Select mode="tags" placeholder="输入标签后按回车" />
      </Form.Item>
      <Form.Item label="前置条件（每行一项）" name="preconditionsText">
        <Input.TextArea rows={3} placeholder="浏览器处于未登录状态" />
      </Form.Item>
      <Form.List name="steps">
        {(steps, { add, remove, move }) => (
          <>
            {steps.map((step, index) => (
              <section className="edit-step" key={step.key}>
                <div className="row-between">
                  <h3>步骤 {index + 1}</h3>
                  <Space>
                    <Button
                      size="small"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      上移
                    </Button>
                    <Button
                      size="small"
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      下移
                    </Button>
                    <Button
                      size="small"
                      danger
                      disabled={steps.length === 1}
                      onClick={() => remove(step.name)}
                    >
                      删除步骤
                    </Button>
                  </Space>
                </div>
                <Form.Item name={[step.name, 'id']} label="步骤 ID" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item
                  name={[step.name, 'action']}
                  label="操作要求"
                  rules={[{ required: true, whitespace: true }]}
                >
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.List name={[step.name, 'assertions']}>
                  {(assertions, controls) => (
                    <>
                      {assertions.map((assertion) => (
                        <div className="edit-assertion" key={assertion.key}>
                          <Form.Item
                            name={[assertion.name, 'id']}
                            label="断言 ID"
                            rules={[{ required: true }]}
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            name={[assertion.name, 'expect']}
                            label="预期结果"
                            rules={[{ required: true, whitespace: true }]}
                          >
                            <Input.TextArea rows={2} />
                          </Form.Item>
                          <Form.Item
                            name={[assertion.name, 'evidence']}
                            label="通过时必须提交的证据"
                          >
                            <Select
                              mode="multiple"
                              options={[
                                { value: 'screenshot', label: '截图' },
                                { value: 'text', label: '文本' },
                              ]}
                            />
                          </Form.Item>
                          <Button
                            size="small"
                            danger
                            disabled={assertions.length === 1}
                            onClick={() => controls.remove(assertion.name)}
                          >
                            删除断言
                          </Button>
                        </div>
                      ))}
                      <Button
                        onClick={() =>
                          controls.add({
                            id: `assert-${crypto.randomUUID().slice(0, 8)}`,
                            expect: '',
                            evidence: ['screenshot'],
                          })
                        }
                      >
                        添加断言
                      </Button>
                    </>
                  )}
                </Form.List>
              </section>
            ))}
            <Button
              block
              type="dashed"
              onClick={() =>
                add({
                  id: `step-${crypto.randomUUID().slice(0, 8)}`,
                  action: '',
                  assertions: [
                    {
                      id: `assert-${crypto.randomUUID().slice(0, 8)}`,
                      expect: '',
                      evidence: ['screenshot'],
                    },
                  ],
                })
              }
            >
              添加步骤
            </Button>
          </>
        )}
      </Form.List>
      <div className="save-bar">
        <Button type="primary" htmlType="submit" loading={busy}>
          保存用例
        </Button>
        <span>保存到 Git 工作区，尚不产生执行结论。</span>
      </div>
    </Form>
  );
}

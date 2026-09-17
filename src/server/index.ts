import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createStore } from '../core/store.js';
import { CoreError, schemas } from '../core/schema.js';

/** 创建本地 API 和静态页面服务；所有业务写入委托给共享内核。 */
export async function createServer(root = process.cwd(), development = false, staticRoot?: string) {
  const store = await createStore(root);
  const server = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  // 本地 Web 只读取 Agent 生成的资产，不提供任何修改入口。
  server.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
      return reply
        .code(403)
        .send({ ok: false, error: { code: 'HOST', message: '仅允许本地访问' } });
    const origin = request.headers.origin;
    const allowed = [`http://${host}`, ...(development ? ['http://127.0.0.1:5173'] : [])];
    if (origin && !allowed.includes(origin))
      return reply
        .code(403)
        .send({ ok: false, error: { code: 'ORIGIN', message: '请求来源不被允许' } });
    const isCaseMutation =
      ['PATCH', 'DELETE'].includes(request.method) &&
      /^\/api\/cases\/[a-z0-9][a-z0-9-]{0,79}$/.test(request.url.split('?')[0]);
    const isReportMutation =
      ['PATCH', 'DELETE'].includes(request.method) &&
      /^\/api\/reports\/[a-z0-9][a-z0-9-]{0,79}(\/cases\/[a-z0-9][a-z0-9-]{0,79})?$/.test(
        request.url.split('?')[0],
      );
    if (!['GET', 'HEAD'].includes(request.method) && !isCaseMutation && !isReportMutation) {
      return reply.code(405).send({
        ok: false,
        error: { code: 'READ_ONLY', message: '本地页面仅用于查看测试资产与管理用例及报告' },
      });
    }
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
  });
  server.setErrorHandler((error: Error, _request, reply) => {
    const known = error instanceof CoreError;
    const status = known
      ? error.code === 'NOT_FOUND'
        ? 404
        : ['BUSY', 'CONFLICT'].includes(error.code)
          ? 409
          : 400
      : 500;
    reply.code(status).send({
      apiVersion: 1,
      ok: false,
      error: {
        code: known ? error.code : 'INTERNAL',
        message: known ? error.message : '本地服务读取或写入失败',
        details: known ? error.details : undefined,
      },
    });
  });
  server.get('/api/health', async () => ({ ok: true, service: 'casedock' }));
  server.get('/api/workspace', async () => store.getWorkspace());
  server.get('/api/schemas', async () => schemas);
  server.get('/api/cases', async () => store.listCases());
  server.get<{ Params: { id: string } }>('/api/cases/:id', async (request) =>
    store.getCase(request.params.id),
  );
  server.patch<{ Params: { id: string }; Body: { title?: string } }>(
    '/api/cases/:id',
    async (request) => {
      const title = request.body?.title;
      if (typeof title !== 'string') {
        throw new CoreError('VALIDATION', '请求体必须包含 title 字符串');
      }
      return store.renameCase(request.params.id, title);
    },
  );
  server.delete<{ Params: { id: string } }>('/api/cases/:id', async (request) => {
    await store.deleteCase(request.params.id);
    return { ok: true, deleted: request.params.id };
  });
  server.get('/api/runs', async () => store.listRuns());
  server.get<{ Params: { id: string } }>('/api/runs/:id', async (request) =>
    store.getRun(request.params.id),
  );
  server.get<{ Params: { runId: string; artifactId: string } }>(
    '/api/runs/:runId/artifacts/:artifactId',
    async (request, reply) => {
      const { artifact, bytes } = await store.readArtifact(
        request.params.runId,
        request.params.artifactId,
      );
      return reply
        .header('Content-Security-Policy', "default-src 'none'")
        .type(artifact.mime)
        .send(bytes);
    },
  );
  server.get('/api/reports', async () => store.listReports());
  server.get<{ Params: { id: string } }>('/api/reports/:id', async (request) =>
    store.getReport(request.params.id),
  );
  server.patch<{ Params: { id: string }; Body: { title?: string } }>(
    '/api/reports/:id',
    async (request) => {
      const title = request.body?.title;
      if (typeof title !== 'string') {
        throw new CoreError('VALIDATION', '请求体必须包含 title 字符串');
      }
      return store.renameReport(request.params.id, title);
    },
  );
  server.delete<{ Params: { id: string } }>('/api/reports/:id', async (request) => {
    await store.deleteReport(request.params.id);
    return { ok: true, deleted: request.params.id };
  });
  server.patch<{ Params: { id: string; caseId: string }; Body: { title?: string } }>(
    '/api/reports/:id/cases/:caseId',
    async (request) => {
      const title = request.body?.title;
      if (typeof title !== 'string') {
        throw new CoreError('VALIDATION', '请求体必须包含 title 字符串');
      }
      return store.updateReportCaseTitle(request.params.id, request.params.caseId, title);
    },
  );
  server.delete<{ Params: { id: string; caseId: string } }>(
    '/api/reports/:id/cases/:caseId',
    async (request) => {
      return store.deleteReportCase(request.params.id, request.params.caseId);
    },
  );
  server.get<{ Params: { id: string; filename: string } }>(
    '/api/reports/:id/evidence/:filename',
    async (request, reply) => {
      const { mime, bytes } = await store.readReportArtifact(
        request.params.id,
        request.params.filename,
      );
      return reply.header('Content-Security-Policy', "default-src 'none'").type(mime).send(bytes);
    },
  );
  // 源码构建时页面与运行器相邻；Skill 分发时页面位于 ../assets/ui。
  const candidates = [
    staticRoot,
    fileURLToPath(new URL('./ui/', import.meta.url)),
    fileURLToPath(new URL('../assets/ui/', import.meta.url)),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const uiRoot =
    candidates.find((candidate) => existsSync(resolve(candidate, 'index.html'))) ?? candidates[0];
  if (existsSync(resolve(uiRoot, 'index.html')))
    await server.register(fastifyStatic, { root: uiRoot });
  else
    server.get('/', async () => ({
      message: '开发模式请打开 http://127.0.0.1:5173 ，或先执行 npm run build。',
    }));
  return server;
}

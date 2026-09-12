import { randomBytes } from 'node:crypto';
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
  const token = randomBytes(32).toString('hex');
  const server = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  // 限制 Host/Origin，写入需要页面取得的会话令牌，避免其他网页驱动本地文件写入。
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
    if (
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      request.headers['x-casedock-token'] !== token
    ) {
      return reply
        .code(403)
        .send({ ok: false, error: { code: 'TOKEN', message: '本地会话已失效，请刷新页面' } });
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
  server.get('/api/session', async () => ({ token }));
  server.get('/api/schemas', async () => schemas);
  server.get('/api/cases', async () => store.listCases());
  server.get<{ Params: { id: string } }>('/api/cases/:id', async (request) =>
    store.getCase(request.params.id),
  );
  server.post('/api/cases', async (request) => store.saveCase(request.body));
  server.get('/api/runs', async () => store.listRuns());
  server.get<{ Params: { id: string } }>('/api/runs/:id', async (request) =>
    store.getRun(request.params.id),
  );
  server.post('/api/runs/start', async (request) => store.startRun(request.body));
  server.post('/api/runs/record', async (request) => store.recordStep(request.body));
  server.post('/api/runs/finish', async (request) => store.finishRun(request.body));
  server.post('/api/artifacts', async (request) => store.addArtifact(request.body));
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
  // 打包后的 CLI 与 ui 目录相邻；开发模式由 Vite 提供页面。
  const uiRoot = staticRoot ?? fileURLToPath(new URL('./ui/', import.meta.url));
  if (existsSync(resolve(uiRoot, 'index.html')))
    await server.register(fastifyStatic, { root: uiRoot });
  else
    server.get('/', async () => ({
      message: '开发模式请打开 http://127.0.0.1:5173 ，或先执行 npm run build。',
    }));
  return server;
}

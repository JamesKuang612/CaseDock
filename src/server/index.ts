import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { getWorkbenchStatus } from '../core/status.js';

export async function createServer() {
  const server = Fastify({ logger: true });
  server.get('/api/health', async () => ({ ok: true, service: 'casedock' }));
  server.get('/api/workbench', async () => getWorkbenchStatus());

  // The CLI is bundled into build/cli.js. During tsx development use Vite.
  const uiRoot = fileURLToPath(new URL('./ui/', import.meta.url));
  if (existsSync(resolve(uiRoot, 'index.html'))) {
    await server.register(fastifyStatic, { root: uiRoot });
  } else {
    server.get('/', async () => ({
      message: 'Use http://127.0.0.1:5173 during development, or run npm run build first.',
    }));
  }
  return server;
}

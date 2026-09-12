#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import open from 'open';
import { createServer } from './server/index.js';

function parsePort(value: string) {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('Port must be an integer.');
  const port = Number(value);
  if (port < 1 || port > 65535) throw new InvalidArgumentError('Port must be between 1 and 65535.');
  return port;
}

const cli = new Command()
  .name('casedock')
  .description('CaseDock — the local test asset workbench for your agent.');

cli.command('app')
  .description('Start the local workbench')
  .option('-p, --port <number>', 'Local server port', parsePort, 4310)
  .option('--no-open', 'Do not open a browser automatically')
  .action(async (options: { port: number; open: boolean }) => {
    const server = await createServer();
    const address = await server.listen({ host: '127.0.0.1', port: options.port });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => { void server.close().then(() => process.exit(0)); });
    }
    if (options.open) {
      try { await open(address); }
      catch { console.error(`Open ${address} in your browser.`); }
    }
  });

await cli.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

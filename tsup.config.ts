import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'build',
  clean: true,
  sourcemap: true,
});

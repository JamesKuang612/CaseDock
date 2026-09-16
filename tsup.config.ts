import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { casedock: 'src/cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'build',
  clean: true,
  sourcemap: false,
  splitting: false,
  noExternal: [/.*/],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  outExtension: () => ({ js: '.mjs' }),
  // 保留第三方依赖的必要许可文本，同时让单文件运行器可独立分发。
  esbuildOptions: (options) => {
    options.legalComments = 'eof';
  },
});

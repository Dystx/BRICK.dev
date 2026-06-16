import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'engine/worker': 'src/engine/worker.ts',
  },
  format: ['cjs', 'esm'],
  target: 'node18',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  shims: true,
  external: [
    '@swc/core',
    'commander',
    'chalk',
    'globby',
    'minimatch',
  ],
});

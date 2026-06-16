import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const BENCHMARK_PATH = resolve('tests/perf/large-codebase.ts');

describe('performance benchmark', () => {
  it('runs the large codebase benchmark successfully', () => {
    const result = spawnSync('pnpm', ['exec', 'tsx', BENCHMARK_PATH], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: process.env,
    });

    if (result.stdout) {
      console.log(result.stdout);
    }
    if (result.stderr) {
      console.error(result.stderr);
    }

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/PASS:/);
    expect(result.stdout).toMatch(/components=\d+\/\d+/);
    expect(result.stdout).toMatch(/issues=\d+/);
  });
});

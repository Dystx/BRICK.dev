import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { Worker } from 'node:worker_threads';
import { scanFile } from '../../src/engine/worker';
import { DEFAULT_CONFIG } from '../../src/config';
import { SEVERITY_WEIGHTS } from '../../src/engine/metrics';
import type { ResolvedConfig } from '../../src/types';

const fixture = (name: string) => join(__dirname, `../fixtures/${name}.tsx`);
const workerScript = resolve(__dirname, '../../dist/engine/worker.js');

function runWorker(data: unknown): Promise<unknown[]> {
  return new Promise((res, rej) => {
    const worker = new Worker(workerScript, { workerData: data, stderr: true });
    const messages: unknown[] = [];
    worker.stderr.on('data', () => {});
    worker.on('message', (msg) => messages.push(msg));
    worker.on('error', (err) => rej(err));
    worker.on('exit', (code) => {
      if (code === 0) {
        res(messages);
      } else {
        rej(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

describe('scanFile', () => {
  it('returns a FileScanResult for a valid TSX file', async () => {
    const result = await scanFile(fixture('sample'), DEFAULT_CONFIG);

    expect(result.parseError).toBeUndefined();
    expect(result.filePath).toBe(fixture('sample'));
    expect(result.componentCount).toBeGreaterThan(0);
    expect(result.astNodeCount).toBeGreaterThan(0);
    const ruleIds = result.issues.map((i) => i.ruleId).sort();
    expect(ruleIds).toContain('logic/boundary-violation');
    expect(ruleIds).toContain('wcag/target-size');
    expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
  });

  it('returns a parseError for a malformed file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slop-audit-worker-test-'));
    const file = join(dir, 'bad.tsx');
    writeFileSync(file, `export function Button() { return <button>`);

    try {
      const result = await scanFile(file, DEFAULT_CONFIG);

      expect(result.parseError).toBeDefined();
      expect(result.componentCount).toBe(0);
      expect(result.astNodeCount).toBe(0);
      expect(result.issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('config.rules runtime behavior', () => {
  it('disabling a rule via config removes its issues', async () => {
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      rules: { ...DEFAULT_CONFIG.rules, 'logic/boundary-violation': 'off' },
    };
    const result = await scanFile(fixture('sample'), config);

    expect(result.issues.some((issue) => issue.ruleId === 'logic/boundary-violation')).toBe(false);
    expect(result.issues.some((issue) => issue.ruleId === 'wcag/target-size')).toBe(true);
  });

  it('overriding severity via config changes issue severity and scoring weight', async () => {
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      rules: { ...DEFAULT_CONFIG.rules, 'wcag/target-size': 'low' },
    };
    const result = await scanFile(fixture('sample'), config);

    const targetIssues = result.issues.filter((issue) => issue.ruleId === 'wcag/target-size');
    expect(targetIssues.length).toBeGreaterThan(0);
    expect(targetIssues.every((issue) => issue.severity === 'low')).toBe(true);

    const totalWeight = targetIssues.reduce(
      (sum, issue) => sum + SEVERITY_WEIGHTS[issue.severity],
      0,
    );
    expect(totalWeight).toBe(targetIssues.length * SEVERITY_WEIGHTS['low']);
  });
});

describe('worker thread validation', () => {
  it('throws when workerData is not an object', async () => {
    await expect(runWorker(null)).rejects.toThrow();
    await expect(runWorker('not-an-object')).rejects.toThrow();
  });

  it('throws when filePaths is not an array', async () => {
    await expect(
      runWorker({ filePaths: 'not-an-array', config: DEFAULT_CONFIG }),
    ).rejects.toThrow();
  });

  it('throws when filePaths contains non-string elements', async () => {
    await expect(
      runWorker({ filePaths: ['Button.tsx', 42], config: DEFAULT_CONFIG }),
    ).rejects.toThrow();
  });

  it('throws when config is not a non-array object', async () => {
    await expect(runWorker({ filePaths: ['Button.tsx'], config: null })).rejects.toThrow();
    await expect(runWorker({ filePaths: ['Button.tsx'], config: [] })).rejects.toThrow();
  });
});

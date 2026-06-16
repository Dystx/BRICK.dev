import { describe, expect, it } from 'vitest';
import { WorkerPool } from '../../src/engine/pool';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { DEFAULT_CONFIG } from '../../src/config';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-pool-test-'));

describe('WorkerPool', () => {
  it('scans multiple files round-robin', async () => {
    const dir = createTmpDir();
    try {
      const files: string[] = [];
      for (let i = 0; i < 4; i++) {
        const file = join(dir, `Comp${i}.tsx`);
        writeFileSync(file, `export function Comp${i}() { return <div>${i}</div>; }`);
        files.push(file);
      }
      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 2,
        workerScript: resolve(__dirname, '../../dist/engine/worker.js'),
      });
      const results = await pool.scan(files);
      expect(results.length).toBe(4);
      expect(results.every((r) => r.componentCount > 0)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when threadCount is 0', () => {
    expect(() => new WorkerPool({ config: DEFAULT_CONFIG, threadCount: 0 })).toThrow(
      'threadCount must be > 0',
    );
  });

  it('respawns a crashed worker and continues scanning remaining files', async () => {
    const dir = createTmpDir();
    try {
      const badFile = join(dir, '__slop_audit_crash__.tsx');
      const goodFile1 = join(dir, 'Good1.tsx');
      const goodFile2 = join(dir, 'Good2.tsx');
      writeFileSync(badFile, 'export function Bad() { return <div>bad</div>; }');
      writeFileSync(goodFile1, 'export function Good1() { return <div>good1</div>; }');
      writeFileSync(goodFile2, 'export function Good2() { return <div>good2</div>; }');

      const pool = new WorkerPool({
        config: DEFAULT_CONFIG,
        threadCount: 1,
        workerScript: resolve(__dirname, '../../dist/engine/worker.js'),
      });
      const results = await pool.scan([badFile, goodFile1, goodFile2]);

      expect(results.length).toBe(3);
      const badResult = results.find((r) => r.filePath === badFile);
      const goodResults = results.filter((r) => r.filePath !== badFile);
      expect(badResult).toBeDefined();
      expect(badResult?.parseError).toContain('PARSE_ERROR');
      expect(goodResults.length).toBe(2);
      expect(goodResults.every((r) => r.componentCount > 0)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

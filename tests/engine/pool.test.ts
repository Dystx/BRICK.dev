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
});

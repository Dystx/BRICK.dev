import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/engine/parser';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-parser-test-'));

describe('parseFile', () => {
  it('parses a TSX file', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Button.tsx');
      writeFileSync(file, `export function Button() { return <button>Hi</button>; }`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on invalid syntax', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'bad.tsx');
      writeFileSync(file, `export function Button() { return <button>`);
      await expect(parseFile(file)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

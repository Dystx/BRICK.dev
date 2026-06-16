import { describe, expect, it, vi } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../src/config';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-config-test-'));

describe('loadConfig', () => {
  it('returns default config when no config file exists', async () => {
    const dir = createTmpDir();
    try {
      const config = await loadConfig(dir);
      expect(config.include).toEqual(DEFAULT_CONFIG.include);
      expect(config.thresholds.meanSlop).toBe(25);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads an ESM config file', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'slop-audit.config.mjs'),
        `export default { thresholds: { meanSlop: 10 } };`,
      );
      const config = await loadConfig(dir);
      expect(config.thresholds.meanSlop).toBe(10);
      expect(config.include).toEqual(DEFAULT_CONFIG.include);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a CJS config file', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'slop-audit.config.cjs'),
        `module.exports = { thresholds: { meanSlop: 15 } };`,
      );
      const config = await loadConfig(dir);
      expect(config.thresholds.meanSlop).toBe(15);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds config in a parent directory', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'slop-audit.config.mjs'),
        `export default { thresholds: { meanSlop: 20 } };`,
      );
      const nested = join(dir, 'packages', 'app');
      mkdirSync(nested, { recursive: true });
      const config = await loadConfig(nested);
      expect(config.thresholds.meanSlop).toBe(20);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a .js config via require in a CJS package', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
      writeFileSync(
        join(dir, 'slop-audit.config.js'),
        `module.exports = { thresholds: { meanSlop: 30 } };`,
      );
      const config = await loadConfig(dir);
      expect(config.thresholds.meanSlop).toBe(30);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a .js config via import in an ESM package', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
      writeFileSync(
        join(dir, 'slop-audit.config.js'),
        `export default { thresholds: { meanSlop: 35 } };`,
      );
      const config = await loadConfig(dir);
      expect(config.thresholds.meanSlop).toBe(35);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('merges rule severity overrides from config file', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'slop-audit.config.mjs'),
        `export default { rules: { 'wcag/target-size': 'low' } };`,
      );
      const config = await loadConfig(dir);
      expect(config.rules['wcag/target-size']).toBe('low');
      expect(config.rules['logic/boundary-violation']).toBe('high');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns about unknown rule IDs but keeps them', async () => {
    const dir = createTmpDir();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      writeFileSync(
        join(dir, 'slop-audit.config.mjs'),
        `export default { rules: { 'unknown/rule': 'low', 'visual/arbitrary-escape': 'high' } };`,
      );
      const config = await loadConfig(dir);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown rule ID "unknown/rule"'),
      );
      expect(config.rules['unknown/rule']).toBe('low');
      expect(config.rules['visual/arbitrary-escape']).toBe('high');
    } finally {
      warnSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads an explicit config path', async () => {
    const dir = createTmpDir();
    try {
      writeFileSync(
        join(dir, 'custom.config.mjs'),
        `export default { thresholds: { meanSlop: 42 } };`,
      );
      const config = await loadConfig(dir, 'custom.config.mjs');
      expect(config.thresholds.meanSlop).toBe(42);
      expect(config.include).toEqual(DEFAULT_CONFIG.include);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads an explicit config path outside cwd', async () => {
    const dir = createTmpDir();
    try {
      const parent = createTmpDir();
      writeFileSync(
        join(parent, 'shared.config.mjs'),
        `export default { thresholds: { meanSlop: 99 } };`,
      );
      const config = await loadConfig(dir, join(parent, 'shared.config.mjs'));
      expect(config.thresholds.meanSlop).toBe(99);
      rmSync(parent, { recursive: true, force: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

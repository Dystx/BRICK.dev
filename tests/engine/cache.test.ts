import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  baselinePath,
  hashConfig,
  loadBaseline,
  saveBaseline,
  tightenBaseline,
  validateBaseline,
} from '../../src/engine/cache';
import { DEFAULT_CONFIG } from '../../src/config';
import type { BaselineCache, ResolvedConfig } from '../../src/types';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-cache-test-'));

const makeCache = (overrides: Partial<BaselineCache> = {}): BaselineCache => ({
  version: '1.0.0',
  config_hash: 'abc123',
  git_head: 'def456',
  baseline_created: new Date().toISOString(),
  baseline_revision: 1,
  totalComponentCount: 2,
  scores: {
    'Button.tsx': { baselineScore: 10, componentCount: 1 },
    'Card.tsx': { baselineScore: 20, componentCount: 1 },
  },
  ...overrides,
});

describe('cache', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = createTmpDir();
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('computes baselinePath under .slop-audit/cache', () => {
    expect(baselinePath(projectPath)).toBe(join(projectPath, '.slop-audit', 'cache', 'baseline.json'));
  });

  it('saveBaseline creates dirs and loadBaseline roundtrips', () => {
    const cache = makeCache();
    saveBaseline(projectPath, cache);
    const loaded = loadBaseline(projectPath);
    expect(loaded).toEqual(cache);
  });

  it('loadBaseline returns undefined when cache is missing', () => {
    expect(loadBaseline(projectPath)).toBeUndefined();
  });

  it('tightenBaseline multiplies scores by 0.9 and increments revision', () => {
    const cache = makeCache();
    const tightened = tightenBaseline(cache);
    expect(tightened.baseline_revision).toBe(cache.baseline_revision + 1);
    expect(tightened.scores['Button.tsx'].baselineScore).toBe(9);
    expect(tightened.scores['Card.tsx'].baselineScore).toBe(18);
    expect(tightened.totalComponentCount).toBe(cache.totalComponentCount);
  });

  it('tightenBaseline preserves component counts', () => {
    const cache = makeCache();
    const tightened = tightenBaseline(cache);
    expect(tightened.scores['Button.tsx'].componentCount).toBe(1);
    expect(tightened.scores['Card.tsx'].componentCount).toBe(1);
  });

  it('validateBaseline passes when hash and head match', () => {
    const cache = makeCache({ config_hash: 'hash1', git_head: 'head1' });
    expect(validateBaseline(cache, 'hash1', 'head1')).toEqual({ valid: true });
  });

  it('validateBaseline fails on config_hash mismatch', () => {
    const cache = makeCache({ config_hash: 'hash1', git_head: 'head1' });
    expect(validateBaseline(cache, 'other', 'head1')).toEqual({
      valid: false,
      reason: 'config_hash mismatch',
    });
  });

  it('validateBaseline fails on git_head mismatch', () => {
    const cache = makeCache({ config_hash: 'hash1', git_head: 'head1' });
    expect(validateBaseline(cache, 'hash1', 'other')).toEqual({
      valid: false,
      reason: 'git_head mismatch',
    });
  });

  it('hashConfig is stable for DEFAULT_CONFIG', () => {
    const hash1 = hashConfig(DEFAULT_CONFIG);
    const hash2 = hashConfig(DEFAULT_CONFIG);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashConfig changes when a regex in arbitraryValueAllowlist changes', () => {
    const baseHash = hashConfig(DEFAULT_CONFIG);
    const modified: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      arbitraryValueAllowlist: [
        ...DEFAULT_CONFIG.arbitraryValueAllowlist.filter((item) => !(item instanceof RegExp)),
        /^w-\[calc\(.*\)\]$/,
      ],
    };
    const modifiedHash = hashConfig(modified);
    expect(modifiedHash).not.toBe(baseHash);
  });

  it('loadBaseline returns undefined and does not throw for invalid JSON', () => {
    saveBaseline(projectPath, makeCache());
    const path = baselinePath(projectPath);
    writeFileSync(path, '{ not json');
    expect(loadBaseline(projectPath)).toBeUndefined();
  });

  it('loadBaseline does not reject a version-mismatched cache', () => {
    const cache = makeCache({ version: '0.0.0' });
    saveBaseline(projectPath, cache);
    expect(loadBaseline(projectPath)).toEqual(cache);
  });

  it('loadBaseline returns undefined when required fields are missing', () => {
    saveBaseline(projectPath, makeCache());
    const path = baselinePath(projectPath);
    writeFileSync(path, JSON.stringify({ version: '1.0.0' }));
    expect(loadBaseline(projectPath)).toBeUndefined();
  });

  it('validateBaseline is fatal on major version mismatch', () => {
    const cache = makeCache({ version: '0.0.0' });
    expect(validateBaseline(cache, cache.config_hash, cache.git_head)).toEqual({
      valid: false,
      fatal: true,
      reason: 'baseline major version mismatch (0.0.0 vs 1.0.0)',
    });
  });

  it('validateBaseline warns but accepts minor/patch version mismatch', () => {
    const cache = makeCache({ version: '1.0.1' });
    expect(validateBaseline(cache, cache.config_hash, cache.git_head)).toEqual({
      valid: true,
      warning: true,
      reason: 'baseline minor/patch version mismatch (1.0.1 vs 1.0.0)',
    });
  });
});

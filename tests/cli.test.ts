import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertDistBuilt,
  cleanupTempDir,
  createTmpDir,
  run,
  workerScript,
} from './helpers/cli';
import {
  colorForSlop,
  formatBadge,
  thresholdExceeded,
  filterIssues,
  serializeConfig,
  scanProject,
  DEFAULT_CONFIG,
} from '../src/index';
import type { Issue, ProjectReport, ResolvedConfig } from '../src/types';

beforeAll(assertDistBuilt);

const issue = (overrides: Partial<Issue> & Pick<Issue, 'aiSpecific' | 'category' | 'severity'>): Issue => ({
  ruleId: 'test/rule',
  message: 'test issue',
  line: 1,
  column: 1,
  ...overrides,
});

const makeReport = (
  overrides: Partial<ProjectReport> = {},
  generatedAt = '2024-01-01T00:00:00.000Z',
): ProjectReport => ({
  version: '1.0.0',
  generatedAt,
  slopIndex: 10,
  assemblyHealth: 90,
  categoryScores: {
    visual: 0,
    typo: 0,
    wcag: 0,
    layout: 0,
    component: 0,
    logic: 0,
    arch: 0,
    perf: 0,
  },
  p90Score: 15,
  peakScore: 20,
  componentCount: 2,
  components: [
    {
      filePath: 'A.tsx',
      rawScore: 5,
      componentScore: 5,
      adjustedScore: 5,
      componentCount: 1,
    },
    {
      filePath: 'B.tsx',
      rawScore: 3,
      componentScore: 3,
      adjustedScore: 3,
      componentCount: 1,
    },
  ],
  issues: [],
  ...overrides,
});

describe('colorForSlop', () => {
  it('returns green for slop index below 25', () => {
    expect(colorForSlop(0)).toBe('green');
    expect(colorForSlop(24.9)).toBe('green');
  });

  it('returns yellow for slop index between 25 and 50', () => {
    expect(colorForSlop(25)).toBe('yellow');
    expect(colorForSlop(49.9)).toBe('yellow');
  });

  it('returns red for slop index 50 or above', () => {
    expect(colorForSlop(50)).toBe('red');
    expect(colorForSlop(100)).toBe('red');
  });
});

describe('formatBadge', () => {
  it('produces a shields.io markdown badge', () => {
    const report = makeReport({ slopIndex: 34.2 });
    const badge = formatBadge(report);
    expect(badge).toContain('https://img.shields.io/badge/slop--index-34-yellow');
    expect(badge).toContain('[![');
  });

  it('uses red color for high slop index', () => {
    const report = makeReport({ slopIndex: 75 });
    const badge = formatBadge(report);
    expect(badge).toContain('red');
  });

  it('matches badge color to rounded slop index', () => {
    expect(formatBadge(makeReport({ slopIndex: 24.4 }))).toContain('slop--index-24-green');
    expect(formatBadge(makeReport({ slopIndex: 25 }))).toContain('slop--index-25-yellow');
    expect(formatBadge(makeReport({ slopIndex: 49.9 }))).toContain('slop--index-50-red');
  });
});

describe('thresholdExceeded', () => {
  const config: ResolvedConfig = {
    ...DEFAULT_CONFIG,
    thresholds: {
      meanSlop: 25,
      p90Slop: 50,
      individualSlopThreshold: 50,
    },
  };

  it('returns false when all thresholds are respected', () => {
    const report = makeReport({ slopIndex: 20, p90Score: 40, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(false);
  });

  it('returns true when slop index exceeds mean threshold', () => {
    const report = makeReport({ slopIndex: 26, p90Score: 40, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(true);
  });

  it('returns true when p90 exceeds threshold', () => {
    const report = makeReport({ slopIndex: 20, p90Score: 51, peakScore: 45 });
    expect(thresholdExceeded(report, config)).toBe(true);
  });

  it('returns true when peak exceeds threshold', () => {
    const report = makeReport({ slopIndex: 20, p90Score: 40, peakScore: 51 });
    expect(thresholdExceeded(report, config)).toBe(true);
  });
});

describe('filterIssues', () => {
  const issues: Issue[] = [
    issue({ aiSpecific: true, category: 'logic', severity: 'high' }),
    issue({ aiSpecific: false, category: 'layout', severity: 'medium' }),
    issue({ aiSpecific: false, category: 'wcag', severity: 'high' }),
  ];

  it('keeps only AI-specific issues with --ai-only', () => {
    const filtered = filterIssues(issues, { aiOnly: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].aiSpecific).toBe(true);
  });

  it('keeps only human issues with --human-only', () => {
    const filtered = filterIssues(issues, { humanOnly: true });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => !i.aiSpecific)).toBe(true);
  });

  it('removes wcag issues with --ignore-wcag22', () => {
    const filtered = filterIssues(issues, { ignoreWcag22: true });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.category !== 'wcag')).toBe(true);
  });

  it('applies filters sequentially', () => {
    const filtered = filterIssues(issues, { aiOnly: true, ignoreWcag22: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('logic');
  });
});

describe('serializeConfig', () => {
  it('produces a valid ESM default export', () => {
    const serialized = serializeConfig(DEFAULT_CONFIG);
    expect(serialized.startsWith('export default')).toBe(true);
    expect(serialized).toContain('"include"');
    expect(serialized).toContain('"rules"');
  });

  it('serializes regex allowlist entries as new RegExp expressions', () => {
    const serialized = serializeConfig(DEFAULT_CONFIG);
    expect(serialized).toContain('new RegExp(');
    expect(serialized).toContain('"w-full"');
  });
});

describe('scanProject', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('returns a report for an empty project', async () => {
    const report = await scanProject({ cwd: dir, workerScript });
    expect(report.version).toBe('1.0.0');
    expect(report.slopIndex).toBe(0);
    expect(report.assemblyHealth).toBe(100);
    expect(report.issues).toEqual([]);
    expect(report.components).toEqual([]);
  });

  it('discovers and scans source files', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Button.tsx'), 'export function Button() { return <div>hi</div>; }');
    const report = await scanProject({ cwd: dir, workerScript });
    expect(report.components.length).toBeGreaterThan(0);
    expect(report.componentCount).toBeGreaterThan(0);
  });
});

describe('--threads validation', () => {
  it('rejects non-positive values with an error', async () => {
    const dir = createTmpDir();
    try {
      const { exitCode, stderr } = await run(['--threads', '0', '--json', '--workspace', dir]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/positive integer/i);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe('unimplemented flag skeletons', () => {
  it('--watch prints a warning and exits cleanly without scanning', async () => {
    const dir = createTmpDir();
    try {
      const { exitCode, stdout, stderr } = await run(['--watch', '--workspace', dir]);
      expect(exitCode).toBe(0);
      expect(stderr).toMatch(/--watch is not implemented/i);
      expect(stdout).toBe('');
      expect(stderr).not.toMatch(/scan took/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('--fix prints a warning and exits cleanly without scanning', async () => {
    const dir = createTmpDir();
    try {
      const { exitCode, stdout, stderr } = await run(['--fix', '--workspace', dir]);
      expect(exitCode).toBe(0);
      expect(stderr).toMatch(/--fix is not implemented/i);
      expect(stdout).toBe('');
      expect(stderr).not.toMatch(/scan took/i);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

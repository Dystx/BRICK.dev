import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendRun, clearLog, logPath, readRuns } from '../../src/engine/memory';
import type { ProjectReport } from '../../src/types';

function createReport(overrides?: Partial<ProjectReport>): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    slopIndex: 34,
    assemblyHealth: 66,
    categoryScores: {
      visual: 40,
      typo: 20,
      motion: 0,
      wcag: 10,
      layout: 30,
      component: 15,
      logic: 5,
      arch: 0,
      perf: 0,
    },
    p90Score: 60,
    peakScore: 80,
    componentCount: 5,
    components: [],
    issues: [
      {
        ruleId: 'wcag/target-size',
        category: 'wcag',
        severity: 'high',
        aiSpecific: false,
        message: 'Interactive element has no sizing tokens.',
        line: 1,
        column: 1,
      },
      {
        ruleId: 'visual/arbitrary-escape',
        category: 'visual',
        severity: 'medium',
        aiSpecific: true,
        message: 'Arbitrary layout value.',
        line: 2,
        column: 5,
      },
    ],
    ...overrides,
  };
}

describe('project memory log', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slop-audit-memory-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends a run to the log', () => {
    const report = createReport();
    appendRun(dir, report);

    const runs = readRuns(dir);
    expect(runs).toHaveLength(1);
    expect(runs[0].slopIndex).toBe(34);
    expect(runs[0].version).toBe('1.0.0');
    expect(runs[0].topOffenseIds).toContain('wcag/target-size');
    expect(runs[0].thresholdExceeded).toBe(false);
  });

  it('flags thresholdExceeded when meanSlop is exceeded', () => {
    const report = createReport({ slopIndex: 60 });
    appendRun(dir, report, { thresholds: { meanSlop: 25 } });

    const runs = readRuns(dir);
    expect(runs[0].thresholdExceeded).toBe(true);
  });

  it('flags thresholdExceeded when individualSlopThreshold is exceeded', () => {
    const report = createReport({
      components: [
        {
          filePath: 'Button.tsx',
          rawScore: 10,
          componentScore: 60,
          adjustedScore: 60,
          componentCount: 1,
        },
      ],
    });
    appendRun(dir, report, { thresholds: { individualSlopThreshold: 50 } });

    const runs = readRuns(dir);
    expect(runs[0].thresholdExceeded).toBe(true);
  });

  it('keeps the most recent runs when the log exceeds the cap', () => {
    for (let i = 0; i < 1002; i++) {
      appendRun(dir, createReport({ slopIndex: i }));
    }

    const runs = readRuns(dir);
    expect(runs).toHaveLength(1000);
    expect(runs[0].slopIndex).toBe(2);
    expect(runs[runs.length - 1].slopIndex).toBe(1001);
  });

  it('clears the log', () => {
    appendRun(dir, createReport());
    expect(readRuns(dir)).toHaveLength(1);

    clearLog(dir);
    expect(readRuns(dir)).toHaveLength(0);
  });

  it('creates the log under .slop-audit/log.json', () => {
    appendRun(dir, createReport());
    expect(logPath(dir)).toBe(join(dir, '.slop-audit', 'log.json'));
  });

  it('ignores malformed log files', () => {
    mkdirSync(join(dir, '.slop-audit'), { recursive: true });
    writeFileSync(join(dir, '.slop-audit', 'log.json'), 'not json');

    expect(readRuns(dir)).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { BaselineCache, ComponentScore, ResolvedConfig } from '../src/types';
import { stagedVirtualMeanThresholdExceeded } from '../src/engine/metrics';

function makeConfig(
  meanSlop: number,
  individualSlopThreshold = 50,
  p90Slop = 50,
): ResolvedConfig {
  return {
    include: ['src/**/*.{ts,tsx,js,jsx}'],
    exclude: [],
    rules: {},
    frameworkMultipliers: { react: 1 },
    ruleConfig: {},
    contextTaxCaps: { cleanCap: 1.5, standardCap: 2 },
    thresholds: { meanSlop, p90Slop, individualSlopThreshold },
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
  };
}

function makeScore(overrides: Partial<ComponentScore> = {}): ComponentScore {
  return {
    filePath: 'src/Multi.tsx',
    rawScore: 0,
    componentScore: 0,
    adjustedScore: 0,
    componentCount: 1,
    ...overrides,
  };
}

function makeBaseline(overrides: Partial<BaselineCache> = {}): BaselineCache {
  return {
    version: '1.0.0',
    config_hash: 'hash',
    git_head: 'head',
    baseline_created: new Date().toISOString(),
    baseline_revision: 0,
    totalComponentCount: 1,
    scores: { 'src/Existing.tsx': { baselineScore: 0, componentCount: 1 } },
    ...overrides,
  };
}

describe('stagedVirtualMeanThresholdExceeded', () => {
  it('computes a size-normalized virtual slop index from component counts', () => {
    // Baseline has 5 components; staged new file adds 5 components with slop 50.
    // virtualN = 5 + 5 = 10; mean = 50 / 10 = 5; normalization for 10 = 1.0.
    const baseline = makeBaseline({ totalComponentCount: 5 });
    const stagedScores = [makeScore({ componentCount: 5, adjustedScore: 50 })];
    const config = makeConfig(4);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config, process.cwd());

    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('mean');
    expect(result.hypotheticalSlopIndex).toBe(5);
  });

  it('applies size normalization when virtualN exceeds 10', () => {
    const baseline = makeBaseline({
      totalComponentCount: 20,
      scores: { 'src/Existing.tsx': { baselineScore: 0, componentCount: 20 } },
    });
    const stagedScores = [makeScore({ componentCount: 100, adjustedScore: 1000 })];
    const config = makeConfig(5);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config, process.cwd());

    // virtualN = 120; mean = 1000 / 120 ≈ 8.33; normalization(120) ≈ 0.52.
    expect(result.hypotheticalSlopIndex).toBeCloseTo(4.34, 2);
    expect(result.exceeded).toBe(true);
  });

  it('replaces modified baseline entries using component count delta', () => {
    // A modified file is represented both in the baseline and in stagedScores.
    // Its cached component count is replaced by the current staged count.
    const baseline = makeBaseline({
      totalComponentCount: 2,
      scores: {
        'src/Existing.tsx': { baselineScore: 4, componentCount: 1 },
        'src/Modified.tsx': { baselineScore: 8, componentCount: 1 },
      },
    });
    const stagedScores = [makeScore({ filePath: 'src/Modified.tsx', adjustedScore: 2, componentCount: 3 })];
    const config = makeConfig(5);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config, process.cwd());

    // virtualN = 2 + (3 - 1) = 4; numerator = 2; mean = 0.5; normalization(4) = 1.0.
    expect(result.exceeded).toBe(false);
    expect(result.hypotheticalSlopIndex).toBe(0.5);
  });

  it('subtracts deleted staged components from virtualN', () => {
    const baseline = makeBaseline({
      totalComponentCount: 10,
      scores: {
        'src/Existing.tsx': { baselineScore: 0, componentCount: 5 },
        'src/Deleted.tsx': { baselineScore: 0, componentCount: 5 },
      },
    });
    const stagedScores = [makeScore({ filePath: 'src/New.tsx', componentCount: 5, adjustedScore: 30 })];
    const config = makeConfig(2);

    const result = stagedVirtualMeanThresholdExceeded(
      stagedScores,
      baseline,
      config,
      process.cwd(),
      ['src/New.tsx', 'src/Deleted.tsx'],
    );

    // virtualN = 10 + 5 - 5 = 10; mean = 30 / 10 = 3; normalization(10) = 1.0.
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('mean');
    expect(result.hypotheticalSlopIndex).toBe(3);
  });

  it('degrades to individual gating when virtualN is <= 0', () => {
    const baseline = makeBaseline({
      totalComponentCount: 1,
      scores: { 'src/Deleted.tsx': { baselineScore: 0, componentCount: 1 } },
    });
    const stagedScores = [makeScore({ filePath: 'src/Deleted.tsx', adjustedScore: 10, componentCount: 0 })];
    const config = makeConfig(100, 5);

    const result = stagedVirtualMeanThresholdExceeded(
      stagedScores,
      baseline,
      config,
      process.cwd(),
      ['src/Deleted.tsx'],
    );

    // virtualN = 1 + 0 - 1 = 0, so individual gating applies.
    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('individual');
  });

  it('rejects when the virtual p90 score exceeds the threshold', () => {
    const baseline = makeBaseline();
    const stagedScores = [makeScore({ adjustedScore: 60 })];
    // Keep meanSlop and individualSlopThreshold high so only the p90 check fires.
    const config = makeConfig(100, 100, 50);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config, process.cwd());

    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('p90');
  });

  it('rejects when an individual staged score exceeds the threshold', () => {
    const baseline = makeBaseline();
    const stagedScores = [makeScore({ adjustedScore: 60 })];
    // Keep meanSlop and p90Slop high so the individual check fires.
    const config = makeConfig(100, 50, 100);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config, process.cwd());

    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('individual');
  });

  it('does not reject when both mean and individual are within thresholds', () => {
    const baseline = makeBaseline({ totalComponentCount: 9 });
    const stagedScores = [makeScore({ adjustedScore: 5 })];
    const config = makeConfig(25, 50);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config, process.cwd());

    expect(result.exceeded).toBe(false);
  });

  it('returns not exceeded when there are no staged scores', () => {
    const baseline = makeBaseline();
    const config = makeConfig(25);

    const result = stagedVirtualMeanThresholdExceeded([], baseline, config, process.cwd());

    expect(result.exceeded).toBe(false);
  });
});

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
    baseline_revision: 1,
    totalComponentCount: 1,
    scores: { 'src/Existing.tsx': { baselineScore: 0, componentCount: 1 } },
    ...overrides,
  };
}

describe('stagedVirtualMeanThresholdExceeded', () => {
  it('computes a size-normalized virtual slop index from file counts', () => {
    // One baseline file + one staged file. Raw mean = 10 / 2 = 5.
    // With 6 total components, sizeNormalization returns 1.0, so the virtual
    // slop index equals the raw mean.
    const baseline = makeBaseline({ totalComponentCount: 1 });
    const stagedScores = [makeScore({ componentCount: 5, adjustedScore: 10 })];
    const config = makeConfig(3);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config);

    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('mean');
    expect(result.hypotheticalSlopIndex).toBe(5);
  });

  it('applies size normalization when total components exceed 10', () => {
    const baseline = makeBaseline({
      totalComponentCount: 10,
      scores: { 'src/Existing.tsx': { baselineScore: 0, componentCount: 10 } },
    });
    const stagedScores = [makeScore({ componentCount: 100, adjustedScore: 100 })];
    const config = makeConfig(10);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config);

    // Raw mean = 100 / 2 = 50. Normalization for 110 components is < 1,
    // so the gate should compare a lower normalized value.
    expect(result.hypotheticalSlopIndex).toBeCloseTo(25.57, 2);
  });

  it('deduplicates staged files that overlap with the baseline', () => {
    // A modified file is represented both in the baseline and in stagedScores.
    // It should only count once, using the current staged score.
    const baseline = makeBaseline({
      totalComponentCount: 2,
      scores: {
        'src/Existing.tsx': { baselineScore: 4, componentCount: 1 },
        'src/Modified.tsx': { baselineScore: 8, componentCount: 1 },
      },
    });
    const stagedScores = [makeScore({ filePath: 'src/Modified.tsx', adjustedScore: 2, componentCount: 1 })];
    const config = makeConfig(5);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config);

    // Without deduplication, sum = 4 + 8 + 2 = 14 over 3 files => mean 7.
    // With deduplication, sum = 4 + 2 = 6 over 2 files => mean 3.
    expect(result.exceeded).toBe(false);
    expect(result.hypotheticalSlopIndex).toBe(3);
  });

  it('rejects when the virtual p90 score exceeds the threshold', () => {
    const baseline = makeBaseline();
    const stagedScores = [makeScore({ adjustedScore: 60 })];
    // Keep meanSlop and individualSlopThreshold high so only the p90 check fires.
    const config = makeConfig(100, 100, 50);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config);

    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('p90');
  });

  it('rejects when an individual staged score exceeds the threshold', () => {
    const baseline = makeBaseline();
    const stagedScores = [makeScore({ adjustedScore: 60 })];
    // Keep meanSlop and p90Slop high so the individual check fires.
    const config = makeConfig(100, 50, 100);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config);

    expect(result.exceeded).toBe(true);
    expect(result.reason).toBe('individual');
  });

  it('does not reject when both mean and individual are within thresholds', () => {
    const baseline = makeBaseline({ totalComponentCount: 9 });
    const stagedScores = [makeScore({ adjustedScore: 5 })];
    const config = makeConfig(25, 50);

    const result = stagedVirtualMeanThresholdExceeded(stagedScores, baseline, config);

    expect(result.exceeded).toBe(false);
  });

  it('returns not exceeded when there are no staged scores', () => {
    const baseline = makeBaseline();
    const config = makeConfig(25);

    const result = stagedVirtualMeanThresholdExceeded([], baseline, config);

    expect(result.exceeded).toBe(false);
  });
});

import { relative, resolve } from 'node:path';
import type {
  BaselineCache,
  Category,
  ComponentScore,
  FileScanResult,
  ProjectReport,
  ResolvedConfig,
  Severity,
} from '../types';

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  low: 1,
  medium: 3,
  high: 5,
};

export function contextTax(
  nodeCount: number,
  hasHighSeverity: boolean,
  caps: { cleanCap: number; standardCap: number },
): number {
  const base = 1 + Math.log(1 + Math.max(0, nodeCount - 100)) / Math.log(2500);
  const cap = hasHighSeverity ? caps.standardCap : caps.cleanCap;
  return Math.min(base, cap);
}

export function sizeNormalization(componentCount: number): number {
  if (componentCount === 0) return 0;
  if (componentCount <= 10) return 1.0;
  return Math.min(1, Math.log10(1 + componentCount) / Math.log10(10001));
}

export function p90(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.9 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function resolveFrameworkMultiplier(config: ResolvedConfig): number {
  const framework = config.framework ?? 'react';
  return config.frameworkMultipliers[framework] ?? 1.0;
}

function baselineKey(filePath: string, cwd?: string): string {
  if (!cwd) return filePath;
  return relative(cwd, filePath);
}

export function scoreFile(
  result: FileScanResult,
  frameworkMultiplier: number,
  config: ResolvedConfig,
  baseline?: BaselineCache,
  cwd?: string,
): ComponentScore {
  const rawScore = result.issues.reduce(
    (sum, issue) => sum + SEVERITY_WEIGHTS[issue.severity],
    0,
  );
  const hasHighSeverity = result.issues.some((issue) => issue.severity === 'high');
  const tax = contextTax(result.astNodeCount, hasHighSeverity, config.contextTaxCaps);
  const componentScore = Math.min(100, rawScore * frameworkMultiplier * tax);
  const key = baselineKey(result.filePath, cwd);
  const baselineScore = baseline?.scores[key]?.baselineScore ?? 0;
  const adjustedScore = baseline ? Math.max(0, componentScore - baselineScore) : componentScore;

  return {
    filePath: result.filePath,
    rawScore,
    componentScore,
    adjustedScore,
    componentCount: result.componentCount,
  };
}

function normalizePath(path: string, cwd: string): string {
  return relative(cwd, resolve(cwd, path));
}

/**
 * Compute the hypothetical slop index if the staged files were merged with the
 * baseline using the component-count-based VirtualN formula from the spec.
 *
 * virtualN = cachedTotalComponentCount
 *            + newStagedComponentCount
 *            - deletedStagedComponentCount
 *            + sum(modifiedFile.currentCount - modifiedFile.cachedCount)
 *
 * If virtualN <= 0 the calculation degrades to individual file gating.
 */
export function stagedVirtualMeanThresholdExceeded(
  stagedScores: ComponentScore[],
  baseline: BaselineCache,
  config: ResolvedConfig,
  cwd: string,
  allStagedPaths?: string[],
): { exceeded: boolean; reason?: 'individual' | 'mean' | 'p90'; hypotheticalSlopIndex?: number } {
  if (stagedScores.length === 0) return { exceeded: false };

  const stagedPaths = new Set(stagedScores.map((s) => normalizePath(s.filePath, cwd)));
  const stagedSetForBaseline = allStagedPaths
    ? new Set(allStagedPaths.map((p) => normalizePath(p, cwd)))
    : stagedPaths;

  let newStagedComponentCount = 0;
  let deletedStagedComponentCount = 0;
  let modifiedDelta = 0;

  for (const score of stagedScores) {
    const key = normalizePath(score.filePath, cwd);
    const cached = baseline.scores[key];
    if (cached) {
      modifiedDelta += score.componentCount - cached.componentCount;
    } else {
      newStagedComponentCount += score.componentCount;
    }
  }

  for (const key of Object.keys(baseline.scores)) {
    // A staged baseline path that has no matching staged score is a deletion.
    if (stagedSetForBaseline.has(key) && !stagedPaths.has(key)) {
      deletedStagedComponentCount += baseline.scores[key].componentCount;
    }
  }

  const virtualN =
    baseline.totalComponentCount +
    newStagedComponentCount -
    deletedStagedComponentCount +
    modifiedDelta;

  // Degrade to individual file gating when the project component count
  // would collapse (e.g. an all-deletion staged set).
  if (virtualN <= 0) {
    const maxStagedScore = Math.max(...stagedScores.map((score) => score.adjustedScore));
    return {
      exceeded: maxStagedScore > config.thresholds.individualSlopThreshold,
      reason: maxStagedScore > config.thresholds.individualSlopThreshold ? 'individual' : undefined,
    };
  }

  // Numerator: adjusted scores of staged files plus zero for unchanged baseline
  // files (their legacy slop is forgiven by the baseline).
  const numerator = stagedScores.reduce((sum, score) => sum + score.adjustedScore, 0);
  const hypotheticalMean = numerator / virtualN;
  const virtualSlopIndex = hypotheticalMean * sizeNormalization(virtualN);

  if (virtualSlopIndex > config.thresholds.meanSlop) {
    return { exceeded: true, reason: 'mean', hypotheticalSlopIndex: virtualSlopIndex };
  }

  const baselineEntries = Object.entries(baseline.scores).filter(
    ([path]) => !stagedPaths.has(path),
  );
  const virtualScores = [
    ...baselineEntries.map(([, entry]) => entry.baselineScore),
    ...stagedScores.map((score) => score.adjustedScore),
  ];
  if (p90(virtualScores) > config.thresholds.p90Slop) {
    return { exceeded: true, reason: 'p90', hypotheticalSlopIndex: virtualSlopIndex };
  }

  const maxStagedScore = Math.max(...stagedScores.map((score) => score.adjustedScore));
  if (maxStagedScore > config.thresholds.individualSlopThreshold) {
    return { exceeded: true, reason: 'individual', hypotheticalSlopIndex: virtualSlopIndex };
  }

  return { exceeded: false, hypotheticalSlopIndex: virtualSlopIndex };
}

export function aggregateReport(
  scores: ComponentScore[],
  issueGroups: Array<{ filePath: string; issues: Array<{ category: Category; severity: Severity }> }>,
  config: ResolvedConfig,
): Pick<
  ProjectReport,
  | 'slopIndex'
  | 'assemblyHealth'
  | 'categoryScores'
  | 'p90Score'
  | 'peakScore'
  | 'componentCount'
  | 'components'
> {
  const adjustedScores = scores.map((score) => score.adjustedScore);
  const mean =
    adjustedScores.length === 0
      ? 0
      : adjustedScores.reduce((a, b) => a + b, 0) / adjustedScores.length;

  const componentCount = scores.reduce((sum, score) => sum + score.componentCount, 0);
  const norm = sizeNormalization(componentCount);
  const slopIndex = mean * norm;
  const assemblyHealth = 100 - slopIndex;

  const p90Score = p90(adjustedScores);
  const peak =
    adjustedScores.length === 0 ? 0 : Math.max(...adjustedScores);

  const categoryContributions: Record<Category, number> = {
    visual: 0,
    typo: 0,
    motion: 0,
    wcag: 0,
    layout: 0,
    component: 0,
    logic: 0,
    arch: 0,
    perf: 0,
  };

  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    const group = issueGroups[i];
    const rawScore = group.issues.reduce(
      (sum, issue) => sum + SEVERITY_WEIGHTS[issue.severity],
      0,
    );
    if (rawScore === 0 || score.adjustedScore === 0) continue;

    for (const issue of group.issues) {
      const share = SEVERITY_WEIGHTS[issue.severity] / rawScore;
      categoryContributions[issue.category] += score.adjustedScore * share;
    }
  }

  const totalComponentCount = scores.reduce((sum, score) => sum + score.componentCount, 0);
  const denominator = totalComponentCount || 1;
  const categoryScores: Record<Category, number> = { ...categoryContributions };
  for (const category of Object.keys(categoryScores) as Category[]) {
    categoryScores[category] /= denominator;
  }

  return {
    slopIndex,
    assemblyHealth,
    categoryScores,
    p90Score,
    peakScore: peak,
    componentCount,
    components: scores,
  };
}

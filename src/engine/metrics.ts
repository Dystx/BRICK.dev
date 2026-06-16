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

export function scoreFile(
  result: FileScanResult,
  frameworkMultiplier: number,
  config: ResolvedConfig,
  baseline?: BaselineCache,
): ComponentScore {
  const rawScore = result.issues.reduce(
    (sum, issue) => sum + SEVERITY_WEIGHTS[issue.severity],
    0,
  );
  const hasHighSeverity = result.issues.some((issue) => issue.severity === 'high');
  const tax = contextTax(result.astNodeCount, hasHighSeverity, config.contextTaxCaps);
  const componentScore = Math.min(100, rawScore * frameworkMultiplier * tax);
  const baselineScore = baseline?.scores[result.filePath]?.baselineScore ?? 0;
  const adjustedScore = baseline ? Math.max(0, componentScore - baselineScore) : componentScore;

  return {
    filePath: result.filePath,
    rawScore,
    componentScore,
    adjustedScore,
    componentCount: result.componentCount,
  };
}

/**
 * Compute the hypothetical slop index if the staged files were merged with the
 * baseline. Staged files that also exist in the baseline replace their baseline
 * entry (they are not double-counted). The mean is per-file and the result is
 * size-normalized so it compares consistently with `thresholdExceeded`.
 */
export function stagedVirtualMeanThresholdExceeded(
  stagedScores: ComponentScore[],
  baseline: BaselineCache,
  config: ResolvedConfig,
): { exceeded: boolean; reason?: 'individual' | 'mean' | 'p90'; hypotheticalSlopIndex?: number } {
  if (stagedScores.length === 0) return { exceeded: false };

  const stagedPaths = new Set(stagedScores.map((s) => s.filePath));
  const baselineEntries = Object.entries(baseline.scores).filter(([path]) => !stagedPaths.has(path));

  const baselineAdjustedSum = baselineEntries.reduce(
    (sum, [, entry]) => sum + entry.baselineScore,
    0,
  );
  const stagedAdjustedSum = stagedScores.reduce((sum, score) => sum + score.adjustedScore, 0);
  const totalFiles = baselineEntries.length + stagedScores.length;
  const totalComponents =
    baselineEntries.reduce((sum, [, entry]) => sum + entry.componentCount, 0) +
    stagedScores.reduce((sum, score) => sum + score.componentCount, 0);
  const virtualMean = totalFiles === 0 ? 0 : (baselineAdjustedSum + stagedAdjustedSum) / totalFiles;
  const virtualSlopIndex = virtualMean * sizeNormalization(totalComponents);

  if (virtualSlopIndex > config.thresholds.meanSlop) {
    return { exceeded: true, reason: 'mean', hypotheticalSlopIndex: virtualSlopIndex };
  }

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

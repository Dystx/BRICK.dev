import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { VERSION } from '../types.js';
import type { ProjectReport, SlopAuditRun } from '../types.js';

const MAX_RUNS = 1000;

const SEVERITY_WEIGHT: Record<string, number> = {
  low: 1,
  medium: 3,
  high: 5,
};

export function logPath(projectPath: string): string {
  return join(projectPath, '.slop-audit', 'log.json');
}

function isSlopAuditRun(value: unknown): value is SlopAuditRun {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.timestamp !== 'string') return false;
  if (typeof obj.version !== 'string') return false;
  if (typeof obj.slopIndex !== 'number') return false;
  if (!obj.categoryScores || typeof obj.categoryScores !== 'object') return false;
  if (!Array.isArray(obj.topOffenseIds)) return false;
  if (typeof obj.thresholdExceeded !== 'boolean') return false;
  return true;
}

export function readRuns(projectPath: string): SlopAuditRun[] {
  const path = logPath(projectPath);
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSlopAuditRun);
  } catch {
    return [];
  }
}

export function clearLog(projectPath: string): void {
  const path = logPath(projectPath);
  if (existsSync(path)) {
    writeFileSync(path, JSON.stringify([], null, 2));
  }
}

function topOffenseIds(report: ProjectReport, limit = 5): string[] {
  const sorted = [...report.issues].sort((a, b) => {
    const weightA = SEVERITY_WEIGHT[a.severity] ?? 0;
    const weightB = SEVERITY_WEIGHT[b.severity] ?? 0;
    return weightB - weightA;
  });
  const ids = sorted.map((issue) => issue.ruleId).slice(0, limit);
  return [...new Set(ids)];
}

function isThresholdExceeded(
  report: ProjectReport,
  thresholds?: { meanSlop?: number; p90Slop?: number; individualSlopThreshold?: number },
): boolean {
  if (!thresholds) return false;
  if (thresholds.meanSlop !== undefined && report.slopIndex > thresholds.meanSlop) return true;
  if (thresholds.p90Slop !== undefined && report.p90Score > thresholds.p90Slop) return true;
  const individualThreshold = thresholds.individualSlopThreshold;
  if (individualThreshold !== undefined) {
    return report.components.some((component) => component.adjustedScore > individualThreshold);
  }
  return false;
}

export function appendRun(
  projectPath: string,
  report: ProjectReport,
  options?: {
    thresholds?: { meanSlop?: number; p90Slop?: number; individualSlopThreshold?: number };
  },
): void {
  const path = logPath(projectPath);
  const runs = readRuns(projectPath);

  const run: SlopAuditRun = {
    timestamp: new Date().toISOString(),
    version: VERSION,
    slopIndex: report.slopIndex,
    categoryScores: report.categoryScores,
    topOffenseIds: topOffenseIds(report),
    thresholdExceeded: isThresholdExceeded(report, options?.thresholds),
  };

  runs.push(run);
  if (runs.length > MAX_RUNS) {
    runs.splice(0, runs.length - MAX_RUNS);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(runs, null, 2));
}

import { Command, InvalidArgumentError } from 'commander';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import os, { tmpdir } from 'node:os';

import { parseSync } from '@swc/core';

import { loadConfig, DEFAULT_CONFIG, resolveConfigPath } from './config.js';
import { buildDetectedConfig } from './wizard.js';
import { discoverFiles, findMonorepoRoot } from './discover.js';
import { runWizard } from './wizard.js';
import {
  collectGitStats,
  getGitHead,
  getGitRoot,
  getStagedFiles,
  getFilesSince,
} from './git.js';
import { hasHuskyDirectory, installHook, uninstallHook } from './installer.js';
import {
  checkRegistrySnapshotFreshness,
  refreshRegistrySnapshot,
} from './rules/component/registry.js';
import { WorkerPool } from './engine/pool.js';
import { scanFile } from './engine/worker.js';
import { RuleRegistry } from './rules/registry.js';
import {
  scoreFile,
  aggregateReport,
  resolveFrameworkMultiplier,
  SEVERITY_WEIGHTS,
  stagedVirtualMeanThresholdExceeded,
} from './engine/metrics.js';
import {
  loadBaseline,
  saveBaseline,
  tightenBaseline,
  validateBaseline,
  hashConfig,
  baselinePath,
} from './engine/cache.js';
import { appendRun } from './engine/memory.js';
import { formatPretty } from './report/pretty.js';
import { formatJson } from './report/json.js';
import { formatSarif } from './report/sarif.js';
import { formatAdvice } from './report/advice.js';
import { formatHeatmap } from './report/heatmap.js';
import { formatAutopsy } from './report/autopsy.js';
import { applyFixes } from './fix/index.js';
import {
  VERSION,
  type FileScanResult,
  type Issue,
  type ProjectReport,
  type ResolvedConfig,
  type BaselineMeta,
  type BaselineCache,
  type ComponentScore,
} from './types.js';

export * from './types.js';
export { loadConfig, DEFAULT_CONFIG } from './config.js';

function escalateExitCode(current: 0 | 1 | 2, code: 1 | 2): 0 | 1 | 2 {
  return current > code ? current : code;
}

export interface ScanProjectOptions {
  cwd: string;
  config?: string;
  framework?: string;
  aiOnly?: boolean;
  humanOnly?: boolean;
  ignoreWcag22?: boolean;
  since?: string;
  staged?: boolean;
  threadCount?: number;
  tighten?: boolean;
  workerScript?: string;
}

interface ScanRunOptions extends Omit<ScanProjectOptions, 'cwd'> {
  workspace?: string;
  fix?: boolean;
  doctor?: boolean;
  watch?: boolean;
  quiet?: boolean;
  cache?: boolean;
}

interface CliGlobalOptions extends ScanRunOptions {
  format?: 'pretty' | 'json' | 'sarif';
  json?: true | string;
  suggest?: boolean;
  heatmap?: boolean;
  aiAutopsy?: boolean;
}

function parseThreads(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('must be a positive integer');
  }
  return parsed;
}

function resolveScanCwd(options: Pick<CliGlobalOptions, 'workspace' | 'quiet'>): string {
  let cwd = resolve(process.cwd());
  if (options.workspace) {
    cwd = resolve(cwd, options.workspace);
  } else {
    const monoRoot = findMonorepoRoot(cwd);
    if (monoRoot && monoRoot !== cwd) {
      if (!options.quiet) {
        console.error(`Detected monorepo root: ${monoRoot}`);
      }
      cwd = monoRoot;
    }
  }
  return cwd;
}

export function colorForSlop(slopIndex: number): string {
  if (slopIndex >= 76) return 'red';
  if (slopIndex >= 51) return 'orange';
  if (slopIndex >= 26) return 'yellow';
  return 'green';
}

export function formatBadge(report: ProjectReport): string {
  const rounded = Math.round(report.slopIndex);
  const color = colorForSlop(rounded);
  return `[![Slop Index](https://img.shields.io/badge/slop--index-${rounded}-${color})](https://github.com/brickdotdev/slop-audit)`;
}

export function thresholdExceeded(report: ProjectReport, config: ResolvedConfig): boolean {
  return (
    report.slopIndex > config.thresholds.meanSlop ||
    report.p90Score > config.thresholds.p90Slop ||
    report.peakScore > config.thresholds.individualSlopThreshold
  );
}

export function filterIssues(
  issues: Issue[],
  options: Pick<ScanRunOptions, 'aiOnly' | 'humanOnly' | 'ignoreWcag22'>,
): Issue[] {
  let result = issues;
  if (options.aiOnly) {
    result = result.filter((issue) => issue.aiSpecific);
  }
  if (options.humanOnly) {
    result = result.filter((issue) => !issue.aiSpecific);
  }
  if (options.ignoreWcag22) {
    result = result.filter((issue) => issue.category !== 'wcag');
  }
  return result;
}

function intersectFiles(discovered: string[], gitPaths: string[], cwd: string): string[] {
  if (gitPaths.length === 0) return [];
  const root = getGitRoot(cwd);
  if (!root) return [];
  const gitAbs = new Set(
    gitPaths.map((p) => {
      try {
        return realpathSync(resolve(root, p));
      } catch {
        return resolve(root, p);
      }
    }),
  );
  return discovered.filter((file) => {
    try {
      return gitAbs.has(realpathSync(file));
    } catch {
      return gitAbs.has(file);
    }
  });
}

function serializeValue(value: unknown, indent = 0): string {
  const currentIndent = ' '.repeat(indent);
  const nextIndent = ' '.repeat(indent + 2);

  if (value instanceof RegExp) {
    return `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
  }
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => serializeValue(item, indent + 2)).join(`,\n${nextIndent}`);
    return `[\n${nextIndent}${items},\n${currentIndent}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const items = entries
      .map(([key, val]) => `${JSON.stringify(key)}: ${serializeValue(val, indent + 2)}`)
      .join(`,\n${nextIndent}`);
    return `{\n${nextIndent}${items},\n${currentIndent}}`;
  }
  return JSON.stringify(value);
}

export function serializeConfig(config: ResolvedConfig, format: 'esm' | 'cjs' = 'esm'): string {
  if (format === 'cjs') {
    return `module.exports = ${serializeValue(config, 0)};\n`;
  }
  return `export default ${serializeValue(config, 0)};\n`;
}

function resolveConfigOutputPath(cwd: string, explicitPath?: string): string {
  if (explicitPath) return resolve(cwd, explicitPath);
  return join(cwd, 'slop-audit.config.mjs');
}

function configOutputFormat(path: string): 'esm' | 'cjs' {
  return path.endsWith('.cjs') ? 'cjs' : 'esm';
}

function diffConfig(existing: ResolvedConfig, proposed: ResolvedConfig): string[] {
  const lines: string[] = [];
  const topKeys = new Set([
    ...Object.keys(existing),
    ...Object.keys(proposed),
  ]) as Set<keyof ResolvedConfig>;

  for (const key of topKeys) {
    if (key === 'rules') continue;
    if (JSON.stringify(existing[key]) !== JSON.stringify(proposed[key])) {
      lines.push(`- ${String(key)}: ${JSON.stringify(existing[key])}`);
      lines.push(`+ ${String(key)}: ${JSON.stringify(proposed[key])}`);
    }
  }

  const ruleIds = new Set([
    ...Object.keys(existing.rules ?? {}),
    ...Object.keys(proposed.rules ?? {}),
  ]);
  for (const id of ruleIds) {
    const before = (existing.rules as Record<string, string | undefined> | undefined)?.[id];
    const after = (proposed.rules as Record<string, string | undefined> | undefined)?.[id];
    if (before !== after) {
      lines.push(`- rules.${id}: ${JSON.stringify(before)}`);
      lines.push(`+ rules.${id}: ${JSON.stringify(after)}`);
    }
  }

  if (lines.length === 0) {
    lines.push('(no proposed changes)');
  }

  return lines;
}

function buildBaselineCache(
  report: ProjectReport,
  configHash: string,
  gitHead: string,
  cwd: string,
): BaselineCache {
  const scores: BaselineCache['scores'] = {};
  for (const component of report.components) {
    const key = relative(cwd, component.filePath);
    scores[key] = {
      baselineScore: component.componentScore,
      componentCount: component.componentCount,
    };
  }
  return {
    version: VERSION,
    config_hash: configHash,
    git_head: gitHead,
    baseline_created: new Date().toISOString(),
    baseline_revision: 0,
    totalComponentCount: report.componentCount,
    scores,
  };
}

interface ScanRunResult {
  report: ProjectReport;
  scores: ComponentScore[];
  config: ResolvedConfig;
  baseline?: BaselineCache;
  configElapsed: number;
  stagedPaths?: string[];
}

function assembleProjectReport(
  results: FileScanResult[],
  config: ResolvedConfig,
  options: Pick<ScanRunOptions, 'aiOnly' | 'humanOnly' | 'ignoreWcag22'>,
  baseline: BaselineCache | undefined,
  cwd: string,
  mergeBaseline = false,
): { report: ProjectReport; scores: ComponentScore[] } {
  for (const result of results) {
    result.issues = filterIssues(result.issues, options);
    for (const issue of result.issues) {
      if (issue.filePath === undefined) {
        issue.filePath = result.filePath;
      }
    }
  }

  const multiplier = resolveFrameworkMultiplier(config);
  const scores = results.map((result) => scoreFile(result, multiplier, config, baseline, cwd));
  const issueGroups = results.map((result) => ({
    filePath: result.filePath,
    issues: result.issues,
  }));
  const scannedPaths = new Set(results.map((result) => relative(cwd, result.filePath)));

  // Merge in unchanged baseline entries so partial scans still reflect the full project.
  if (baseline && mergeBaseline) {
    for (const [key, entry] of Object.entries(baseline.scores)) {
      if (scannedPaths.has(key)) continue;
      const absolutePath = resolve(cwd, key);
      scores.push({
        filePath: absolutePath,
        rawScore: entry.baselineScore,
        componentScore: entry.baselineScore,
        adjustedScore: 0,
        componentCount: entry.componentCount,
      });
      issueGroups.push({ filePath: absolutePath, issues: [] });
    }
  }

  const aggregated = aggregateReport(scores, issueGroups, config);

  const allIssues = results.flatMap((result) => result.issues);
  allIssues.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);

  const baselineMeta: BaselineMeta | undefined = baseline
    ? {
        active: true,
        version: baseline.version,
        baselineRevision: baseline.baseline_revision,
        createdAt: baseline.baseline_created,
      }
    : undefined;

  const report: ProjectReport = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    configPath: resolveConfigPath(cwd),
    slopIndex: aggregated.slopIndex,
    assemblyHealth: aggregated.assemblyHealth,
    categoryScores: aggregated.categoryScores,
    p90Score: aggregated.p90Score,
    peakScore: aggregated.peakScore,
    componentCount: aggregated.componentCount,
    components: aggregated.components,
    issues: allIssues,
    baseline: baselineMeta,
  };

  return { report, scores };
}

interface DoctorResult {
  ok: boolean;
  summary: string[];
  exitCode: 0 | 1 | 2;
}

async function runDoctor(
  cwd: string,
  options?: { cache?: boolean },
): Promise<DoctorResult> {
  const lines: string[] = ['slop-audit diagnostics', ''];
  let exitCode: 0 | 1 | 2 = 0;
  const useCache = options?.cache !== false;

  const mark = (pass: boolean): string => (pass ? '✓' : '✗');
  const push = (status: string, label: string, detail?: string): void => {
    lines.push(`${status} ${label}`);
    if (detail) lines.push(`  ${detail}`);
  };

  lines.push('Environment');
  push(mark(true), `Node.js ${process.version}`);
  const workers = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  push(mark(true), `${workers} worker thread${workers === 1 ? '' : 's'} available`);
  lines.push('');

  lines.push('Parser');
  let parserOk = false;
  let parserError = '';
  try {
    parseSync('const x = 1;', { syntax: 'typescript' });
    parserOk = true;
  } catch (err) {
    exitCode = escalateExitCode(exitCode, 1);
    parserError = err instanceof Error ? err.message : String(err);
  }
  push(
    mark(parserOk),
    parserOk ? '@swc/core parser bindings load' : '@swc/core parser bindings failed to load',
    parserError || undefined,
  );

  let jsxOk = false;
  let jsxError = '';
  if (parserOk) {
    try {
      parseSync('const El = () => <div className="x" />;', { syntax: 'typescript', tsx: true });
      jsxOk = true;
    } catch (err) {
      exitCode = escalateExitCode(exitCode, 1);
      jsxError = err instanceof Error ? err.message : String(err);
    }
  }
  push(
    mark(jsxOk),
    jsxOk ? '@swc/core JSX parser bindings load' : '@swc/core JSX parser bindings failed to load',
    jsxError || undefined,
  );
  lines.push('');

  lines.push('Git');
  const gitRoot = getGitRoot(cwd);
  const gitHead = await getGitHead(cwd);
  if (gitRoot) {
    push(mark(true), 'Git available', `root: ${gitRoot}`);
  } else {
    exitCode = escalateExitCode(exitCode, 1);
    push(mark(false), 'Git not available', 'not a git repository or git not in PATH');
  }
  if (gitHead) {
    push(mark(true), 'HEAD readable', gitHead);
  } else if (gitRoot) {
    exitCode = escalateExitCode(exitCode, 1);
    push(mark(false), 'HEAD not readable');
  }
  lines.push('');

  lines.push('Workers');
  let workersOk = false;
  let workersError = '';
  try {
    const dir = mkdtempSync(join(tmpdir(), 'slop-audit-doctor-'));
    const sampleFile = join(dir, 'test.tsx');
    writeFileSync(sampleFile, 'export function Test() { return <div className="x" />; }');
    const sampleConfig: ResolvedConfig = {
      include: [],
      exclude: [],
      rules: {},
      frameworkMultipliers: {},
      ruleConfig: {},
      contextTaxCaps: { cleanCap: 0, standardCap: 0 },
      arbitraryValueAllowlist: [],
      thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
      wcag: { targetSizeExemptSelectors: [] },
    };
    const pool = new WorkerPool({ config: sampleConfig, threadCount: 1 });
    const results = await pool.scan([sampleFile]);
    workersOk = results.length === 1 && results[0].parseError === undefined;
    if (!workersOk) {
      workersError = results[0]?.parseError ?? 'worker returned unexpected result';
    }
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    exitCode = escalateExitCode(exitCode, 1);
    workersError = err instanceof Error ? err.message : String(err);
  }
  push(
    mark(workersOk),
    workersOk ? 'Worker pool can parse a sample file' : 'Worker pool failed to parse a sample file',
    workersError || undefined,
  );
  lines.push('');

  lines.push('Baseline');
  if (!useCache) {
    push(mark(true), 'Baseline validation skipped (cache disabled)');
  } else {
    const baseline = loadBaseline(cwd);
    if (!baseline) {
      push(mark(true), 'No baseline cache found');
    } else if (!gitHead) {
      exitCode = escalateExitCode(exitCode, 1);
      push(mark(false), 'Baseline present but cannot validate freshness', 'git HEAD unavailable');
    } else {
      const config = await loadConfig(cwd);
      const configHash = hashConfig(config);
      const validation = validateBaseline(baseline, configHash, gitHead);
      if (validation.valid) {
        push(mark(true), 'Baseline fresh', `created ${baseline.baseline_created}`);
        push(mark(true), 'config_hash matches');
        push(mark(true), `git_head matches (${baseline.git_head.slice(0, 7)})`);
      } else {
        exitCode = escalateExitCode(exitCode, 2);
        push(mark(false), `Baseline stale: ${validation.reason}`);
        push(mark(false), `stored config_hash: ${baseline.config_hash.slice(0, 7)}…, current: ${configHash.slice(0, 7)}…`);
        push(mark(false), `stored git_head: ${baseline.git_head.slice(0, 7)}…, current: ${gitHead.slice(0, 7)}…`);
      }
    }
  }
  lines.push('');

  lines.push('Registry');
  let registryDetail: string | undefined;
  try {
    const refresh = await refreshRegistrySnapshot(cwd);
    if (refresh.success) {
      registryDetail = 'Refreshed shadcn/ui registry snapshot from network.';
    } else {
      registryDetail = `Network refresh unavailable (${refresh.error ?? 'unknown error'}); using local or bundled snapshot.`;
    }
    const freshness = checkRegistrySnapshotFreshness(cwd);
    if (!freshness.fresh) {
      registryDetail = `${registryDetail} ${freshness.reason}`;
    }
    push(mark(true), 'shadcn/ui registry snapshot check complete', registryDetail);
  } catch (err) {
    push(mark(true), 'shadcn/ui registry snapshot check complete', `Warning: ${err instanceof Error ? err.message : String(err)}`);
  }
  lines.push('');

  const ok = exitCode === 0;
  const summary = ok ? 'All diagnostic checks passed.' : 'One or more diagnostic checks failed.';
  push(mark(ok), summary);

  return { ok, summary: lines, exitCode };
}

async function runScan(
  options: ScanRunOptions,
  explicitPaths?: string[],
): Promise<ScanRunResult> {
  const cwd = resolveScanCwd(options);

  if (options.config) {
    const explicitConfigPath = resolve(cwd, options.config);
    if (!existsSync(explicitConfigPath)) {
      console.error(`Config file not found: ${explicitConfigPath}`);
      process.exit(2);
    }
  }

  const configStart = performance.now();
  const loadedConfig = await loadConfig(cwd, options.config);
  const config: ResolvedConfig = options.framework
    ? { ...loadedConfig, framework: options.framework }
    : loadedConfig;
  const configElapsed = Math.round(performance.now() - configStart);

  let files: string[];
  if (explicitPaths && explicitPaths.length > 0) {
    files = explicitPaths.map((p) => resolve(cwd, p));
  } else {
    files = await discoverFiles(cwd, config);
  }

  if (options.staged && options.since) {
    console.error('Error: --staged and --since cannot be used together');
    process.exit(2);
  }

  let stagedPaths: string[] | undefined;
  if (options.staged) {
    stagedPaths = await getStagedFiles(cwd);
    files = intersectFiles(files, stagedPaths, cwd);
  }
  if (options.since) {
    const since = await getFilesSince(cwd, options.since);
    files = intersectFiles(files, since, cwd);
  }

  const configHash = hashConfig(config);
  const gitHead = (await getGitHead(cwd)) ?? 'unknown';
  let baseline: BaselineCache | undefined;
  let baselineMeta: BaselineMeta | undefined;
  const useCache = options.cache !== false;
  const baselineCache = useCache ? loadBaseline(cwd) : undefined;

  if (baselineCache) {
    const validation = validateBaseline(baselineCache, configHash, gitHead);
    if (validation.fatal) {
      console.error(`Baseline error: ${validation.reason}`);
      throw new Error(validation.reason);
    }
    if (validation.valid && !validation.warning) {
      baseline = options.tighten ? tightenBaseline(baselineCache) : baselineCache;
      if (options.tighten && baseline) {
        saveBaseline(cwd, baseline);
        if (!options.quiet) {
          console.warn(
            `Tightened baseline (revision ${baseline.baseline_revision}); scores reduced by 10%.`,
          );
        }
      }
      baselineMeta = {
        active: true,
        version: baseline.version,
        baselineRevision: baseline.baseline_revision,
        createdAt: baseline.baseline_created,
      };
    } else {
      if (validation.warning && !options.quiet) {
        console.warn(`Baseline warning: ${validation.reason}; continuing with baseline.`);
      }
      if (!validation.valid && !options.quiet) {
        console.warn(`Baseline invalid: ${validation.reason}; ignoring.`);
      }
      if (validation.valid && validation.warning) {
        baseline = options.tighten ? tightenBaseline(baselineCache) : baselineCache;
        if (options.tighten && baseline) {
          saveBaseline(cwd, baseline);
          if (!options.quiet) {
            console.warn(
              `Tightened baseline (revision ${baseline.baseline_revision}); scores reduced by 10%.`,
            );
          }
        }
        baselineMeta = {
          active: true,
          version: baseline.version,
          baselineRevision: baseline.baseline_revision,
          createdAt: baseline.baseline_created,
        };
      }
    }
  }

  const pool = new WorkerPool({
    config,
    threadCount: options.threadCount,
    ...(options.workerScript ? { workerScript: options.workerScript } : {}),
  });
  const results = await pool.scan(files);

  // Partial scans (--since or explicit paths) should still reflect the full
  // project in their aggregated report. --staged gating computes the virtual
  // project mean separately, so it keeps a staged-only report for output.
  const mergeBaseline = !!(options.since || (explicitPaths && explicitPaths.length > 0));
  const { report, scores } = assembleProjectReport(results, config, options, baseline, cwd, mergeBaseline);

  if (config.projectMemory !== false) {
    appendRun(cwd, report, { thresholds: config.thresholds });
  }

  return { report, scores, config, baseline, configElapsed, stagedPaths };
}

export async function scanProject(options: ScanProjectOptions): Promise<ProjectReport> {
  const { report } = await runScan({ ...options, workspace: options.cwd });
  return report;
}

async function watchProject(
  options: CliGlobalOptions,
  explicitPaths: string[],
  cwd: string,
): Promise<void> {
  const configPath = resolveConfigPath(cwd);
  const cacheFile = baselinePath(cwd);
  let lastBaselineMtime = existsSync(cacheFile) ? statSync(cacheFile).mtimeMs : 0;

  const loadWatchConfig = async (): Promise<ResolvedConfig> => {
    const loaded = await loadConfig(cwd);
    return options.framework ? { ...loaded, framework: options.framework } : loaded;
  };

  let config = await loadWatchConfig();
  let registry = new RuleRegistry();
  registry.loadBuiltins();

  const explicitSet =
    explicitPaths.length > 0 ? new Set(explicitPaths.map((p) => resolve(cwd, p))) : undefined;

  const getFileList = async (): Promise<string[]> => {
    if (explicitSet) return Array.from(explicitSet);
    return discoverFiles(cwd, config);
  };

  const loadActiveBaseline = async (): Promise<BaselineCache | undefined> => {
    if (options.cache === false) return undefined;
    const baselineCache = loadBaseline(cwd);
    if (!baselineCache) return undefined;
    const configHash = hashConfig(config);
    const gitHead = (await getGitHead(cwd)) ?? 'unknown';
    const validation = validateBaseline(baselineCache, configHash, gitHead);
    if (validation.fatal) {
      console.error(`Baseline error: ${validation.reason}`);
      throw new Error(validation.reason);
    }
    if (!validation.valid && !validation.warning) {
      return undefined;
    }
    return options.tighten ? tightenBaseline(baselineCache) : baselineCache;
  };

  const resultsMap = new Map<string, FileScanResult>();

  const notifyBeforeRescan = (filePath: string): void => {
    for (const { rule, context } of registry.createContexts(config, filePath)) {
      rule.beforeRescan?.(context, filePath);
    }
  };

  const render = async (scanStart: number): Promise<void> => {
    if (existsSync(cacheFile)) {
      const mtime = statSync(cacheFile).mtimeMs;
      if (mtime !== lastBaselineMtime) {
        lastBaselineMtime = mtime;
        if (!options.quiet) {
          console.error('Baseline cache changed externally; reloading.');
        }
      }
    }

    const baseline = await loadActiveBaseline();
    const results = Array.from(resultsMap.values());
    const { report } = assembleProjectReport(results, config, options, baseline, cwd);
    renderOutput(report, options);
    if (!options.quiet) {
      const scanElapsed = Math.max(0, Math.round(performance.now() - scanStart));
      console.error(`(scan took ${scanElapsed}ms)`);
    }
  };

  const fullRescan = async (): Promise<void> => {
    const scanStart = performance.now();
    resultsMap.clear();
    // Reset cross-file rule state by replacing the registry.
    registry = new RuleRegistry();
    registry.loadBuiltins();
    const files = await getFileList();
    for (const file of files) {
      const result = await scanFile(file, config, registry);
      resultsMap.set(file, result);
    }
    await render(scanStart);
  };

  const scanSingle = async (filePath: string): Promise<void> => {
    const scanStart = performance.now();
    notifyBeforeRescan(filePath);
    if (!existsSync(filePath)) {
      resultsMap.delete(filePath);
    } else {
      const result = await scanFile(filePath, config, registry);
      resultsMap.set(filePath, result);
    }
    await render(scanStart);
  };

  await fullRescan();

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(cwd, { recursive: true }, (_eventType, filename) => {
    if (typeof filename !== 'string') return;
    const changedPath = resolve(cwd, filename);

    if (configPath && changedPath === configPath) {
      if (!options.quiet) {
        console.error('Config changed; reloading and rescanning...');
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void (async () => {
          config = await loadWatchConfig();
          await fullRescan();
        })();
      }, 100);
      return;
    }

    if (explicitSet && !explicitSet.has(changedPath)) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void (async () => {
        const matching = new Set(await getFileList());
        if (!matching.has(changedPath) && !resultsMap.has(changedPath)) {
          return;
        }
        await scanSingle(changedPath);
      })();
    }, 100);
  });

  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
}

function renderOutput(report: ProjectReport, options: CliGlobalOptions): void {
  if (options.suggest) {
    if (!options.quiet) {
      console.log(formatAdvice(report));
    }
    return;
  }

  if (options.aiAutopsy) {
    if (!options.quiet) {
      console.log(formatAutopsy(report));
    }
    return;
  }

  if (options.json) {
    const json = formatJson(report);
    if (typeof options.json === 'string') {
      writeFileSync(resolve(options.json), json);
      if (!options.quiet) {
        console.error(`Wrote JSON report to ${options.json}`);
      }
    } else {
      console.log(json);
    }
    return;
  }

  if (options.format === 'json') {
    console.log(formatJson(report));
    return;
  }

  if (options.format === 'sarif') {
    console.log(formatSarif(report));
    return;
  }

  if (!options.quiet) {
    console.log(formatPretty(report));
  }
}

export async function runCli({ start }: { start: number }): Promise<void> {
  try {
    const program = new Command()
      .name('slop-audit')
      .description('Detect AI-generated frontend slop')
      .version(VERSION)
      .option('--framework <name>', 'framework multiplier to apply')
      .option('--ai-only', 'only report AI-specific issues')
      .option('--human-only', 'only report human-facing issues')
      .option('--ignore-wcag22', 'ignore WCAG 2.2 related issues')
      .option('--format <pretty|json|sarif>', 'output format', 'pretty')
      .option('--config <path>', 'path to slop-audit config file')
      .option('--threads <n>', 'number of worker threads', parseThreads)
      .option('--since <ref>', 'only scan files changed since git ref')
      .option('--workspace <path>', 'workspace/project path (default: auto-detect monorepo root, fallback cwd)')
      .option('--tighten', 'tighten baseline allowances')
      .option('--fix', 'apply auto-fixes')
      .option('--doctor', 'run diagnostics')
      .option('--watch', 'watch files and re-run')
      .option('--suggest', 'print remediation advice')
      .option('--heatmap', 'output migration ROI heatmap')
      .option('--ai-autopsy', 'show AI failure-mode breakdown')
      .option('--quiet', 'suppress non-error output')
      .option('--json [path]', 'write JSON report to path or stdout')
      .option('--staged', 'scan only staged files')
      .option('--cache', 'enable baseline caching', true)
      .option('--no-cache', 'disable baseline caching');

    program
      .command('init')
      .description('create a slop-audit config file')
      .option('--baseline', 'run an initial scan and save a baseline')
      .option('--yes', 'overwrite existing config and skip the wizard')
      .action(async (cmdOptions: { baseline?: boolean; yes?: boolean }, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolveScanCwd(options);
        const configPath = resolveConfigOutputPath(cwd, options.config);
        const outputFormat = configOutputFormat(configPath);
        const detectedConfig = buildDetectedConfig(cwd);
        if (existsSync(configPath) && !cmdOptions.yes) {
          const existing = await loadConfig(cwd, options.config);
          console.error(`Config file already exists: ${configPath}`);
          console.error('Proposed changes:');
          for (const line of diffConfig(existing, detectedConfig)) {
            console.error(`  ${line}`);
          }
          console.error('Use --yes to overwrite');
          process.exit(2);
        }

        let config: ResolvedConfig;
        if (cmdOptions.yes) {
          config = detectedConfig;
        } else if (process.stdin.isTTY) {
          config = await runWizard(cwd);
        } else {
          config = detectedConfig;
          if (!options.quiet) {
            console.warn('Running in non-interactive mode; using detected stack config. Use --yes to suppress this warning.');
          }
        }

        writeFileSync(configPath, serializeConfig(config, outputFormat));
        if (!options.quiet) {
          console.log(`Created ${configPath}`);
        }

        const gitignorePath = join(cwd, '.gitignore');
        const gitignoreEntry = '.slop-audit/';
        const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
        if (!existing.split(/\r?\n/).includes(gitignoreEntry)) {
          appendFileSync(gitignorePath, `${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}${gitignoreEntry}\n`);
        }

        const registryRefresh = await refreshRegistrySnapshot(cwd);
        if (!options.quiet) {
          if (registryRefresh.success) {
            console.log('Updated shadcn/ui registry snapshot from network.');
          } else {
            console.log('Using bundled shadcn/ui registry snapshot (network refresh unavailable).');
          }
        }

        if (cmdOptions.baseline) {
          const { staged, since, aiOnly, humanOnly, ignoreWcag22, ...baselineOptions } = options;
          const { report, config } = await runScan({
            ...baselineOptions,
            workspace: cwd,
            cache: false,
          });
          const configHash = hashConfig(config);
          const gitHead = (await getGitHead(cwd)) ?? 'unknown';
          const cache = buildBaselineCache(report, configHash, gitHead, cwd);
          saveBaseline(cwd, cache);
          if (!options.quiet) {
            console.log(`Saved baseline to ${baselinePath(cwd)}`);
          }
        }
        process.exit(0);
      });

    program
      .command('install')
      .description('install the git pre-commit hook')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolveScanCwd(options);
        if (hasHuskyDirectory(cwd)) {
          const result = installHook({ kind: 'husky', cwd });
          if (!options.quiet) {
            console.log(result.message);
          }
          process.exit(result.exitCode);
          return;
        }
        const root = getGitRoot(cwd);
        if (!root) {
          console.error('Not a git repository');
          process.exit(2);
          return;
        }
        const result = installHook({ kind: 'git', gitRoot: root });
        if (!options.quiet) {
          console.log(result.message);
        }
        process.exit(result.exitCode);
      });

    program
      .command('uninstall')
      .description('uninstall the git pre-commit hook')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolveScanCwd(options);
        if (hasHuskyDirectory(cwd)) {
          const result = uninstallHook({ kind: 'husky', cwd });
          if (!options.quiet) {
            console.log(result.message);
          }
          process.exit(result.exitCode);
          return;
        }
        const root = getGitRoot(cwd);
        if (!root) {
          console.error('Not a git repository');
          process.exit(2);
          return;
        }
        const result = uninstallHook({ kind: 'git', gitRoot: root });
        if (!options.quiet) {
          console.log(result.message);
        }
        process.exit(result.exitCode);
      });

    program
      .command('badge')
      .description('print a shields.io slop-index badge')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const { report } = await runScan(options);
        console.log(formatBadge(report));
        process.exit(0);
      });

    program
      .command('suggest')
      .description('print remediation advice')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const { report } = await runScan(options);
        console.log(formatAdvice(report));
        process.exit(0);
      });

    const scanAction = async (
      paths: string[],
      // Commander passes local command options here, but scanAction reads global
      // options (e.g. --doctor, --workspace) via command.optsWithGlobals().
      _ignoredLocalOptions: CliGlobalOptions,
      command: Command,
    ): Promise<void> => {
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const cwd = resolveScanCwd(options);

      if (options.watch) {
        await watchProject(options, paths, cwd);
        return;
      }

      if (options.doctor) {
        const { summary, exitCode } = await runDoctor(cwd, { cache: options.cache });
        console.log(summary.join('\n'));
        const isScanInvocation = paths.length > 0 || options.staged || options.since;
        if (!isScanInvocation) {
          process.exit(exitCode);
        }
      }

      const scanStart = performance.now();
      let scanResult = await runScan(options, paths);
      let scanElapsed = Math.max(
        0,
        Math.round(performance.now() - scanStart) - scanResult.configElapsed,
      );

      let skippedFixes = 0;
      if (options.fix) {
        const fixResults = applyFixes(scanResult.report.issues);
        const fixedFileCount = fixResults.filter((r) => r.applied.length > 0).length;
        const fixedIssueCount = fixResults.reduce((sum, r) => sum + r.applied.length, 0);
        skippedFixes = fixResults.reduce((sum, r) => sum + r.skipped.length, 0);
        if (!options.quiet) {
          console.error(
            `Applied ${fixedIssueCount} fix(es) across ${fixedFileCount} file(s).`,
          );
          if (skippedFixes > 0) {
            console.error(`${skippedFixes} fix(es) could not be applied.`);
          }
        }
        const rescanStart = performance.now();
        scanResult = await runScan(options, paths);
        const rescanElapsed = Math.max(
          0,
          Math.round(performance.now() - rescanStart) - scanResult.configElapsed,
        );
        if (!options.quiet) {
          console.error(`(rescan took ${rescanElapsed}ms)`);
        }
      }

      const { report, scores, config, baseline } = scanResult;
      const totalElapsed = Math.round(performance.now() - start);

      if (options.heatmap) {
        const stats = await collectGitStats(
          cwd,
          report.components.map((component) => component.filePath),
        );
        if (!options.quiet) {
          console.log(formatHeatmap(report, stats));
        }
      } else {
        renderOutput(report, options);
      }

      let exitCode: 0 | 1;
      let stagedReason: 'individual' | 'mean' | 'p90' | undefined;

      if (options.staged) {
        if (baseline) {
          const check = stagedVirtualMeanThresholdExceeded(scores, baseline, config, cwd, scanResult.stagedPaths);
          exitCode = check.exceeded ? 1 : 0;
          stagedReason = check.reason;
        } else {
          // Degrade to strict individual threshold gating when no valid baseline is available.
          const maxStagedScore = Math.max(...scores.map((score) => score.adjustedScore), 0);
          exitCode = maxStagedScore > config.thresholds.individualSlopThreshold ? 1 : 0;
          stagedReason = exitCode === 1 ? 'individual' : undefined;
        }
      } else {
        exitCode = thresholdExceeded(report, config) ? 1 : 0;
      }

      if (options.fix && skippedFixes > 0) {
        exitCode = 1;
      }

      if (exitCode === 1) {
        if (options.fix && skippedFixes > 0) {
          console.error('--fix could not resolve all issues.');
        } else if (options.staged) {
          if (stagedReason === 'mean') {
            console.error(
              'Gating failure: staged file(s) would raise project mean slop above threshold.',
            );
          } else if (stagedReason === 'individual') {
            console.error('Gating failure: staged file(s) exceed individual slop threshold.');
          } else if (stagedReason === 'p90') {
            console.error('Gating failure: staged file(s) would raise project p90 slop above threshold.');
          } else {
            console.error('Gating failure: staged file(s) exceed slop threshold.');
          }
        } else {
          console.error('Slop thresholds exceeded.');
        }
      }
      if (!options.quiet) {
        console.error(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
      }
      process.exit(exitCode);
    };

    program
      .command('scan [paths...]', { isDefault: true })
      .description('scan files for slop')
      .action(scanAction);

    await program.parseAsync(process.argv);
  } catch (err) {
    console.error('Unexpected error:', err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(3);
  }
}

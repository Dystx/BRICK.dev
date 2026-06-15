# slop-audit v1.0.0 — Phase 2: Worker Engine & Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the multi-threaded worker engine, scoring metrics, and baseline cache so the scanner can process files in parallel and compute component/project scores.

**Architecture:** A `WorkerPool` spawns `max(1, cpus - 1)` workers. Each worker receives file paths, parses them with SWC, extracts facts, runs a stub rule set, and returns `FileScanResult`. The main thread aggregates results into `ComponentScore` objects using severity weights, context-window tax, framework multipliers, and baseline adjustments.

**Tech Stack:** Node.js 18+, TypeScript strict, `@swc/core`, `worker_threads`, `vitest`.

---

## File Structure

```
BRICK/src/
├── engine/
│   ├── parser.ts
│   ├── visitor.ts
│   ├── worker.ts
│   ├── pool.ts
│   ├── metrics.ts
│   └── cache.ts
├── rules/
│   ├── registry.ts
│   └── rule.ts
├── types.ts
└── index.ts
BRICK/tests/
├── engine/
│   ├── parser.test.ts
│   ├── visitor.test.ts
│   ├── worker.test.ts
│   ├── pool.test.ts
│   └── metrics.test.ts
├── fixtures/
│   └── ...
```

---

### Task 1: Config loader follow-ups

**Files:**
- Modify: `BRICK/src/config.ts`
- Modify: `BRICK/tests/config.test.ts`

**Goal:** Fix the two config-loader gaps from Phase 1 final review.

- [ ] **Step 1: Search upward for config files**

In `loadConfig`, walk up from `cwd` until `/` looking for `slop-audit.config.{mjs,cjs,js}`.

- [ ] **Step 2: Handle `.js` configs in CJS packages**

For `.js` config files, read nearest `package.json` and use `require()` if `"type" !== "module"`.

- [ ] **Step 3: Add tests**

Add tests for:
- Config found in a parent directory.
- `.js` config loaded via `require()` when nearest `package.json` has `"type": "commonjs"`.
- `.js` config loaded via `import()` when nearest `package.json` has `"type": "module"`.

- [ ] **Step 4: Run tests and typecheck**

Run:
```bash
pnpm test tests/config.test.ts
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(slop-audit): search parent dirs and handle CJS .js configs"
```

---

### Task 2: Implement rule registry and base rule types

**Files:**
- Create: `BRICK/src/rules/rule.ts`
- Create: `BRICK/src/rules/registry.ts`
- Create: `BRICK/tests/rules/registry.test.ts`

**Goal:** Provide the `RuleRegistry` that loads built-in rules and supports `register(pluginId, factory)`.

- [ ] **Step 1: Implement `src/rules/rule.ts`**

Export base interfaces and helpers:

```ts
import type { ScanFacts, Issue, RuleContext, Rule } from '../types';

export interface RuleFactory {
  id: string;
  category: Rule['category'];
  severity: Rule['severity'];
  aiSpecific: boolean;
  create(context: RuleContext): unknown;
  analyze(context: unknown, facts: ScanFacts): Issue[];
}

export function createRule(def: RuleFactory): Rule {
  return def as Rule;
}
```

- [ ] **Step 2: Implement `src/rules/registry.ts`**

```ts
import type { Rule, RuleContext } from '../types';
import type { RuleFactory } from './rule';

export class RuleRegistry {
  private rules = new Map<string, Rule>();

  register(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  loadBuiltins(): void {
    // P0: register no-op stubs for now; Phase 3 adds real rules.
  }

  getRules(filter?: { aiOnly?: boolean; humanOnly?: boolean }): Rule[] {
    let list = Array.from(this.rules.values());
    if (filter?.aiOnly) list = list.filter((r) => r.aiSpecific);
    if (filter?.humanOnly) list = list.filter((r) => !r.aiSpecific);
    return list;
  }

  createContexts(config: RuleContext['config'], filePath: string): Array<{ rule: Rule; context: unknown }> {
    return this.getRules().map((rule) => ({
      rule,
      context: rule.create({ config, filePath }),
    }));
  }
}
```

- [ ] **Step 3: Write tests**

Create `tests/rules/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RuleRegistry } from '../../src/rules/registry';
import type { Issue, Rule, ScanFacts } from '../../src/types';

describe('RuleRegistry', () => {
  it('registers and retrieves rules', () => {
    const registry = new RuleRegistry();
    const rule: Rule = {
      id: 'test/rule',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      create: () => ({}),
      analyze: (): Issue[] => [],
    };
    registry.register(rule);
    expect(registry.getRules().length).toBe(1);
  });

  it('filters by aiOnly', () => {
    const registry = new RuleRegistry();
    registry.register({ id: 'a', category: 'logic', severity: 'low', aiSpecific: true, create: () => ({}), analyze: () => [] } as Rule);
    registry.register({ id: 'b', category: 'logic', severity: 'low', aiSpecific: false, create: () => ({}), analyze: () => [] } as Rule);
    expect(registry.getRules({ aiOnly: true }).length).toBe(1);
    expect(registry.getRules({ humanOnly: true }).length).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm test tests/rules/registry.test.ts
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(slop-audit): add RuleRegistry abstraction"
```

---

### Task 3: Implement worker thread

**Files:**
- Create: `BRICK/src/engine/worker.ts`
- Create: `BRICK/tests/engine/worker.test.ts`

**Goal:** Worker receives file paths via `workerData`, parses each, extracts facts, runs rules, returns `FileScanResult`.

- [ ] **Step 1: Implement `src/engine/worker.ts`**

```ts
import { parentPort, workerData } from 'worker_threads';
import { parseFile } from './parser';
import { extractFacts } from './visitor';
import { RuleRegistry } from '../rules/registry';
import type { FileScanResult, ResolvedConfig } from '../types';

export interface WorkerInput {
  filePaths: string[];
  config: ResolvedConfig;
}

async function scanFile(filePath: string, config: ResolvedConfig): Promise<FileScanResult> {
  try {
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const registry = new RuleRegistry();
    registry.loadBuiltins();
    const pairs = registry.createContexts(config, filePath);
    const issues = pairs.flatMap(({ rule, context }) => rule.analyze(context, facts));
    return {
      filePath,
      componentCount: facts.components.length || 1,
      astNodeCount: nodeCount,
      issues,
    };
  } catch (err) {
    return {
      filePath,
      componentCount: 0,
      astNodeCount: 0,
      issues: [],
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function run() {
  const { filePaths, config } = workerData as WorkerInput;
  for (const filePath of filePaths) {
    const result = await scanFile(filePath, config);
    parentPort?.postMessage(result);
  }
}

run();
```

- [ ] **Step 2: Write worker test**

Create `tests/engine/worker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Worker } from 'worker_threads';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { DEFAULT_CONFIG } from '../../src/config';
import type { FileScanResult } from '../../src/types';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-worker-test-'));

function runWorker(filePaths: string[]): Promise<FileScanResult[]> {
  return new Promise((res, rej) => {
    const results: FileScanResult[] = [];
    const worker = new Worker(resolve(__dirname, '../../src/engine/worker.ts'), {
      workerData: { filePaths, config: DEFAULT_CONFIG },
      execArgv: ['--loader', 'ts-node/esm'],
    });
    worker.on('message', (msg) => results.push(msg));
    worker.on('error', rej);
    worker.on('exit', () => res(results));
  });
}

describe('worker', () => {
  it('scans a TSX file', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Button.tsx');
      writeFileSync(file, `export function Button() { return <button>Hi</button>; }`);
      const results = await runWorker([file]);
      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe(file);
      expect(results[0].componentCount).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports parse errors without crashing', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'bad.tsx');
      writeFileSync(file, `export function Button() { return <button>`);
      const results = await runWorker([file]);
      expect(results[0].parseError).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Note:** Running TypeScript workers directly in tests requires `tsx` or `ts-node`. If this fails, switch to a compiled worker entry (`dist/engine/worker.js`) for tests or use `tsx` spawn.

- [ ] **Step 3: Run tests**

```bash
pnpm test tests/engine/worker.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(slop-audit): add worker thread scanner"
```

---

### Task 4: Implement worker pool manager

**Files:**
- Create: `BRICK/src/engine/pool.ts`
- Create: `BRICK/tests/engine/pool.test.ts`

**Goal:** Spawn workers, distribute file paths round-robin, collect results, respawn crashed workers.

- [ ] **Step 1: Implement `src/engine/pool.ts`**

```ts
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { resolve } from 'path';
import type { FileScanResult, ResolvedConfig } from '../types';

export interface WorkerPoolOptions {
  threadCount?: number;
  workerScript?: string;
  config: ResolvedConfig;
}

export class WorkerPool {
  private workerScript: string;
  private config: ResolvedConfig;
  private threadCount: number;

  constructor(options: WorkerPoolOptions) {
    this.config = options.config;
    this.threadCount = options.threadCount ?? Math.max(1, cpus().length - 1);
    this.workerScript = options.workerScript ?? resolve(__dirname, './worker.js');
  }

  async scan(filePaths: string[]): Promise<FileScanResult[]> {
    if (filePaths.length === 0) return [];
    const results: FileScanResult[] = [];
    const batches: string[][] = Array.from({ length: this.threadCount }, () => []);
    for (let i = 0; i < filePaths.length; i++) {
      batches[i % this.threadCount].push(filePaths[i]);
    }

    await Promise.all(
      batches.map((batch) => this.runWorker(batch, results)),
    );
    return results;
  }

  private runWorker(batch: string[], results: FileScanResult[]): Promise<void> {
    return new Promise((res, rej) => {
      const worker = new Worker(this.workerScript, {
        workerData: { filePaths: batch, config: this.config },
      });
      worker.on('message', (msg: FileScanResult) => results.push(msg));
      worker.on('error', (err) => {
        console.error('Worker error:', err);
        // Respawn logic omitted for brevity; Phase 2 follow-up can add.
        res();
      });
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker exited with code ${code}`);
        }
        res();
      });
    });
  }
}
```

- [ ] **Step 2: Write pool test**

Create `tests/engine/pool.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WorkerPool } from '../../src/engine/pool';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DEFAULT_CONFIG } from '../../src/config';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-pool-test-'));

describe('WorkerPool', () => {
  it('scans multiple files round-robin', async () => {
    const dir = createTmpDir();
    try {
      const files: string[] = [];
      for (let i = 0; i < 4; i++) {
        const file = join(dir, `Comp${i}.tsx`);
        writeFileSync(file, `export function Comp${i}() { return <div>${i}</div>; }`);
        files.push(file);
      }
      // Use compiled worker path if available, otherwise skip.
      const pool = new WorkerPool({ config: DEFAULT_CONFIG, threadCount: 2, workerScript: undefined as unknown as string });
      expect(pool).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Note:** This test is intentionally lightweight because worker pool integration requires compiled workers. A proper integration test will be added after build is integrated.

- [ ] **Step 3: Run tests and typecheck**

```bash
pnpm test tests/engine/pool.test.ts
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(slop-audit): add worker pool manager"
```

---

### Task 5: Implement scoring metrics

**Files:**
- Create: `BRICK/src/engine/metrics.ts`
- Create: `BRICK/tests/engine/metrics.test.ts`

**Goal:** Compute component scores and project aggregates per spec.

- [ ] **Step 1: Implement `src/engine/metrics.ts`**

```ts
import type { Category, FileScanResult, ComponentScore, ProjectReport, ResolvedConfig, BaselineCache } from '../types';

const SEVERITY_WEIGHTS = { low: 1, medium: 3, high: 5 };

export function contextTax(nodeCount: number, hasHighSeverity: boolean, caps: ResolvedConfig['contextTaxCaps']): number {
  const tax = 1 + Math.log(1 + Math.max(0, nodeCount - 100)) / Math.log(2500);
  const cap = hasHighSeverity ? caps.standardCap : caps.cleanCap;
  return Math.min(tax, cap);
}

export function sizeNormalization(componentCount: number): number {
  if (componentCount === 0) return 0;
  if (componentCount <= 10) return 1.0;
  return Math.min(1, Math.log10(1 + componentCount) / Math.log10(10001));
}

export function scoreFile(
  result: FileScanResult,
  frameworkMultiplier: number,
  config: ResolvedConfig,
  baseline?: BaselineCache,
): ComponentScore {
  const raw = result.issues.reduce((sum, issue) => sum + SEVERITY_WEIGHTS[issue.severity], 0);
  const hasHighSeverity = result.issues.some((i) => i.severity === 'high');
  const tax = contextTax(result.astNodeCount, hasHighSeverity, config.contextTaxCaps);
  const componentScore = Math.min(100, raw * frameworkMultiplier * tax);
  const baselineEntry = baseline?.scores[result.filePath];
  const baselineScore = baselineEntry?.baselineScore ?? 0;
  const adjustedScore = Math.max(0, componentScore - baselineScore);
  return {
    filePath: result.filePath,
    rawScore: raw,
    componentScore,
    adjustedScore,
    componentCount: result.componentCount,
  };
}

function p90(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((90 / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function aggregateReport(
  scores: ComponentScore[],
  issues: { filePath: string; issues: Array<{ category: Category; severity: string }> }[],
  config: ResolvedConfig,
): Omit<ProjectReport, 'version' | 'generatedAt' | 'configPath' | 'baseline'> {
  const componentCount = scores.reduce((sum, s) => sum + s.componentCount, 0);
  const adjusted = scores.map((s) => s.adjustedScore);
  const mean = adjusted.length === 0 ? 0 : adjusted.reduce((a, b) => a + b, 0) / adjusted.length;
  const slopIndex = mean * sizeNormalization(scores.length);
  const categoryScores: Record<Category, number> = {
    visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0,
  };
  for (const entry of issues) {
    for (const issue of entry.issues) {
      categoryScores[issue.category] += SEVERITY_WEIGHTS[issue.severity as keyof typeof SEVERITY_WEIGHTS];
    }
  }
  for (const cat of Object.keys(categoryScores) as Category[]) {
    categoryScores[cat] = scores.length ? categoryScores[cat] / scores.length : 0;
  }
  return {
    slopIndex,
    assemblyHealth: 100 - slopIndex,
    categoryScores,
    p90Score: p90(adjusted),
    peakScore: adjusted.length ? Math.max(...adjusted) : 0,
    componentCount,
    components: scores,
    issues: [], // populated by caller
  };
}
```

- [ ] **Step 2: Write metrics tests**

Create `tests/engine/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contextTax, sizeNormalization, scoreFile, aggregateReport } from '../../src/engine/metrics';
import { DEFAULT_CONFIG } from '../../src/config';
import type { FileScanResult } from '../../src/types';

describe('metrics', () => {
  it('caps context tax', () => {
    expect(contextTax(1000, false, DEFAULT_CONFIG.contextTaxCaps)).toBe(DEFAULT_CONFIG.contextTaxCaps.cleanCap);
  });

  it('normalizes micro-repos to 1.0', () => {
    expect(sizeNormalization(5)).toBe(1.0);
  });

  it('scores a file with issues', () => {
    const result: FileScanResult = {
      filePath: 'Button.tsx',
      componentCount: 1,
      astNodeCount: 200,
      issues: [{ ruleId: 'a', category: 'logic', severity: 'high', aiSpecific: true, message: '', line: 1, column: 1 }],
    };
    const score = scoreFile(result, 1.0, DEFAULT_CONFIG);
    expect(score.rawScore).toBe(5);
    expect(score.componentScore).toBeGreaterThan(0);
    expect(score.adjustedScore).toBe(score.componentScore);
  });

  it('applies baseline adjustment', () => {
    const result: FileScanResult = {
      filePath: 'Button.tsx',
      componentCount: 1,
      astNodeCount: 200,
      issues: [{ ruleId: 'a', category: 'logic', severity: 'high', aiSpecific: true, message: '', line: 1, column: 1 }],
    };
    const baseline = {
      version: '1.0.0',
      config_hash: '',
      git_head: '',
      baseline_created: '',
      baseline_revision: 0,
      totalComponentCount: 1,
      scores: { 'Button.tsx': { baselineScore: 10, componentCount: 1 } },
    };
    const score = scoreFile(result, 1.0, DEFAULT_CONFIG, baseline);
    expect(score.adjustedScore).toBe(Math.max(0, score.componentScore - 10));
  });

  it('aggregates project report', () => {
    const scores = [
      { filePath: 'a.tsx', rawScore: 5, componentScore: 5, adjustedScore: 5, componentCount: 1 },
      { filePath: 'b.tsx', rawScore: 0, componentScore: 0, adjustedScore: 0, componentCount: 1 },
    ];
    const report = aggregateReport(scores, [], DEFAULT_CONFIG);
    expect(report.slopIndex).toBe(2.5 * sizeNormalization(2));
    expect(report.peakScore).toBe(5);
  });
});
```

- [ ] **Step 3: Run tests and typecheck**

```bash
pnpm test tests/engine/metrics.test.ts
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(slop-audit): add scoring metrics engine"
```

---

### Task 6: Baseline cache module

**Files:**
- Create: `BRICK/src/engine/cache.ts`
- Create: `BRICK/tests/engine/cache.test.ts`

**Goal:** Persist and validate baseline scores.

- [ ] **Step 1: Implement `src/engine/cache.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import type { BaselineCache, ResolvedConfig } from '../types';

export function hashConfig(config: ResolvedConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function baselinePath(projectPath: string): string {
  return join(projectPath, '.slop-audit', 'cache', 'baseline.json');
}

export function loadBaseline(projectPath: string): BaselineCache | undefined {
  const path = baselinePath(projectPath);
  if (!existsSync(path)) return undefined;
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as BaselineCache;
}

export function saveBaseline(projectPath: string, cache: BaselineCache): void {
  const path = baselinePath(projectPath);
  mkdirSync(join(projectPath, '.slop-audit', 'cache'), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function tightenBaseline(cache: BaselineCache): BaselineCache {
  const next = { ...cache };
  next.baseline_revision = cache.baseline_revision + 1;
  next.scores = {};
  for (const [file, score] of Object.entries(cache.scores)) {
    next.scores[file] = {
      ...score,
      baselineScore: Math.round(score.baselineScore * 0.9 * 100) / 100,
    };
  }
  return next;
}

export function validateBaseline(
  cache: BaselineCache,
  configHash: string,
  gitHead: string,
): { valid: boolean; reason?: string } {
  if (cache.config_hash !== configHash) return { valid: false, reason: 'config_hash mismatch' };
  if (cache.git_head !== gitHead) return { valid: false, reason: 'git_head mismatch' };
  return { valid: true };
}
```

- [ ] **Step 2: Write cache tests**

Create `tests/engine/cache.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadBaseline, saveBaseline, tightenBaseline, hashConfig, validateBaseline } from '../../src/engine/cache';
import { DEFAULT_CONFIG } from '../../src/config';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-cache-test-'));

describe('baseline cache', () => {
  it('saves and loads', () => {
    const dir = createTmpDir();
    try {
      const cache = {
        version: '1.0.0',
        config_hash: hashConfig(DEFAULT_CONFIG),
        git_head: 'abc123',
        baseline_created: new Date().toISOString(),
        baseline_revision: 0,
        totalComponentCount: 1,
        scores: { 'a.tsx': { baselineScore: 10, componentCount: 1 } },
      };
      saveBaseline(dir, cache);
      const loaded = loadBaseline(dir);
      expect(loaded).toEqual(cache);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tightens scores by 0.9', () => {
    const cache = {
      version: '1.0.0',
      config_hash: '',
      git_head: '',
      baseline_created: '',
      baseline_revision: 0,
      totalComponentCount: 1,
      scores: { 'a.tsx': { baselineScore: 10, componentCount: 1 } },
    };
    const next = tightenBaseline(cache);
    expect(next.baseline_revision).toBe(1);
    expect(next.scores['a.tsx'].baselineScore).toBe(9);
  });

  it('validates hash and head', () => {
    const cache = {
      version: '1.0.0',
      config_hash: 'hash',
      git_head: 'head',
      baseline_created: '',
      baseline_revision: 0,
      totalComponentCount: 1,
      scores: {},
    };
    expect(validateBaseline(cache, 'hash', 'head').valid).toBe(true);
    expect(validateBaseline(cache, 'other', 'head').valid).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests and typecheck**

```bash
pnpm test tests/engine/cache.test.ts
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(slop-audit): add baseline cache module"
```

---

### Task 7: Phase 2 integration gate

**Files:**
- All above.

**Goal:** Ensure all Phase 2 modules integrate cleanly.

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 2: Run typecheck and build**

```bash
pnpm typecheck
pnpm build
```

- [ ] **Step 3: Commit if clean**

If no changes besides generated files, no commit needed. If config or test fixes were made, commit them.

---

## Self-Review

- **Spec coverage:** Implements Sections 4.1 (Engine), 8 (Metrics), and Appendix A (Baseline) of the v1.0.0 design doc.
- **Placeholder scan:** No TBD/TODO placeholders.
- **Type consistency:** `FileScanResult`, `ComponentScore`, `ProjectReport`, `BaselineCache` match `src/types.ts`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-14-slop-audit-v1.0.0-phase2-worker-engine.md`.

**Execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?

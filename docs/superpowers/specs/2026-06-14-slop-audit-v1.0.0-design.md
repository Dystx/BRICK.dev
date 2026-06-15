# `slop-audit` v1.0.0 — Engineering Design Document

**Document Version:** 1.0.0  
**Spec Reference:** `slop-audit-v1.0.0-spec-and-implementation-plan.md` v1.4.2  
**Date:** 2026-06-14  
**Status:** Draft — pending review

---

## 1. Goals and Scope

This design defines the P0 implementation of `slop-audit`, a SWC-based, multi-threaded static analyzer that scores frontend codebases for AI-generated slop.

P0 scope (must ship in v1.0.0):

- SWC parser engine with a custom AST visitor.
- `worker_threads` file scanner that processes file paths only.
- Directory-based `RuleRegistry` with a `register(ruleId, factory)` plugin hook.
- Baseline cache (`.slop-audit/cache/baseline.json`) with SHA-256 config hashing and git HEAD tracking.
- CLI commands: `scan` (default), `init`, `install`, `uninstall`, `badge`, `suggest`.
- Output formats: `pretty`, `json`, `sarif`.
- P0 rule set: `visual/arbitrary-escape`, `visual/generic-centering`, `logic/boundary-violation`, `logic/zombie-state`, `logic/ghost-defensive`, `wcag/target-size`, `wcag/focus-appearance`.
- `--fix` for safe, idempotent AST edits (P0: `"use client"` insertion, layout token replacement, focus-ring CSS anchor injection).
- Performance benchmark proving 2,000 components in < 8 seconds on 4-core/8GB hardware.

Explicitly out of scope for P0:

- Native Vue, Svelte, Astro parsing (P1/P2).
- CSS-in-JS plugin API (Phase 2).
- IDE LSP / GIR / advanced SARIF remediation context (Commercial Tier).
- `--watch` persistence across config reloads (basic watcher skeleton only if time permits).

---

## 2. Directory Layout

```
BRICK/
├── bin/
│   └── slop-audit.js           # Node entry point (async IIFE wrapper)
├── src/
│   ├── index.ts                # CLI command setup + public API exports
│   ├── types.ts                # Shared domain types
│   ├── config.ts               # Config loader, defaults, validation
│   ├── engine/
│   │   ├── parser.ts           # parseFile(path) using @swc/core
│   │   ├── visitor.ts          # SlopParserVisitor: extracts relevant AST facts
│   │   ├── worker.ts           # Worker entry: path -> FileScanResult
│   │   ├── pool.ts             # Worker pool manager (spawn, round-robin, respawn)
│   │   ├── metrics.ts          # Context tax, size normalization, scoring
│   │   └── cache.ts            # Baseline cache CRUD + --tighten
│   ├── rules/
│   │   ├── registry.ts         # RuleRegistry (load built-ins + register API)
│   │   ├── rule.ts             # Base rule types and helpers
│   │   ├── visual/
│   │   │   ├── arbitrary-escape.ts
│   │   │   └── generic-centering.ts
│   │   ├── logic/
│   │   │   ├── boundary-violation.ts
│   │   │   ├── zombie-state.ts
│   │   │   └── ghost-defensive.ts
│   │   └── wcag/
│   │       ├── target-size.ts
│   │       └── focus-appearance.ts
│   ├── report/
│   │   ├── pretty.ts
│   │   ├── json.ts
│   │   ├── sarif.ts
│   │   └── heatmap.ts          # Migration ROI heatmap
│   ├── fix/
│   │   ├── index.ts            # Safe fix orchestrator
│   │   ├── use-client.ts
│   │   ├── layout-token.ts
│   │   └── focus-ring.ts
│   └── installer.ts            # Git/Husky hook sentinel install/uninstall
├── tests/
│   ├── fixtures/               # Passing/failing rule fixtures
│   ├── rules/                  # Unit tests per rule
│   ├── integration/            # CLI end-to-end tests
│   └── perf/
│       └── large-codebase.ts   # Synthetic 2,000-component benchmark
├── scripts/
│   └── generate-perf-fixtures.ts
├── .github/
│   └── workflows/
│       └── slop-audit.yml
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## 3. Module-by-Module Design

### 3.1 `bin/slop-audit.js`

- Must be the only synchronous file executed by Node.
- Wraps the async CLI bootstrap in an IIFE so ESM/CJS configs can be dynamically imported before worker threads are spawned.
- Records `performance.now()` immediately for later bootstrap-time segregation in `--doctor`.

```js
#!/usr/bin/env node
const start = performance.now();
(async () => {
  const { runCli } = await import('../dist/index.js');
  await runCli({ start });
})();
```

### 3.2 `src/index.ts`

Responsibilities:

1. Define `commander` program, commands, flags, and exit-code schema.
2. Implement `runCli({ start })`:
   - Load config (async).
   - If command is `init`, `install`, `uninstall`, `badge`, or `suggest`, dispatch directly.
   - For scan: discover files, load baseline, spawn worker pool, aggregate, format, exit.
3. Export public API types and helper functions (`scanProject`, `loadConfig`, etc.).

### 3.3 `src/types.ts`

Core domain types:

```ts
export type Severity = 'low' | 'medium' | 'high';
export type Category =
  | 'visual' | 'typo' | 'wcag' | 'layout' | 'component' | 'logic' | 'arch' | 'perf';

export interface Issue {
  ruleId: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  message: string;
  line: number;
  column: number;
  advice?: string;
  fix?: FixSuggestion;
}

export interface FileScanResult {
  filePath: string;
  componentCount: number;
  astNodeCount: number;
  issues: Issue[];
  parseError?: string;
}

export interface ComponentScore {
  filePath: string;
  rawScore: number;
  componentScore: number; // capped at 100
  adjustedScore: number;  // after baseline subtraction
  componentCount: number;
}

export interface ProjectReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;        // Final Mean Slop Score
  assemblyHealth: number;   // 100 - slopIndex
  categoryScores: Record<Category, number>;
  p90Score: number;
  peakScore: number;
  componentCount: number;
  components: ComponentScore[];
  issues: Issue[];
  baseline?: BaselineMeta;
}

export interface BaselineMeta {
  active: boolean;
  version: string;
  baselineRevision: number;
  createdAt: string;
}
```

### 3.4 `src/config.ts`

Responsibilities:

- Search for `slop-audit.config.js`/`slop-audit.config.mjs`/`slop-audit.config.cjs` from cwd upward.
- Detect ESM vs CJS: file extension or nearest `package.json` `type` field.
- Dynamic `import()` for ESM; `require()` for CJS.
- Merge user config with `DEFAULT_CONFIG`.
- Validate unknown rule IDs and warn.

Default config constants:

```ts
export const DEFAULT_SPACING_SCALE = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];

export const DEFAULT_TYPOGRAPHY_SCALE = [
  '0.75rem', '0.875rem', '1rem', '1.125rem', '1.25rem',
  '1.5rem', '1.875rem', '2.25rem', '3rem', '3.75rem', '4.5rem',
];
```

### 3.5 `src/engine/parser.ts`

- Export `parseFile(path: string): { ast: Module; nodeCount: number }`.
- Use `@swc/core`'s `parseFile` or `parse` with syntax determined by extension.
- `jsx: true` for `.jsx`/`.tsx`.
- Throws on parse errors; worker catches them.

### 3.6 `src/engine/visitor.ts`

`SlopParserVisitor` extends `@swc/core/Visitor`. It extracts a **scan facts** object that rules consume:

```ts
export interface ScanFacts {
  filePath: string;
  astNodeCount: number;
  components: ComponentFacts[];
  staticClassNames: ClassNameFact[];
  interactiveElements: ElementFact[];
  hooks: HookFact[];
  logicalExpressions: LogicalExpressionFact[];
}

export interface ComponentFacts {
  name?: string;
  line: number;
  column: number;
  isServerComponent: boolean; // true unless "use client" directive present
  hookCalls: HookFact[];
}
```

Visitor behavior:

- Track `"use client"` directives; flip `isServerComponent` to false when seen.
- Collect every function declaration/expression that returns JSX as a component.
- Record `useState`/`useEffect`/`useContext` hook calls per component.
- Collect `JSXAttribute` `className` string literals and template literals with zero interpolations.
- Record interactive JSX elements (`<button>`, `<a>`, `<input>`) and their class/value attributes.
- Collect binary `&&` chains for `logic/ghost-defensive` depth analysis.
- Count total AST nodes visited for the context-window tax.

### 3.7 `src/engine/worker.ts`

Worker responsibilities:

1. Read `workerData.filePaths: string[]`.
2. For each path:
   - Parse with `parseFile`.
   - Run `SlopParserVisitor` to build `ScanFacts`.
   - Instantiate rules from `RuleRegistry` for the active config.
   - Execute each rule against `ScanFacts`; collect `Issue[]`.
   - Post `FileScanResult` to `parentPort`.
3. Catch parse/visitor errors; post `FileScanResult` with `parseError` set.

Worker never sends raw AST buffers.

### 3.8 `src/engine/pool.ts`

`WorkerPool` API:

```ts
export class WorkerPool {
  constructor(threadCount: number, registryScript: string);
  scan(files: string[]): Promise<FileScanResult[]>;
  terminate(): Promise<void>;
}
```

- Spawns `threadCount` workers with `new Worker(registryScript, { workerData })`.
- Distributes file paths round-robin across workers.
- Listens for messages; on uncaught worker error, logs file, respawns worker, and continues.
- Each worker receives a batch of paths and returns results sequentially.

### 3.9 `src/engine/metrics.ts`

Scoring pipeline:

1. **Raw score** per file:
   `raw = sum(count_i * weight_i)` where `weight = { low: 1, medium: 3, high: 5 }`.
2. **Context density multiplier**:
   `contextTax = 1 + ln(1 + max(0, astNodeCount - 100)) / ln(2500)`.
   - Cap at `contextTaxCaps.cleanCap` if no high-severity issues, else `standardCap`.
3. **Component score**:
   `componentScore = min(100, raw * frameworkMultiplier * contextTax)`.
4. **Baseline adjustment** (if active):
   `adjustedScore = max(0, componentScore - baselineScore)`.
5. **Project aggregation**:
   - `mean = average(adjustedScores)`.
   - `sizeNorm = componentCount <= 10 ? 1.0 : min(1, log10(1 + n) / log10(10001))`.
   - `slopIndex = mean * sizeNorm`.
   - `assemblyHealth = 100 - slopIndex`.
   - `p90` and `peak` computed from adjusted scores.

Category scores:
- Sum adjusted scores of issues per category, normalize by component count.

### 3.10 `src/engine/cache.ts`

Baseline cache schema (matches spec):

```ts
export interface BaselineCache {
  version: string;
  config_hash: string;
  git_head: string;
  baseline_created: string;
  baseline_revision: number;
  totalComponentCount: number;
  scores: Record<string, { baselineScore: number; componentCount: number }>;
}
```

Functions:

- `loadBaseline(projectPath): BaselineCache | undefined`
- `saveBaseline(projectPath, data)`
- `hashConfig(config): string` (SHA-256 of serialized normalized config)
- `tightenBaseline(cache): BaselineCache` — multiplies every `baselineScore` by 0.9, increments `baseline_revision`, leaves `config_hash`.
- `validateBaseline(cache, configHash, gitHead): { valid: boolean; reason?: string }`

Cache invalidation rules:

- Config hash mismatch → invalid.
- git HEAD mismatch → pre-commit hook downgrades to individual gating; scan still runs.
- Major version mismatch → hard error.
- Minor/patch version mismatch → soft warning.

### 3.11 `src/rules/registry.ts`

`RuleRegistry`:

```ts
export interface Rule<Context = unknown> {
  id: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
}

export interface RuleContext {
  config: ResolvedConfig;
  filePath: string;
}

export class RuleRegistry {
  register(rule: Rule): void;
  loadBuiltins(): void;
  getRules(filter?: { aiOnly?: boolean; humanOnly?: boolean }): Rule[];
}
```

- `loadBuiltins()` imports all files under `src/rules/**/!(*.test).ts` and registers them.
- Built-in rules export a default `Rule` object.
- Rule factories receive `RuleContext` and return a per-file context object.
- This design supports Phase 2 plugin loading via `registry.register(pluginRule)`.

### 3.12 P0 Rule Design

#### `visual/arbitrary-escape`

- Trigger: static Tailwind class strings containing arbitrary values on layout properties (`w-[...]`, `h-[...]`, `p-[...]`, `m-[...]`, `gap-[...]`, etc.).
- Exempt: colors, backgrounds, borders; arbitrary values using `calc()`; regex allowlist matches.
- Severity: medium.

#### `visual/generic-centering`

- Trigger: class string contains `flex` + `items-center` + `justify-center` + `min-h-screen` + `text-center`.
- Allow up to `genericCenteringMaxInstances` (default 1) per file.
- Severity: low.

#### `logic/boundary-violation`

- Trigger: file is an RSC (`isServerComponent === true`) and contains `useState`, `useEffect`, or `useContext`.
- Severity: high.
- `--fix`: insert `"use client";\n` at top of file.

#### `logic/zombie-state`

- Trigger: `useState` tuple destructured; neither the value nor the setter has a downstream reference in the same file.
- Exempt: single-value tuples like `[initialValue]` or `[, setForceUpdate]` when the used side is referenced.
- Severity: medium.

#### `logic/ghost-defensive`

- Trigger: chained logical AND (`&&`) expression accessing nested member properties to depth >= 3 (e.g., `res && res.data && res.data.user`).
- Must measure depth regardless of AST traversal order.
- Severity: medium.

#### `wcag/target-size`

- Trigger: interactive element (`<button>`, `<a>`, `<input>`) has no sizing tokens (`h-*`, `w-*`, `p-*`, `min-w-*`, etc.) or explicit `width`/`height` attributes capable of meeting the minimum footprint.
- Severity: high.

#### `wcag/focus-appearance`

- Trigger: interactive element uses tokens that strip focus outline (`outline-none`, `focus:outline-none`) without a verified `:focus-visible` ring modifier (`focus-visible:ring-*`, `focus:ring-*`).
- Severity: high.
- `--fix`: inject a global focus-ring CSS block anchored with `/* @slop-audit:v1.0.0:fix:focus-ring */` into `globalCssTarget`.

---

## 4. CLI Design

### Commands

| Command | Description |
|---|---|
| `slop-audit [paths...]` | Run scan (default). |
| `slop-audit init` | Generate config; `--baseline` runs baseline scan. `--yes` overwrites. |
| `slop-audit install` | Install pre-commit hook with sentinels. |
| `slop-audit uninstall` | Remove pre-commit hook block. |
| `slop-audit badge` | Print shields.io markdown. |
| `slop-audit suggest` | Alias for `--suggest`. |

### Flags

| Flag | Behavior |
|---|---|
| `--framework <name>` | Override detection. |
| `--baseline` | With `init`: baseline mode. |
| `--tighten` | Reduce baseline forgiveness. |
| `--ai-only` | Only `aiSpecific: true` rules. |
| `--human-only` | Only `aiSpecific: false` rules. |
| `--heatmap` | Output migration ROI heatmap. |
| `--since <ref>` | Scan files changed since git ref. |
| `--workspace <path>` | Target monorepo package. |
| `--ignore-wcag22` | Disable WCAG rules. |
| `--fix` | Execute safe fixes. |
| `--suggest` | Output remediation tiers. |
| `--yes` | Skip prompts. |
| `--doctor` | Validate environment, parser bindings, baseline freshness. |
| `--watch` | Persistent watcher (basic P0 skeleton). |
| `--format <pretty\|json\|sarif>` | Output format. |
| `--cache` | Enable AST result cache (P0: baseline only; full AST cache optional). |
| `--threads <n>` | Worker count. |
| `--quiet` | Suppress non-essential output. |
| `--json [path]` | JSON report file or stdout. |

### Exit Codes

- `0` — success, thresholds passed.
- `1` — success, thresholds exceeded.
- `2` — config/cache/hook error.
- `3` — environment error (missing parser bindings, permissions).

---

## 5. Baseline & Pre-Commit Hook

### Baseline Flow

1. `slop-audit init --baseline` scans project, computes per-file `baselineScore`, persists cache.
2. Subsequent scans subtract `baselineScore` from each file's component score.
3. `--tighten` reduces forgiveness by 0.9 per invocation.

### Pre-Commit Hook Algorithm

1. Read staged files via `git diff --cached --name-only`.
2. Validate baseline `config_hash` and `git_head`.
3. Compute `virtualN` and hypothetical project mean per spec formula.
4. Reject commit if any staged file score > `individualSlopThreshold` or hypothetical mean > `meanSlop`.
5. On baseline mismatch, degrade to individual file gating.

### Hook Sentinel Format

```sh
# slop-audit-hook-begin
npx slop-audit --staged
# slop-audit-hook-end
```

- `install` checks for both sentinels; if exactly one is found, exit code 2.
- `uninstall` removes the block.

---

## 6. Reporting

### `pretty`

- Header: `Slop Index: 34 | Assembly Health: 66`
- Legend line: `(0-100, higher = better, inverse of Slop Index)`
- Micro-repo warning if `componentCount <= 10`.
- Category breakdown table.
- Top offending components list.
- Per-issue output with severity, rule, file, line, advice.

### `json`

- Full `ProjectReport` object serialized.

### `sarif`

- SARIF v2.1.0 run with rule metadata, results, locations, and messages.
- Rule property bag includes `aiSpecific`, `category`, `severity`.

### `heatmap`

- Rank components by `ROI = adjustedScore * recency_weight * churn_weight`.
- `recency_weight`: 1.5 if file modified in last 30 days, else 1.0.
- `churn_weight`: `1 + min(edit_count_last_30_days / 10, 1.0)`.

---

## 7. Safe Fix Pipeline

`--fix` operates only on unambiguous repairs:

1. **Missing `"use client"`** — insert directive at file top.
2. **Replaceable layout arbitrary values** — e.g., `p-[13px]` → `p-3`.
3. **Focus-ring CSS** — inject anchored block into `globalCssTarget`.

Fix orchestrator:

```ts
export interface FixResult {
  filePath: string;
  applied: FixApplication[];
  skipped: FixApplication[]; // with reason
}
```

Each fix writes a versioned anchor comment when modifying shared files.

---

## 8. Testing Strategy

### Unit Tests (`tests/rules/*.test.ts`)

- One test file per rule.
- Passing and failing fixtures per rule edge case.
- Assert exact rule ID, severity, line/column.

### Integration Tests (`tests/integration/*.test.ts`)

- `init` writes config and `.gitignore`.
- `init --baseline` creates `baseline.json`.
- `install`/`uninstall` mutate hooks idempotently.
- `--tighten` updates baseline scores.
- CLI exit codes for threshold violations.
- `--format json` and `--format sarif` produce valid output.

### Performance Test (`tests/perf/large-codebase.ts`)

- `scripts/generate-perf-fixtures.ts` creates 2,000 components:
  - 60%: 50-100 AST nodes
  - 30%: 100-500 AST nodes
  - 10%: 500-1000 AST nodes
- Benchmark runs scan and asserts total wall time < 8s.
- Subtract bootstrap time when reporting in `--doctor`.

---

## 9. Migration from MVP

1. Remove old `src/` and `tests/` trees.
2. Remove `ts-morph` dependency; add `@swc/core`, `@swc/types`, `cli-table3`.
3. Bump `version` to `1.0.0`.
4. Update `bin` to `dist/index.js` (spec says `bin/slop-audit` points to `dist/index.js`).
5. Update `tsup.config.ts` external list to exclude `@swc/core`? No — `@swc/core` is a native dependency and must remain external.
6. Preserve `README.md` narrative where applicable; rewrite usage for v1.0.0 flags.
7. Keep `LICENSE` and author fields.

---

## 10. Implementation Phases (Task-by-Task)

### Phase 1: Foundation

1. Update `package.json` dependencies and version.
2. Create new directory layout.
3. Implement `src/types.ts` domain model.
4. Implement `src/config.ts` loader with ESM/CJS detection.
5. Implement `src/engine/parser.ts` and `src/engine/visitor.ts`.
6. Add unit tests for parser/visitor facts extraction.

### Phase 2: Worker Engine

7. Implement `src/engine/worker.ts`.
8. Implement `src/engine/pool.ts` with respawn logic.
9. Implement `src/engine/metrics.ts` scoring.
10. Add integration test for worker pool round-robin + error recovery.

### Phase 3: Rule Registry & P0 Rules

11. Implement `src/rules/registry.ts`.
12. Implement P0 rules (one task each):
    - `visual/arbitrary-escape`
    - `visual/generic-centering`
    - `logic/boundary-violation`
    - `logic/zombie-state`
    - `logic/ghost-defensive`
    - `wcag/target-size`
    - `wcag/focus-appearance`
13. Add rule unit tests for each.

### Phase 4: CLI, Cache, Installer

14. Implement `src/engine/cache.ts` and baseline lifecycle.
15. Implement `src/installer.ts` hook install/uninstall.
16. Implement `src/index.ts` CLI wiring.
17. Implement `init`, `install`, `uninstall`, `badge`, `suggest` commands.
18. Implement pre-commit hook virtual-mean gating.

### Phase 5: Reporting & Fix Pipeline

19. Implement `src/report/pretty.ts`.
20. Implement `src/report/json.ts`.
21. Implement `src/report/sarif.ts`.
22. Implement `src/report/heatmap.ts`.
23. Implement `src/fix/index.ts` and safe fix rules.

### Phase 6: Testing & Release Engineering

24. Create rule fixtures and unit tests.
25. Create CLI integration tests.
26. Create synthetic performance benchmark.
27. Add GitHub Actions workflow.
28. Run full test suite, typecheck, build, `npm publish --dry-run`.

---

## 11. Open Questions / Risks

- SWC visitor ergonomics for JSX-specific extraction may require iterating AST nodes manually; fallback to `walk` helper if `Visitor` is too restrictive.
- The 8-second performance target depends on native SWC parsing and minimal rule work; keep rules synchronous and avoid cross-file analysis.
- `--watch` P0 skeleton may be limited; full watch-mode cache invalidation is P1.
- `--fix` focus-ring injection must avoid duplicate anchors and respect missing `globalCssTarget`.

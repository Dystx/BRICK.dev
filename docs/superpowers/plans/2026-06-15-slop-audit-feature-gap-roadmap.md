# slop-audit v1.0.0 — Feature Gap Implementation Plan

**Date:** 2026-06-15  
**Spec reference:** `slop-audit-v1.0.0-spec-and-implementation-plan.md` (v1.4.2 architecture freeze)  
**Current HEAD:** `a827670` (monorepo auto-detection landed)  
**Status:** Planning — not yet implemented

---

## 1. Goal

Close the remaining gaps between the current `main` branch and the approved v1.0.0 specification, prioritized by release-blocker status and implementation cost.

**Priority legend:**
- **P0** — Required for a credible v1.0.0 release.
- **P1** — High value, small-to-medium effort; should ship shortly after P0.
- **P2** — Medium value; can follow in a minor release if time-constrained.
- **P3** — Future / commercial / out-of-scope for the OSS v1.0.0 MVP.

---

## 2. Gap Inventory

| # | Feature | Priority | Effort | Depends on |
|---|---------|----------|--------|------------|
| 1 | Project memory log (`.slop-audit/log.json`) | P0 | Medium | — |
| 2 | `--config <path>` CLI override | P1 | Tiny | — |
| 3 | `--strict` CI gate (exit code 2 for critical/high) | P1 | Small | — |
| 4 | `--no-increase` regression gating | P1 | Small | #1 |
| 5 | `--trend [n]` sparkline report | P1 | Small | #1 |
| 6 | `--include` / `--exclude` CLI overrides | P1 | Small | — |
| 7 | Color contrast rule (`wcag/contrast`) | P2 | Medium | — |
| 8 | Additional component registries (MUI, AntD, Chakra, Radix) | P2 | Medium | — |
| 9 | AST-level scan cache (separate from baseline cache) | P2 | Medium | — |
| 10 | Corpus inference / rarity scoring | P3 | Large | #8, metrics |
| 11 | CSS-in-JS plugin API | P3 | Large | — |
| 12 | Release engineering / npm publish verification | P3 | Small | #1–#6 stable |

---

## 3. Detailed Plans

### 3.1 Project Memory Log (P0)

**Current state:** The baseline cache stores per-file scores, but there is no append-only run log. `--no-increase` and `--trend` cannot exist without it.

**Spec requirement (§6.1, §16.8):**
- Persist a lightweight run record at `.slop-audit/log.json`.
- Each scan appends: timestamp, CLI version, slopIndex, categoryScores, top offense IDs, threshold-exceeded flag.
- Never store source code, full file paths, or secrets.
- Respect `"projectMemory": false` in config to disable.
- `init` should add `.slop-audit/` to `.gitignore` (already done).

**Proposed implementation:**
1. Add types in `src/types.ts`:
   ```ts
   export interface SlopAuditRun {
     timestamp: string;
     version: string;
     slopIndex: number;
     categoryScores: Record<Category, number>;
     topOffenseIds: string[];
     thresholdExceeded: boolean;
   }
   ```
2. Create `src/engine/memory.ts`:
   - `logPath(projectPath: string): string`
   - `appendRun(projectPath: string, report: ProjectReport, thresholdExceeded: boolean): void`
   - `readRuns(projectPath: string): SlopAuditRun[]`
   - `clearLog(projectPath: string): void`
3. Wire `appendRun` into `runScan` in `src/index.ts` after aggregation, guarded by `config.projectMemory !== false`.
4. Add `projectMemory?: boolean` to `ResolvedConfig` and default it to `true` in `src/config.ts`.
5. Add unit tests in `tests/engine/memory.test.ts` covering append/read/clear and disabled state.

**Acceptance criteria:**
- Running a scan appends one record to `.slop-audit/log.json`.
- `projectMemory: false` prevents writes.
- The log stays under 1MB for 1,000 runs (store only aggregated data).

---

### 3.2 `--config <path>` CLI Override (P1)

**Current state:** `loadConfig(cwd)` searches upward for `slop-audit.config.{mjs,cjs,js}`. There is no way to point the CLI at an arbitrary config file.

**Spec requirement (§12):** `--config <path>` loads a custom configuration file.

**Proposed implementation:**
1. Add `config?: string` to `ScanProjectOptions` / `ScanRunOptions` / `CliGlobalOptions`.
2. In `src/config.ts`, change `resolveConfigPath(dir)` to accept an optional explicit path:
   - If explicit path is provided, verify it exists and return it.
   - Otherwise keep the existing upward search.
3. In `src/index.ts`, add `.option('--config <path>', 'path to slop-audit config file')`.
4. Pass `options.config` through to `loadConfig(cwd, options.config)`.
5. Update `init` so the explicit config path is used when diffing/writing.
6. Add integration tests in `tests/integration/cli.test.ts`.

**Acceptance criteria:**
- `slop-audit --config ./configs/strict.mjs` uses that file.
- A missing explicit config exits with code 2 and a clear error.
- Existing auto-discovery still works when `--config` is omitted.

---

### 3.3 `--strict` CI Gate (P1)

**Current state:** Exit code 1 is used whenever thresholds are exceeded. There is no flag to fail harder on critical/high issues.

**Spec requirement (§12):** Exit code 2 when any critical or high issue is found.

**Proposed implementation:**
1. Add `strict?: boolean` to options.
2. Add `.option('--strict', 'exit with code 2 if any critical or high issue is found')`.
3. After scoring, if `options.strict` and any issue has `severity === 'high'`, set `exitCode = 2`.
4. Print a concise message: `"--strict triggered: high-severity issue(s) found."`
5. Add integration tests asserting exit code 2 for high-severity fixtures and exit code 1 without `--strict`.

**Acceptance criteria:**
- `slop-audit --strict` returns 2 when a high-severity issue exists.
- `slop-audit` without `--strict` returns 1 in the same scenario.
- No false 2 when only low/medium issues exist.

---

### 3.4 `--no-increase` Regression Gating (P1)

**Current state:** No historical comparison across runs.

**Spec requirement (§12):** Fail if the project Slop Index increased compared to the previous run.

**Proposed implementation:**
1. Depends on project memory log (#3.1).
2. Add `noIncrease?: boolean` to options and CLI flag.
3. In `runScan`, after computing the report:
   - Read the most recent run from the log.
   - If `noIncrease` is set and `report.slopIndex > previous.slopIndex`, set `exitCode = 2`.
   - Print: `"Slop Index increased from X to Y."`
4. Edge case: if no previous run exists, treat it as a baseline of 0 (passes).
5. Add integration tests.

**Acceptance criteria:**
- `--no-increase` exits 2 when the current Slop Index is higher than the last run.
- Passes when the score decreased or stayed the same.
- Works with `projectMemory: false` by degrading gracefully (warn and ignore).

---

### 3.5 `--trend [n]` Sparkline Report (P1)

**Current state:** No historical reporting.

**Spec requirement (§12):** Print a sparkline of the last N Slop Indexes by category.

**Proposed implementation:**
1. Depends on project memory log (#3.1).
2. Add `trend?: number` to options and `.option('--trend [n]', 'print sparkline of last n runs', parseTrend, 20)`.
3. Create `src/report/trend.ts`:
   - `formatTrend(runs: SlopAuditRun[], categories: Category[]): string`
   - Use a simple sparkline block-character renderer or table.
4. When `--trend` is set, skip the normal scan and only print the trend (or print it after the scan if both are requested).
5. Add tests in `tests/report/trend.test.ts`.

**Acceptance criteria:**
- `slop-audit --trend` prints the last 20 runs.
- `slop-audit --trend 5` prints the last 5.
- Empty log prints a friendly "no run history" message.

---

### 3.6 `--include` / `--exclude` CLI Overrides (P1)

**Current state:** Include/exclude patterns only come from config.

**Spec requirement (§6.3):** Allow command-line include/exclude glob overrides.

**Proposed implementation:**
1. Add `include?: string[]` and `exclude?: string[]` to options.
2. Add repeatable options:
   ```ts
   .option('--include <glob>', 'include pattern (repeatable)', collect, [])
   .option('--exclude <glob>', 'exclude pattern (repeatable)', collect, [])
   ```
3. In `loadConfig`, merge CLI-provided arrays on top of the resolved config:
   - CLI `--include` replaces config `include`.
   - CLI `--exclude` is appended to config `exclude`.
4. Add integration tests.

**Acceptance criteria:**
- `--include 'src/**/*.tsx' --include 'app/**/*.tsx'` restricts scanning to those globs.
- `--exclude '**/*.test.tsx'` excludes tests in addition to config excludes.
- Overrides do not mutate the config file.

---

### 3.7 Color Contrast Rule (`wcag/contrast`) (P2)

**Current state:** §8.3 defines the math, but no rule is registered.

**Spec requirement (§8.3):** Compute WCAG 2.x contrast ratio for inline foreground/background pairs and warn if below 3:1 (large) or 4.5:1 (body).

**Proposed implementation:**
1. Add color parsing helpers in `src/rules/utils.ts`:
   - `parseColor(value: string): { r, g, b } | undefined` for hex/rgb/rgba.
   - `relativeLuminance(rgb)` and `contrastRatio(a, b)`.
2. Extend `ScanFacts` / visitor to capture inline `style` props with `color`/`backgroundColor` on the same element (or `className` derived colors if feasible).
3. Create `src/rules/wcag/contrast.ts`:
   - ID: `wcag/contrast`
   - Severity: `high`
   - `aiSpecific: false`
   - Trigger: computed contrast ratio below configured target.
4. Add `rules.contrastTarget` (default 4.5) and `rules.contrastMethod` to config.
5. Register in `src/rules/builtins.ts`.
6. Add tests in `tests/rules/wcag/contrast.test.ts`.

**Acceptance criteria:**
- Flags `<div style={{ color: '#777', backgroundColor: '#fff' }}>`.
- Ignores pairs that meet the threshold.
- Respects `rules.contrastTarget` override.

---

### 3.8 Additional Component Registries (P2)

**Current state:** Only shadcn/ui has a bundled registry snapshot.

**Spec requirement (§4.8):** Built-in registries for MUI, Ant Design, Chakra UI, Radix Themes.

**Proposed implementation:**
1. Refactor `src/rules/component/registry.ts` into a generic loader:
   - `loadRegistrySnapshot(projectPath, uiLibrary)`
   - Store snapshots under `src/rules/component/snapshots/{shadcn,mui,antd,chakra,radix}.ts`.
2. Add a `uiLibrary` field to `ResolvedConfig` (auto-detected by wizard).
3. Update `component/primitive-reinvention.ts` and `component/shadcn-prop-mismatch.ts` to use the selected registry.
4. Add tests asserting each snapshot loads and known primitives are recognized.

**Acceptance criteria:**
- `uiLibrary: 'mui'` recognizes `<Button>`, `<TextField>`, etc.
- Unknown `uiLibrary` falls back to shadcn snapshot.
- Existing shadcn tests still pass.

---

### 3.9 AST-Level Scan Cache (P2)

**Current state:** `--cache` controls baseline score caching. The spec also mentions local AST result caching.

**Spec requirement (§12):** `--cache` enables local caching of AST results.

**Proposed implementation:**
1. Rename conceptually: baseline cache remains baseline; add an **AST cache** at `.slop-audit/cache/ast/` keyed by file content hash.
2. Cache `FileScanResult` (sans issues if rules changed? safer to cache parsed facts + issues).
3. On scan, compute a quick hash of file content; if cache hit and config hash matches, reuse result.
4. Invalidate when config changes (hash config into cache key).
5. Add `tests/engine/ast-cache.test.ts`.

**Acceptance criteria:**
- Re-scanning an unchanged file with the same config is faster than re-parsing.
- Changing the config invalidates the AST cache.
- `--no-cache` disables both baseline and AST caching.

**Risk:** AST objects can be large; cap cache size or store only `FileScanResult` JSON.

---

### 3.10 Corpus Inference / Rarity Scoring (P3)

**Current state:** A static `corpus/baseline.json` exists but is not consumed by rules.

**Spec requirement (§3.2, §7.5):** Offline rarity scoring based on frequency data from well-designed apps.

**Proposed implementation:**
1. Define `CorpusProfile` type and load `corpus/baseline.json`.
2. Create `src/engine/corpus.ts` with percentile / tail-10% scoring.
3. Add opt-in rules:
   - `visual/arbitrary-rarity` — flag arbitrary layout values in the extreme tail of the corpus.
   - `typo/font-size-rarity`
4. Add `arbitraryTolerance: 'strict' | 'balanced' | 'permissive'` to config and wire to corpus thresholds.

**Acceptance criteria:**
- Corpus is loaded offline, no network.
- Rarity rules do not fire on values near the median.
- Tests cover strict/balanced/permissive modes.

---

### 3.11 CSS-in-JS Plugin API (P3)

**Current state:** No plugin system. `styled-components` / Emotion are explicitly out of default scan scope.

**Spec requirement (Appendix G):** Define `CanonicalStyleNode`, `TokenMap`, and `StyleResolverHook` interfaces; allow plugins to resolve styles without engine changes.

**Proposed implementation:**
1. Add plugin types in `src/types.ts` or `src/plugins/types.ts`.
2. Add `plugins: StyleResolverHook[]` to `ResolvedConfig`.
3. In `src/engine/visitor.ts`, emit `CanonicalStyleNode` candidates for tagged templates / `css()` calls.
4. In rule execution, call resolvers before evaluating visual rules; merge resolved tokens into `ScanFacts`.
5. Provide a sample plugin under `examples/styled-components-plugin.ts`.

**Acceptance criteria:**
- Plugin API is documented and type-safe.
- A sample plugin can resolve a `styled.div` template literal into layout tokens.
- No performance regression when no plugins are registered.

---

### 3.12 Release Engineering / npm Publish Verification (P3)

**Current state:** `prepublishOnly` runs build/test; CI workflow exists; package is not published.

**Spec requirement (§12, Phase 4):** Ship to npm with cross-platform binary verification.

**Proposed implementation:**
1. Verify `.github/workflows/slop-audit.yml` runs on `ubuntu-latest`, `macos-latest`, `windows-latest`.
2. Add a `pnpm prepublishOnly` dry-run check in CI.
3. Ensure `files` array in `package.json` includes `dist`, `bin`, `rules`, `README.md`, `LICENSE`.
4. Publish a `1.0.0` prerelease (`1.0.0-beta.0`) to npm and smoke-test `npx slop-audit@beta --version`.
5. Add a `CHANGELOG.md` entry.

**Acceptance criteria:**
- `npm publish --dry-run` reports the expected files and no errors.
- `npx slop-audit@1.0.0-beta.0 --version` prints the version on all three platforms.

---

## 4. Recommended Execution Order

1. **Project memory log** — unlocks `--no-increase` and `--trend`.
2. `--config`, `--strict`, `--include`/`--exclude` — small, independent wins.
3. `--no-increase` and `--trend` — built on memory log.
4. Color contrast rule and additional registries — flesh out rule coverage.
5. AST-level cache — performance optimization before release.
6. Corpus, CSS-in-JS plugin API, npm publish — final stretch.

---

## 5. Quality Gates for Every Gap

For each feature:
- `pnpm typecheck` passes.
- `pnpm test` passes (including new unit/integration tests).
- `pnpm test:perf` stays under the 8-second budget.
- `pnpm build` succeeds.
- New CLI behavior has at least one integration test in `tests/integration/cli.test.ts`.
- New rules have passing/failing fixtures in `tests/rules/`.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Project memory log grows unbounded | Cap file size; rotate after 1,000 runs. |
| `--no-increase` surprises users on first run | Default previous score to 0; print the compared value. |
| AST cache bloat | Store only `FileScanResult` JSON; include config hash in key. |
| Color contrast false positives | Limit to inline styles; ignore when colors cannot be resolved. |
| npm binary failures on Windows | CI matrix catches missing `@swc/core` platform binaries early. |

---

## 7. Rollback Strategy

- Each gap should land as a single focused commit.
- Use `git revert <commit>` if a feature causes test or perf regressions.
- Feature flags (config options with safe defaults) let users disable behavior without reverting code.

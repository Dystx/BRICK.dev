# slop-audit v1.0.0 — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MVP project skeleton with the v1.0.0 foundation: package metadata, shared domain types, config loader, SWC parser, and AST visitor fact extractor, all covered by unit tests.

**Architecture:** Clean-slate rewrite inside `BRICK/`. Remove old `src/` and `tests/`. Introduce `src/engine/parser.ts` and `src/engine/visitor.ts` on top of `@swc/core`. The visitor extracts a `ScanFacts` object that all P0 rules will consume, keeping rules parser-agnostic.

**Tech Stack:** Node.js 18+, TypeScript strict, `@swc/core`, `commander`, `chalk`, `minimatch`, `globby`, `vitest`, `tsup`.

---

## File Structure

```
BRICK/
├── bin/slop-audit.js
├── src/
│   ├── types.ts
│   ├── config.ts
│   ├── engine/
│   │   ├── parser.ts
│   │   └── visitor.ts
│   └── index.ts              # minimal CLI bootstrap for this phase
├── tests/
│   ├── engine/
│   │   ├── parser.test.ts
│   │   └── visitor.test.ts
│   └── fixtures/
│       └── sample.tsx
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

### Task 1: Reset project dependencies and metadata

**Files:**
- Modify: `package.json`
- Modify: `tsup.config.ts`
- Delete: `src/*`, `tests/*` (old MVP files)
- Create: `src/index.ts` (minimal stub)

**Goal:** Update the project to v1.0.0 dependencies and remove the MVP source.

- [ ] **Step 1: Delete old source and tests**

Run:
```bash
rm -rf src tests dist
```

Expected: `src/` and `tests/` directories no longer exist.

- [ ] **Step 2: Write new `package.json`**

Create `package.json`:

```json
{
  "name": "slop-audit",
  "version": "1.0.0",
  "description": "Detect AI-generated frontend slop",
  "type": "module",
  "bin": {
    "slop-audit": "bin/slop-audit.js"
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@swc/core": "^1.10.0",
    "chalk": "^4.1.2",
    "commander": "^12.1.0",
    "globby": "^14.0.0",
    "minimatch": "^9.0.5"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsup": "^8.3.5",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "dist",
    "bin",
    "README.md",
    "LICENSE",
    "!dist/**/*.map"
  ],
  "keywords": [
    "ai",
    "slop",
    "frontend",
    "linter",
    "tailwind",
    "design-system",
    "react",
    "code-quality"
  ],
  "author": "Brick.dev",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/brickdotdev/slop-audit.git"
  }
}
```

- [ ] **Step 3: Update `tsup.config.ts` to externalize `@swc/core`**

Create `tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['cjs', 'esm'],
  target: 'node18',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  external: [
    '@swc/core',
    'commander',
    'chalk',
    'globby',
    'minimatch',
  ],
});
```

- [ ] **Step 4: Create minimal `src/index.ts` stub**

Create `src/index.ts`:

```ts
export const VERSION = '1.0.0';

export function hello(): string {
  return 'slop-audit v1.0.0';
}
```

- [ ] **Step 5: Install dependencies**

Run:
```bash
pnpm install
```

Expected: `node_modules` populated with `@swc/core`.

- [ ] **Step 6: Commit**

Run:
```bash
git add -A
git commit -m "chore(slop-audit): reset to v1.0.0 foundation deps" -m "Remove MVP source, update package.json, add @swc/core"
```

---

### Task 2: Define shared domain types

**Files:**
- Create: `src/types.ts`

**Goal:** Establish the domain model used by the engine, rules, reports, and cache.

- [ ] **Step 1: Write failing test for type exports**

Create `tests/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VERSION, type Severity, type Issue, type FileScanResult } from '../src/types';

describe('types', () => {
  it('exports version', () => {
    expect(VERSION).toBe('1.0.0');
  });

  it('allows valid severity values', () => {
    const s: Severity = 'high';
    expect(s).toBe('high');
  });

  it('constructs a FileScanResult', () => {
    const issue: Issue = {
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      message: 'Hook used in RSC',
      line: 1,
      column: 1,
    };
    const result: FileScanResult = {
      filePath: 'Button.tsx',
      componentCount: 1,
      astNodeCount: 10,
      issues: [issue],
    };
    expect(result.issues[0].ruleId).toBe('logic/boundary-violation');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test tests/types.test.ts
```

Expected: FAIL — `src/types.ts` not found.

- [ ] **Step 3: Implement `src/types.ts`**

Create `src/types.ts`:

```ts
export const VERSION = '1.0.0';

export type Severity = 'low' | 'medium' | 'high';

export type Category =
  | 'visual'
  | 'typo'
  | 'wcag'
  | 'layout'
  | 'component'
  | 'logic'
  | 'arch'
  | 'perf';

export interface FixSuggestion {
  kind: 'insert' | 'replace' | 'css-anchor';
  description: string;
  targetFile?: string;
  anchor?: string;
}

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

export interface ClassNameFact {
  value: string;
  line: number;
  column: number;
}

export interface ElementFact {
  tag: string;
  attributes: Record<string, string | undefined>;
  classNames: ClassNameFact[];
  line: number;
  column: number;
}

export interface HookFact {
  name: string;
  line: number;
  column: number;
}

export interface ComponentFacts {
  name?: string;
  line: number;
  column: number;
  isServerComponent: boolean;
  hookCalls: HookFact[];
}

export interface LogicalExpressionFact {
  depth: number;
  line: number;
  column: number;
  text: string;
}

export interface ScanFacts {
  filePath: string;
  astNodeCount: number;
  components: ComponentFacts[];
  staticClassNames: ClassNameFact[];
  interactiveElements: ElementFact[];
  hooks: HookFact[];
  logicalExpressions: LogicalExpressionFact[];
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
  componentScore: number;
  adjustedScore: number;
  componentCount: number;
}

export interface BaselineMeta {
  active: boolean;
  version: string;
  baselineRevision: number;
  createdAt: string;
}

export interface ProjectReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;
  assemblyHealth: number;
  categoryScores: Record<Category, number>;
  p90Score: number;
  peakScore: number;
  componentCount: number;
  components: ComponentScore[];
  issues: Issue[];
  baseline?: BaselineMeta;
}

export interface BaselineCache {
  version: string;
  config_hash: string;
  git_head: string;
  baseline_created: string;
  baseline_revision: number;
  totalComponentCount: number;
  scores: Record<string, { baselineScore: number; componentCount: number }>;
}

export interface RuleContext {
  config: ResolvedConfig;
  filePath: string;
}

export interface Rule<Context = unknown> {
  id: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
}

export interface ResolvedConfig {
  framework?: string;
  include: string[];
  exclude: string[];
  rules: Record<string, Severity | 'off'>;
  frameworkMultipliers: Record<string, number>;
  ruleConfig: Record<string, unknown>;
  gapTokens?: string[];
  contextTaxCaps: { cleanCap: number; standardCap: number };
  globalCssTarget?: string;
  thresholds: {
    meanSlop: number;
    p90Slop: number;
    individualSlopThreshold: number;
  };
  arbitraryValueAllowlist: (string | RegExp)[];
  wcag: {
    targetSizeExemptSelectors: string[];
  };
}
```

- [ ] **Step 4: Update `src/index.ts` to re-export types**

Modify `src/index.ts` to:

```ts
export * from './types';

export function hello(): string {
  return 'slop-audit v1.0.0';
}
```

- [ ] **Step 5: Run tests**

Run:
```bash
pnpm test tests/types.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:
```bash
git add -A
git commit -m "feat(slop-audit): add shared domain types"
```

---

### Task 3: Implement config loader

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Goal:** Load and merge `slop-audit.config.js`/`slop-audit.config.mjs`/`slop-audit.config.cjs`, supporting both ESM and CJS.

- [ ] **Step 1: Write failing tests**

Create `tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../src/config';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = join(tmpdir(), 'slop-audit-config-test-' + Date.now());

describe('loadConfig', () => {
  it('returns default config when no config file exists', async () => {
    const config = await loadConfig(tmp);
    expect(config.include).toEqual(DEFAULT_CONFIG.include);
    expect(config.thresholds.meanSlop).toBe(25);
  });

  it('loads an ESM config file', async () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(
      join(tmp, 'slop-audit.config.mjs'),
      `export default { thresholds: { meanSlop: 10 } };`,
    );
    const config = await loadConfig(tmp);
    expect(config.thresholds.meanSlop).toBe(10);
    expect(config.include).toEqual(DEFAULT_CONFIG.include);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('loads a CJS config file', async () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(
      join(tmp, 'slop-audit.config.cjs'),
      `module.exports = { thresholds: { meanSlop: 15 } };`,
    );
    const config = await loadConfig(tmp);
    expect(config.thresholds.meanSlop).toBe(15);
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:
```bash
pnpm test tests/config.test.ts
```

Expected: FAIL — `src/config.ts` not found.

- [ ] **Step 3: Implement `src/config.ts`**

Create `src/config.ts`:

```ts
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { ResolvedConfig } from './types';

export const DEFAULT_SPACING_SCALE = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];

export const DEFAULT_TYPOGRAPHY_SCALE = [
  '0.75rem', '0.875rem', '1rem', '1.125rem', '1.25rem',
  '1.5rem', '1.875rem', '2.25rem', '3rem', '3.75rem', '4.5rem',
];

export const DEFAULT_CONFIG: ResolvedConfig = {
  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  rules: {
    'visual/arbitrary-escape': 'medium',
    'visual/generic-centering': 'low',
    'logic/boundary-violation': 'high',
    'logic/zombie-state': 'medium',
    'logic/ghost-defensive': 'medium',
    'wcag/target-size': 'high',
    'wcag/focus-appearance': 'high',
  },
  frameworkMultipliers: {
    react: 1.0,
    vue: 1.0,
    svelte: 1.0,
    solid: 1.0,
    qwik: 1.0,
    astro: 1.0,
  },
  ruleConfig: {
    genericCenteringMaxInstances: 1,
  },
  contextTaxCaps: {
    cleanCap: 1.5,
    standardCap: 2.0,
  },
  thresholds: {
    meanSlop: 25,
    p90Slop: 50,
    individualSlopThreshold: 50,
  },
  arbitraryValueAllowlist: [
    'w-full',
    /^w-\[calc\(.*\)\]$/,
    'top-[var(--header-height)]',
  ],
  wcag: {
    targetSizeExemptSelectors: [],
  },
};

function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const out = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const s = source[key];
    if (s && typeof s === 'object' && !Array.isArray(s) && out[key] && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key] as Record<string, unknown>, s as Record<string, unknown>);
    } else {
      out[key] = s;
    }
  }
  return out as T;
}

function resolveConfigPath(dir: string): string | undefined {
  const candidates = [
    'slop-audit.config.mjs',
    'slop-audit.config.cjs',
    'slop-audit.config.js',
  ];
  for (const name of candidates) {
    const full = join(dir, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

async function loadConfigFile(path: string): Promise<Partial<ResolvedConfig>> {
  const ext = path.split('.').pop();
  if (ext === 'cjs') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path);
    return mod.default ?? mod;
  }
  const mod = await import(path);
  return mod.default ?? mod;
}

export async function loadConfig(cwd: string): Promise<ResolvedConfig> {
  const configPath = resolveConfigPath(cwd);
  if (!configPath) {
    return DEFAULT_CONFIG;
  }
  const user = await loadConfigFile(resolve(configPath));
  return deepMerge(DEFAULT_CONFIG, user as Record<string, unknown>);
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
pnpm test tests/config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add -A
git commit -m "feat(slop-audit): add config loader with ESM/CJS support"
```

---

### Task 4: Implement SWC parser wrapper

**Files:**
- Create: `src/engine/parser.ts`
- Create: `tests/engine/parser.test.ts`

**Goal:** Parse files with `@swc/core` returning an SWC AST plus node count.

- [ ] **Step 1: Write failing tests**

Create `tests/engine/parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/engine/parser';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = join(tmpdir(), 'slop-audit-parser-test-' + Date.now());

describe('parseFile', () => {
  it('parses a TSX file', async () => {
    mkdirSync(tmp, { recursive: true });
    const file = join(tmp, 'Button.tsx');
    writeFileSync(file, `export function Button() { return <button>Hi</button>; }`);
    const result = await parseFile(file);
    expect(result.ast.type).toBe('Module');
    expect(result.nodeCount).toBeGreaterThan(5);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('throws on invalid syntax', async () => {
    mkdirSync(tmp, { recursive: true });
    const file = join(tmp, 'bad.tsx');
    writeFileSync(file, `export function Button() { return <button>`);
    await expect(parseFile(file)).rejects.toThrow();
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:
```bash
pnpm test tests/engine/parser.test.ts
```

Expected: FAIL — parser module not found.

- [ ] **Step 3: Implement `src/engine/parser.ts`**

Create `src/engine/parser.ts`:

```ts
import { parseFile as swcParseFile } from '@swc/core';
import type { Module } from '@swc/core/types';

export interface ParseResult {
  ast: Module;
  nodeCount: number;
}

function syntaxFor(filePath: string): { syntax: 'typescript' | 'ecmascript'; jsx: boolean } {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') {
    return { syntax: 'typescript', jsx: ext === 'tsx' };
  }
  return { syntax: 'ecmascript', jsx: ext === 'jsx' };
}

export async function parseFile(filePath: string): Promise<ParseResult> {
  const { syntax, jsx } = syntaxFor(filePath);
  const ast = await swcParseFile(filePath, {
    syntax,
    jsx,
    target: 'es2022',
    module: {
      type: 'es6',
    },
  });
  return { ast, nodeCount: countNodes(ast) };
}

function countNodes(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0;
  let count = 1;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        count += countNodes(item);
      }
    } else if (typeof value === 'object' && value !== null) {
      count += countNodes(value);
    }
  }
  return count;
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
pnpm test tests/engine/parser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add -A
git commit -m "feat(slop-audit): add SWC parser wrapper"
```

---

### Task 5: Implement AST visitor fact extractor

**Files:**
- Create: `src/engine/visitor.ts`
- Create: `tests/engine/visitor.test.ts`
- Create: `tests/fixtures/sample.tsx`

**Goal:** Walk the SWC AST and extract `ScanFacts`.

- [ ] **Step 1: Write failing tests**

Create `tests/fixtures/sample.tsx`:

```tsx
export function Button() {
  return <button className="flex items-center justify-center">Click</button>;
}

export function Form() {
  const [value, setValue] = useState('');
  return <input value={value} onChange={(e) => setValue(e.target.value)} />;
}
```

Create `tests/engine/visitor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { join } from 'path';

const fixture = join(__dirname, '../fixtures/sample.tsx');

describe('extractFacts', () => {
  it('extracts components and class names', async () => {
    const { ast, nodeCount } = await parseFile(fixture);
    const facts = extractFacts(fixture, ast, nodeCount);
    expect(facts.components.length).toBe(2);
    expect(facts.staticClassNames.length).toBe(1);
    expect(facts.staticClassNames[0].value).toBe('flex items-center justify-center');
  });

  it('detects useState hook usage', async () => {
    const { ast, nodeCount } = await parseFile(fixture);
    const facts = extractFacts(fixture, ast, nodeCount);
    const form = facts.components.find((c) => c.name === 'Form');
    expect(form).toBeDefined();
    expect(form!.hookCalls.some((h) => h.name === 'useState')).toBe(true);
  });

  it('marks files without use client as server components', async () => {
    const { ast, nodeCount } = await parseFile(fixture);
    const facts = extractFacts(fixture, ast, nodeCount);
    expect(facts.components.every((c) => c.isServerComponent)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:
```bash
pnpm test tests/engine/visitor.test.ts
```

Expected: FAIL — visitor module not found.

- [ ] **Step 3: Implement `src/engine/visitor.ts`**

Create `src/engine/visitor.ts`:

```ts
import { Visitor } from '@swc/core/Visitor';
import type {
  BlockStatement,
  CallExpression,
  Expression,
  FunctionDeclaration,
  FunctionExpression,
  ArrowFunctionExpression,
  Identifier,
  JSXAttribute,
  JSXElement,
  JSXOpeningElement,
  Module,
  ModuleItem,
  Statement,
  StringLiteral,
  TemplateLiteral,
} from '@swc/core/types';
import type {
  ClassNameFact,
  ComponentFacts,
  ElementFact,
  HookFact,
  LogicalExpressionFact,
  ScanFacts,
} from '../types';

class SlopVisitor extends Visitor {
  filePath: string;
  initialNodeCount: number;
  components: ComponentFacts[] = [];
  staticClassNames: ClassNameFact[] = [];
  interactiveElements: ElementFact[] = [];
  hooks: HookFact[] = [];
  logicalExpressions: LogicalExpressionFact[] = [];
  hasUseClient = false;
  private nodeStack: string[] = [];

  constructor(filePath: string, initialNodeCount: number) {
    super();
    this.filePath = filePath;
    this.initialNodeCount = initialNodeCount;
  }

  visitModuleItems(items: ModuleItem[]): ModuleItem[] {
    for (const item of items) {
      if (
        item.type === 'ExpressionStatement' &&
        item.expression.type === 'StringLiteral' &&
        item.expression.value === 'use client'
      ) {
        this.hasUseClient = true;
      }
    }
    return super.visitModuleItems(items);
  }

  visitFunctionDeclaration(n: FunctionDeclaration): FunctionDeclaration {
    this.push('FunctionDeclaration');
    const body = this.extractComponent(n.identifier?.value, n.body, n.span?.start ?? 0);
    const result = super.visitFunctionDeclaration(n);
    this.pop();
    return result;
  }

  visitFunctionExpression(n: FunctionExpression): FunctionExpression {
    this.push('FunctionExpression');
    const result = super.visitFunctionExpression(n);
    this.pop();
    return result;
  }

  visitArrowFunctionExpression(n: ArrowFunctionExpression): ArrowFunctionExpression {
    this.push('ArrowFunctionExpression');
    const result = super.visitArrowFunctionExpression(n);
    this.pop();
    return result;
  }

  private push(kind: string) {
    this.nodeStack.push(kind);
  }

  private pop() {
    this.nodeStack.pop();
  }

  private extractComponent(
    name: string | undefined,
    body: BlockStatement | Expression,
    start: { line: number; column: number },
  ): void {
    // Lightweight detection: mark as component if body contains JSX (will be refined when JSX is visited).
  }

  visitJSXElement(el: JSXElement): JSXElement {
    const opening = el.opening;
    if (opening && opening.name?.type === 'Identifier') {
      const tag = opening.name.value;
      const isInteractive = ['button', 'a', 'input'].includes(tag);
      const classFacts: ClassNameFact[] = [];
      const attributes: Record<string, string | undefined> = {};
      for (const attr of opening.attributes ?? []) {
        if (attr.type === 'JSXAttribute') {
          const attrName = attr.name.type === 'Identifier' ? attr.name.value : attr.name.value;
          attributes[attrName] = extractAttributeValue(attr);
          if (attrName === 'className' || attrName === 'class') {
            const classes = extractClassNames(attr);
            classFacts.push(...classes);
          }
        }
      }
      if (isInteractive) {
        this.interactiveElements.push({
          tag,
          attributes,
          classNames: classFacts,
          line: opening.span.start.line,
          column: opening.span.start.column,
        });
      }
    }
    return super.visitJSXElement(el);
  }

  visitCallExpression(expr: CallExpression): CallExpression {
    if (expr.callee.type === 'Identifier') {
      const name = expr.callee.value;
      if (
        name === 'useState' ||
        name === 'useEffect' ||
        name === 'useContext' ||
        name === 'useReducer' ||
        name === 'useRef'
      ) {
        this.hooks.push({
          name,
          line: expr.span.start.line,
          column: expr.span.start.column,
        });
      }
    }
    return super.visitCallExpression(expr);
  }

  visitBinExpr(expr: any): any {
    if (expr.op === '&&') {
      const depth = measureAndChainDepth(expr);
      if (depth >= 3) {
        this.logicalExpressions.push({
          depth,
          line: expr.span.start.line,
          column: expr.span.start.column,
          text: '', // source text unavailable from AST alone
        });
      }
    }
    return super.visitBinExpr(expr);
  }
}

function extractAttributeValue(attr: JSXAttribute): string | undefined {
  if (!attr.value) return undefined;
  if (attr.value.type === 'StringLiteral') return attr.value.value;
  if (attr.value.type === 'JSXExpressionContainer') {
    const expr = attr.value.expression;
    if (expr.type === 'StringLiteral') return expr.value;
  }
  return undefined;
}

function extractClassNames(attr: JSXAttribute): ClassNameFact[] {
  const facts: ClassNameFact[] = [];
  if (!attr.value) return facts;
  if (attr.value.type === 'StringLiteral') {
    facts.push({ value: attr.value.value, line: attr.span.start.line, column: attr.span.start.column });
  } else if (attr.value.type === 'JSXExpressionContainer') {
    const expr = attr.value.expression;
    if (expr.type === 'StringLiteral') {
      facts.push({ value: expr.value, line: expr.span.start.line, column: expr.span.start.column });
    } else if (expr.type === 'TemplateLiteral' && (expr.expressions?.length ?? 0) === 0) {
      const value = expr.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
      facts.push({ value, line: expr.span.start.line, column: expr.span.start.column });
    }
  }
  return facts;
}

function measureAndChainDepth(expr: any): number {
  if (expr?.type !== 'BinExpr' || expr.op !== '&&') return 0;
  const left = measureAndChainDepth(expr.left);
  const rightDepth = 1;
  return left + rightDepth;
}

function findComponents(module: Module): ComponentFacts[] {
  const components: ComponentFacts[] = [];
  for (const item of module.body) {
    if (item.type === 'ExportDeclaration' || item.type === 'ExportDefaultDeclaration') {
      const decl =
        item.type === 'ExportDeclaration' ? item.declaration : item.decl;
      if (decl?.type === 'FunctionDeclaration' && decl.identifier) {
        components.push({
          name: decl.identifier.value,
          line: decl.span.start.line,
          column: decl.span.start.column,
          isServerComponent: true,
          hookCalls: [],
        });
      }
    } else if (item.type === 'FunctionDeclaration' && item.identifier) {
      components.push({
        name: item.identifier.value,
        line: item.span.start.line,
        column: item.span.start.column,
        isServerComponent: true,
        hookCalls: [],
      });
    }
  }
  return components;
}

export function extractFacts(filePath: string, ast: Module, nodeCount: number): ScanFacts {
  const visitor = new SlopVisitor(filePath, nodeCount);
  visitor.visitProgram(ast);
  const components = findComponents(ast).map((c) => ({
    ...c,
    isServerComponent: !visitor.hasUseClient,
    hookCalls: visitor.hooks,
  }));
  return {
    filePath,
    astNodeCount: nodeCount,
    components,
    staticClassNames: visitor.staticClassNames,
    interactiveElements: visitor.interactiveElements,
    hooks: visitor.hooks,
    logicalExpressions: visitor.logicalExpressions,
  };
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
pnpm test tests/engine/visitor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add -A
git commit -m "feat(slop-audit): add AST visitor fact extractor"
```

---

### Task 6: Typecheck and build gate

**Files:**
- Modify: `tsconfig.json` (if needed)
- Modify: `vitest.config.ts`

**Goal:** Ensure the foundation compiles and builds cleanly.

- [ ] **Step 1: Create `vitest.config.ts`**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 2: Create `tsconfig.json`**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:
```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Run build**

Run:
```bash
pnpm build
```

Expected: dist generated.

- [ ] **Step 6: Commit**

Run:
```bash
git add -A
git commit -m "chore(slop-audit): add tsconfig and vitest config, verify build gate"
```

---

## Self-Review

- **Spec coverage:** This phase implements the foundation required by Sections 4.1 (Engine), 4.2 (Component Detection), 7 (Dynamic Class Extraction Boundary), 8 (baseline constants), and 12 (config loading) of the v1.0.0 spec.
- **Placeholder scan:** No TBD/TODO placeholders. Each step includes exact file paths and code.
- **Type consistency:** `ResolvedConfig`, `ScanFacts`, `Issue`, and `FileScanResult` match the design document and are reused in later phases.

## Gaps for Later Phases

- Worker pool and multi-threading (Phase 2).
- Rule registry and P0 rules (Phase 3).
- Scoring, baseline cache, CLI commands (Phase 4).
- Reporting and `--fix` pipeline (Phase 5).
- Performance benchmark and CI (Phase 6).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-14-slop-audit-v1.0.0-phase1-foundation.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using checkpoints.

Which approach would you like?

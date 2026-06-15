# slop-audit CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish the MVP `npx slop-audit` CLI that scans React/TSX projects, detects visual and logic slop, calculates a Slop Index, and prints a brutal terminal report with a README badge.

**Architecture:** TypeScript CLI built with `commander`, AST parsing via `ts-morph`, terminal styling via `chalk`, bundled with `tsup`, tested with `vitest`. The pipeline is: discover files → detect components → extract tokens/classNames/styles → run detectors → score → report.

**Tech Stack:** Node.js 18+, TypeScript, commander, ts-morph, chalk@4, tsup, vitest, pnpm.

---

## File Structure

```
slop-audit/
├── bin/slop-audit.js
├── src/
│   ├── cli.ts
│   ├── index.ts
│   ├── types.ts
│   ├── config/
│   │   ├── schema.ts
│   │   ├── loader.ts
│   │   └── wizard.ts
│   ├── tokenizer/
│   │   ├── tailwind-v4.ts      # CSS @theme (Tailwind v4)
│   │   ├── tailwind-v3.ts      # tailwind.config.js (Tailwind v3)
│   │   ├── css-vars.ts
│   │   ├── oklch.ts
│   │   ├── cache.ts
│   │   └── index.ts
│   ├── extractor/
│   │   ├── project.ts
│   │   ├── component.ts
│   │   ├── className.ts
│   │   └── style.ts
│   ├── detectors/
│   │   ├── visual.ts
│   │   ├── spacing.ts
│   │   ├── typography.ts
│   │   ├── components.ts
│   │   ├── logic.ts
│   │   ├── architecture.ts
│   │   ├── ai-smells.ts        # banned-defaults + AI tendency patterns
│   │   └── index.ts
│   ├── math/
│   │   ├── spacing.ts
│   │   ├── typography.ts
│   │   ├── contrast.ts
│   │   ├── proportions.ts
│   │   └── zIndex.ts
│   ├── corpus/
│   │   ├── baseline.json
│   │   └── inference.ts
│   ├── ai-smells/
│   │   ├── patterns.ts
│   │   └── autopsy.ts
│   ├── context/
│   │   └── classifier.ts
│   ├── memory/
│   │   └── log.ts              # project-local .slop-audit/log.json
│   ├── scorer.ts
│   └── reporter/
│       ├── terminal.ts
│       ├── json.ts
│       ├── badge.ts
│       └── advice.ts
├── tests/
│   ├── fixtures/
│   │   ├── clean-shadcn.tsx
│   │   ├── ai-landing.tsx
│   │   ├── vibe-dashboard.tsx
│   │   ├── tailwind-v3.config.js
│   │   └── tailwind-v4-theme.css
│   └── unit/
│       ├── config.test.ts
│       ├── tokenizer.test.ts
│       ├── extractor.test.ts
│       ├── detectors.test.ts
│       ├── ai-smells.test.ts
│       └── scorer.test.ts
├── rules/
│   └── banned-defaults.json
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── README.md
```

---

## Task 1: Scaffold Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `bin/slop-audit.js`
- Create: `README.md` (skeleton)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "slop-audit",
  "version": "0.1.0",
  "description": "Detect AI-generated frontend slop",
  "type": "module",
  "bin": { "slop-audit": "./bin/slop-audit.js" },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsup",
    "build:corpus": "tsx scripts/generate-corpus.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "chalk": "^4.1.2",
    "commander": "^12.1.0",
    "ts-morph": "^24.0.0",
    "globby": "^14.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsup": "^8.3.5",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  },
  "engines": { "node": ">=18" },
  "files": ["dist", "bin", "corpus", "rules", "README.md", "LICENSE"],
  "publishConfig": {
    "provenance": true,
    "access": "public"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["cjs", "esm"],
  target: "node18",
  splitting: false,
  sourcemap: true,
  dts: { entry: { index: "src/index.ts" } },
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 5: Create bin/slop-audit.js**

```js
#!/usr/bin/env node
import("../dist/cli.mjs");
```

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`

Expected: `node_modules` created, lockfile generated.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: scaffold slop-audit project"
```

---

## Task 2: Shared Types & Config Schema

**Files:**
- Create: `src/types.ts`
- Create: `src/config/schema.ts`
- Create: `tests/unit/config.test.ts`

- [ ] **Step 1: Write failing test for config defaults**

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig, validateConfig } from "../../src/config/schema";

describe("config schema", () => {
  it("provides sensible defaults", () => {
    expect(defaultConfig.framework).toBe("react");
    expect(defaultConfig.baseSpacing).toBe(4);
    expect(defaultConfig.strictness).toBe("balanced");
  });

  it("rejects invalid strictness", () => {
    expect(() => validateConfig({ strictness: "medium" })).toThrow();
  });
});
```

Run: `pnpm test tests/unit/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement types.ts**

```ts
export type Severity = "critical" | "high" | "medium" | "low";
export type Strictness = "brutal" | "balanced" | "gentle";
export type Category = "visual" | "typography" | "spacing" | "component" | "logic" | "architecture";

export interface Issue {
  ruleId: string;
  category: Category;
  severity: Severity;
  message: string;
  line: number;
  column: number;
  advice?: string;
}

export interface ComponentReport {
  file: string;
  name: string;
  line: number;
  slopIndex: number;
  issues: Issue[];
}

export interface SlopAuditReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  components: ComponentReport[];
  topOffenses: Issue[];
  advice: string[];
  ignoredIssues: number;
  unscannedFiles: string[];
}
```

- [ ] **Step 3: Implement config/schema.ts**

```ts
import { Strictness } from "../types";

export interface SlopAuditConfig {
  framework: "react" | "vue" | "svelte" | "solid";
  styling: "tailwind" | "css-modules" | "styled-components" | "emotion" | "plain";
  uiLibrary?: string;
  baseSpacing: number;
  typeScaleRatio?: number;
  arbitraryTolerance: "strict" | "balanced" | "permissive";
  strictness: Strictness;
  include: string[];
  exclude: string[];
  legacyPaths?: string[];
  allowedArbitraryPaths?: string[];
  componentRegistry: Record<string, string[]>;
  disabledRules?: string[];
  bannedDefaults: boolean;
  projectMemory: boolean;
  categoryThresholds: Record<Category, number>;
  corpusVersion?: string;
  rules: {
    maxUseEffectPerComponent: number;
    maxComponentLines: number;
    maxJsxNestingDepth: number;
    maxDirectChildren: number;
    maxProps: number;
    contrastMethod: "wcag2" | "wcag3" | "apca";
    contrastTarget: number;
  };
}

export const defaultConfig: SlopAuditConfig = {
  framework: "react",
  styling: "tailwind",
  uiLibrary: "shadcn/ui",
  baseSpacing: 4,
  typeScaleRatio: 1.2,
  arbitraryTolerance: "balanced",
  strictness: "balanced",
  include: ["src/**/*", "app/**/*", "pages/**/*", "components/**/*"],
  exclude: [
    "**/node_modules/**",
    "**/*.test.{ts,tsx,js,jsx}",
    "**/*.stories.{ts,tsx}",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
  ],
  legacyPaths: [],
  allowedArbitraryPaths: [],
  componentRegistry: {
    button: ["Button"],
    input: ["Input"],
    dialog: ["Dialog"],
    card: ["Card"],
    select: ["Select"],
    badge: ["Badge"],
  },
  disabledRules: [],
  bannedDefaults: true,
  projectMemory: true,
  categoryThresholds: {
    visual: 0.35,
    typography: 0.35,
    spacing: 0.35,
    component: 0.35,
    logic: 0.5,
    architecture: 0.5,
  },
  rules: {
    maxUseEffectPerComponent: 3,
    maxComponentLines: 500,
    maxJsxNestingDepth: 6,
    maxDirectChildren: 10,
    maxProps: 10,
    contrastMethod: "wcag2",
    contrastTarget: 4.5,
  },
};

export function validateConfig(partial: unknown): SlopAuditConfig {
  const cfg = { ...defaultConfig, ...(partial as Partial<SlopAuditConfig>) };
  if (!["brutal", "balanced", "gentle"].includes(cfg.strictness)) {
    throw new Error(`Invalid strictness: ${cfg.strictness}`);
  }
  return cfg as SlopAuditConfig;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/unit/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add shared types and config schema"
```

---

## Task 3: Tokenizer — Extract Tailwind Tokens

**Files:**
- Create: `src/tokenizer/tailwind-v3.ts`
- Create: `src/tokenizer/tailwind-v4.ts`
- Create: `src/tokenizer/oklch.ts`
- Create: `src/tokenizer/index.ts`
- Create: `tests/unit/tokenizer.test.ts`
- Create: `tests/fixtures/tailwind-v3.config.js`
- Create: `tests/fixtures/tailwind-v4-theme.css`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { extractDesignTokens } from "../../src/tokenizer";
import { join } from "node:path";

describe("extractDesignTokens", () => {
  it("reads spacing values from a Tailwind v3 config", () => {
    const tokens = extractDesignTokens({
      tailwindConfigPath: join(__dirname, "../fixtures/tailwind-v3.config.js"),
    });
    const values = tokens.spacing.map((t) => t.value);
    expect(values).toContain(4);
    expect(values).toContain(16);
  });

  it("reads spacing values from a Tailwind v4 @theme CSS file", () => {
    const tokens = extractDesignTokens({
      tailwindThemeCssPath: join(__dirname, "../fixtures/tailwind-v4-theme.css"),
    });
    const values = tokens.spacing.map((t) => t.value);
    expect(values).toContain(4);
    expect(values).toContain(16);
  });

  it("preserves OKLCH color raw values", () => {
    const tokens = extractDesignTokens({
      tailwindThemeCssPath: join(__dirname, "../fixtures/tailwind-v4-theme.css"),
    });
    expect(tokens.colors.length).toBeGreaterThan(0);
    const primary = tokens.colors.find((c) => c.name === "primary");
    expect(primary).toBeDefined();
    expect(primary?.oklch).toContain("oklch");
  });
});
```

Run: `pnpm test tests/unit/tokenizer.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create fixtures**

```js
// tests/fixtures/tailwind-v3.config.js
module.exports = {
  theme: {
    extend: {
      spacing: { 13: "3.25rem" },
    },
    spacing: {
      0: "0px",
      1: "0.25rem",
      4: "1rem",
      16: "4rem",
    },
  },
};
```

```css
/* tests/fixtures/tailwind-v4-theme.css */
@import "tailwindcss";

@theme {
  --spacing-*: initial;
  --spacing-0: 0px;
  --spacing-1: 0.25rem;
  --spacing-4: 1rem;
  --spacing-16: 4rem;

  --color-primary: oklch(55% 0.2 250);
  --color-surface: #ffffff;
}
```

- [ ] **Step 3: Implement tokenizers**

`tailwind-v3.ts`: walk the exported `theme` object with `ts-morph` and convert rem values to px using a 16px base.

`tailwind-v4.ts`: parse the CSS file, collect `@theme { ... }` declarations, read `--spacing-*` and `--color-*` custom properties.

`oklch.ts`: convert hex, rgb, hsl, oklch, lch values to a normalized `{ l, c, h }` object (OKLCH) for contrast math.

`index.ts`: merge both token sources and CSS variables into a single `DesignTokens` object.

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/unit/tokenizer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tokenizer tests
git commit -m "feat: extract Tailwind v3/v4 design tokens and OKLCH colors"
```

---

## Task 3b: Token Cache (supports `--no-cache`)

**Files:**
- Create: `src/tokenizer/cache.ts`
- Create: `tests/unit/tokenizer-cache.test.ts`

- [ ] **Step 1: Implement cache.ts**

```ts
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DesignTokens } from "../types";

interface CacheEntry {
  mtime: number;
  tokens: DesignTokens;
}

export class TokenCache {
  private path: string;
  private enabled: boolean;

  constructor(projectPath: string, enabled = true) {
    this.path = join(projectPath, ".slop-audit", "cache.json");
    this.enabled = enabled;
  }

  get(filePath: string): DesignTokens | undefined {
    if (!this.enabled) return undefined;
    try {
      const cache: Record<string, CacheEntry> = JSON.parse(readFileSync(this.path, "utf-8"));
      const entry = cache[this.key(filePath)];
      if (entry && statSync(filePath).mtimeMs === entry.mtime) {
        return entry.tokens;
      }
    } catch {}
    return undefined;
  }

  set(filePath: string, tokens: DesignTokens): void {
    if (!this.enabled) return;
    let cache: Record<string, CacheEntry> = {};
    try {
      cache = JSON.parse(readFileSync(this.path, "utf-8"));
    } catch {}
    cache[this.key(filePath)] = { mtime: statSync(filePath).mtimeMs, tokens };
    writeFileSync(this.path, JSON.stringify(cache, null, 2) + "\n");
  }

  private key(filePath: string): string {
    return createHash("sha256").update(filePath).digest("hex").slice(0, 16);
  }
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test tests/unit/tokenizer-cache.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/tokenizer tests
git commit -m "feat: add token extraction cache"
```

---

## Task 4: Extractor — Component & Style Extraction

**Files:**
- Create: `src/extractor/project.ts`
- Create: `src/extractor/component.ts`
- Create: `src/extractor/className.ts`
- Create: `src/extractor/style.ts`
- Create: `tests/unit/extractor.test.ts`
- Create: `tests/fixtures/sample.tsx`

- [ ] **Step 1: Create sample fixture**

```tsx
// tests/fixtures/sample.tsx
import { useState } from "react";

export function SloppyCard() {
  const [count, setCount] = useState(0);
  return (
    <div
      className="w-[123px] h-[45px] p-[13px] bg-[#ff0000]"
      style={{ marginTop: 10 }}
    >
      <button onClick={() => setCount(count + 1)}>Click</button>
    </div>
  );
}
```

- [ ] **Step 2: Write failing test for component extraction**

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { createProject } from "../../src/extractor/project";
import { extractComponents } from "../../src/extractor/component";

describe("extractor", () => {
  it("finds components in a TSX file", () => {
    const project = createProject([join(__dirname, "../fixtures/sample.tsx")]);
    const components = extractComponents(project);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("SloppyCard");
  });
});
```

Run: `pnpm test tests/unit/extractor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement project.ts**

```ts
import { Project } from "ts-morph";

export function createProject(filePaths: string[]): Project {
  const project = new Project({
    compilerOptions: { jsx: "react-jsx", allowJs: true },
  });
  project.addSourceFilesAtPaths(filePaths);
  return project;
}
```

- [ ] **Step 4: Implement component.ts**

```ts
import { Project, FunctionDeclaration, ArrowFunction, SyntaxKind } from "ts-morph";

export interface ComponentInfo {
  file: string;
  name: string;
  line: number;
  node: FunctionDeclaration | ArrowFunction;
}

export function extractComponents(project: Project): ComponentInfo[] {
  const components: ComponentInfo[] = [];
  for (const source of project.getSourceFiles()) {
    for (const fn of source.getFunctions()) {
      if (returnsJsx(fn)) {
        components.push({
          file: source.getFilePath(),
          name: fn.getName() || "anonymous",
          line: fn.getStartLineNumber(),
          node: fn,
        });
      }
    }
  }
  return components;
}

function returnsJsx(fn: FunctionDeclaration): boolean {
  return fn.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
         fn.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0;
}
```

- [ ] **Step 5: Implement className.ts**

```ts
import { JsxAttributeLike, SyntaxKind } from "ts-morph";

export interface ParsedClassName {
  raw: string;
  utilities: string[];
}

export function parseClassName(attr: JsxAttributeLike): ParsedClassName | undefined {
  if (attr.getKind() !== SyntaxKind.JsxAttribute) return;
  const name = attr.getNameNode().getText();
  if (name !== "className" && name !== "class") return;
  const init = attr.getInitializer();
  const raw = init?.getText().replace(/^"|"$/g, "") || "";
  return { raw, utilities: raw.split(/\s+/) };
}
```

- [ ] **Step 6: Implement style.ts**

```ts
import { JsxAttributeLike, SyntaxKind } from "ts-morph";

export function parseStyle(attr: JsxAttributeLike): Record<string, string> | undefined {
  if (attr.getKind() !== SyntaxKind.JsxAttribute) return;
  if (attr.getNameNode().getText() !== "style") return;
  const init = attr.getInitializer();
  if (!init) return {};

  const styles: Record<string, string> = {};
  if (init.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const obj = init.asKind(SyntaxKind.ObjectLiteralExpression);
    if (obj) {
      for (const prop of obj.getProperties()) {
        if (prop.getKind() === SyntaxKind.PropertyAssignment) {
          const assignment = prop.asKind(SyntaxKind.PropertyAssignment);
          if (assignment) {
            const key = assignment.getName();
            const value = assignment.getInitializer()?.getText().replace(/^["']|["']$/g, "");
            if (value !== undefined) styles[key] = value;
          }
        }
      }
    }
  }
  return styles;
}
```

- [ ] **Step 7: Run tests**

Run: `pnpm test tests/unit/extractor.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/extractor tests
git commit -m "feat: add component and style extraction"
```

---

## Task 5: Visual & Spacing Detectors

**Files:**
- Create: `src/detectors/visual.ts`
- Create: `src/detectors/spacing.ts`
- Modify: `src/detectors/index.ts`
- Create: `tests/unit/detectors.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { detectVisualSlop } from "../../src/detectors/visual";
import { Project } from "ts-morph";
import { join } from "node:path";

describe("visual detector", () => {
  it("flags arbitrary Tailwind values", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.addSourceFileAtPath(join(__dirname, "../fixtures/sample.tsx"));
    const fn = source.getFunctions()[0];
    const issues = detectVisualSlop(fn, { baseSpacing: 4, arbitraryTolerance: "balanced" });
    const arbitrary = issues.find((i) => i.ruleId === "arbitrary-tailwind");
    expect(arbitrary).toBeDefined();
  });
});
```

Run: `pnpm test tests/unit/detectors.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement visual.ts**

```ts
import { FunctionDeclaration, ArrowFunction, SyntaxKind } from "ts-morph";
import { Issue, Severity } from "../types";

export interface VisualOptions {
  baseSpacing: number;
  arbitraryTolerance: "strict" | "balanced" | "permissive";
}

export function detectVisualSlop(
  node: FunctionDeclaration | ArrowFunction,
  options: VisualOptions
): Issue[] {
  const issues: Issue[] = [];
  const classAttrs = node.getDescendantsOfKind(SyntaxKind.JsxAttribute)
    .filter((a) => ["className", "class"].includes(a.getNameNode().getText()));

  for (const attr of classAttrs) {
    const init = attr.getInitializer();
    if (!init) continue;
    const text = init.getText();
    const arbitrary = text.match(/\[([^\]]+)\]/g) || [];
    if (arbitrary.length > 0) {
      issues.push({
        ruleId: "arbitrary-tailwind",
        category: "visual",
        severity: options.arbitraryTolerance === "strict" ? "critical" : "high",
        message: `${arbitrary.length} arbitrary Tailwind value(s) detected`,
        line: attr.getStartLineNumber(),
        column: attr.getStartLinePos(),
        advice: "Use design-system tokens instead of bracket values.",
      });
    }
  }

  const styleAttrs = node.getDescendantsOfKind(SyntaxKind.JsxAttribute)
    .filter((a) => a.getNameNode().getText() === "style");
  if (styleAttrs.length > 0) {
    issues.push({
      ruleId: "inline-style",
      category: "visual",
      severity: "high",
      message: "Inline style prop detected",
      line: styleAttrs[0].getStartLineNumber(),
      column: styleAttrs[0].getStartLinePos(),
      advice: "Move styles to className or a design token.",
    });
  }

  return issues;
}
```

- [ ] **Step 3: Implement spacing.ts**

```ts
import { FunctionDeclaration, ArrowFunction, SyntaxKind } from "ts-morph";
import { Issue } from "../types";

export interface SpacingOptions {
  baseSpacing: number;
}

export function detectSpacingSlop(
  node: FunctionDeclaration | ArrowFunction,
  options: SpacingOptions
): Issue[] {
  const issues: Issue[] = [];
  const classAttrs = node.getDescendantsOfKind(SyntaxKind.JsxAttribute)
    .filter((a) => ["className", "class"].includes(a.getNameNode().getText()));

  for (const attr of classAttrs) {
    const init = attr.getInitializer();
    if (!init) continue;
    const text = init.getText();
    const matches = text.matchAll(/(?:p|m|gap|w|h)-\[(\d+)px\]/g);
    for (const match of matches) {
      const value = parseInt(match[1], 10);
      if (value % options.baseSpacing !== 0) {
        issues.push({
          ruleId: "off-grid-spacing",
          category: "spacing",
          severity: "medium",
          message: `${match[0]} is off the ${options.baseSpacing}px grid`,
          line: attr.getStartLineNumber(),
          column: attr.getStartLinePos(),
          advice: "Use a spacing token that aligns to the base grid.",
        });
      }
    }
  }

  return issues;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/unit/detectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detectors tests
git commit -m "feat: add visual and spacing detectors"
```

---

## Task 5b: Typography & Math Utilities

**Files:**
- Create: `src/detectors/typography.ts`
- Create: `src/math/spacing.ts`
- Create: `src/math/typography.ts`
- Create: `src/math/contrast.ts`
- Create: `tests/unit/typography.test.ts`

- [ ] **Step 1: Implement math utilities**

`src/math/spacing.ts`: export `spacingGridSlop(valuePx, baseGrid)` and `spacingEntropySlop(values)` from the spec.

`src/math/typography.ts`: export `typographyScaleSlop(sizes, targetRatio)` and helpers for heading hierarchy.

`src/math/contrast.ts`: export `relativeLuminance(hex)` and `contrastRatio(a, b)` using WCAG 2 formula; accept hex/OKLCH inputs.

`src/math/proportions.ts`: export helpers for aspect-ratio regularity.

`src/math/zIndex.ts`: export `zIndexSlop(values)` to detect arbitrary z-index jumps.

- [ ] **Step 2: Implement typography detector**

`src/detectors/typography.ts`:

- Extract `text-[size]` utilities and inline `fontSize` styles.
- Compute font-size variance against the configured `typeScaleRatio`.
- Flag heading hierarchy skips (e.g. `h1` followed by `h3` with no `h2`).
- Flag low-contrast text color pairs using `contrastRatio`.

- [ ] **Step 3: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { detectTypographySlop } from "../../src/detectors/typography";
import { Project } from "ts-morph";

describe("typography detector", () => {
  it("flags off-scale font sizes", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "type.tsx",
      `export function T() {
        return <p className="text-[15px]">x</p>;
      }`
    );
    const issues = detectTypographySlop(source.getFunctions()[0], {
      typeScaleRatio: 1.2,
      tokens: { fontSizes: [] } as any,
    });
    expect(issues.some((i) => i.ruleId === "off-scale-font-size")).toBe(true);
  });
});
```

Run: `pnpm test tests/unit/typography.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement detector to pass tests**

- [ ] **Step 5: Run tests**

Run: `pnpm test tests/unit/typography.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/detectors src/math tests
git commit -m "feat: add typography detector and math utilities"
```

---

## Task 6: Component & Logic Detectors

**Files:**
- Create: `src/detectors/components.ts`
- Create: `src/detectors/logic.ts`
- Modify: `src/detectors/index.ts`

- [ ] **Step 1: Write failing test for logic detector**

```ts
import { describe, it, expect } from "vitest";
import { detectLogicSlop } from "../../src/detectors/logic";
import { Project } from "ts-morph";

describe("logic detector", () => {
  it("flags ghost useEffect", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "ghost.tsx",
      `
      import { useState, useEffect } from "react";
      export function Ghost() {
        const [x, setX] = useState(0);
        useEffect(() => { setX(1); }, []);
        return <div>{x}</div>;
      }
      `
    );
    const fn = source.getFunctions()[0];
    const issues = detectLogicSlop(fn, { maxUseEffectPerComponent: 3 });
    expect(issues.some((i) => i.ruleId === "ghost-use-effect")).toBe(true);
  });
});
```

Run: `pnpm test tests/unit/logic.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement logic.ts**

```ts
import { FunctionDeclaration, ArrowFunction, SyntaxKind, CallExpression } from "ts-morph";
import { Issue } from "../types";

export interface LogicOptions {
  maxUseEffectPerComponent: number;
}

export function detectLogicSlop(
  node: FunctionDeclaration | ArrowFunction,
  options: LogicOptions
): Issue[] {
  const issues: Issue[] = [];
  const effects = node.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getExpression().getText() === "useEffect");

  if (effects.length > options.maxUseEffectPerComponent) {
    issues.push({
      ruleId: "excessive-use-effect",
      category: "logic",
      severity: "medium",
      message: `${effects.length} useEffect calls in one component`,
      line: node.getStartLineNumber(),
      column: node.getStartLinePos(),
      advice: "Combine related effects or move logic outside the component.",
    });
  }

  for (const effect of effects) {
    const callback = effect.getArguments()[0];
    if (!callback) continue;
    const body = callback.getDescendantsOfKind(SyntaxKind.Block)[0];
    if (!body) continue;
    const statements = body.getStatements();
    if (statements.length === 1 && statements[0].getText().match(/set[A-Z]/)) {
      issues.push({
        ruleId: "ghost-use-effect",
        category: "logic",
        severity: "high",
        message: "useEffect only calls setState",
        line: effect.getStartLineNumber(),
        column: effect.getStartLinePos(),
        advice: "Derive state from props instead of syncing with useEffect.",
      });
    }
  }

  return issues;
}
```

- [ ] **Step 3: Implement components.ts**

```ts
import { FunctionDeclaration, ArrowFunction, SyntaxKind } from "ts-morph";
import { Issue } from "../types";

export interface ComponentOptions {
  registry: Record<string, string[]>;
}

export function detectComponentSlop(
  node: FunctionDeclaration | ArrowFunction,
  options: ComponentOptions
): Issue[] {
  const issues: Issue[] = [];
  const divsWithClick = node.getDescendantsOfKind(SyntaxKind.JsxElement)
    .concat(node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement))
    .filter((el) => {
      const tag = el.getTagNameNode?.().getText() || el.getOpeningElement?.().getTagNameNode().getText();
      return tag === "div" && el.getAttributes?.().some((a) => a.getNameNode().getText() === "onClick");
    });

  if (divsWithClick.length > 0) {
    issues.push({
      ruleId: "div-as-button",
      category: "component",
      severity: "high",
      message: "<div> with onClick acts as a button",
      line: divsWithClick[0].getStartLineNumber(),
      column: divsWithClick[0].getStartLinePos(),
      advice: "Use <button> or your design-system <Button> component.",
    });
  }

  return issues;
}
```

> Note: adjust ts-morph API usage to match actual method names; the snippet above is illustrative.

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/unit/logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detectors tests
git commit -m "feat: add logic and component detectors"
```

---

## Task 6b: AI-Smell & Banned-Defaults Detectors

**Files:**
- Create: `src/detectors/ai-smells.ts`
- Create: `src/detectors/architecture.ts`
- Create: `rules/banned-defaults.json`
- Create: `tests/unit/ai-smells.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { detectAiSmells } from "../../src/detectors/ai-smells";
import { Project } from "ts-morph";
import { join } from "node:path";

describe("ai-smell detector", () => {
  it("flags glassmorphism cards", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "glass.tsx",
      `export function Glass() {
        return <div className="backdrop-blur bg-white/70 rounded-xl">hi</div>;
      }`
    );
    const issues = detectAiSmells(source.getFunctions()[0], {
      disabledRules: [],
      bannedDefaults: true,
    });
    expect(issues.some((i) => i.ruleId === "no-glassmorphism")).toBe(true);
  });

  it("flags hallucinated imports", () => {
    const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
    const source = project.createSourceFile(
      "bad-import.tsx",
      `import { MagicIcon } from "not-a-package";
      export function X() { return <MagicIcon />; }`
    );
    const issues = detectAiSmells(source.getFunctions()[0], {
      disabledRules: [],
      bannedDefaults: true,
    });
    expect(issues.some((i) => i.ruleId === "hallucinated-import")).toBe(true);
  });
});
```

Run: `pnpm test tests/unit/ai-smells.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create `rules/banned-defaults.json`**

Port the rule pack from the spec (no-glassmorphism, no-gradient-hero, max-radius, no-generic-font-stack, no-saas-template-structure).

- [ ] **Step 3: Implement `src/detectors/ai-smells.ts`**

Load `rules/banned-defaults.json` at startup. For each component:

- Match banned `classNames` against extracted Tailwind utilities.
- Match banned `fontFamily` against `font-*` classes or inline styles.
- Detect page-structure templates by counting semantic sections.
- Skip rules listed in `config.disabledRules`.

- [ ] **Step 4: Implement `src/detectors/architecture.ts`**

KarpeSlop-style static detectors:

- Hallucinated imports (import source not in `package.json` dependencies).
- Unresolved icon components or string icon props that do not match a known library export.
- `any` type annotations on props/style/event handlers.
- Redundant AI comments (`// Generated by AI`, `// TODO: Add real data`).
- Placeholder copy (`Lorem ipsum`, `Your Company`, `Build faster with AI`).
- Inline data arrays mapped inside JSX without external data file.
- Dead state setters (`useState` setter only called by its own control).
- Confidence-without-evidence (`isPremium`, `plan` hardcoded as boolean/string in presentation code).

- [ ] **Step 5: Implement `src/detectors/index.ts`**

```ts
import { FunctionDeclaration, ArrowFunction } from "ts-morph";
import { Issue, SlopAuditConfig } from "../types";
import { detectVisualSlop } from "./visual";
import { detectSpacingSlop } from "./spacing";
import { detectTypographySlop } from "./typography";
import { detectComponentSlop } from "./components";
import { detectLogicSlop } from "./logic";
import { detectArchitectureSlop } from "./architecture";
import { detectAiSmells } from "./ai-smells";

export function runDetectors(
  node: FunctionDeclaration | ArrowFunction,
  config: SlopAuditConfig
): Issue[] {
  return [
    ...detectVisualSlop(node, { baseSpacing: config.baseSpacing, arbitraryTolerance: config.arbitraryTolerance }),
    ...detectSpacingSlop(node, { baseSpacing: config.baseSpacing }),
    ...detectTypographySlop(node, { typeScaleRatio: config.typeScaleRatio ?? 1.2, tokens: /* loaded tokens */ {} as any }),
    ...detectComponentSlop(node, { registry: config.componentRegistry }),
    ...detectLogicSlop(node, { maxUseEffectPerComponent: config.rules.maxUseEffectPerComponent }),
    ...detectArchitectureSlop(node),
    ...detectAiSmells(node, { disabledRules: config.disabledRules ?? [], bannedDefaults: config.bannedDefaults }),
  ].filter((issue) => !(config.disabledRules ?? []).includes(issue.ruleId));
}
```

> Note: pass the real `DesignTokens` object loaded by the tokenizer into `detectTypographySlop`.

- [ ] **Step 7: Run tests**

Run: `pnpm test tests/unit/ai-smells.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/detectors rules tests
npm pkg set files[]="rules"
git commit -m "feat: add AI-smell and banned-defaults detectors"
```

---

## Task 7: Scorer

**Files:**
- Create: `src/scorer.ts`
- Create: `tests/unit/scorer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { scoreComponent, scoreProject } from "../../src/scorer";
import { Issue, Strictness } from "../../src/types";

describe("scorer", () => {
  it("caps component score at 100", () => {
    const issues: Issue[] = Array.from({ length: 20 }, (_, i) => ({
      ruleId: "x",
      category: "visual",
      severity: "critical",
      message: "bad",
      line: i,
      column: 0,
    }));
    expect(scoreComponent(issues, "balanced")).toBe(100);
  });

  it("averages project scores", () => {
    const report = scoreProject(
      [{ file: "a.tsx", name: "A", line: 1, slopIndex: 0, issues: [] }],
      "balanced"
    );
    expect(report.slopIndex).toBe(0);
  });
});
```

Run: `pnpm test tests/unit/scorer.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement scorer.ts**

```ts
import { Issue, ComponentReport, SlopAuditReport, Category, Strictness } from "./types";

const SEVERITY_WEIGHTS = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
};

const COMPONENT_BUDGET = 30;

const MULTIPLIERS: Record<Strictness, number> = {
  brutal: 1.5,
  balanced: 1.0,
  gentle: 0.5,
};

function finite(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

export function scoreComponent(issues: Issue[], strictness: Strictness): number {
  const weighted = issues.reduce((sum, i) => sum + SEVERITY_WEIGHTS[i.severity], 0);
  const normalized = (weighted * MULTIPLIERS[strictness]) / COMPONENT_BUDGET;
  return Math.min(100, Math.round(finite(normalized, 0) * 100));
}

export function scoreCategory(
  components: ComponentReport[],
  category: Category
): number {
  if (components.length === 0) return 0;
  const sum = components.reduce((acc, c) => {
    const hasIssue = c.issues.some((i) => i.category === category);
    return acc + (hasIssue ? c.slopIndex : 0);
  }, 0);
  return Math.round(sum / components.length);
}

export function scoreProject(
  components: ComponentReport[],
  strictness: Strictness
): SlopAuditReport {
  const categoryScores: Record<Category, number> = {
    visual: scoreCategory(components, "visual"),
    typography: scoreCategory(components, "typography"),
    spacing: scoreCategory(components, "spacing"),
    component: scoreCategory(components, "component"),
    logic: scoreCategory(components, "logic"),
    architecture: scoreCategory(components, "architecture"),
  };

  const slopIndex = components.length === 0
    ? 0
    : Math.round(components.reduce((sum, c) => sum + c.slopIndex, 0) / components.length);

  const allIssues = components.flatMap((c) => c.issues);
  const topOffenses = allIssues
    .sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity])
    .slice(0, 10);

  return {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    configPath: undefined,
    slopIndex,
    categoryScores,
    components,
    topOffenses,
    advice: generateAdvice(topOffenses),
    ignoredIssues: 0,
    unscannedFiles: [],
  };
}

function generateAdvice(offenses: Issue[]): string[] {
  const advice = new Set<string>();
  for (const issue of offenses.slice(0, 5)) {
    if (issue.advice) advice.add(issue.advice);
  }
  return Array.from(advice);
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test tests/unit/scorer.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/scorer.ts tests/unit/scorer.test.ts
git commit -m "feat: add scoring engine"
```

---

## Task 8: Reporter

**Files:**
- Create: `src/reporter/terminal.ts`
- Create: `src/reporter/json.ts`
- Create: `src/reporter/badge.ts`
- Create: `tests/unit/reporter.test.ts`

- [ ] **Step 1: Write failing test for badge**

```ts
import { describe, it, expect } from "vitest";
import { renderBadge } from "../../src/reporter/badge";

describe("badge", () => {
  it("renders markdown badge", () => {
    expect(renderBadge(42)).toBe("[AI-Slop: 42%](https://slop-audit.dev)");
  });
});
```

Run: `pnpm test tests/unit/reporter.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement badge.ts**

```ts
export function renderBadge(score: number): string {
  return `[AI-Slop: ${score}%](https://slop-audit.dev)`;
}
```

- [ ] **Step 3: Implement json.ts**

```ts
import { SlopAuditReport } from "../types";

export function renderJson(report: SlopAuditReport): string {
  return JSON.stringify(report, null, 2);
}
```

- [ ] **Step 4: Implement terminal.ts**

```ts
import chalk from "chalk";
import { SlopAuditReport, Category } from "../types";

export interface TerminalOptions {
  quiet?: boolean;
  aiAutopsy?: boolean;
}

export function renderTerminal(report: SlopAuditReport, options: TerminalOptions = {}): string {
  const lines: string[] = [];
  const color = report.slopIndex > 80 ? "red" : report.slopIndex > 50 ? "yellow" : "green";
  lines.push(chalk[color].bold(`AI-Slop Index: ${report.slopIndex}%`) + " " + bar(report.slopIndex));
  lines.push("");
  for (const [category, score] of Object.entries(report.categoryScores)) {
    lines.push(`${pad(category)} ${score}%  ${bar(score)}`);
  }
  lines.push("");
  lines.push(chalk.bold("Top offenses:"));
  for (const issue of report.topOffenses.slice(0, 5)) {
    lines.push(`  • ${issue.message} (${issue.severity})`);
  }
  if (options.aiAutopsy) {
    lines.push("");
    lines.push(chalk.bold("AI autopsy:"));
    for (const issue of report.topOffenses.filter((i) => ["critical", "high"].includes(i.severity)).slice(0, 5)) {
      lines.push(`  • ${issue.ruleId}: ${issue.advice || issue.message}`);
    }
  }
  if (!options.quiet) {
    lines.push("");
    lines.push(chalk.bold("Advice:"));
    for (const advice of report.advice) {
      lines.push(`  • ${advice}`);
    }
    lines.push("");
    lines.push("Get a deeper analysis: https://slop-audit.dev");
    lines.push("Need a rescue? https://brick.dev/rescue");
  }
  return lines.join("\n");
}

function bar(score: number): string {
  const filled = Math.round(score / 5);
  return "[" + "█".repeat(filled) + "░".repeat(20 - filled) + "]";
}

function pad(category: string): string {
  return (category.charAt(0).toUpperCase() + category.slice(1)).padEnd(12);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test tests/unit/reporter.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/reporter tests
git commit -m "feat: add terminal, json, and badge reporters"
```

---

## Task 9: Calibration Wizard

**Files:**
- Create: `src/config/wizard.ts`
- Create: `src/config/loader.ts`
- Create: `tests/unit/wizard.test.ts`
- Add dependency: `@inquirer/prompts`

- [ ] **Step 1: Add prompt dependency**

Run: `pnpm add @inquirer/prompts`

- [ ] **Step 2: Implement wizard.ts**

```ts
import { select, input, confirm } from "@inquirer/prompts";
import { SlopAuditConfig } from "./schema";

export async function runWizard(): Promise<SlopAuditConfig> {
  const framework = await select({
    message: "Framework:",
    choices: [
      { name: "React", value: "react" },
      { name: "Vue", value: "vue" },
      { name: "Svelte", value: "svelte" },
      { name: "Solid", value: "solid" },
    ],
    default: "react",
  });

  const styling = await select({
    message: "Styling solution:",
    choices: [
      { name: "Tailwind CSS", value: "tailwind" },
      { name: "CSS Modules", value: "css-modules" },
      { name: "Styled Components", value: "styled-components" },
      { name: "Emotion", value: "emotion" },
      { name: "Plain CSS", value: "plain" },
    ],
    default: "tailwind",
  });

  const uiLibrary = await select({
    message: "UI library / design system:",
    choices: [
      { name: "shadcn/ui", value: "shadcn/ui" },
      { name: "Material UI", value: "mui" },
      { name: "Ant Design", value: "ant-design" },
      { name: "Chakra UI", value: "chakra" },
      { name: "Radix Themes", value: "radix" },
      { name: "Custom", value: "custom" },
      { name: "None", value: "none" },
    ],
    default: "shadcn/ui",
  });

  const baseSpacing = parseInt(
    await input({ message: "Base spacing grid (px):", default: "4" }),
    10
  );

  const typeScaleRatio = parseFloat(
    await input({ message: "Type scale ratio:", default: "1.2" })
  );

  const arbitraryTolerance = await select({
    message: "Arbitrary value tolerance:",
    choices: [
      { name: "Strict", value: "strict" },
      { name: "Balanced", value: "balanced" },
      { name: "Permissive", value: "permissive" },
    ],
    default: "balanced",
  });

  const scanPaths = await input({
    message: "Paths to scan (comma-separated globs):",
    default: "src/**/*,app/**/*,components/**/*",
  });

  const strictness = await select({
    message: "Strictness:",
    choices: [
      { name: "Brutal", value: "brutal" },
      { name: "Balanced", value: "balanced" },
      { name: "Gentle", value: "gentle" },
    ],
    default: "balanced",
  });

  return {
    framework: framework as SlopAuditConfig["framework"],
    styling: styling as SlopAuditConfig["styling"],
    uiLibrary,
    baseSpacing,
    typeScaleRatio,
    arbitraryTolerance: arbitraryTolerance as SlopAuditConfig["arbitraryTolerance"],
    strictness: strictness as SlopAuditConfig["strictness"],
    include: scanPaths.split(",").map((s) => s.trim()),
    exclude: [
      "**/*.test.{ts,tsx,js,jsx}",
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
    ],
    legacyPaths: [],
    allowedArbitraryPaths: [],
    componentRegistry: {
      button: ["Button"],
      input: ["Input"],
      dialog: ["Dialog"],
      card: ["Card"],
    },
    disabledRules: [],
    bannedDefaults: true,
    projectMemory: true,
    categoryThresholds: {
      visual: 0.35,
      typography: 0.35,
      spacing: 0.35,
      component: 0.35,
      logic: 0.5,
      architecture: 0.5,
    },
    rules: {
      maxUseEffectPerComponent: 3,
      maxComponentLines: 500,
      maxJsxNestingDepth: 6,
      maxDirectChildren: 10,
      maxProps: 10,
      contrastMethod: "wcag2",
      contrastTarget: 4.5,
    },
  };
}
```

- [ ] **Step 3: Implement loader.ts**

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SlopAuditConfig, defaultConfig, validateConfig } from "./schema";

export const CONFIG_NAME = ".slop-audit.json";

export function loadConfig(projectPath: string, customPath?: string): SlopAuditConfig {
  const configPath = customPath ? customPath : join(projectPath, CONFIG_NAME);
  if (!existsSync(configPath)) return defaultConfig;
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  return validateConfig(raw);
}

export function saveConfig(projectPath: string, config: SlopAuditConfig): void {
  writeFileSync(join(projectPath, CONFIG_NAME), JSON.stringify(config, null, 2) + "\n");
}
```

- [ ] **Step 4: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../../src/config/loader";

describe("config loader", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "slop-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("loads default config when file missing", () => {
    expect(loadConfig(dir).framework).toBe("react");
  });

  it("saves and loads config", () => {
    saveConfig(dir, { ...loadConfig(dir), strictness: "brutal" });
    expect(loadConfig(dir).strictness).toBe("brutal");
  });
});
```

Run: `pnpm test tests/unit/wizard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config tests package.json pnpm-lock.yaml
git commit -m "feat: add calibration wizard and config loader"
```

---

## Task 9b: Project Memory Log

**Files:**
- Create: `src/memory/log.ts`
- Create: `tests/unit/memory.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRun, readLastRun, renderTrend } from "../../src/memory/log";
import { Category } from "../../src/types";

describe("memory log", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "slop-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("appends and reads runs", () => {
    const scores: Record<Category, number> = {
      visual: 10, typography: 0, spacing: 5, component: 0, logic: 0, architecture: 0,
    };
    appendRun(dir, { version: "0.1.0", generatedAt: "x", configPath: undefined, slopIndex: 10, categoryScores: scores, components: [], topOffenses: [], advice: [], ignoredIssues: 0, unscannedFiles: [] });
    const last = readLastRun(dir);
    expect(last?.slopIndex).toBe(10);
  });

  it("renders a trend", () => {
    const scores: Record<Category, number> = { visual: 0, typography: 0, spacing: 0, component: 0, logic: 0, architecture: 0 };
    appendRun(dir, { version: "0.1.0", generatedAt: "a", configPath: undefined, slopIndex: 5, categoryScores: scores, components: [], topOffenses: [], advice: [], ignoredIssues: 0, unscannedFiles: [] });
    appendRun(dir, { version: "0.1.0", generatedAt: "b", configPath: undefined, slopIndex: 15, categoryScores: scores, components: [], topOffenses: [], advice: [], ignoredIssues: 0, unscannedFiles: [] });
    expect(renderTrend(dir, 10)).toContain("5");
  });
});
```

Run: `pnpm test tests/unit/memory.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement log.ts**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SlopAuditReport, Category } from "../types";

export interface RunRecord {
  timestamp: string;
  version: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  topOffenseIds: string[];
  thresholdExceeded: boolean;
}

const LOG_DIR = ".slop-audit";
const LOG_FILE = "log.json";

export function appendRun(
  projectPath: string,
  report: SlopAuditReport,
  thresholds: Record<Category, number> = {
    visual: 0.35,
    typography: 0.35,
    spacing: 0.35,
    component: 0.35,
    logic: 0.5,
    architecture: 0.5,
  }
): void {
  const dir = join(projectPath, LOG_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, LOG_FILE);
  const existing: RunRecord[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : [];
  const thresholdExceeded = Object.entries(report.categoryScores).some(
    ([category, score]) => score > (thresholds[category as Category] ?? 1)
  );
  const record: RunRecord = {
    timestamp: report.generatedAt,
    version: report.version,
    slopIndex: report.slopIndex,
    categoryScores: report.categoryScores,
    topOffenseIds: report.topOffenses.map((i) => i.ruleId),
    thresholdExceeded,
  };
  existing.push(record);
  writeFileSync(path, JSON.stringify(existing.slice(-100), null, 2) + "\n");
}

export function readLastRun(projectPath: string): RunRecord | undefined {
  const path = join(projectPath, LOG_DIR, LOG_FILE);
  if (!existsSync(path)) return undefined;
  const records: RunRecord[] = JSON.parse(readFileSync(path, "utf-8"));
  return records.at(-1);
}

export function renderTrend(projectPath: string, limit: number): string {
  const path = join(projectPath, LOG_DIR, LOG_FILE);
  if (!existsSync(path)) return "No runs logged yet.";
  const records: RunRecord[] = JSON.parse(readFileSync(path, "utf-8")).slice(-limit);
  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const max = Math.max(...records.map((r) => r.slopIndex), 1);
  const bars = records.map((r) => blocks[Math.min(blocks.length - 1, Math.round((r.slopIndex / max) * (blocks.length - 1)))]);
  return `Slop Index trend (last ${records.length} runs): ${bars.join("")}`;
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test tests/unit/memory.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/memory tests
git commit -m "feat: add project memory log and trend renderer"
```

---

## Task 10: CLI Entry Point

**Files:**
- Create: `src/cli.ts`
- Modify: `bin/slop-audit.js`

- [ ] **Step 1: Implement cli.ts**

```ts
#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Command } from "commander";
import { globby } from "globby";
import { loadConfig, saveConfig } from "./config/loader";
import { runWizard } from "./config/wizard";
import { createProject } from "./extractor/project";
import { extractComponents } from "./extractor/component";
import { runDetectors } from "./detectors";
import { scoreComponent, scoreProject } from "./scorer";
import { renderTerminal } from "./reporter/terminal";
import { renderJson } from "./reporter/json";
import { renderBadge } from "./reporter/badge";
import { renderTrend, readLastRun, appendRun } from "./memory/log";

const program = new Command();

program
  .name("slop-audit")
  .description("Detect AI-generated frontend slop")
  .version("0.1.0")
  .argument("[path]", "project path", process.cwd())
  .option("--init", "run calibration wizard")
  .option("--json [path]", "write JSON report (default: ./slop-audit-report.json; use - for stdout)")
  .option("--badge", "output README badge markdown")
  .option("--ai-autopsy", "show AI failure-mode breakdown")
  .option("--quiet, -q", "suppress advice and footer links")
  .option("--strict, -s", "exit with code 2 if any critical/high issue is found")
  .option("--config <path>", "path to .slop-audit.json")
  .option("--include <glob>", "include pattern (repeatable)", collect, [])
  .option("--exclude <glob>", "exclude pattern (repeatable)", collect, [])
  .option("--strictness <level>", "brutal | balanced | gentle")
  .option("--no-increase", "fail if Slop Index increased vs. previous run")
  .option("--trend [n]", "print Sparkline of last n runs")
  .option("--no-cache", "disable incremental token cache")
  .option("--since <ref>", "only scan files changed since git ref")
  .action(async (projectPath, options) => {
    try {
      if (options.init) {
        const config = await runWizard();
        saveConfig(projectPath, config);
        console.log(`Generated .slop-audit.json`);
        return;
      }

      if (options.trend !== undefined) {
        const limit = options.trend === true ? 20 : parseInt(options.trend, 10);
        console.log(renderTrend(projectPath, Number.isFinite(limit) ? limit : 20));
        return;
      }

      const config = loadConfig(projectPath, options.config);
      if (options.strictness) config.strictness = options.strictness;

      const include = options.include.length > 0 ? options.include : config.include;
      const exclude = [...config.exclude, ...options.exclude];

      let files = await globby(include, {
        cwd: projectPath,
        ignore: exclude,
        absolute: true,
        gitignore: true,
      });

      if (options.since) {
        files = filterSince(projectPath, files, options.since);
      }

      const project = createProject(files);
      const components = extractComponents(project).map((c) => {
        const issues = runDetectors(c.node, config);
        return {
          file: c.file,
          name: c.name,
          line: c.line,
          slopIndex: scoreComponent(issues, config.strictness),
          issues,
        };
      });

      const report = scoreProject(components, config.strictness);
      const previous = config.projectMemory ? readLastRun(projectPath) : undefined;

      if (options.json !== undefined) {
        const out = renderJson(report);
        if (options.json === true) {
          writeFileSync(join(projectPath, "slop-audit-report.json"), out + "\n");
        } else if (options.json === "-") {
          console.log(out);
        } else {
          writeFileSync(options.json, out + "\n");
        }
      } else if (options.badge) {
        console.log(renderBadge(report.slopIndex));
      } else {
        console.log(renderTerminal(report, { quiet: options.quiet, aiAutopsy: options.aiAutopsy }));
      }

      if (config.projectMemory) {
        appendRun(projectPath, report, config.categoryThresholds);
      }

      const hasCriticalHigh = report.topOffenses.some((i) => ["critical", "high"].includes(i.severity));
      let exitCode = report.slopIndex > 0 ? 1 : 0;
      if (options.strict && hasCriticalHigh) exitCode = 2;
      if (options.noIncrease && previous && report.slopIndex > previous.slopIndex) exitCode = 2;
      process.exit(exitCode);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

function collect(value: string, previous: string[]) {
  return previous.concat(value);
}

function filterSince(projectPath: string, files: string[], ref: string): string[] {
  try {
    const changed = new Set(
      execSync(`git diff --name-only ${ref} --`, { cwd: projectPath, encoding: "utf-8" })
        .split("\n")
        .filter(Boolean)
    );
    return files.filter((f) => changed.has(f) || changed.has(relative(projectPath, f)));
  } catch {
    return files;
  }
}

program.parse();
```

> Note: `globby` is already declared in `package.json`.

- [ ] **Step 2: Build and run CLI on fixture**

Run: `pnpm build`
Run: `node bin/slop-audit.js tests/fixtures --json`
Expected: JSON report with detected issues in `sample.tsx`.

- [ ] **Step 3: Verify exit codes**

Run: `node bin/slop-audit.js tests/fixtures --strict; echo $?`
Expected: `2` because critical/high issues exist.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts bin package.json pnpm-lock.yaml
git commit -m "feat: wire CLI entry point"
```

---

## Task 11: Integration Tests & Fixtures

**Files:**
- Create: `tests/fixtures/clean-shadcn.tsx`
- Create: `tests/fixtures/ai-landing.tsx`
- Create: `tests/fixtures/vibe-dashboard.tsx`
- Create: `tests/integration/scan.test.ts`

- [ ] **Step 1: Create clean-shadcn.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ProfileCard({ user }: { user: { name: string; email: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{user.email}</p>
      </CardContent>
      <Button variant="outline">Edit</Button>
    </Card>
  );
}
```

- [ ] **Step 2: Create ai-landing.tsx**

Replicate the default SaaS landing page from the spec.

- [ ] **Step 3: Create vibe-dashboard.tsx**

Replicate the dashboard with excessive useEffect and arbitrary spacing.

- [ ] **Step 4: Write integration test**

```ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { join } from "node:path";

describe("cli integration", () => {
  it("reports slop for ai-landing", () => {
    const out = execSync(
      `node ${join(__dirname, "../../bin/slop-audit.js")} ${join(__dirname, "../fixtures")} --json`,
      { encoding: "utf-8" }
    );
    const report = JSON.parse(out);
    expect(report.slopIndex).toBeGreaterThan(0);
    expect(report.components.length).toBeGreaterThan(0);
  });
});
```

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration tests/fixtures
git commit -m "test: add integration fixtures and scan tests"
```

---

## Task 12: Synthetic Corpus Generator

**Files:**
- Create: `scripts/generate-corpus.ts`
- Create: `corpus/baseline.json`
- Modify: `package.json` scripts: `"build:corpus": "tsx scripts/generate-corpus.ts"`

- [ ] **Step 1: Add tsx dependency**

Run: `pnpm add -D tsx`

- [ ] **Step 2: Implement generator script**

```ts
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROMPTS = [
  "Build a SaaS landing page hero section in React + Tailwind",
  "Build a mobile settings screen in React + Tailwind",
  "Build a dashboard metrics grid in React + Tailwind",
  "Build an e-commerce product card in React + Tailwind",
];

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { extractComponents } from "../src/extractor/component";
import { parseClassName } from "../src/extractor/className";
import { parseStyle } from "../src/extractor/style";

const FIXTURE_DIR = join(process.cwd(), "tests", "fixtures");

function extractDimensions(sourceText: string) {
  const project = new Project({ compilerOptions: { jsx: "react-jsx" } });
  const source = project.createSourceFile("fixture.tsx", sourceText);
  const spacing: number[] = [];
  const fontSizes: number[] = [];
  const colors: string[] = [];

  for (const component of extractComponents(project)) {
    for (const attr of component.node.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      const className = parseClassName(attr);
      if (className) {
        for (const util of className.utilities) {
          const spacingMatch = util.match(/^(?:p|m|gap|w|h)-\[(\d+)px\]$/);
          if (spacingMatch) spacing.push(parseInt(spacingMatch[1], 10));
          const textMatch = util.match(/^text-\[(\d+)px\]$/);
          if (textMatch) fontSizes.push(parseInt(textMatch[1], 10));
          const colorMatch = util.match(/^(?:bg|text)-\[(#[0-9a-fA-F]{3,8})\]$/);
          if (colorMatch) colors.push(colorMatch[1]);
        }
      }
      const style = parseStyle(attr);
      if (style) {
        if (style.marginTop) spacing.push(parseInt(style.marginTop, 10));
        if (style.fontSize) fontSizes.push(parseInt(style.fontSize, 10));
      }
    }
  }
  return { spacing, fontSizes, colors };
}

function main() {
  const spacingValues: number[] = [];
  const fontSizeValues: number[] = [];
  const colorValues: string[] = [];

  for (const file of readdirSync(FIXTURE_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const dims = extractDimensions(readFileSync(join(FIXTURE_DIR, file), "utf-8"));
    spacingValues.push(...dims.spacing);
    fontSizeValues.push(...dims.fontSizes);
    colorValues.push(...dims.colors);
  }

  const histogram = (values: (string | number)[]) => {
    const map = new Map<string, number>();
    for (const v of values) map.set(String(v), (map.get(String(v)) || 0) + 1);
    return Object.fromEntries(map);
  };

  const corpus = {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    sampleCount: readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".tsx")).length,
    spacingHistogram: histogram(spacingValues),
    fontSizeHistogram: histogram(fontSizeValues),
    colorHistogram: histogram(colorValues),
  };

  writeFileSync(join(process.cwd(), "corpus", "baseline.json"), JSON.stringify(corpus, null, 2));
}

main();
```

- [ ] **Step 3: Generate baseline corpus**

Run: `pnpm build:corpus`
Expected: `corpus/baseline.json` created.

- [ ] **Step 4: Commit**

```bash
git add scripts corpus package.json pnpm-lock.yaml
git commit -m "feat: add synthetic corpus generator"
```

---

## Task 13: Documentation & Publish Prep

**Files:**
- Modify: `README.md`
- Modify: `package.json` (add `files`, `keywords`, `author`, `license`)

- [ ] **Step 1: Write README.md**

Include:
- Installation: `npx slop-audit`
- Quick start
- Calibration
- Badge usage
- Configuration reference
- Example output
- Link to Brick.dev rescue

- [ ] **Step 2: Add npm metadata**

```json
{
  "keywords": ["ai", "slop", "frontend", "linter", "tailwind", "design-system"],
  "author": "Brick.dev",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/brickdotdev/slop-audit.git" }
}
```

- [ ] **Step 3: Run all quality gates**

Run: `pnpm typecheck`
Run: `pnpm test`
Run: `pnpm build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add README.md package.json
git commit -m "docs: add README and npm metadata"
```

---

## Task 14: Publish to npm

- [ ] **Step 1: Version bump**

Run: `pnpm version 0.1.0`

- [ ] **Step 2: Publish**

Run: `pnpm publish --access public`

- [ ] **Step 3: Verify install**

Run: `npx slop-audit --version`
Expected: `0.1.0`

- [ ] **Step 4: Tag release**

```bash
git push origin main --tags
```

---

## Risks and Open Questions

1. **Context classifier not fully detailed**
   - The spec defines context-aware severity (`src/context/classifier.ts`).
   - Risk: the calibration between `legacyPaths`, `allowedArbitraryPaths`, and detector severities may shift during implementation.
   - Mitigation: implement classifier as a pure function first; add tests before wiring it into `runDetectors`.

2. **Token cache / `--no-cache` wiring**
   - `TokenCache` is specified and the CLI exposes `--no-cache`, but the exact handshake between CLI, tokenizer, and detectors is not line-by-line in the plan.
   - Risk: cache could be ignored or could cache stale tokens.
   - Mitigation: add integration test in Task 3b and pass the cache instance explicitly through `extractDesignTokens`.

3. **ts-morph API edge cases**
   - Several detectors rely on ts-morph AST traversal (inline styles, imports, JSX attributes).
   - Risk: some patterns (spread attributes, computed property names, dynamic imports) may not be covered by the snippets.
   - Mitigation: each detector task includes a fixture for edge cases; expand fixtures as new patterns appear.

4. **Color contrast math for OKLCH**
   - The spec targets WCAG 2 contrast; OKLCH support is for future APCA/WCAG 3.
   - Risk: converting OKLCH to sRGB for WCAG 2 may introduce small errors.
   - Mitigation: keep contrast method configurable (`wcag2` default) and document the conversion.

5. **Synthetic corpus is fixture-driven**
   - The generator currently scans `tests/fixtures` rather than invoking an external AI agent.
   - Risk: the baseline may be too small until more fixtures are added.
   - Mitigation: document the flywheel and add a script to generate new AI mock fixtures later.

6. **Reviewer timeout**
   - The second reviewer subagent exceeded its time budget, so the final alignment was done manually.
   - Risk: subtle inconsistencies remain.
   - Mitigation: run a fresh review pass after the first few tasks are implemented.

---

## Self-Review Checklist

- [ ] Spec coverage: every MVP requirement has at least one task.
- [ ] Placeholder scan: no TBD/TODO/placeholder code in plan.
- [ ] Type consistency: `SlopAuditConfig`, `Issue`, `ComponentReport`, `SlopAuditReport` match spec.
- [ ] Gate definition: `pnpm typecheck`, `pnpm test`, `pnpm build` run before publish.
- [ ] Rollback: revert last commit if a task breaks main.

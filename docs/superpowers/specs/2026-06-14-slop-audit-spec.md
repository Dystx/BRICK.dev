# slop-audit CLI Specification

> Version: 0.1.0-draft  
> Scope: public `npx slop-audit` npm package, open source  
> Primary deliverable: Node.js CLI that audits frontend codebases for AI-generated slop.

---

## 1. Purpose & Thesis

AI can write logic, but it hallucinates frontend. The root cause is not model intelligence; it is that UI is spatial, semantic, and systemic, while LLMs optimize for token generation. The cheapest token is a raw `className` string or a custom `<div>`—so AI defaults to them, even when a design-system primitive exists.

**slop-audit** is a code-level design-intent enforcement layer. It reads a frontend codebase, extracts the design tokens and conventions it finds, and flags deviations that indicate AI slop: arbitrary values, semantic drift, logic hacks, component reinvention, and structural rot.

It does not replace a designer. It answers one question brutally well:

> “Is this frontend built with tokens, semantics, and components, or is it hacked together with magic values and divs?”

---

## 2. Product Definition

### 2.1 Core promise

- Run `npx slop-audit` in any React / Vue / Svelte / Solid project.
- Get a single **Slop Index** (0–100%).
- See a categorized, severity-weighted report.
- Receive actionable advice tuned to the project’s own design system.
- Optionally generate a `[AI-Slop: 42%]` README badge.
- Footer links to `slop-audit.dev` for deeper analysis and the Brick.dev rescue waitlist.

### 2.2 Target users

- Solo founders who “vibe-coded” an MVP and need to know what is broken.
- Agencies reviewing AI-generated client deliverables.
- Teams adding guardrails before shipping AI-assisted PRs.
- Developers who want a viral badge to prove (or roast) their code quality.

### 2.3 Tech stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript
- **CLI framework:** `commander`
- **AST parsing:** `ts-morph` (supports TS, TSX, JS, JSX; easy className/style extraction)
- **Terminal output:** `chalk` v4 (CJS compatibility)
- **Bundling:** `tsup` to a single executable CLI file
- **Testing:** `vitest`
- **Package manager:** `pnpm`

---

## 3. Design Philosophy

### 3.1 Code-level visual discipline

The CLI cannot see rendered pixels, but it can infer design intent from code. A value like `p-[13px]` is not bad because 13 is prime; it is bad because it breaks the spacing rhythm the design system encodes.

### 3.2 Three detection layers

| Layer | What it does | Example |
|-------|--------------|---------|
| **AST + rules** | Find structural and pattern violations | `<div onClick>`, ghost `useEffect` |
| **Math** | Measure regularity against design-system math | off-grid spacing, chaotic type scale |
| **Corpus inference** | Compare values to a dataset of real apps | `p-[13px]` is rare in successful projects |

### 3.3 Intent over dogma

Reports explain *why* a pattern is slop, not just that a rule was triggered. The tool distinguishes a one-off expressive choice from habitual sloppiness.

### 3.4 Context-aware severity

The same pattern scores differently depending on where it lives: critical in new components, warning in legacy files, warning in marketing pages.

---

## 4. Functional Requirements

### 4.1 Scanning

- Recursively scan a project directory.
- Default include: `src/**/*`, `app/**/*`, `components/**/*`, `pages/**/*`.
- Default exclude: `node_modules`, `.next`, `dist`, `build`, `coverage`, `**/*.test.{ts,tsx,js,jsx}`, `**/*.stories.{ts,tsx}`.
- Support extensions: `.tsx`, `.ts`, `.jsx`, `.js`, `.vue`, `.svelte`.
- Respect `.slop-audit.json` `include` / `exclude` overrides.

### 4.2 Component detection

A “component” is any function or class that returns JSX / HTML, or any Vue/Svelte single-file component. The scorer operates per component and then aggregates to project level.

Component boundaries are detected by:

- Function declaration / arrow function / function expression with a JSX return.
- React.forwardRef / Vue defineComponent / Svelte default export.
- Files with `.vue` or `.svelte` extension.

### 4.3 Issue catalog

The CLI detects issues across five categories.

#### Visual slop

| Pattern | Detection | Severity |
|---------|-----------|----------|
| Arbitrary Tailwind values | `className` contains `[...]`; non-token numeric utilities like `p-13` in v4 | high |
| Inline styles | `style={...}` | high |
| Mixed styling systems | Tailwind + CSS Modules + styled-components in same component | medium |
| Hardcoded colors | `text-[#333]`, `bg-red-500`, literal OKLCH not matching semantic `--color-*` tokens | medium |
| Negative margins | `-mt-[20px]` | medium |
| Fixed dimensions | `w-[800px]`, `h-[600px]` | medium |
| Magic z-index | `z-[9999]` | medium |
| Excessive absolute positioning | >2 `absolute` + coordinate utilities per component | low |

#### Typography slop

| Pattern | Detection | Severity |
|---------|-----------|----------|
| Hardcoded font sizes | `text-[14px]`, `text-[1.2rem]` | medium |
| Hardcoded line heights | `leading-[1.3]` | low |
| Magic letter spacing | `tracking-[0.5px]` | low |
| Non-token font weights | `font-[550]` | low |
| Custom font families | `font-['Inter']` | low |
| Inverted heading hierarchy | semantic level and visual size disagree | high |
| Skipped heading levels | `<h1>` then `<h3>` with no `<h2>` | medium |
| Visual-only headings | `<div className="text-2xl font-bold">` instead of heading tag | medium |

#### Spacing / layout slop

| Pattern | Detection | Severity |
|---------|-----------|----------|
| Off-grid spacing | value not divisible by configured base grid | medium |
| High spacing entropy | many unique spacing values in one component | low |
| Deep JSX nesting | >6 levels | low |
| Excessive sibling count | container with >10 direct children | low |
| Extreme aspect ratios | computed width/height ratio outside [0.25, 4] | low |

#### Component slop

| Pattern | Detection | Severity |
|---------|-----------|----------|
| Custom interactive elements | `<div onClick>` / `<span onClick>` | high |
| Missing accessible labels | icon buttons without `aria-label` | high |
| Missing alt on images | `<img>` without `alt` | high |
| Prop spreading abuse | `{...props}` on leaf components | low |
| Inline event handlers with complex logic | handler body >3 statements | medium |
| Too many props | >10 props | low |
| Variant hacking via className | many conditional class strings | medium |
| Missing loading/error/empty states | data-fetching component with no fallback | medium |
| Reinventing primitives | custom `<div>` where registered `<Button>`, `<Card>`, etc. exist | high |

#### Logic slop

| Pattern | Detection | Severity |
|---------|-----------|----------|
| Ghost `useEffect` | `useEffect` that only calls `setState` | high |
| Zombie state | `useState` variable never read | high |
| Excessive effects | >3 `useEffect` in one component | medium |
| Prop-to-state sync | `useState(props.x)` + `useEffect` to update | high |
| Inline complex business logic | conditional fetch / transform inside JSX | medium |
| Hand-rolled utilities | custom debounce/throttle/fetch wrappers where libraries exist | low |
| Pointless memo | `useCallback(..., [])` wrapping a stable function | low |

#### Architecture slop

| Pattern | Detection | Severity |
|---------|-----------|----------|
| Giant components | >500 lines | medium |
| Missing semantic landmarks | no `<main>`, `<nav>`, etc. in page components | low |
| Comment theater | self-evident comments above obvious code | low |

### 4.4 Scoring

- Each issue has a severity weight: **critical = 10**, **high = 5**, **medium = 2**, **low = 1**.
- Each component has a saturation budget of **30 weighted points** by default.
- Component Slop Index = `min(100, round((weightedPoints × strictnessMultiplier / budget) × 100))`.
- Project Slop Index = arithmetic mean of all component scores, rounded to integer.
- Category scores average over all scanned components, treating unaffected components as `0` for that category.
- Edge cases:
  - `0/0` components → report N/A.
  - `0%` → clean.
  - `100%` → saturated slop.

### 4.5 Reporting

- Terminal output with category bars, top offenses, and advice.
- Optional JSON output (`--json`).
- Optional badge markdown (`--badge`).
- Optional AI autopsy report (`--ai-autopsy`).
- Report footer links to `https://slop-audit.dev/analyze?repo=...` and Brick.dev rescue waitlist.

### 4.6 Calibration wizard

On first run (or via `npx slop-audit --init`), ask the user 6–8 questions and generate `.slop-audit.json`.

| # | Question | Options | Auto-detect source |
|---|----------|---------|-------------------|
| 1 | Framework | React, Vue, Svelte, Solid, Other | `package.json` dependencies |
| 2 | Styling solution | Tailwind, CSS Modules, Styled Components, Emotion, Plain CSS | deps + files |
| 3 | UI library / design system | shadcn/ui, MUI, Ant Design, Chakra, Radix, Custom, None | deps + `components/ui/` |
| 4 | Base spacing grid | 4px, 8px, 5px, Other | `tailwind.config.js` `theme.spacing` |
| 5 | Type scale ratio | Minor third (1.2), Major third (1.25), Perfect fourth (1.333), Custom | derived from config |
| 6 | Arbitrary value tolerance | strict / balanced / permissive | default: balanced |
| 7 | Paths to scan | auto / src / app / custom | project structure |
| 8 | Strictness | brutal / balanced / gentle | default: balanced |

Auto-detected values are shown as defaults; user can override.

### 4.7 Configuration file

`.slop-audit.json` (root of target project):

```json
{
  "framework": "react",
  "styling": "tailwind",
  "uiLibrary": "shadcn/ui",
  "baseSpacing": 4,
  "typeScaleRatio": 1.2,
  "arbitraryTolerance": "balanced",
  "strictness": "balanced",
  "include": ["src/**/*", "app/**/*"],
  "exclude": ["**/*.test.tsx", "**/*.stories.tsx", "**/node_modules/**"],
  "legacyPaths": ["src/legacy/**"],
  "allowedArbitraryPaths": ["app/(marketing)/**"],
  "componentRegistry": {
    "button": ["Button"],
    "input": ["Input"],
    "dialog": ["Dialog", "Modal"],
    "card": ["Card"],
    "select": ["Select"],
    "badge": ["Badge"]
  },
  "disabledRules": ["no-gradient-hero"],
  "bannedDefaults": true,
  "projectMemory": true,
  "categoryThresholds": {
    "visual": 0.35,
    "typography": 0.35,
    "spacing": 0.35,
    "component": 0.35,
    "logic": 0.5,
    "architecture": 0.5
  },
  "rules": {
    "maxUseEffectPerComponent": 3,
    "maxComponentLines": 500,
    "maxJsxNestingDepth": 6,
    "maxDirectChildren": 10,
    "maxProps": 10,
    "contrastMethod": "wcag2",
    "contrastTarget": 4.5
  }
}
```

### 4.8 Component registry

Built-in registries for popular libraries:

- shadcn/ui
- Material UI
- Ant Design
- Chakra UI
- Radix Themes

Users can extend via `.slop-audit.json` `componentRegistry`.

---

## 5. Out of Scope (Non-Goals)

These are deliberately excluded from the CLI MVP; they belong to the Brick.dev web scanner or future work.

- Pixel-perfect visual alignment checks.
- Real whitespace balance analysis.
- Layout breakage on actual devices.
- True color contrast computation from rendered composites.
- Multi-modal screenshot analysis.
- Automatic code rewriting (reserved for the GIR refactorer).
- IDE extension / CI action (post-MVP).
- Live browser instrumentation.

---

## 6. User Experience

### 6.1 First-run flow

```bash
$ npx slop-audit
No .slop-audit.json found. Let’s calibrate for this project.
? Framework: React
? Styling: Tailwind CSS
? UI library: shadcn/ui
? Base spacing unit: 4px
? Arbitrary value tolerance: balanced
? Paths to scan: auto
? Strictness: balanced
Generated .slop-audit.json
Scanning 14 components...
```

### 6.2 Normal scan flow

```bash
$ npx slop-audit
AI-Slop Index: 73%  [████████████████░░░░]

Visual:     81%  ████████████████░░
Typography: 60%  ████████████░░░░░░░░
Spacing:    45%  █████████░░░░░░░░░░░
Components: 62%  ████████████░░░░░░░░
Logic:      54%  ███████████░░░░░░░░░
Architecture: 30%  ██████░░░░░░░░░░░░░░

Top offenses:
  • 14 arbitrary Tailwind values off the 4px grid
  • 3 ghost useEffect calls setting state on mount
  • 2 <div> elements acting as buttons
  • Heading hierarchy inverted on /pricing

Advice:
  1. Replace w-[800px] h-[600px] with container + aspect ratio.
  2. Move fetch logic to react-query; delete 3 useEffects.
  3. Use <Button> from your design system.

Get a deeper analysis: https://slop-audit.dev/analyze?repo=my-repo
Need a rescue? https://brick.dev/rescue
```

### 6.3 Flags

| Flag | Description |
|------|-------------|
| `--init` | Run calibration wizard |
| `--json` | Output raw JSON report |
| `--badge` | Print README badge markdown |
| `--ai-autopsy` | Show AI-failure-mode breakdown |
| `--config <path>` | Use custom config path |
| `--include <glob>` | Override include patterns |
| `--exclude <glob>` | Override exclude patterns |
| `--strictness <level>` | Override strictness for this run |
| `--version` | Show version |
| `--help` | Show help |

---

## 7. Detection Engine

### 7.1 Token extraction (`tokenizer/`)

Reads the project’s source of truth. In 2026, Tailwind CSS v4 is the default and stores theme values in CSS using `@theme` directives. Tailwind v3 projects still use `tailwind.config.js`. The tokenizer supports both paths and merges them.

**Priority order:**

1. Tailwind v4 CSS-native config: parse `globals.css` / `app.css` for `@theme` and `@theme inline` blocks.
2. Tailwind v3 JS config: parse `tailwind.config.js` / `tailwind.config.ts` only if an explicit `@config` directive points to it.
3. CSS variables in any design-token file.
4. `components.json` for shadcn/ui v4 aliases.

Output: a normalized `DesignTokens` object.

```ts
interface DesignTokens {
  spacing: TokenValue[];      // e.g. [{ value: 4, unit: "px", raw: "--spacing" }]
  radii: TokenValue[];
  fontSizes: TokenValue[];
  colors: ColorToken[];       // [{ name: "primary", hex?: "", oklch?: "", raw: "--color-primary" }]
  zIndex: number[];
  shadows: string[];
  lineHeights: number[];
}

interface TokenValue {
  value: number;
  unit: "px" | "rem" | "em";
  raw: string;
}

interface ColorToken {
  name: string;
  raw: string;
  hex?: string;
  oklch?: string;
}
```

Tailwind v4 `@theme` example:

```css
@import "tailwindcss";

@theme {
  --spacing: 0.25rem;
  --color-brand: oklch(60% 0.2 250);
  --font-sans: "Inter", sans-serif;
  --radius-sm: 0.25rem;
}
```

The tokenizer extracts `--spacing`, `--color-*`, `--font-*`, `--radius-*`, and `--breakpoint-*` variables and resolves numeric values to pixels where possible.

### 7.2 Style extraction (`extractor/`)

For every JSX element, flatten `className` / `class` and `style={}` into computed CSS properties.

```jsx
<div className="w-[123px] p-[13px] text-[15px] rounded-[7px]">
```

becomes:

```ts
{
  width: { value: 123, unit: "px", raw: "w-[123px]" },
  padding: { value: 13, unit: "px", raw: "p-[13px]" },
  fontSize: { value: 15, unit: "px", raw: "text-[15px]" },
  borderRadius: { value: 7, unit: "px", raw: "rounded-[7px]" }
}
```

Tailwind utility mapping table required for common utilities.

For Tailwind v4, numeric utilities without brackets (e.g. `p-13`, `m-18`, `w-103`) are resolved against the extracted `--spacing-*` token map. A value is flagged only if it is not a registered token. Bracket arbitrary values are always flagged as explicit slop unless the path is in `allowedArbitraryPaths`.

### 7.3 Rule engine (`rules/`)

Compares extracted values against tokens and structural rules.

```ts
const spacingRule: Rule = {
  appliesTo: ["padding", "margin", "gap", "width", "height"],
  allowed: theme.spacing,
  message: (prop, value) =>
    `${prop}: ${value} breaks the spacing rhythm (not a design-system token)`,
  severity: "medium",
};
```

### 7.4 Mathematical detectors (`math/`)

All math functions are normalized to return a value in `[0, 1]` where `0` means no slop and `1` means maximum slop. Inputs are guarded for `NaN`, `Infinity`, and invalid zeros.

#### Guard utilities

```ts
function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

function positive(n: number, fallback = 0): number {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
```

#### Spacing grid conformance

```ts
function spacingGridSlop(valuePx: number, baseGrid: number): number {
  const base = positive(baseGrid, 0);
  const value = finite(valuePx, 0);
  if (base === 0) return 0;
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  const remainder = abs % base;
  const deviation = Math.min(remainder, base - remainder);
  return Math.min(deviation / (base / 2), 1);
}
```

| Value | base=4 | Verdict |
|-------|--------|---------|
| 16px  | 0      | clean   |
| 13px  | 0.5    | off-grid|
| 14px  | 1.0    | worst   |
| -13px | 0.5    | off-grid (negative margins) |

#### Spacing entropy

True normalized Shannon entropy. `0` means one value repeated; `1` means all values are unique.

```ts
function spacingEntropySlop(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const v of clean) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = clean.length;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  const max = Math.log2(counts.size || 1);
  return max === 0 ? 0 : entropy / max;
}
```

#### Typography modular scale variance

Measures both internal consistency (coefficient of variation) and deviation from the project’s target type ratio.

```ts
function typographyScaleSlop(sizes: number[], targetRatio: number): number {
  const valid = sizes.filter((s) => Number.isFinite(s) && s > 0);
  if (valid.length < 2 || targetRatio <= 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const ratios = sorted.slice(1).map((s, i) => s / sorted[i]);
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  if (mean === 0) return 0;
  const variance = ratios.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ratios.length;
  const cv = Math.sqrt(variance) / mean;
  const targetError = Math.abs(mean - targetRatio) / targetRatio;
  return Math.min((cv + targetError) / 0.35, 1);
}
```

| Sizes | target=1.2 | Score |
|-------|------------|-------|
| [12,14.4,17.3,20.7,24.9] | 0 | clean |
| [12,14,16,18,22,30] | ~0.45 | inconsistent |
| [12,18,27,40.5] with target 1.5 | 0 | clean for 1.5 ratio |

#### Heading hierarchy

Counts pairwise inversions between semantic level and visual size. Handles duplicate font sizes deterministically.

```ts
function headingHierarchySlop(headings: { level: number; fontSize: number }[]): number {
  if (headings.length < 2) return 0;
  const pairs = headings.map((h) => ({ level: h.level, size: finite(h.fontSize, 0) }));
  let inversions = 0;
  let total = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if (pairs[i].level === pairs[j].level) continue;
      total++;
      const levelOrder = pairs[i].level < pairs[j].level; // h1 before h2 = true
      const sizeOrder = pairs[i].size > pairs[j].size;    // larger before smaller = true
      if (levelOrder !== sizeOrder && pairs[i].size !== pairs[j].size) {
        inversions++;
      }
    }
  }
  return total === 0 ? 0 : inversions / total;
}
```

#### Contrast

The tokenizer resolves colors to both hex and OKLCH. Contrast can be computed with either WCAG 2.1 relative luminance (for hex/sRGB) or OKLCH perceptual lightness difference (for OKLCH colors). The default method is WCAG 2.1 with a target ratio of 4.5 for AA normal text; this is configurable via `rules.contrastTarget` and `rules.contrastMethod`.

```ts
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg) + 0.05;
  const L2 = relativeLuminance(bg) + 0.05;
  return Math.max(L1, L2) / Math.min(L1, L2);
}

function contrastSlop(ratio: number, target: number = 4.5): number {
  const r = finite(ratio, 0);
  const t = positive(target, 4.5);
  if (r >= t) return 0;
  return Math.min((t - r) / t, 1);
}
```

| Ratio | target=4.5 | Slop |
|-------|------------|------|
| 7.0   | 0          | clean |
| 4.5   | 0          | clean |
| 2.25  | 0.5        | medium |
| 1.0   | ~0.78      | high |

#### Z-index scale

Distance to nearest allowed token, normalized by the largest token. Reads from `DesignTokens.zIndex` when available; otherwise falls back to a bundled scale.

```ts
const DEFAULT_Z_SCALE = [0, 10, 20, 30, 40, 50, 100, 200, 500, 1000];

function zIndexSlop(value: number, allowedScale: number[] = DEFAULT_Z_SCALE): number {
  const v = finite(value, NaN);
  if (allowedScale.length === 0 || v !== v) return 0; // NaN check
  if (allowedScale.includes(v)) return 0;
  const nearest = allowedScale.reduce((best, z) =>
    Math.abs(z - v) < Math.abs(best - v) ? z : best
  );
  const max = Math.max(...allowedScale.map(Math.abs));
  return max === 0 ? 0 : Math.min(Math.abs(v - nearest) / max, 1);
}
```

| Value | Scale | Slop |
|-------|-------|------|
| 10    | default | 0 |
| 11    | default | 0.001 |
| 9999  | default | 1.0 |
| -1    | default | 0.001 |

#### Layout proportion / aspect ratio

```ts
function aspectRatioSlop(width: number, height: number): number {
  const w = finite(width, 0);
  const h = finite(height, 0);
  if (w === 0 || h === 0) return 0;
  const ratio = w / h;
  if (ratio >= 0.25 && ratio <= 4) return 0;
  const dist = ratio < 0.25 ? 0.25 - ratio : ratio - 4;
  return Math.min(dist / 4, 1);
}
```

#### Count-based detectors

For patterns measured by a count (nesting depth, prop count, sibling count, useEffect count), use a sigmoid step so small overages are warnings and large overages are critical.

```ts
function countSlop(value: number, threshold: number, max: number): number {
  const v = finite(value, 0);
  const t = positive(threshold, 1);
  const m = Math.max(v, max, t * 2);
  if (v <= t) return 0;
  return Math.min((v - t) / (m - t), 1);
}
```

Examples:

| Value | threshold | max | Slop |
|-------|-----------|-----|------|
| 5     | 6         | 12  | 0 |
| 8     | 6         | 12  | 0.33 |
| 12    | 6         | 12  | 1.0 |

#### Corpus rarity

Continuous rarity score based on percentile rank in the corpus. Values near the median score 0; extreme tail values score high.

```ts
function corpusRaritySlop(value: number, corpus: number[]): number {
  const v = finite(value, NaN);
  if (corpus.length === 0 || v !== v) return 0;
  const sorted = [...corpus].sort((a, b) => a - b);
  const rank = sorted.filter((x) => x < v).length / sorted.length;
  const distanceFromCenter = Math.abs(rank - 0.5) * 2; // 0 = median, 1 = extreme
  return Math.max(0, distanceFromCenter - 0.9) / 0.1; // tail 10% scores
}
```

### 7.5 Corpus inference (`corpus/`)

Ship a small built-in dataset of dimensions extracted from well-designed open-source apps.

```ts
interface CorpusProfile {
  spacingFrequencies: Record<number, number>;
  fontSizeFrequencies: Record<number, number>;
  colorFrequencies: Record<string, number>;
}
```

For each value, compute how typical it is. Rare values score higher slop.

```ts
function corpusSlop(value: number, corpus: number[]): number {
  const percentile = getPercentile(value, corpus);
  return percentile < 0.05 || percentile > 0.95 ? 1 : 0;
}
```

Corpus is offline, bundled with the package. No network required for MVP.

### 7.6 AI-smell database (`ai-smells/`)

Hardcoded patterns that strongly signal AI-generated slop:

| Smell | Pattern | Advice |
|-------|---------|--------|
| Ghost state | `useEffect(() => setX(...), [])` | Derive state instead. |
| State soup | >5 `useState` in one component | Group related state or use a reducer. |
| Arbitrary Tailwind | `className="...-[...]"` | Use design tokens. |
| Div-as-button | `<div onClick>` | Use `<Button>` or `<button>`. |
| Inline style | `style={{...}}` | Move to class or token. |
| Pointless memo | `useCallback(fn, [])` | Remove unless props are referential. |
| Comment theater | `// This component renders...` | Delete self-evident comments. |
| Pattern lock-in | Same bad pattern copied across files | Refactor the shared abstraction. |

### 7.7 Context-aware severity (`context/`)

Classify each file by path:

- `new`: `src/components/`, `app/**/page.tsx`
- `legacy`: paths matching `legacyPaths`
- `marketing`: paths matching `allowedArbitraryPaths`
- `ui-library`: `components/ui/`

Severity adjustment table:

| Pattern | New component | Legacy file | Marketing page |
|---------|---------------|-------------|----------------|
| `p-[13px]` | critical | warning | warning |
| `<div onClick>` | critical | high | high |
| `inline style` | critical | medium | medium |

---

## 8. Scoring Model

### 8.1 Component-level scoring

```ts
const SEVERITY_WEIGHTS = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
};

const STRICTNESS_MULTIPLIERS: Record<Strictness, number> = {
  brutal: 1.5,
  balanced: 1.0,
  gentle: 0.5,
};

function componentSlopIndex(issues: Issue[], strictness: Strictness): number {
  const multiplier = STRICTNESS_MULTIPLIERS[strictness];
  const budget = 30; // weighted points
  const weightedPoints = issues.reduce(
    (sum, issue) => sum + SEVERITY_WEIGHTS[issue.severity],
    0
  );
  return Math.min(100, Math.round((weightedPoints * multiplier / budget) * 100));
}
```

Context-aware severity (§7.7) is applied by selecting the appropriate severity level for an issue before scoring. The scoring function itself consumes the resolved severity.

### 8.2 Category-level scoring

For each category, average the component scores across **all scanned components**. Components with no issues in a category contribute `0` to that category average.

```ts
function categoryScore(category: Category, components: ComponentReport[]): number {
  if (components.length === 0) return 0;
  const sum = components.reduce((acc, c) => {
    const hasIssue = c.issues.some((i) => i.category === category);
    return acc + (hasIssue ? c.slopIndex : 0);
  }, 0);
  return Math.round(sum / components.length);
}
```

### 8.3 Project-level scoring

```ts
function projectSlopIndex(components: ComponentReport[]): number {
  if (components.length === 0) return 0;
  return Math.round(
    components.reduce((sum, c) => sum + c.slopIndex, 0) / components.length
  );
}
```

### 8.4 Strictness modifiers

| Strictness | Budget multiplier | Effect |
|------------|-------------------|--------|
| Brutal | 1.5 | Punishes every issue harder |
| Balanced | 1.0 | Default |
| Gentle | 0.5 | Forgiving, useful for legacy rescue |

---

## 9. Reporting

### 9.1 Terminal report

- Header: `AI-Slop Index: N%` with colored progress bar.
- Category bars.
- Top offenses (sorted by weighted impact).
- Advice list (up to 5 items).
- Footer with links.

### 9.2 JSON report

```json
{
  "slopIndex": 73,
  "categoryScores": {
    "visual": 81,
    "typography": 60,
    "spacing": 45,
    "component": 62,
    "logic": 54,
    "architecture": 30
  },
  "components": [
    {
      "file": "src/Hero.tsx",
      "name": "Hero",
      "slopIndex": 85,
      "issues": [...]
    }
  ],
  "topOffenses": [...],
  "advice": [...]
}
```

### 9.3 Badge

```markdown
[AI-Slop: 73%](https://slop-audit.dev)
```

Color thresholds:

| Score | Color |
|-------|-------|
| 0–20 | green |
| 21–50 | yellow |
| 51–80 | orange |
| 81–100 | red |

### 9.4 AI autopsy report

A special mode that frames findings as AI failure modes:

```text
This codebase shows 6 classic AI failure modes:

1. Token bias        → 14 custom divs where <Button>/<Card> exist
2. State soup        → 3 ghost useEffects, 2 zombie states
3. Inline temptation → 9 inline styles, 7 inline handlers
4. Pattern lock-in   → 12 components copy the same bad useEffect pattern
5. Comment theater   → 23 self-evident comments
6. Flat design       → 0 semantic color tokens, 11 hardcoded grays

Slop Index: 71%
```

---

## 10. CLI Interface

```
Usage: slop-audit [options] [path]

Options:
  -V, --version                output the version number
  --init                       run calibration wizard
  --json [path]                write JSON report (default: ./slop-audit-report.json; use - for stdout)
  --badge                      output README badge markdown
  --ai-autopsy                 show AI failure-mode breakdown
  --quiet, -q                  suppress advice and footer links
  --strict, -s                 exit with code 2 if any critical or high issue is found
  --config <path>              path to .slop-audit.json
  --include <glob>             include pattern (repeatable)
  --exclude <glob>             exclude pattern (repeatable)
  --strictness <level>         brutal | balanced | gentle
  --no-increase                fail if Slop Index increased vs. previous run
  --trend [n]                  print Sparkline of last n runs (default: 20)
  --no-cache                   disable incremental token cache
  --since <ref>                only scan files changed since git ref
  -h, --help                   display help for command
```

Default path is current working directory.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | No issues found and no score regression |
| 1 | Issues found (warnings or below-threshold slop) |
| 2 | Critical/high issues found (with `--strict`), score increased (with `--no-increase`), or scan error |

`--strict` is a CI gate. `--strictness` is a calibration knob that changes score sensitivity. They can be combined: `--strict --strictness=brutal`. `--no-increase` requires the project memory log to be enabled.

---

## 11. Architecture / File Layout

```
slop-audit/
├── src/
│   ├── cli.ts                 # commander entry point
│   ├── index.ts               # public API
│   ├── config/
│   │   ├── schema.ts          # .slop-audit.json types + defaults
│   │   ├── loader.ts          # read + validate config
│   │   └── wizard.ts          # interactive calibration
│   ├── tokenizer/
│   │   ├── tailwind-v4.ts     # parse CSS-native @theme (Tailwind v4)
│   │   ├── tailwind-v3.ts     # parse tailwind.config.js (Tailwind v3)
│   │   ├── css-vars.ts        # parse CSS variables
│   │   ├── oklch.ts           # OKLCH/LCH/RGB color normalisation
│   │   └── index.ts           # merge into DesignTokens
│   ├── extractor/
│   │   ├── jsx-element.ts     # walk JSX with ts-morph
│   │   ├── className.ts       # parse Tailwind utilities
│   │   ├── style-prop.ts      # parse inline style objects
│   │   └── component.ts       # component boundary detection
│   ├── detectors/
│   │   ├── visual.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   ├── components.ts
│   │   ├── logic.ts
│   │   ├── architecture.ts
│   │   └── index.ts           # orchestrate all detectors
│   ├── math/
│   │   ├── spacing.ts         # grid + entropy
│   │   ├── typography.ts      # modular scale + hierarchy
│   │   ├── contrast.ts        # WCAG
│   │   ├── proportions.ts     # aspect ratio
│   │   └── zIndex.ts          # z-scale
│   ├── corpus/
│   │   ├── baseline.json      # shipped frequency data
│   │   └── inference.ts       # rarity scoring
│   ├── ai-smells/
│   │   ├── patterns.ts        # regex/AST smell definitions
│   │   └── autopsy.ts         # failure-mode aggregation
│   ├── context/
│   │   └── classifier.ts      # legacy/marketing/new path classification
│   ├── scorer.ts              # component + project scoring
│   ├── reporter/
│   │   ├── terminal.ts
│   │   ├── json.ts
│   │   ├── badge.ts
│   │   └── advice.ts          # generate actionable advice
│   └── types.ts               # shared TypeScript types
├── tests/
│   ├── fixtures/
│   │   ├── clean-shadcn.tsx
│   │   ├── ai-landing.tsx
│   │   └── vibe-dashboard.tsx
│   └── detectors/
│       ├── visual.test.ts
│       ├── logic.test.ts
│       └── scorer.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## 12. MVP Scope

### In MVP

- React + TSX/JSX scanning.
- Tailwind CSS parsing.
- Calibration wizard (framework, styling, UI library, base spacing, tolerance, paths, strictness).
- `.slop-audit.json` generation and loading.
- Visual detectors: arbitrary Tailwind, inline styles, hardcoded colors, negative margins, fixed dimensions, magic z-index.
- Logic detectors: ghost useEffect, zombie state, excessive useEffect, prop-to-state sync.
- Component detectors: `<div onClick>`, missing `alt`, missing `aria-label`, reinventing registered primitives.
- Basic typography detectors: hardcoded font sizes, skipped heading levels, visual-only headings.
- Basic spacing detectors: off-grid spacing, deep JSX nesting, excessive sibling count.
- Scoring: weighted severity, 30-point budget, category breakdown.
- Terminal report + JSON output + badge.
- shadcn/ui registry.

### Post-MVP

- Vue / Svelte support.
- CSS Modules / Styled Components / Emotion extraction.
- Full math layer: entropy, modular scale variance, contrast ratios, proportion checks.
- Corpus inference with app-type clustering.
- AI autopsy report.
- Context-aware severity (legacy/marketing paths).
- More component registries (MUI, AntD, Chakra).
- CI action and GitHub annotation output.
- IDE extension.
- Brick.dev web scanner integration.

### Explicitly not doing

- Rewriting code automatically.
- Rendering / screenshot analysis.
- Network-dependent corpus updates in MVP.

---

## 13. Roadmap

| Phase | Deliverable | Goal |
|-------|-------------|------|
| 0.1 | MVP CLI | Ship `npx slop-audit`, calibration, core detectors, badge |
| 0.2 | Math engine | Grid, entropy, type scale, contrast |
| 0.3 | Corpus inference | Offline rarity scoring + app-type clustering |
| 0.4 | AI autopsy | Failure-mode report, prompt-aware hints |
| 0.5 | Multi-framework | Vue + Svelte scanning |
| 0.6 | CI / IDE | GitHub Action, VS Code extension |
| 1.0 | Brick.dev bridge | Upload scan, web scanner, rescue waitlist |

---

## 14. Competitive Differentiation

| Competitor | What they do | What slop-audit adds |
|------------|--------------|----------------------|
| KarpeSlop | TS/JS AI-slop linter: hallucinated imports, `any` abuse, redundant comments, vibe-coding | Frontend-specific design-system conformance + visual slop scoring |
| aislop | Subjective “vibe” scoring | Measurable math + token extraction |
| Vibecheck | Generic quality check | Component registry + contextual advice |
| gstack slop-scan | Pattern linter | Scoring model + badge + rescue funnel |
| Hallmark | Design skill with `hallmark audit` and 65 anti-slop gates | Deterministic CLI, calibration wizard, synthetic data flywheel |
| ux-skill | Deterministic anti-slop linter with 152 rules and brand specs | Open-source npm package, corpus inference, Brick.dev rescue bridge |

Our moat: **token conformance + mathematical regularity + corpus inference + AI-smell database**, wrapped in a viral badge and rescue funnel. We focus on the code layer; Hallmark and Taste Skill focus on the generation layer. Both are needed.

---

## 15. Risks & Limitations

| Risk | Mitigation |
|------|------------|
| False positives on intentionally expressive code | Calibration + context-aware severity |
| Tailwind v4 config changes | Tokenizer abstraction; test against v4 |
| Complex dynamic className strings | Extract static segments; flag dynamic concatenation |
| No rendered visual truth | Document as “code-level slop only”; Brick.dev handles rendered analysis |
| Competitor clones | Data flywheel from scan telemetry (opt-in) |

---

## 16. Anti-AI-Pattern Data & AI Design Tendency Modeling

The CLI’s AI-smell database is not a random list of pet peeves. It is grounded in two sources: **public anti-slop rule sets** that enumerate AI UI failure modes, and **self-observed AI generation tendencies** distilled from how models like the author (and similar agents) actually produce code when asked for mock interfaces.

### 16.1 Public anti-slop rule sets

A growing ecosystem of skills and rule files explicitly forbids generic AI UI output. These are valuable reference data because they encode the difference between “looks like a website” and “looks like a designed product.”

| Resource | Format | Focus |
|----------|--------|-------|
| [LeoStehlik/no-slop-ui](https://github.com/LeoStehlik/no-slop-ui) | OpenClaw / Codex skill | Bans glassmorphism, gradient abuse, eyebrow labels, hero sections inside dashboards, oversized rounded corners; enforces 4/8/12/16/24/32px spacing and 8–12px radius max |
| [Taste Skill](https://www.tasteskill.dev/) | SKILL.md framework | Stack-agnostic anti-slop design system with 5 design schools and adjustable dials |
| [Anthropic frontend-design plugin](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design) | SKILL.md | Forces purpose/tone/constraints/differentiation before generating UI; forbids Inter, Roboto, Arial, purple gradients, predictable layouts |
| [Hallmark](https://github.com/nutlope/hallmark) | SKILL.md + audit verb | 65 anti-slop gates across typography, color, layout, motion, copy; `hallmark audit` scores existing code |
| [ux-skill](https://github.com/Laith0003/ux-skill) | Python engine + skill manifests | 152 deterministic anti-slop rules, 160 brand specs, CI-safe linter |
| [KarpeSlop](https://github.com/CodeDeficient/KarpeSlop) | npm CLI | TS/JS AI-slop linter: hallucinated imports, `any` abuse, redundant comments, vibe-coding patterns |
| [anti-ai-slop topic on GitHub](https://github.com/topics/anti-ai-slop) | Topic index | Collection of writing, UI, and code anti-slop tools |
| [conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) | Writing skill | Anti-AI-ism detector with tiered vocabulary and structural patterns (analogous approach for prose) |

These rule sets do three things for slop-audit:

1. **Validate detector choices** — if multiple independent skills ban glassmorphism, it belongs in the visual-slop catalog.
2. **Supply default thresholds** — e.g. “radius max 12px,” “shadow blur max 8px,” “no decorative gradients.”
3. **Feed the advice engine** — the report can cite the intent behind a rule, not just the rule itself.

### 16.2 Distilling AI agent UI tendencies

When asked to design a mock website, landing page, dashboard, or mobile screen without tight constraints, an AI agent typically emits a recognizable default. Cataloguing this default is data.

#### Default SaaS landing page (desktop)

```tsx
export default function SaasLandingPage() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <div className="text-xl font-bold text-indigo-600">SaaSify</div>
        <button onClick={() => setIsOpen(!isOpen)} className="md:hidden">
          <Menu />
        </button>
      </nav>
      <section className="py-20 px-6 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-6">
          Build faster with AI
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
          ...
        </p>
        <button className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Get Started
        </button>
      </section>
      <section className="py-16 px-6 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {features.map((f) => (
          <div key={f.title} className="p-6 bg-white rounded-xl shadow-sm">
            ...
          </div>
        ))}
      </section>
    </div>
  );
}
```

#### Default mobile screen

```tsx
export default function MobileScreen() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome back</h2>
        <p className="text-gray-600 mb-4">Continue where you left off.</p>
        <button className="w-full py-3 bg-blue-600 text-white rounded-xl">
          Continue
        </button>
      </div>
    </div>
  );
}
```

### 16.3 Observable AI UI tendencies

| Tendency | What the model does | Detectable signal |
|----------|--------------------:|-------------------|
| **Safe color fallback** | Defaults to slate + indigo/blue/gray | `bg-slate-50`, `text-indigo-600`, `bg-blue-600` |
| **Soft shape fallback** | Uses `rounded-lg`, `rounded-xl`, `rounded-2xl` everywhere | radius utility count ≫ token radius count |
| **Centered hero + 3-col grid** | Predictable SaaS template | semantic page structure repeats across files |
| **Shadow as decoration** | `shadow-sm`, `shadow-lg`, `shadow-xl` on cards | shadow utility on non-elevated surfaces |
| **Gradient hero** | purple-to-indigo or blue decorative gradient | arbitrary gradient classes or inline background |
| **Glassmorphism** | frosted panels, `backdrop-blur` | `backdrop-blur` + low-opacity white backgrounds |
| **Eyebrow labels** | `<small>SECTION NAME</small>` above headings | small-caps/uppercase decorative labels |
| **Generic copy** | “Build faster with AI,” “Operational clarity” | marketing phrases not tied to product |
| **Inline data arrays** | maps `features`, `pricing`, `testimonials` inline | data + presentation mixed in component |
| **Missing labels** | icon-only mobile menu button | `<button>` with icon but no `aria-label` |
| **Custom primitives** | raw `<button>` and `<div>` instead of imported `<Button>` | `<button>` detected while `Button` is in registry |
| **Ghost state** | `useState` for mobile menu toggle that only toggles itself | state setter only called by its own control |

### 16.4 AI design tendency profile schema

The CLI can ship a dataset of these tendencies so detectors can flag “this matches a known AI default” even when no project-specific token is violated.

```ts
interface AIDesignTendency {
  id: string;
  name: string;
  description: string;
  category: "visual" | "typography" | "spacing" | "component" | "logic" | "architecture";
  severity: "critical" | "high" | "medium" | "low";
  signals: {
    classNames?: string[];      // Tailwind utility patterns
    colors?: string[];          // hex/rgb or tailwind color names
    elementPatterns?: string[]; // JSX tag + role patterns
    hookPatterns?: string[];    // React hook AST patterns
    copyPhrases?: string[];     // generic marketing strings
  };
  advice: string;
  references: string[];         // links to skills/docs that forbid this
}
```

Example entry:

```ts
{
  id: "glassmorphism-card",
  name: "Glassmorphism card",
  category: "visual",
  severity: "medium",
  signals: {
    classNames: [
      "backdrop-blur",
      "bg-white/\\d+",
      "bg-opacity-\\d+"
    ]
  },
  advice: "Glass panels are a common AI default. Use solid surfaces with 1px borders unless transparency is required by the design system.",
  references: ["https://github.com/LeoStehlik/no-slop-ui"]
}
```

### 16.5 How this data feeds the engine

1. **AI-smell database** — high-confidence patterns become detectable smells.
2. **Corpus baseline** — frequency of AI-default colors/shapes helps distinguish “common in real apps” from “common in AI output.”
3. **Advice engine** — the report can say not just *what* is wrong but *which AI tendency it matches*.
4. **Calibration defaults** — the wizard can ask: “Do you want to block generic AI aesthetic defaults (gradients, glass, rounded everything)?”

### 16.6 KarpeSlop-style code detectors

The [KarpeSlop](https://github.com/CodeDeficient/KarpeSlop) CLI proves that AI slop is visible in code, not only pixels. `slop-audit` should include equivalent static-analysis detectors for TypeScript / JSX:

| Detector | Signal | Rationale |
|----------|--------|-----------|
| **Hallucinated import** | Import path resolves to a package not declared in `package.json` (e.g. `lucide-react` or `framer-motion` imported but absent) | AI often “imports from muscle memory.” |
| **Unresolved icon** | `<Icon name="...">` or string icon prop that does not match a known icon library export | Common in generated component registries. |
| **`any` / `unknown` abuse** | Type annotation `any` on style props, event handlers, or component props | Vibe-coding shortcut that disables type safety. |
| **Redundant AI comment** | Comment patterns such as `// This component handles...`, `// TODO: Add real data`, `// Generated by AI` | Noise and unfinished intent. |
| **Dead state setter** | `useState` setter only called by the same control that reads it (e.g. `isOpen` toggle) | Produces non-functional interactive chrome. |
| **Inline data as presentation** | Large arrays of objects mapped inside a component with no separation into a data file or hook | Hardcodes AI-generated demo content. |
| **Placeholder copy** | Strings matching `Lorem ipsum`, `Example Inc`, `Your Company`, `Build faster with AI`, `Operational clarity` | Unreviewed placeholder text ships to users. |
| **Confidence without evidence** | Prop names like `isPremium`, `plan` set to hardcoded booleans/strings in presentation code | Fake feature-gating. |

These detectors run on the AST using `ts-morph`, not on rendered output. They produce medium-severity issues under the `logic` and `architecture` categories.

### 16.7 Banned-defaults rule pack

A portable, versioned rule pack encodes the intersection of popular anti-slop skills. It ships as `rules/banned-defaults.json` and is applied unless the user disables it. Examples:

```json
{
  "rules": [
    {
      "id": "no-glassmorphism",
      "message": "Avoid backdrop-blur + translucent white backgrounds as a default card style.",
      "category": "visual",
      "severity": "medium",
      "patterns": {
        "classNames": ["backdrop-blur", "bg-white/\\d+", "bg-opacity-\\d+"]
      }
    },
    {
      "id": "no-gradient-hero",
      "message": "Decorative gradient heroes are a common AI default.",
      "category": "visual",
      "severity": "low",
      "patterns": {
        "classNames": ["bg-gradient-to-", "from-indigo-", "from-purple-"]
      }
    },
    {
      "id": "max-radius",
      "message": "Avoid oversized corner radii (>16px) on small components.",
      "category": "visual",
      "severity": "low",
      "patterns": {
        "classNames": ["rounded-2xl", "rounded-3xl", "rounded-full"]
      }
    },
    {
      "id": "no-generic-font-stack",
      "message": "Inter/Roboto/Arial defaults signal unconsidered typography.",
      "category": "typography",
      "severity": "low",
      "patterns": {
        "fontFamily": ["Inter", "Roboto", "Arial", "sans-serif"]
      }
    },
    {
      "id": "no-saas-template-structure",
      "message": "Centered hero + 3-column feature grid repeated across pages.",
      "category": "architecture",
      "severity": "medium",
      "patterns": {
        "pageStructure": ["centeredHero", "threeColumnFeatureGrid"]
      }
    }
  ]
}
```

The rule pack is parsed by the same pattern engine as the AI-smell database and supports suppression comments.

### 16.8 Project memory log

`slop-audit` keeps a project-local log at `.slop-audit/log.json` (gitignored by default). Each scan appends a lightweight record:

```ts
interface SlopAuditRun {
  timestamp: string;
  version: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  topOffenseIds: string[];
  thresholdExceeded: boolean; // true if any category > user-configured threshold
}
```

Uses:

- **Trends** — `slop-audit --trend` prints a Sparkline of the last N Slop Indexes by category.
- **Regression gating** — CI can fail only when the Slop Index increases compared to the previous run (`--no-increase`).
- **Calibration replay** — the wizard can ask “Your last run scored X; did that feel right?” to tighten thresholds.

The log never stores source code, file paths beyond relative component names, or secrets. Users can disable it with `"projectMemory": false` in `.slop-audit.json`.

---

## 17. Operational & Distribution Specs

### 17.1 Telemetry & data flywheel

The CLI can optionally upload anonymized scan dimensions to improve the corpus baseline.

- **Opt-in only.** Default is off. Ask once during calibration: `Help improve slop-audit by sharing anonymized design dimensions?`.
- **Never upload source code.** Only aggregated dimensions: spacing value histograms, font-size histograms, component counts by category, framework/styling fingerprints.
- **No secrets.** Strip file paths, variable names, and string literals.
- **Offline fallback.** If the user declines, the CLI uses the bundled corpus and never calls the network.

Telemetry payload example:

```json
{
  "version": "0.1.0",
  "framework": "react",
  "styling": "tailwind",
  "uiLibrary": "shadcn/ui",
  "componentCount": 42,
  "spacingHistogram": { "4": 12, "8": 34, "13": 2, "16": 28 },
  "fontSizeHistogram": { "14": 10, "16": 24, "15": 3 },
  "issueCounts": { "arbitraryTailwind": 14, "ghostUseEffect": 3 }
}
```

#### 17.1.1 Synthetic data flywheel

User telemetry is valuable but not required to bootstrap the corpus. The project maintains a **synthetic generator** that prompts an AI coding agent to produce thousands of mock UI components across categories:

- SaaS landing pages (desktop + mobile)
- Dashboards and admin panels
- E-commerce product pages
- Onboarding flows
- Settings screens

Each generated component is run through the same extraction pipeline as real code. The resulting dimensions are merged into the corpus baseline.

```
AI generator ──► mock UI components ──► extractor ──► dimension histograms ──► corpus baseline
                                        │                                              │
                                        └────────────── slop-audit scans ◄───────────────┘
```

Benefits:

- **No cold-start problem.** The corpus ships with meaningful frequency data from day one.
- **Controlled variation.** We can generate rare-but-valid values and common AI slop values in known proportions.
- **AI tendency mining.** Running the detector against generated code surfaces new failure modes before real users encounter them.
- **Privacy-free.** Synthetic data contains no proprietary user code.

The generator is a separate internal tool, not shipped with the CLI. It produces `corpus/baseline.json` during release builds.

### 17.2 Corpus versioning

- The bundled corpus is versioned with the package.
- Each corpus entry includes a checksum.
- Backward compatibility: new corpus versions must not change old scores by more than ±2% on the test fixture set.
- Users can pin a corpus version in `.slop-audit.json`: `"corpusVersion": "0.1.0"`.

### 17.3 Escape hatches & rule suppression

Users must be able to suppress false positives without disabling the whole tool.

Per-rule disable in `.slop-audit.json`:

```json
{
  "disabledRules": ["off-grid-spacing", "ghost-use-effect"]
}
```

Per-file disable via comment:

```tsx
// slop-audit-disable-next-line arbitrary-tailwind
<div className="p-[13px]">
```

Per-component disable:

```tsx
// slop-audit-disable visual
export function ExpressiveHero() { ... }
```

Suppressed issues are still counted in a separate “ignored” bucket in the JSON report so teams can audit suppressions.

### 17.4 Determinism & caching

- Same codebase + same config must produce the same Slop Index byte-for-byte in JSON output (modulo timestamps).
- Token parsing results can be cached in `.slop-audit/cache/` keyed by file mtime.
- Caching is disabled in CI by default (`--no-cache`).

### 17.5 Performance budget

- Target: scan 1,000 components in <5 seconds on a modern laptop.
- File timeout: 2 seconds per file; files that time out are reported as unscanned.
- Incremental scan: only re-scan files changed since last run (`--since <ref>`).

### 17.6 Package structure & npm distribution

```
slop-audit/
├── bin/
│   └── slop-audit.js          # shebang entry (dev via tsx, prod via dist)
├── dist/
│   ├── index.cjs              # CJS library bundle
│   ├── index.mjs              # ESM library bundle
│   ├── index.d.ts             # type declarations
│   ├── cli.cjs                # CJS CLI bundle
│   └── cli.mjs                # ESM CLI bundle
├── corpus/
│   └── baseline.json
├── package.json
├── README.md
└── LICENSE
```

`package.json`:

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
  "files": ["dist", "bin", "corpus", "rules", "README.md", "LICENSE"],
  "engines": { "node": ">=18" },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "publishConfig": {
    "provenance": true,
    "access": "public"
  }
}
```

Bundle with `tsup` producing dual CJS/ESM output for maximum compatibility. Use `tsx` for local development so the dev bin runs TypeScript directly without a build step. Publish with npm Trusted Publisher / provenance signing enabled.

### 17.7 Output format specifications

#### JSON report schema

```ts
interface SlopAuditReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;
  categoryScores: Record<Category, number>;
  components: ComponentReport[];
  topOffenses: Offense[];
  advice: string[];
  ignoredIssues: number;
  unscannedFiles: string[];
}

interface ComponentReport {
  file: string;
  name: string;
  line: number;
  slopIndex: number;
  issues: Issue[];
}

interface Issue {
  ruleId: string;
  category: Category;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  line: number;
  column: number;
  advice?: string;
}
```

#### SARIF output (post-MVP)

A `--sarif` flag outputs SARIF v2.1.0 for GitHub Advanced Security ingestion.

#### Markdown report

`--markdown` outputs a report suitable for PR comments.

---

## 18. Appendices

### A. Key formulas

| Detector | Formula |
|----------|---------|
| Grid slop | `min(\|value\| % base, base - \|value\| % base) / (base / 2)` |
| Type scale variance | `(CV + targetError) / 0.35` capped at 1 |
| Contrast ratio | `max(L₁,L₂) / min(L₁,L₂)` where `L = relativeLuminance + 0.05` |
| Contrast slop | `max(0, (target - ratio) / target)` |
| Entropy | `-Σ p × log₂(p)`, normalized by `log₂(uniqueCount)` |
| Heading hierarchy | pairwise inversions / total comparable pairs |
| Z-index slop | `\|value - nearestToken\| / maxToken` |
| Aspect ratio slop | `distanceOutside([0.25, 4]) / 4` |
| Count slop | `(value - threshold) / (max - threshold)` |
| Corpus rarity | `max(0, \|2 × percentile - 1\| - 0.9) / 0.1` |
| Component saturation | `min(100, round(weightedPoints × multiplier / 30 × 100))` |

### B. Standard UI library scales (reference)

| Library | Spacing base | Type ratio | Radius base |
|---------|--------------|------------|-------------|
| Tailwind CSS | 4px (0.25rem) | — | 4px |
| Material Design 3 | 4dp grid | — | 4dp / 8dp / 16dp |
| shadcn/ui | Tailwind tokens | Tailwind tokens | `--radius` |
| Common modular scale | — | 1.2 / 1.25 / 1.333 | — |

These are not hardcoded rules; they are defaults the calibration wizard suggests and the user can override.

### C. AI failure modes catalog

The autopsy report maps findings to these failure modes:

1. **Token bias** — preferring `className` strings over importing components.
2. **State soup** — declaring more state than needed.
3. **Ghost logic** — `useEffect` deriving state instead of syncing.
4. **Inline temptation** — handlers, styles, and logic inlined.
5. **Pattern lock-in** — copying bad patterns across files.
6. **Comment theater** — self-evident comments.
7. **Flat design** — safe but generic neutral grays and rounded corners.
8. **Primitive reinvention** — `<div>` doing the job of `<Button>`.
9. **Vague prompt fallback** — generic SaaS landing page template.
10. **Constraint blindness** — ignoring accessibility, performance, brand.

### D. Glossary

- **Slop Index** — the final 0–100% quality score.
- **Component saturation** — how full a single component is of slop.
- **Ghost useEffect** — an effect that only calls `setState`.
- **Zombie state** — state declared but never read.
- **Token conformance** — whether values match the project’s design tokens.
- **Corpus inference** — comparing values to a dataset of real apps.

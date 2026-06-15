# slop-audit

> Detect AI-generated frontend slop. Get a single Slop Index for any React / Vue / Svelte / Solid project.

AI writes logic well, but it hallucinates UI. `slop-audit` reads your frontend code, extracts the design tokens and conventions it finds, and flags deviations that signal slop: arbitrary Tailwind values, ghost `useEffect`s, `<div onClick>`, inline styles, broken type scales, and more.

It answers one question brutally well:

> **Is this frontend built with tokens, semantics, and components, or hacked together with magic values and divs?**

[![AI-Slop: badge me](https://img.shields.io/badge/AI--Slop-audit%20me-6366f1)](https://slop-audit.dev)

---

## Installation

Run once without installing:

```bash
npx slop-audit
```

Add to a project as a dev dependency:

```bash
pnpm add -D slop-audit
```

---

## Quick start

Scan the current directory:

```bash
npx slop-audit .
```

On first run, `slop-audit` auto-detects your framework, styling solution, and base spacing grid. If no `.slop-audit.json` exists, run the calibration wizard first.

---

## Calibration

Generate a project-specific config with an interactive wizard:

```bash
npx slop-audit --init
```

The wizard asks about:

- Framework (React, Vue, Svelte, Solid)
- Styling solution (Tailwind, CSS Modules, styled-components, Emotion, plain CSS)
- UI library / design system (shadcn/ui, MUI, Ant Design, Chakra, Radix, custom, none)
- Base spacing grid (4px, 8px, 5px, custom)
- Type scale ratio
- Arbitrary value tolerance (`strict`, `balanced`, `permissive`)
- Paths to scan
- Strictness level (`brutal`, `balanced`, `gentle`)

Auto-detected values are shown as defaults and can be overridden.

---

## Configuration reference

`.slop-audit.json` lives at the root of the project being scanned.

```json
{
  "framework": "react",
  "styling": "tailwind",
  "uiLibrary": "shadcn/ui",
  "baseSpacing": 4,
  "typeScaleRatio": 1.2,
  "arbitraryTolerance": "balanced",
  "strictness": "balanced",
  "include": ["src/**/*", "app/**/*", "pages/**/*", "components/**/*"],
  "exclude": [
    "**/node_modules/**",
    "**/*.test.{ts,tsx,js,jsx}",
    "**/*.stories.{ts,tsx}",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**"
  ],
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
  "disabledRules": [],
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

### Key options

| Option | Description |
|--------|-------------|
| `framework` | Target framework: `react`, `vue`, `svelte`, `solid` |
| `styling` | Primary styling system: `tailwind`, `css-modules`, `styled-components`, `emotion`, `plain` |
| `uiLibrary` | Design system in use, e.g. `shadcn/ui`, `mui`, `antd`, `chakra`, `radix` |
| `baseSpacing` | Base spacing grid in pixels (e.g. `4`) |
| `typeScaleRatio` | Target modular type scale ratio (e.g. `1.2`) |
| `arbitraryTolerance` | How hard to flag arbitrary Tailwind values: `strict`, `balanced`, `permissive` |
| `strictness` | Overall scoring multiplier: `brutal`, `balanced`, `gentle` |
| `legacyPaths` | Paths where issues score lower because the code is old |
| `allowedArbitraryPaths` | Paths where arbitrary values are acceptable, e.g. marketing pages |
| `componentRegistry` | Map primitive names to your component names |
| `disabledRules` | Rule IDs to skip |
| `bannedDefaults` | Enable the built-in banned-defaults rule set |
| `projectMemory` | Store run history for trend tracking |

---

## CLI flags reference

```text
Usage: slop-audit [options] [path]

Options:
  -V, --version                output the version number
  --init                       run calibration wizard
  --json [path]                write JSON report (default: ./slop-audit-report.json; use - for stdout)
  --badge                      output README badge markdown
  --ai-autopsy                 show AI failure-mode breakdown
  -q, --quiet                  suppress advice and footer links
  -s, --strict                 exit with code 2 if any critical or high issue is found
  --config <path>              path to .slop-audit.json
  --include <glob>             include pattern (repeatable)
  --exclude <glob>             exclude pattern (repeatable)
  --strictness <level>         brutal | balanced | gentle
  --no-increase                fail if Slop Index increased vs. previous run
  --trend [n]                  print sparkline of last n runs (default: 20)
  --no-cache                   disable incremental token cache
  --since <ref>                only scan files changed since git ref
  -h, --help                   display help for command
```

Default path is the current working directory.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | No issues found and no score regression |
| `1` | Issues found (warnings or below-threshold slop) |
| `2` | Critical/high issues with `--strict`, score increased with `--no-increase`, or scan error |

Use `--strict` as a CI gate. Combine with `--strictness=brutal` for maximum pain.

---

## Example terminal output

```text
$ npx slop-audit .
AI-Slop Index: 73% [████████████████░░░░]

Visual:       81%  ████████████████░░░░
Typography:   60%  ████████████░░░░░░░░
Spacing:      45%  █████████░░░░░░░░░░░
Components:   62%  ████████████░░░░░░░░
Logic:        54%  ███████████░░░░░░░░░
Architecture: 30%  ██████░░░░░░░░░░░░░░

Top offenses:
  • 14 arbitrary Tailwind values off the 4px grid (high)
  • 3 ghost useEffect calls setting state on mount (high)
  • 2 <div> elements acting as buttons (high)
  • Heading hierarchy inverted on /pricing (medium)

Advice:
  1. Replace w-[800px] h-[600px] with a container + aspect ratio.
  2. Move fetch logic to a data library; delete 3 useEffects.
  3. Use <Button> from your design system instead of <div onClick>.

Get a deeper analysis: https://slop-audit.dev
Need a rescue? https://brick.dev/rescue
```

---

## README badge

Add a Slop Index badge to your README:

```bash
npx slop-audit --badge
```

Output:

```markdown
[AI-Slop: 73%](https://slop-audit.dev)
```

Render it as a badge with shields.io:

```markdown
[![AI-Slop: 73%](https://img.shields.io/badge/AI--Slop-73%25-orange)](https://slop-audit.dev)
```

Badge color thresholds:

| Score | Color |
|-------|-------|
| 0–20  | green |
| 21–50 | yellow |
| 51–80 | orange |
| 81–100 | red |

---

## How scoring works

Each issue has a severity weight:

| Severity | Weight |
|----------|--------|
| critical | 10 |
| high | 5 |
| medium | 2 |
| low | 1 |

Each component has a saturation budget of 30 weighted points. The component Slop Index is:

```text
min(100, round((weightedPoints × strictnessMultiplier / 30) × 100))
```

The project Slop Index is the arithmetic mean of all component scores. Category scores average across all scanned components.

| Strictness | Multiplier |
|------------|------------|
| brutal | 1.5 |
| balanced | 1.0 |
| gentle | 0.5 |

---

## Need a rescue?

If your Slop Index is higher than your blood pressure, Brick.dev offers a rescue service for AI-generated frontend messes.

👉 [https://brick.dev/rescue](https://brick.dev/rescue)

---

## License

[MIT](./LICENSE) © Brick.dev

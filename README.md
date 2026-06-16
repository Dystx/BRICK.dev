# slop-audit

> Detect AI-generated frontend slop. Get a single Slop Index for any React / Vue / Svelte / Solid project.

AI writes logic well, but it hallucinates UI. `slop-audit` reads your frontend code, extracts the design tokens and conventions it finds, and flags deviations that signal slop: arbitrary Tailwind values, ghost `useEffect`s, `<div onClick>`, inline styles, broken type scales, and more.

It answers one question brutally well:

> **Is this frontend built with tokens, semantics, and components, or hacked together with magic values and divs?**

[![Slop Index](https://img.shields.io/badge/slop--index-audit%20me-6366f1)](https://github.com/brickdotdev/slop-audit)

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
npx slop-audit
```

Scan specific paths:

```bash
npx slop-audit src app
```

`slop-audit` auto-detects your framework when possible. For a repeatable setup, create a config file first.

---

## Initialize a project

Create `slop-audit.config.mjs` with the default configuration:

```bash
npx slop-audit init
```

Overwrite an existing config:

```bash
npx slop-audit init --yes
```

Save an initial baseline at the same time:

```bash
npx slop-audit init --baseline
```

---

## Configuration reference

`slop-audit.config.mjs` lives at the root of the project being scanned. `.cjs` and `.js` are also supported.

```js
export default {
  framework: 'react',
  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
  ],
  rules: {
    'visual/arbitrary-escape': 'medium',
    'visual/generic-centering': 'low',
    'logic/boundary-violation': 'high',
    'logic/zombie-state': 'medium',
    'logic/ghost-defensive': 'medium',
    'wcag/target-size': 'high',
    'wcag/focus-appearance': 'high',
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
};
```

### Key options

| Option | Description |
|--------|-------------|
| `framework` | Target framework multiplier, e.g. `react`, `vue`, `svelte`, `solid` |
| `include` | Glob patterns for files to scan |
| `exclude` | Glob patterns for files to ignore |
| `rules` | Per-rule severity override: `low`, `medium`, `high`, or `off` |
| `frameworkMultipliers` | Multipliers applied per framework |
| `ruleConfig` | Rule-specific numeric options |
| `contextTaxCaps` | Saturation caps for clean/standard contexts |
| `thresholds` | Gate thresholds for `meanSlop`, `p90Slop`, and `individualSlopThreshold` |
| `arbitraryValueAllowlist` | Class-name strings or regexes that are allowed as arbitrary values |
| `wcag.targetSizeExemptSelectors` | CSS selectors exempt from target-size checks |

---

## CLI reference

```text
Usage: slop-audit [options] [command]

Global options:
  -V, --version                         output the version number
  --framework <name>                    framework multiplier to apply
  --ai-only                             only report AI-specific issues
  --human-only                          only report human-facing issues
  --ignore-wcag22                       ignore WCAG 2.2 related issues
  --format <pretty|json|sarif>          output format (default: pretty)
  --threads <n>                         number of worker threads
  --since <ref>                         only scan files changed since git ref
  --workspace <path>                    workspace/project path (default: cwd)
  --tighten                             tighten baseline allowances
  --fix                                 apply auto-fixes
  --doctor                              run diagnostics
  --watch                               watch files and re-run (not implemented)
  --suggest                             print remediation advice
  --heatmap                             output migration ROI heatmap
  --quiet                               suppress non-error output
  --json [path]                         write JSON report to path or stdout
  --staged                              scan only staged files
  --cache                               enable baseline caching (default: true)
  --no-cache                            disable baseline caching
  -h, --help                            display help for command

Subcommands:
  init [options]                        create a slop-audit config file
    --baseline                          run an initial scan and save a baseline
    --yes                               overwrite existing config
  install                               install the git pre-commit hook
  uninstall                             uninstall the git pre-commit hook
  badge                                 print a shields.io slop-index badge
  suggest                               print remediation advice
  scan [paths...]                       scan files for slop (default command)
```

The default command is `scan`. Running `npx slop-audit` with no subcommand scans the current directory.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Passed: below thresholds or no staged gating failure |
| `1` | Thresholds exceeded or staged gating failure |
| `2` | Config, git, hook, or user error |
| `3` | Unexpected error |

Use `--staged` as a pre-commit gate. Combine with `--tighten` to ratchet baselines down over time.

---

## Example terminal output

```text
$ npx slop-audit .
Slop Index: 73 | Assembly Health: 27
(0-100, higher = better, inverse of Slop Index)

Category breakdown
  Visual            81.0
  Typography        60.0
  Spacing           45.0
  Component         62.0
  Logic             54.0
  Architecture      30.0

Top offending components
   95.0  src/legacy/Modal.tsx
   88.0  app/(marketing)/page.tsx
   71.0  src/components/Button.tsx

Issues (4)
[HIGH  ] visual/arbitrary-escape · src/legacy/Modal.tsx:14:8
  Avoid arbitrary Tailwind values outside the design token grid.
  → Replace w-[800px] h-[600px] with a container + aspect ratio.
[HIGH  ] logic/zombie-state · src/components/Form.tsx:42:3
  State is initialized but never updated or read.
  → Remove the unused state or wire it up.
[HIGH  ] wcag/target-size · app/pricing/page.tsx:28:5
  Interactive element is smaller than the WCAG 2.2 minimum target size.
  → Increase the hit area to at least 24×24 CSS pixels.
[MEDIUM] visual/generic-centering · src/components/Hero.tsx:9:5
  Generic centering pattern detected.
  → Use a layout primitive from your design system.

Need a rescue? https://brick.dev/rescue
```

---

## README badge

Add a Slop Index badge to your README:

```bash
npx slop-audit badge
```

Output:

```markdown
[![Slop Index](https://img.shields.io/badge/slop--index-73-red)](https://github.com/brickdotdev/slop-audit)
```

Badge color thresholds:

| Score | Color |
|-------|-------|
| 0–24  | green |
| 25–49 | yellow |
| 50+   | red |

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

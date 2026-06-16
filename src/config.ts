import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { ResolvedConfig } from './types';
import { builtinRules } from './rules/builtins';

export const DEFAULT_SPACING_SCALE = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];

export const DEFAULT_CONFIG: ResolvedConfig = {
  include: [
    'src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'packages/*/src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
    'apps/*/src/**/*.{ts,tsx,js,jsx,vue,svelte,astro}',
  ],
  exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  rules: {
    'visual/arbitrary-escape': 'medium',
    'visual/forced-layout': 'medium',
    'visual/generic-centering': 'low',
    'logic/boundary-violation': 'high',
    'logic/zombie-state': 'medium',
    'logic/ghost-defensive': 'medium',
    'wcag/target-size': 'high',
    'wcag/focus-appearance': 'high',
    'wcag/focus-obscured': 'medium',
    'layout/gap-monopoly': 'medium',
    'typo/calc-raw-px': 'high',
    'typo/calc-fontsize': 'medium',
    'typo/clamp-offscale': 'medium',
    'visual/inline-style': 'high',
    'visual/hardcoded-color': 'medium',
    'visual/clamp-soup': 'high',
    'component/primitive-reinvention': 'high',
    'component/shadcn-prop-mismatch': 'high',
    'typo/heading-hierarchy': 'high',
    'typo/hardcoded-font-size': 'medium',
    'typo/hardcoded-line-height': 'low',
    'typo/magic-letter-spacing': 'low',
    'typo/non-token-font-weight': 'low',
    'typo/custom-font-family': 'low',
    'motion/arbitrary-duration': 'low',
    'motion/arbitrary-easing': 'low',
    'motion/arbitrary-transition': 'low',
    'motion/arbitrary-animation': 'low',
    'visual/arbitrary-z-index': 'low',
    'visual/arbitrary-shadow': 'low',
    'visual/arbitrary-radius': 'low',
    'wcag/dragging-movements': 'medium',
    'logic/qwik-hook-leak': 'high',
    'perf/cls-image': 'low',
    'perf/css-bloat': 'low',
    'arch/astro-island-leak': 'low',
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
    forcedLayoutThreshold: 2,
    genericCenteringMaxInstances: 1,
    gapMonopolyTolerance: undefined,
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
  projectMemory: true,
};

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const out = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const s = (source as Record<string, unknown>)[key];
    if (s && typeof s === 'object' && !Array.isArray(s) && out[key] && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key] as Record<string, unknown>, s as Record<string, unknown>);
    } else if (s !== undefined) {
      out[key] = s;
    }
  }
  return out as T;
}

export function resolveConfigPath(dir: string): string | undefined {
  const candidates = ['slop-audit.config.mjs', 'slop-audit.config.cjs', 'slop-audit.config.js'];
  let current = resolve(dir);
  while (true) {
    for (const name of candidates) {
      const full = join(current, name);
      if (existsSync(full)) return full;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function detectJsLoader(configPath: string): 'import' | 'require' {
  const ext = extname(configPath);
  if (ext === '.mjs') return 'import';
  if (ext === '.cjs') return 'require';
  // For .js, inspect nearest package.json type field.
  let current = dirname(resolve(configPath));
  while (true) {
    const pkgPath = join(current, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.type === 'module' ? 'import' : 'require';
      } catch {
        return 'require';
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return 'require';
}

async function loadConfigFile(path: string): Promise<Partial<ResolvedConfig>> {
  const loader = detectJsLoader(path);
  if (loader === 'require') {
    const req = createRequire(import.meta.url);
    const mod = req(path);
    return mod.default ?? mod;
  }
  const mod = await import(path);
  return mod.default ?? mod;
}

function validateRuleIds(config: ResolvedConfig): void {
  const knownIds = new Set(builtinRules.map((rule) => rule.id));
  for (const ruleId of Object.keys(config.rules)) {
    if (!knownIds.has(ruleId)) {
      console.warn(`Warning: Unknown rule ID "${ruleId}" in config.`);
    }
  }
}

export async function loadConfig(cwd: string): Promise<ResolvedConfig> {
  const configPath = resolveConfigPath(cwd);
  if (!configPath) {
    return DEFAULT_CONFIG;
  }
  const user = await loadConfigFile(configPath);
  const config = deepMerge(DEFAULT_CONFIG, user as Partial<ResolvedConfig>);
  validateRuleIds(config);
  return config;
}

import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { clampOffscaleRule } from '../../src/rules/typo/clamp-offscale';
import type { ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    contextTaxCaps: { cleanCap: 0, standardCap: 0 },
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<ReturnType<typeof clampOffscaleRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-clamp-offscale-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    return clampOffscaleRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/clamp-offscale', () => {
  it('flags fontSize clamp with a min value far from scale', async () => {
    const source = `
export function Page() {
  return <div style={{ fontSize: 'clamp(0.5rem, 2vw, 1.5rem)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/clamp-offscale');
    expect(issues[0].message).toContain('0.5rem');
  });

  it('flags fontSize clamp with max value far from scale', async () => {
    const source = `
export function Page() {
  return <div style={{ fontSize: 'clamp(1rem, 2vw, 10rem)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('10rem');
  });

  it('flags fontSize clamp with preferred value far from scale', async () => {
    const source = `
export function Page() {
  return <div style={{ fontSize: 'clamp(1rem, 0.5rem, 1.5rem)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('0.5rem');
  });

  it('allows clamp values within 20% of scale', async () => {
    const source = `
export function Page() {
  return <div style={{ fontSize: 'clamp(0.9rem, 2vw, 1.6rem)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags Tailwind text-[clamp(...)] arbitrary class off scale', async () => {
    const source = `
export function Page() {
  return <div className="text-[clamp(0.5rem,2vw,10rem)]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/clamp-offscale');
  });

  it('ignores clamp in non-typography properties', async () => {
    const source = `
export function Page() {
  return <div style={{ width: 'clamp(1rem, 2vw, 10rem)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

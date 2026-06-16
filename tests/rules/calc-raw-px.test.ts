import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { calcRawPxRule } from '../../src/rules/typo/calc-raw-px';
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
): Promise<ReturnType<typeof calcRawPxRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-calc-raw-px-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    return calcRawPxRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('calc-raw-px', () => {
  it('flags calc with raw px units', async () => {
    const source = `
export function Page() {
  return <div style={{ width: 'calc(100% - 16px)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/calc-raw-px');
    expect(issues[0].severity).toBe('high');
  });

  it('allows calc with rem units', async () => {
    const source = `
export function Page() {
  return <div style={{ width: 'calc(100% - 1rem)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags multiple px values in a single calc', async () => {
    const source = `
export function Page() {
  return <div style={{ width: 'calc(100px + 16px)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('ignores inline styles without calc', async () => {
    const source = `
export function Page() {
  return <div style={{ width: '100%' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

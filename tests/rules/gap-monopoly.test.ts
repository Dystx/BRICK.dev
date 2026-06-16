import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { gapMonopolyRule } from '../../src/rules/layout/gap-monopoly';
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
): Promise<ReturnType<typeof gapMonopolyRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-gap-monopoly-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = gapMonopolyRule.create(context);
    return gapMonopolyRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('gap-monopoly', () => {
  it('does not flag balanced gap values', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="gap-2">A</div>
      <div className="gap-4">B</div>
      <div className="gap-6">C</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags a dominant gap value', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="gap-4">A</div>
      <div className="gap-4">B</div>
      <div className="gap-4">C</div>
      <div className="gap-4">D</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('layout/gap-monopoly');
    expect(issues[0].message).toContain("Gap value '4' dominates layout");
  });

  it('does not flag when gapTokens are restricted', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="gap-4">A</div>
      <div className="gap-4">B</div>
      <div className="gap-4">C</div>
      <div className="gap-2">D</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig({ gapTokens: ['2', '4'] }));
    expect(issues).toHaveLength(0);
  });
});

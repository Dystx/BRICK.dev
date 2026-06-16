import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { inlineStyleRule } from '../../src/rules/visual/inline-style';
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
): Promise<ReturnType<typeof inlineStyleRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-inline-style-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    return inlineStyleRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('inline-style', () => {
  it('flags a single inline style prop', async () => {
    const source = `
export function Page() {
  return <div style={{ color: 'red' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/inline-style');
    expect(issues[0].severity).toBe('high');
  });

  it('flags multiple inline style props in one file', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div style={{ color: 'red' }}>A</div>
      <span style={{ marginTop: 8 }}>B</span>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(2);
  });

  it('ignores elements without a style prop', async () => {
    const source = `
export function Page() {
  return <div className="text-red-500">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { shadcnPropMismatchRule } from '../../src/rules/component/shadcn-prop-mismatch';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

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
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-shadcn-prop-mismatch-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = shadcnPropMismatchRule.create(context);
    return shadcnPropMismatchRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('component/shadcn-prop-mismatch', () => {
  it('flags <Button className="foo" />', async () => {
    const source = `
export function Page() {
  return <Button className="foo">Click me</Button>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('component/shadcn-prop-mismatch');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].message).toBe("Component 'Button' does not accept a className prop in the shadcn/ui registry.");
  });

  it('does not flag <Button variant="outline" />', async () => {
    const source = `
export function Page() {
  return <Button variant="outline">Click me</Button>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag <div className="foo" />', async () => {
    const source = `
export function Page() {
  return <div className="foo">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

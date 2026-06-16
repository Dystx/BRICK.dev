import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { headingHierarchyRule } from '../../src/rules/typo/heading-hierarchy';
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
): Promise<ReturnType<typeof headingHierarchyRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-heading-hierarchy-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = headingHierarchyRule.create(context);
    return headingHierarchyRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('heading-hierarchy', () => {
  it('flags h1 visually smaller than h2', async () => {
    const source = `
export function Page() {
  return (
    <>
      <h1 className="text-lg">Title</h1>
      <h2 className="text-xl">Subtitle</h2>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/heading-hierarchy');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].message).toBe(
      'Heading hierarchy inversion: h1 (18px) appears before h2 (20px)',
    );
    expect(issues[0].line).toBe(5);
    expect(issues[0].column).toBe(7);
  });

  it('allows h1 larger than h2', async () => {
    const source = `
export function Page() {
  return (
    <>
      <h1 className="text-2xl">Title</h1>
      <h2 className="text-xl">Subtitle</h2>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('ignores headings with unresolvable sizes', async () => {
    const source = `
export function Page() {
  return (
    <>
      <h1 className="title">Title</h1>
      <h2 className="subtitle">Subtitle</h2>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('resolves size from inline style fontSize', async () => {
    const source = `
export function Page() {
  return (
    <>
      <h1 style={{ fontSize: '14px' }}>Title</h1>
      <h2 style={{ fontSize: '16px' }}>Subtitle</h2>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/heading-hierarchy');
    expect(issues[0].message).toBe(
      'Heading hierarchy inversion: h1 (14px) appears before h2 (16px)',
    );
  });
});

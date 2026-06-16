import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { focusObscuredRule } from '../../src/rules/wcag/focus-obscured';
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
): Promise<ReturnType<typeof focusObscuredRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-focus-obscured-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    return focusObscuredRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('focus-obscured', () => {
  it('flags fixed positioning', async () => {
    const source = `
export function Page() {
  return <nav className="fixed top-0 w-full">Menu</nav>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/focus-obscured');
    expect(issues[0].severity).toBe('low');
  });

  it('flags sticky positioning', async () => {
    const source = `
export function Page() {
  return <header className="sticky top-0">Header</header>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/focus-obscured');
  });

  it('ignores responsive position utilities', async () => {
    const source = `
export function Page() {
  return <div className="relative md:static">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-position classes', async () => {
    const source = `
export function Page() {
  return <div className="flex p-4">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

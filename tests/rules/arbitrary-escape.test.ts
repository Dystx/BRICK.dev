import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { arbitraryEscapeRule } from '../../src/rules/visual/arbitrary-escape';
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
): Promise<ReturnType<typeof arbitraryEscapeRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-arbitrary-escape-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = arbitraryEscapeRule.create(context);
    return arbitraryEscapeRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('arbitrary-escape', () => {
  it('flags layout arbitrary values', async () => {
    const source = `
export function Box() {
  return <div className="w-[100px] p-[13px] bg-[red] text-[14px]" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/arbitrary-escape');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].message).toBe(
      "Layout arbitrary value(s) 'w-[100px]', 'p-[13px]' escaped the design system",
    );
  });

  it('exempts non-layout arbitrary values', async () => {
    const source = `
export function Box() {
  return <div className="bg-[red] text-[14px]" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('respects the arbitrary value allowlist', async () => {
    const source = `
export function Box() {
  return <div className="w-[100px] h-[200px] top-[var(--header-height)]" />;
}
`;
    const issues = await runRule(
      source,
      makeConfig({
        arbitraryValueAllowlist: ['h-[200px]', /^w-\[calc\(.*\)\]$/],
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe("Layout arbitrary value(s) 'w-[100px]' escaped the design system");
  });

  it('does not flag standard design tokens', async () => {
    const source = `
export function Box() {
  return <div className="w-10 h-full p-4 m-auto" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('reports line and column from the className attribute', async () => {
    const source = `
export function Box() {
  return (
    <div
      className="w-[100px]"
    />
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(5);
    expect(issues[0].column).toBe(7);
  });

  it('exempts calc() arbitrary values as legitimate responsive logic', async () => {
    const source = `
export function Box() {
  return <div className="w-[calc(100%-2rem)] p-[calc(1rem+2px)]" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

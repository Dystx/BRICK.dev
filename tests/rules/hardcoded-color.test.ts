import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { hardcodedColorRule } from '../../src/rules/visual/hardcoded-color';
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
): Promise<ReturnType<typeof hardcodedColorRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-hardcoded-color-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    return hardcodedColorRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('hardcoded-color', () => {
  it('flags arbitrary color class text-[#333]', async () => {
    const source = `
export function Page() {
  return <div className="text-[#333]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/hardcoded-color');
    expect(issues[0].message).toContain("'text-[#333]'");
  });

  it('flags arbitrary OKLCH class bg-[oklch(0.7_0.1_240)]', async () => {
    const source = `
export function Page() {
  return <div className="bg-[oklch(0.7_0.1_240)]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/hardcoded-color');
    expect(issues[0].message).toContain("'bg-[oklch(0.7_0.1_240)]'");
  });

  it('flags inline style style={{ color: \'#333\' }}', async () => {
    const source = `
export function Page() {
  return <div style={{ color: '#333' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/hardcoded-color');
    expect(issues[0].message).toBe('Inline style contains a hardcoded color value');
  });

  it('ignores named Tailwind palette color text-red-500', async () => {
    const source = `
export function Page() {
  return <div className="text-red-500">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('ignores style={{ color: \'var(--color-text)\' }}', async () => {
    const source = `
export function Page() {
  return <div style={{ color: 'var(--color-text)' }}>Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

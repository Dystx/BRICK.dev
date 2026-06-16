import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { hardcodedFontSizeRule } from '../../src/rules/typo/hardcoded-font-size';
import type { ResolvedConfig } from '../../src/types';

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
): Promise<ReturnType<typeof hardcodedFontSizeRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-hardcoded-font-size-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    return hardcodedFontSizeRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/hardcoded-font-size', () => {
  it('flags text-[14px]', async () => {
    const source = `
export function Page() {
  return <div className="text-[14px]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/hardcoded-font-size');
    expect(issues[0].message).toContain("'text-[14px]'");
  });

  it('flags text-[1.2rem]', async () => {
    const source = `
export function Page() {
  return <div className="text-[1.2rem]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('ignores text-sm', async () => {
    const source = `
export function Page() {
  return <div className="text-sm">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('ignores text-[#333] (color, not size)', async () => {
    const source = `
export function Page() {
  return <div className="text-[#333]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

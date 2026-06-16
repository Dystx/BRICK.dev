import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { customFontFamilyRule } from '../../src/rules/typo/custom-font-family';
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
): Promise<ReturnType<typeof customFontFamilyRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-custom-font-family-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    return customFontFamilyRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/custom-font-family', () => {
  it("flags font-['Inter']", async () => {
    const source = `
export function Page() {
  return <div className="font-['Inter']">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/custom-font-family');
  });

  it('flags font-[Inter]', async () => {
    const source = `
export function Page() {
  return <div className="font-[Inter]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('ignores font-sans', async () => {
    const source = `
export function Page() {
  return <div className="font-sans">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('ignores font-[550]', async () => {
    const source = `
export function Page() {
  return <div className="font-[550]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags font-[Inter,sans-serif]', async () => {
    const source = `
export function Page() {
  return <div className="font-[Inter,sans-serif]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('flags font-[Inter_sans-serif]', async () => {
    const source = `
export function Page() {
  return <div className="font-[Inter_sans-serif]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it("flags font-['Inter',sans-serif]", async () => {
    const source = `
export function Page() {
  return <div className="font-['Inter',sans-serif]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });
});

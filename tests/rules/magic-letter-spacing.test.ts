import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { magicLetterSpacingRule } from '../../src/rules/typo/magic-letter-spacing';
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
): Promise<ReturnType<typeof magicLetterSpacingRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-magic-letter-spacing-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    return magicLetterSpacingRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/magic-letter-spacing', () => {
  it('flags tracking-[0.5px]', async () => {
    const source = `
export function Page() {
  return <div className="tracking-[0.5px]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('typo/magic-letter-spacing');
  });

  it('ignores tracking-wide', async () => {
    const source = `
export function Page() {
  return <div className="tracking-wide">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

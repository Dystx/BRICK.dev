import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../../src/engine/parser';
import { extractFacts } from '../../../src/engine/visitor';
import { arbitraryTransitionRule } from '../../../src/rules/motion/arbitrary-transition';
import type { ResolvedConfig } from '../../../src/types';

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
): Promise<ReturnType<typeof arbitraryTransitionRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-arbitrary-transition-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    return arbitraryTransitionRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('motion/arbitrary-transition', () => {
  it('flags transition-[color_200ms]', async () => {
    const source = `
export function Page() {
  return <div className="transition-[color_200ms]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('motion/arbitrary-transition');
  });

  it('ignores transition-colors', async () => {
    const source = `
export function Page() {
  return <div className="transition-colors">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

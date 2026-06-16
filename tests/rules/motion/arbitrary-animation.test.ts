import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../../src/engine/parser';
import { extractFacts } from '../../../src/engine/visitor';
import { arbitraryAnimationRule } from '../../../src/rules/motion/arbitrary-animation';
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
): Promise<ReturnType<typeof arbitraryAnimationRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-arbitrary-animation-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    return arbitraryAnimationRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('motion/arbitrary-animation', () => {
  it('flags animate-[spin_1s_linear]', async () => {
    const source = `
export function Page() {
  return <div className="animate-[spin_1s_linear]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('motion/arbitrary-animation');
  });

  it('ignores animate-spin', async () => {
    const source = `
export function Page() {
  return <div className="animate-spin">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

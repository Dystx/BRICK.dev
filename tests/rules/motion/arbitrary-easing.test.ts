import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../../src/engine/parser';
import { extractFacts } from '../../../src/engine/visitor';
import { arbitraryEasingRule } from '../../../src/rules/motion/arbitrary-easing';
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
): Promise<ReturnType<typeof arbitraryEasingRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-arbitrary-easing-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    return arbitraryEasingRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('motion/arbitrary-easing', () => {
  it('flags ease-[cubic-bezier(0.4,0,0.2,1)]', async () => {
    const source = `
export function Page() {
  return <div className="ease-[cubic-bezier(0.4,0,0.2,1)]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('motion/arbitrary-easing');
  });

  it('ignores ease-in-out', async () => {
    const source = `
export function Page() {
  return <div className="ease-in-out">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../../src/engine/parser';
import { extractFacts } from '../../../src/engine/visitor';
import { arbitraryDurationRule } from '../../../src/rules/motion/arbitrary-duration';
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
): Promise<ReturnType<typeof arbitraryDurationRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-arbitrary-duration-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    return arbitraryDurationRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('motion/arbitrary-duration', () => {
  it('flags duration-[250ms]', async () => {
    const source = `
export function Page() {
  return <div className="duration-[250ms]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('motion/arbitrary-duration');
  });

  it('flags duration-[0.2s]', async () => {
    const source = `
export function Page() {
  return <div className="duration-[0.2s]">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('ignores duration-300', async () => {
    const source = `
export function Page() {
  return <div className="duration-300">Content</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

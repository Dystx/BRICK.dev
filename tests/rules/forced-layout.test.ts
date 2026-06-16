import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { forcedLayoutRule } from '../../src/rules/visual/forced-layout';
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
): Promise<ReturnType<typeof forcedLayoutRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-forced-layout-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = forcedLayoutRule.create(context);
    return forcedLayoutRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('forced-layout', () => {
  it('allows a single flex flex-col gap-* wrapper', async () => {
    const source = `
export function Page() {
  return (
    <div className="flex flex-col gap-4">
      Hello
    </div>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags repetitive wrappers above threshold', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex flex-col gap-4">A</div>
      <div className="flex flex-col gap-4">B</div>
      <div className="flex flex-col gap-4">C</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/forced-layout');
    expect(issues[0].message).toBe('Repetitive flex flex-col gap-* wrappers detected; extract a layout primitive.');
  });

  it('respects a higher threshold', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex flex-col gap-4">A</div>
      <div className="flex flex-col gap-4">B</div>
      <div className="flex flex-col gap-4">C</div>
    </>
  );
}
`;
    const issues = await runRule(
      source,
      makeConfig({ ruleConfig: { forcedLayoutThreshold: 3 } }),
    );
    expect(issues).toHaveLength(0);
  });
});

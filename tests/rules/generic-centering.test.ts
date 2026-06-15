import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { genericCenteringRule } from '../../src/rules/visual/generic-centering';
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
): Promise<ReturnType<typeof genericCenteringRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-generic-centering-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = genericCenteringRule.create(context);
    return genericCenteringRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('generic-centering', () => {
  it('allows the first occurrence of the full stack', async () => {
    const source = `
export function Page() {
  return (
    <div className="flex items-center justify-center min-h-screen text-center">
      Hello
    </div>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags the second occurrence of the full stack', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex items-center justify-center min-h-screen text-center">A</div>
      <div className="flex items-center justify-center min-h-screen text-center">B</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/generic-centering');
    expect(issues[0].severity).toBe('low');
    expect(issues[0].message).toBe('Generic AI centering stack detected');
    expect(issues[0].line).toBe(6);
    expect(issues[0].column).toBe(12);
  });

  it('emits no issue when a required class is missing', async () => {
    const source = `
export function Page() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      Hello
    </div>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('respects the configured max instance limit', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex items-center justify-center min-h-screen text-center">A</div>
      <div className="flex items-center justify-center min-h-screen text-center">B</div>
      <div className="flex items-center justify-center min-h-screen text-center">C</div>
    </>
  );
}
`;
    const issues = await runRule(
      source,
      makeConfig({ ruleConfig: { genericCenteringMaxInstances: 2 } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(7);
  });

  it('defaults the max instance limit to 1 when config is missing', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="flex items-center justify-center min-h-screen text-center">A</div>
      <div className="flex items-center justify-center min-h-screen text-center">B</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig({ ruleConfig: {} }));
    expect(issues).toHaveLength(1);
  });
});

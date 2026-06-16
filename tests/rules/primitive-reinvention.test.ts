import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { primitiveReinventionRule } from '../../src/rules/component/primitive-reinvention';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

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
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-primitive-reinvention-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = primitiveReinventionRule.create(context);
    return primitiveReinventionRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('component/primitive-reinvention', () => {
  it('flags <div onClick> when a Button primitive is registered', async () => {
    const source = `export function Page() { return <div onClick={() => {}}>Click</div>; }`;
    const issues = await runRule(
      source,
      makeConfig({ componentRegistry: { button: ['Button'] } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('component/primitive-reinvention');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(true);
    expect(issues[0].message).toBe('<div> with onClick reinvents the registered Button primitive');
  });

  it('ignores <Button onClick> when it is in the registry', async () => {
    const source = `export function Page() { return <Button onClick={() => {}}>Click</Button>; }`;
    const issues = await runRule(
      source,
      makeConfig({ componentRegistry: { button: ['Button'] } }),
    );
    expect(issues).toHaveLength(0);
  });

  it('ignores <div onClick> when there is no component registry', async () => {
    const source = `export function Page() { return <div onClick={() => {}}>Click</div>; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('ignores native <button onClick>', async () => {
    const source = `export function Page() { return <button onClick={() => {}}>Click</button>; }`;
    const issues = await runRule(
      source,
      makeConfig({ componentRegistry: { button: ['Button'] } }),
    );
    expect(issues).toHaveLength(0);
  });
});

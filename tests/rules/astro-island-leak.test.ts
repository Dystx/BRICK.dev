import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { astroIslandLeakRule } from '../../src/rules/arch/astro-island-leak';
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
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-astro-island-leak-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = astroIslandLeakRule.create(context);
    return astroIslandLeakRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('arch/astro-island-leak', () => {
  it('flags a component without a client:* directive when framework is astro', async () => {
    const source = `export function Page() { return <Counter initial={0} />; }`;
    const issues = await runRule(source, makeConfig({ framework: 'astro' }));
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('arch/astro-island-leak');
    expect(issues[0].severity).toBe('low');
    expect(issues[0].aiSpecific).toBe(true);
    expect(issues[0].message).toBe('<Counter> is used without a client:* hydration directive');
  });

  it('ignores a component with client:load', async () => {
    const source = `export function Page() { return <Counter client:load initial={0} />; }`;
    const issues = await runRule(source, makeConfig({ framework: 'astro' }));
    expect(issues).toHaveLength(0);
  });

  it('ignores a component with client:visible', async () => {
    const source = `export function Page() { return <Modal client:visible />; }`;
    const issues = await runRule(source, makeConfig({ framework: 'astro' }));
    expect(issues).toHaveLength(0);
  });

  it('flags a native element with an inline onClick handler', async () => {
    const source = `export function Page() { return <div onClick={() => alert('hi')}>Click</div>; }`;
    const issues = await runRule(source, makeConfig({ framework: 'astro' }));
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('arch/astro-island-leak');
    expect(issues[0].message).toBe('<div> registers an inline onClick handler');
  });

  it('prefers the onClick message when a component has both onClick and no client directive', async () => {
    const source = `export function Page() { return <Counter onClick={() => {}} />; }`;
    const issues = await runRule(source, makeConfig({ framework: 'astro' }));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('<Counter> registers an inline onClick handler');
  });

  it('ignores native elements without event handlers', async () => {
    const source = `export function Page() { return <div><button>Click</button></div>; }`;
    const issues = await runRule(source, makeConfig({ framework: 'astro' }));
    expect(issues).toHaveLength(0);
  });

  it('ignores non-astro files', async () => {
    const source = `export function Page() { return <Counter initial={0} />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

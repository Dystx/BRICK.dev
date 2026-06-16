import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { ghostDefensiveRule } from '../../src/rules/logic/ghost-defensive';
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
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-ghost-defensive-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = ghostDefensiveRule.create(context);
    return ghostDefensiveRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/ghost-defensive', () => {
  it('flags a deep && defensive chain', async () => {
    const source = `
export function User() {
  const user = res && res.data && res.data.user;
  return <div>{user}</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/ghost-defensive');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].message).toBe('Ghost defensive chain: res && res.data && res.data.user');
    expect(issues[0].advice).toBe('Use optional chaining (?.) or early returns instead of deep && guards.');
  });

  it('does not flag a shallow && expression', async () => {
    const source = `
export function Box() {
  return a && b ? <div>yes</div> : null;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a chain of depth 2', async () => {
    const source = `
export function Box() {
  const user = res && res.data;
  return <div>{user}</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a non-member && chain', async () => {
    const source = `
export function Box() {
  return a && b && c ? <div>yes</div> : null;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags multiple independent deep chains', async () => {
    const source = `
export function Box() {
  const user = res && res.data && res.data.user;
  const post = data && data.post && data.post.title;
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(2);
  });
});

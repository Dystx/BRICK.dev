import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { zombieStateRule } from '../../src/rules/logic/zombie-state';
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
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-zombie-state-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = zombieStateRule.create(context);
    return zombieStateRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/zombie-state', () => {
  it('flags a useState tuple that is never referenced', async () => {
    const source = `
export function Counter() {
  const [count, setCount] = useState(0);
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/zombie-state');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].message).toBe("Zombie state 'count' / 'setCount' is never used");
    expect(issues[0].advice).toBe('Remove the unused useState or wire it into the component.');
  });

  it('does not flag when the value is read', async () => {
    const source = `
export function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag when the setter is called', async () => {
    const source = `
export function Counter() {
  const [count, setCount] = useState(0);
  setCount(1);
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a single-element useState tuple', async () => {
    const source = `
export function Counter() {
  const [count] = useState(0);
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags multiple independent zombie states', async () => {
    const source = `
export function Counter() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toBe("Zombie state 'count' / 'setCount' is never used");
    expect(issues[1].message).toBe("Zombie state 'name' / 'setName' is never used");
  });
});

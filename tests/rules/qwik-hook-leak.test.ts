import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { qwikHookLeakRule } from '../../src/rules/logic/qwik-hook-leak';
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
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-qwik-hook-leak-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = qwikHookLeakRule.create(context);
    return qwikHookLeakRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/qwik-hook-leak', () => {
  it('flags classical React hooks inside a Qwik component', async () => {
    const source = `
export const Counter = component$(() => {
  const [count, setCount] = useState(0);
  useEffect(() => {}, []);
  const ctx = useContext(MyContext);
  return <div>{count}</div>;
});
`;
    const issues = await runRule(source, makeConfig({ framework: 'qwik' }));
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.message).sort()).toEqual([
      "React hook 'useContext' leaked into Qwik component layout",
      "React hook 'useEffect' leaked into Qwik component layout",
      "React hook 'useState' leaked into Qwik component layout",
    ]);
    expect(issues.every((i) => i.severity === 'high')).toBe(true);
    expect(issues.every((i) => i.aiSpecific)).toBe(true);
  });

  it('ignores React hooks when the framework is react', async () => {
    const source = `
export function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {}, []);
  const ctx = useContext(MyContext);
  return <div>{count}</div>;
}
`;
    const issues = await runRule(source, makeConfig({ framework: 'react' }));
    expect(issues).toHaveLength(0);
  });

  it('ignores non-React hooks in Qwik components', async () => {
    const source = `
export const Counter = component$(() => {
  const count = useSignal(0);
  useTask$(({ track }) => {
    track(() => count.value);
  });
  return <div>{count.value}</div>;
});
`;
    const issues = await runRule(source, makeConfig({ framework: 'qwik' }));
    expect(issues).toHaveLength(0);
  });
});

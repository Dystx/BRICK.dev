import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { boundaryViolationRule } from '../../src/rules/logic/boundary-violation';
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
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-boundary-violation-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = boundaryViolationRule.create(context);
    return boundaryViolationRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/boundary-violation', () => {
  it('flags a server component that calls useState', async () => {
    const source = `
export function Page() {
  const [x, setX] = useState(0);
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/boundary-violation');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].message).toBe("Client hook 'useState' called inside a server component");
    expect(issues[0].advice).toBe("Add the 'use client' directive or move the hook to a client component.");
  });

  it('does not flag a component with the use client directive', async () => {
    const source = `
'use client';
export function Page() {
  const [x, setX] = useState(0);
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a server component that only calls useId', async () => {
    const source = `
export function Page() {
  const id = useId();
  return <div id={id} />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags useEffect and useContext in a server component', async () => {
    const source = `
export function Page() {
  useEffect(() => {}, []);
  const ctx = useContext(MyContext);
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.message).sort()).toEqual([
      "Client hook 'useContext' called inside a server component",
      "Client hook 'useEffect' called inside a server component",
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../../src/engine/parser';
import { extractFacts } from '../../../src/engine/visitor';
import { clsImageRule } from '../../../src/rules/perf/cls-image';
import type { ResolvedConfig, RuleContext } from '../../../src/types';

function makeConfig(): ResolvedConfig {
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
  };
}

async function runRule(
  source: string,
  fileName = 'Component.tsx',
): Promise<ReturnType<typeof clsImageRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-cls-image-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config: makeConfig(), filePath };
    return clsImageRule.analyze(undefined, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('perf/cls-image', () => {
  it('flags lazy images without width/height or aspect-ratio', async () => {
    const source = `
export function Page() {
  return <img loading="lazy" src="/a.jpg" alt="A" />;
}
`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('perf/cls-image');
    expect(issues[0].severity).toBe('low');
  });

  it('ignores lazy images with explicit width and height', async () => {
    const source = `
export function Page() {
  return <img loading="lazy" src="/a.jpg" alt="A" width="200" height="100" />;
}
`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('ignores lazy images with an aspect-ratio utility', async () => {
    const source = `
export function Page() {
  return <img loading="lazy" src="/a.jpg" alt="A" className="aspect-video" />;
}
`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('ignores non-lazy images', async () => {
    const source = `
export function Page() {
  return <img src="/a.jpg" alt="A" />;
}
`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('flags multiple lazy images missing dimensions', async () => {
    const source = `
export function Page() {
  return (
    <>
      <img loading="lazy" src="/a.jpg" alt="A" />
      <img loading="lazy" src="/b.jpg" alt="B" />
    </>
  );
}
`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(2);
  });
});

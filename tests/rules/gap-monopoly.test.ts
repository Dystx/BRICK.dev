import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { gapMonopolyRule } from '../../src/rules/layout/gap-monopoly';
import { RuleRegistry } from '../../src/rules/registry';
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
): Promise<ReturnType<typeof gapMonopolyRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-gap-monopoly-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, nodeCount } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount);
    const context: RuleContext = { config, filePath };
    const ruleContext = gapMonopolyRule.create(context);
    return gapMonopolyRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runAcrossFiles(
  files: { name: string; source: string }[],
  config: ResolvedConfig = makeConfig(),
): Promise<ReturnType<typeof gapMonopolyRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-gap-monopoly-multi-'));
  const registry = new RuleRegistry();
  registry.register(gapMonopolyRule);
  try {
    const context = registry.createContexts(config, join(dir, 'dummy.tsx'))[0].context as ReturnType<typeof gapMonopolyRule.create>;
    const issues: ReturnType<typeof gapMonopolyRule.analyze> = [];
    for (const file of files) {
      const filePath = join(dir, file.name);
      writeFileSync(filePath, file.source);
      const { ast, nodeCount } = await parseFile(filePath);
      const facts = extractFacts(filePath, ast, nodeCount);
      issues.push(...gapMonopolyRule.analyze(context, facts));
    }
    return issues;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function componentWithGap(gap: string): string {
  return `
export function Page() {
  return <div className="${gap}">A</div>;
}
`;
}

function componentWithGaps(gaps: string[]): string {
  const divs = gaps.map((g) => `      <div className="${g}">A</div>`).join('\n');
  return `
export function Page() {
  return (
    <>
${divs}
    </>
  );
}
`;
}

describe('gap-monopoly', () => {
  it('does not flag balanced gap values in a single file', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="gap-2">A</div>
      <div className="gap-4">B</div>
      <div className="gap-6">C</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags a dominant gap value in a single file', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="gap-4">A</div>
      <div className="gap-4">B</div>
      <div className="gap-4">C</div>
      <div className="gap-4">D</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('layout/gap-monopoly');
    expect(issues[0].message).toContain("Gap value '4' dominates layout");
  });

  it('does not flag when gapTokens are restricted', async () => {
    const source = `
export function Page() {
  return (
    <>
      <div className="gap-4">A</div>
      <div className="gap-4">B</div>
      <div className="gap-4">C</div>
      <div className="gap-2">D</div>
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig({ gapTokens: ['2', '4'] }));
    expect(issues).toHaveLength(0);
  });

  it('accumulates gap values across files and emits once when threshold is crossed', async () => {
    // Each file contributes four gap-4 attributes. The first file already
    // dominates its own small sample, so the project-level rule reports once
    // and suppresses further emissions.
    const files = Array.from({ length: 20 }, (_, i) => ({
      name: `Component${i}.tsx`,
      source: componentWithGaps(['gap-4', 'gap-4', 'gap-4', 'gap-4']),
    }));
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('layout/gap-monopoly');
    expect(issues[0].message).toContain("Gap value '4' dominates layout");
  });

  it('does not emit duplicate issues across subsequent files', async () => {
    const files = Array.from({ length: 25 }, (_, i) => ({
      name: `Component${i}.tsx`,
      source: componentWithGaps(['gap-4', 'gap-4', 'gap-4', 'gap-4']),
    }));
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(1);
  });

  it('reports the issue on the file that caused the threshold to be crossed', async () => {
    // Early files are balanced, so the ratio stays low. Later files are heavily
    // uniform gap-4 and push the project-level ratio over the threshold.
    const files = [
      ...Array.from({ length: 2 }, (_, i) => ({
        name: `Balanced${i}.tsx`,
        source: componentWithGaps(['gap-2', 'gap-4', 'gap-6', 'gap-8']),
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        name: `Dominant${i}.tsx`,
        source: componentWithGaps([
          'gap-4', 'gap-4', 'gap-4', 'gap-4', 'gap-4',
          'gap-4', 'gap-4', 'gap-4', 'gap-4', 'gap-4',
        ]),
      })),
    ];
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('layout/gap-monopoly');
    expect(issues[0].message).toContain("Gap value '4' dominates layout");
  });

  it('does not flag balanced gap values across many files', async () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      name: `Component${i}.tsx`,
      source: componentWithGaps(['gap-2', 'gap-4', 'gap-6', 'gap-8']),
    }));
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(0);
  });
});

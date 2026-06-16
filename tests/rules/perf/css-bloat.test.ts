import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../../src/engine/parser';
import { extractFacts } from '../../../src/engine/visitor';
import { cssBloatRule } from '../../../src/rules/perf/css-bloat';
import { RuleRegistry } from '../../../src/rules/registry';
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

async function runAcrossFiles(
  files: { name: string; source: string }[],
): Promise<ReturnType<typeof cssBloatRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slop-audit-css-bloat-test-'));
  try {
    const context: RuleContext = { config: makeConfig(), filePath: join(dir, 'dummy.tsx') };
    const ruleContext = cssBloatRule.create(context);
    const issues: ReturnType<typeof cssBloatRule.analyze> = [];
    for (const file of files) {
      const filePath = join(dir, file.name);
      writeFileSync(filePath, file.source);
      const { ast, nodeCount } = await parseFile(filePath);
      const facts = extractFacts(filePath, ast, nodeCount);
      issues.push(...cssBloatRule.analyze(ruleContext, facts));
    }
    return issues;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function componentWithClass(className: string): string {
  return `
export function Card() {
  return <div className="${className}">Card</div>;
}
`;
}

describe('perf/css-bloat', () => {
  it('reports a className repeated more than 5 times', async () => {
    const className = 'flex items-center justify-between p-4 bg-white rounded';
    const files = Array.from({ length: 6 }, (_, i) => ({
      name: `Component${i}.tsx`,
      source: componentWithClass(className),
    }));
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('perf/css-bloat');
    expect(issues[0].severity).toBe('low');
    expect(issues[0].message).toContain('6 distinct files');
  });

  it('does not report a className repeated 5 times or fewer', async () => {
    const className = 'flex items-center';
    const files = Array.from({ length: 5 }, (_, i) => ({
      name: `Component${i}.tsx`,
      source: componentWithClass(className),
    }));
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(0);
  });

  it('normalizes whitespace before counting duplicates', async () => {
    const files = [
      { name: 'A.tsx', source: componentWithClass('flex  items-center justify-between') },
      { name: 'B.tsx', source: componentWithClass('flex items-center  justify-between') },
      { name: 'C.tsx', source: componentWithClass('  flex items-center justify-between  ') },
      { name: 'D.tsx', source: componentWithClass('flex items-center justify-between') },
      { name: 'E.tsx', source: componentWithClass('flex items-center justify-between') },
      { name: 'F.tsx', source: componentWithClass('flex items-center justify-between') },
    ];
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('6 distinct files');
  });

  it('reports each distinct duplicated className once', async () => {
    const files = [
      { name: 'A.tsx', source: componentWithClass('flex items-center') },
      { name: 'B.tsx', source: componentWithClass('flex items-center') },
      { name: 'C.tsx', source: componentWithClass('flex items-center') },
      { name: 'D.tsx', source: componentWithClass('text-sm font-bold') },
      { name: 'E.tsx', source: componentWithClass('text-sm font-bold') },
      { name: 'F.tsx', source: componentWithClass('flex items-center') },
      { name: 'G.tsx', source: componentWithClass('text-sm font-bold') },
      { name: 'J.tsx', source: componentWithClass('flex items-center') },
      { name: 'K.tsx', source: componentWithClass('text-sm font-bold') },
      { name: 'L.tsx', source: componentWithClass('text-sm font-bold') },
    ];
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(0);

    // Add one more occurrence of each to cross the threshold (>5).
    const moreFiles = [
      { name: 'H.tsx', source: componentWithClass('flex items-center') },
      { name: 'I.tsx', source: componentWithClass('text-sm font-bold') },
    ];
    const allFiles = [...files, ...moreFiles];
    const allIssues = await runAcrossFiles(allFiles);
    expect(allIssues).toHaveLength(2);
    const messages = allIssues.map((i) => i.message);
    expect(messages.some((m) => m.includes('flex items-center'))).toBe(true);
    expect(messages.some((m) => m.includes('text-sm font-bold'))).toBe(true);
  });

  it('emits only one issue per duplicated value', async () => {
    const className = 'm-2 p-2';
    const files = Array.from({ length: 10 }, (_, i) => ({
      name: `Component${i}.tsx`,
      source: componentWithClass(className),
    }));
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(1);
  });

  it('does not count repeated uses within the same file as distinct files', async () => {
    const className = 'flex items-center justify-between p-4 bg-white rounded';
    const source = `
export function Card() {
  return (
    <div className="${className}">
      <span className="${className}">A</span>
      <span className="${className}">B</span>
      <span className="${className}">C</span>
      <span className="${className}">D</span>
      <span className="${className}">E</span>
      <span className="${className}">F</span>
    </div>
  );
}
`;
    const files = [{ name: 'Card.tsx', source }];
    const issues = await runAcrossFiles(files);
    expect(issues).toHaveLength(0);
  });

  it('beforeRescan removes a file from the cross-file accumulator', async () => {
    const className = 'flex items-center';
    const registry = new RuleRegistry();
    registry.register(cssBloatRule);
    const dir = mkdtempSync(join(tmpdir(), 'slop-audit-css-bloat-rescan-'));
    try {
      const context = registry.createContexts(makeConfig(), join(dir, 'A.tsx'))[0].context as ReturnType<typeof cssBloatRule.create>;
      const filePaths: string[] = [];
      for (let i = 0; i < 6; i++) {
        const filePath = join(dir, `Component${i}.tsx`);
        filePaths.push(filePath);
        writeFileSync(filePath, componentWithClass(className));
        const { ast, nodeCount } = await parseFile(filePath);
        const facts = extractFacts(filePath, ast, nodeCount);
        cssBloatRule.analyze(context, facts);
      }

      // After 6 distinct files the rule should have reported once.
      let issues = cssBloatRule.analyze(context, extractFacts(filePaths[0], (await parseFile(filePaths[0])).ast, (await parseFile(filePaths[0])).nodeCount));
      expect(issues).toHaveLength(0);

      cssBloatRule.beforeRescan?.(context, filePaths[0]);
      // Removing one file drops the distinct count to 5, so re-analyzing the
      // remaining files should not produce a new issue.
      let afterRescanIssues: ReturnType<typeof cssBloatRule.analyze> = [];
      for (let i = 1; i < 6; i++) {
        const { ast, nodeCount } = await parseFile(filePaths[i]);
        const facts = extractFacts(filePaths[i], ast, nodeCount);
        afterRescanIssues.push(...cssBloatRule.analyze(context, facts));
      }
      expect(afterRescanIssues).toHaveLength(0);

      // Adding a fresh 7th file pushes the count back over the threshold.
      const seventh = join(dir, 'Component6.tsx');
      writeFileSync(seventh, componentWithClass(className));
      const { ast, nodeCount } = await parseFile(seventh);
      const facts = extractFacts(seventh, ast, nodeCount);
      const newIssues = cssBloatRule.analyze(context, facts);
      expect(newIssues).toHaveLength(1);
      expect(newIssues[0].message).toContain('6 distinct files');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatAdvice } from '../../src/report/advice';
import type { Issue, ProjectReport } from '../../src/types';

const createTmpDir = () =>
  mkdtempSync(join(tmpdir(), 'slop-audit-suggest-test-'));

function makeReport(filePath: string, issues: Issue[]): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    configPath: undefined,
    slopIndex: 0,
    assemblyHealth: 100,
    categoryScores: {
      visual: 0,
      typo: 0,
      motion: 0,
      wcag: 0,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
    },
    p90Score: 0,
    peakScore: 0,
    componentCount: 1,
    components: [
      {
        filePath,
        rawScore: issues.reduce((sum, issue) => sum + (issue.severity === 'high' ? 5 : issue.severity === 'medium' ? 3 : 1), 0),
        componentScore: 0,
        adjustedScore: issues.length > 0 ? 3 : 0,
        componentCount: 1,
      },
    ],
    issues,
  };
}

describe('formatAdvice', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits a unified diff for a layout-token fix', () => {
    const filePath = join(dir, 'Button.tsx');
    writeFileSync(
      filePath,
      `export function Button() {\n  return <button className="p-[13px]">Click</button>;\n}\n`,
    );

    const issue: Issue = {
      ruleId: 'visual/arbitrary-escape',
      category: 'visual',
      severity: 'medium',
      aiSpecific: true,
      filePath,
      message: 'Arbitrary layout value p-[13px]',
      line: 2,
      column: 36,
      fix: {
        kind: 'replace',
        description: 'Replace arbitrary layout value with nearest token',
        anchor: 'p-[13px]',
        replacement: 'p-3',
      },
    };

    const report = makeReport(filePath, [issue]);
    const advice = formatAdvice(report);

    expect(advice).toContain('=== Tier 1: AST Patch (Unified Diff) ===');
    expect(advice).toContain(`+++ b/${filePath}`);
    expect(advice).toContain('p-[13px]');
    expect(advice).toContain('p-3');
    expect(advice).toContain('=== Tier 2: Natural Language Guidance ===');
    expect(advice).toContain('=== Tier 3: GIR Boundary Markers ===');
  });

  it('emits a unified diff for a missing use-client insertion', () => {
    const filePath = join(dir, 'Client.tsx');
    writeFileSync(
      filePath,
      `export function Client() {\n  const [x, setX] = useState(0);\n  return <div>{x}</div>;\n}\n`,
    );

    const issue: Issue = {
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      filePath,
      message: 'Missing "use client" directive',
      line: 1,
      column: 1,
      fix: {
        kind: 'insert',
        description: 'Add "use client" directive',
      },
    };

    const report = makeReport(filePath, [issue]);
    const advice = formatAdvice(report);

    expect(advice).toContain('=== Tier 1: AST Patch (Unified Diff) ===');
    expect(advice).toContain(`+++ b/${filePath}`);
    expect(advice).toContain('+"use client";');
  });

  it('emits GIR boundary markers for structural anti-patterns without fixes', () => {
    const filePath = join(dir, 'Messy.tsx');
    writeFileSync(
      filePath,
      `export function Messy() {\n  return <div className="w-[312px] h-[43px]">hi</div>;\n}\n`,
    );

    const issue: Issue = {
      ruleId: 'visual/arbitrary-escape',
      category: 'visual',
      severity: 'medium',
      aiSpecific: true,
      filePath,
      message: 'Arbitrary layout value',
      line: 2,
      column: 1,
    };

    const report = makeReport(filePath, [issue]);
    const advice = formatAdvice(report);

    expect(advice).toContain('=== Tier 3: GIR Boundary Markers ===');
    expect(advice).toContain(`<!-- GIR-BOUNDARY: clean-room refactor ${filePath}`);
  });

  it('reports when no fixes or boundaries are available', () => {
    const filePath = join(dir, 'Clean.tsx');
    writeFileSync(filePath, `export function Clean() { return <div>hi</div>; }\n`);

    const report = makeReport(filePath, []);
    const advice = formatAdvice(report);

    expect(advice).toContain('No safe localized patches available.');
    expect(advice).toContain('No problem categories detected');
    expect(advice).toContain('No clean-room refactor boundaries identified.');
  });
});

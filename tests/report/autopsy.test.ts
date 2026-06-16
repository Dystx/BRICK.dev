import { describe, expect, it } from 'vitest';
import { formatAutopsy, analyzeAutopsy } from '../../src/report/autopsy.js';
import type { Issue, ProjectReport } from '../../src/types.js';

function makeReport(issues: Issue[]): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: '2026-06-15T00:00:00.000Z',
    slopIndex: 42.3,
    assemblyHealth: 57.7,
    categoryScores: {
      visual: 10,
      typo: 5,
      motion: 0,
      wcag: 8,
      layout: 3,
      component: 4,
      logic: 12,
      arch: 1,
      perf: 0,
    },
    p90Score: 80,
    peakScore: 90,
    componentCount: 3,
    components: [],
    issues,
  };
}

function makeIssue(overrides: Partial<Issue> & Pick<Issue, 'ruleId'>): Issue {
  return {
    category: 'visual',
    severity: 'medium',
    aiSpecific: true,
    message: 'test issue',
    line: 1,
    column: 1,
    ...overrides,
  };
}

describe('formatAutopsy', () => {
  it('reports no failure modes when there are no issues', () => {
    const output = formatAutopsy(makeReport([]));
    expect(output).toContain('No classic AI failure modes detected.');
    expect(output).toContain('Slop Index: 42%');
  });

  it('groups issues into failure modes', () => {
    const issues: Issue[] = [
      makeIssue({ ruleId: 'visual/arbitrary-escape', message: 'Arbitrary value escaped' }),
      makeIssue({ ruleId: 'logic/zombie-state', category: 'logic', message: 'Unused state' }),
      makeIssue({ ruleId: 'wcag/target-size', category: 'wcag', message: 'Small target' }),
    ];
    const output = formatAutopsy(makeReport(issues));
    expect(output).toContain('Token bias');
    expect(output).toContain('State soup');
    expect(output).toContain('Constraint blindness');
    expect(output).toContain('1 issue');
  });

  it('counts multiple issues in the same mode', () => {
    const issues: Issue[] = [
      makeIssue({ ruleId: 'visual/arbitrary-escape', message: 'One' }),
      makeIssue({ ruleId: 'visual/arbitrary-escape', message: 'Two' }),
    ];
    const output = formatAutopsy(makeReport(issues));
    expect(output).toContain('2 issues');
  });

  it('includes a sample message for each mode', () => {
    const issues: Issue[] = [
      makeIssue({ ruleId: 'logic/zombie-state', category: 'logic', message: 'Unused setter' }),
    ];
    const output = formatAutopsy(makeReport(issues));
    expect(output).toContain('Unused setter');
  });
});

describe('analyzeAutopsy', () => {
  it('only returns modes with at least one matching issue', () => {
    const issues: Issue[] = [
      makeIssue({ ruleId: 'logic/ghost-defensive', category: 'logic' }),
    ];
    const modes = analyzeAutopsy(makeReport(issues));
    expect(modes).toHaveLength(1);
    expect(modes[0].name).toBe('Ghost logic');
  });
});

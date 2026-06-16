import { describe, expect, it } from 'vitest';
import { formatAdvice } from '../../src/report/advice.js';
import type { ProjectReport } from '../../src/types.js';

function makeReport(
  categoryScores: ProjectReport['categoryScores'],
): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    slopIndex: 34.2,
    assemblyHealth: 65.8,
    categoryScores,
    p90Score: 88.0,
    peakScore: 92.0,
    componentCount: 12,
    components: [],
    issues: [],
  };
}

describe('formatAdvice', () => {
  it('mentions categories with non-zero scores', () => {
    const report = makeReport({
      visual: 12.5,
      typo: 0,
      motion: 0,
      wcag: 15.2,
      layout: 3.1,
      component: 0,
      logic: 21.4,
      arch: 0,
      perf: 0,
    });

    const output = formatAdvice(report);

    expect(output).toContain('logic');
    expect(output).toContain('wcag');
    expect(output).toContain('visual');
    expect(output).toContain('layout');
    expect(output).not.toContain('typo');
    expect(output).not.toContain('component');
  });

  it('includes actionable remediation text', () => {
    const report = makeReport({
      visual: 12.5,
      typo: 0,
      motion: 0,
      wcag: 15.2,
      layout: 3.1,
      component: 0,
      logic: 21.4,
      arch: 0,
      perf: 0,
    });

    const output = formatAdvice(report);

    expect(output).toContain('replace one-off values with design tokens');
    expect(output).toContain('Add focus rings and minimum target sizes');
    expect(output).toContain('Review hook usage and remove zombie state');
  });

  it('orders categories by score descending in the summary', () => {
    const report = makeReport({
      visual: 12.5,
      typo: 0,
      motion: 0,
      wcag: 15.2,
      layout: 3.1,
      component: 0,
      logic: 21.4,
      arch: 0,
      perf: 0,
    });

    const output = formatAdvice(report);
    const priorityIndex = output.indexOf('Priority order:');
    const logicIndex = output.indexOf('logic (21.4)', priorityIndex);
    const wcagIndex = output.indexOf('wcag (15.2)', priorityIndex);
    const visualIndex = output.indexOf('visual (12.5)', priorityIndex);
    const layoutIndex = output.indexOf('layout (3.1)', priorityIndex);

    expect(logicIndex).toBeLessThan(wcagIndex);
    expect(wcagIndex).toBeLessThan(visualIndex);
    expect(visualIndex).toBeLessThan(layoutIndex);
  });

  it('returns a positive message when no categories have issues', () => {
    const report = makeReport({
      visual: 0,
      typo: 0,
      motion: 0,
      wcag: 0,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
    });

    const output = formatAdvice(report);

    expect(output).toContain('No problem categories detected');
  });
});

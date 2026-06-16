import { describe, expect, it } from 'vitest';
import { formatHeatmap } from '../../src/report/heatmap.js';
import type { ProjectReport } from '../../src/types.js';

function makeReport(): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: '2026-06-15T00:00:00.000Z',
    slopIndex: 34.2,
    assemblyHealth: 65.8,
    categoryScores: {
      visual: 12.5,
      typo: 8.0,
      motion: 0,
      wcag: 15.2,
      layout: 3.1,
      component: 9.9,
      logic: 21.4,
      arch: 4.2,
      perf: 0,
    },
    p90Score: 88.0,
    peakScore: 92.0,
    componentCount: 2,
    components: [
      {
        filePath: 'src/pages/Home.tsx',
        rawScore: 12.0,
        componentScore: 8.0,
        adjustedScore: 30.0,
        componentCount: 1,
      },
      {
        filePath: 'src/components/Button.tsx',
        rawScore: 4.0,
        componentScore: 3.0,
        adjustedScore: 12.0,
        componentCount: 1,
      },
    ],
    issues: [],
  };
}

describe('formatHeatmap', () => {
  it('ranks components by ROI descending', () => {
    const stats = {
      'src/pages/Home.tsx': { recent: true, editCount: 5 },
      'src/components/Button.tsx': { recent: false, editCount: 2 },
    };

    const output = formatHeatmap(makeReport(), stats);

    const homeRoi = 30.0 * 1.5 * (1 + 5 / 10); // 67.5
    const buttonRoi = 12.0 * 1.0 * (1 + 2 / 10); // 14.4

    expect(output).toContain('Migration ROI Heatmap');
    expect(output).toContain(homeRoi.toFixed(1));
    expect(output).toContain(buttonRoi.toFixed(1));
    expect(output.indexOf('src/pages/Home.tsx')).toBeLessThan(
      output.indexOf('src/components/Button.tsx'),
    );
  });

  it('applies recency weight of 1.5 for recent files', () => {
    const stats = {
      'src/pages/Home.tsx': { recent: true, editCount: 0 },
    };

    const output = formatHeatmap(makeReport(), stats);

    expect(output).toContain((30.0 * 1.5).toFixed(1));
  });

  it('applies recency weight of 1.0 for stale files', () => {
    const stats = {
      'src/components/Button.tsx': { recent: false, editCount: 0 },
    };

    const output = formatHeatmap(makeReport(), stats);

    expect(output).toContain((12.0 * 1.0).toFixed(1));
  });

  it('caps churn weight at 2.0', () => {
    const stats = {
      'src/pages/Home.tsx': { recent: false, editCount: 25 },
    };

    const output = formatHeatmap(makeReport(), stats);

    expect(output).toContain((30.0 * 1.0 * 2.0).toFixed(1));
  });

  it('handles missing git stats gracefully', () => {
    const output = formatHeatmap(makeReport(), {});

    expect(output).toContain('src/pages/Home.tsx');
    expect(output).toContain('src/components/Button.tsx');
    expect(output).toContain((30.0 * 1.0 * 1.0).toFixed(1));
    expect(output).toContain((12.0 * 1.0 * 1.0).toFixed(1));
  });

  it('handles a report with no components gracefully', () => {
    const report = makeReport();
    report.components = [];

    const output = formatHeatmap(report, {});

    expect(output).toContain('Migration ROI Heatmap');
    expect(output).toContain('No components to rank');
  });
});

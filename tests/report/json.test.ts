import { describe, expect, it } from 'vitest';
import { formatJson } from '../../src/report/json.js';
import type { ProjectReport } from '../../src/types.js';

function makeReport(): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: '2026-06-15T00:00:00.000Z',
    configPath: 'slop-audit.config.js',
    slopIndex: 34.2,
    assemblyHealth: 65.8,
    categoryScores: {
      visual: 12.5,
      typo: 8.0,
      wcag: 15.2,
      layout: 3.1,
      component: 9.9,
      logic: 21.4,
      arch: 4.2,
      perf: 0,
    },
    p90Score: 88.0,
    peakScore: 92.0,
    componentCount: 12,
    components: [],
    issues: [],
    baseline: {
      active: true,
      version: '1.0.0',
      baselineRevision: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  };
}

describe('formatJson', () => {
  it('returns valid JSON', () => {
    const output = formatJson(makeReport());

    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('preserves key report fields', () => {
    const output = formatJson(makeReport());
    const parsed = JSON.parse(output) as ProjectReport;

    expect(parsed.version).toBe('1.0.0');
    expect(parsed.slopIndex).toBe(34.2);
    expect(parsed.assemblyHealth).toBe(65.8);
    expect(parsed.componentCount).toBe(12);
    expect(parsed.categoryScores.logic).toBe(21.4);
    expect(parsed.baseline).toEqual({
      active: true,
      version: '1.0.0',
      baselineRevision: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
    });
    expect(parsed.components.length).toBe(0);
    expect(parsed.issues.length).toBe(0);
  });

  it('formats with 2-space indentation', () => {
    const output = formatJson(makeReport());

    expect(output).toMatch(/^\{\n  "version"/);
    expect(output).toContain('\n  "categoryScores"');
    expect(output).toContain('\n}');
    expect(output).not.toContain('"version":"1.0.0"');
    expect(output).toContain('"version": "1.0.0"');
  });
});

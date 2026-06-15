import { describe, expect, it } from 'vitest';
import { formatSarif } from '../../src/report/sarif.js';
import type { Issue, ProjectReport } from '../../src/types.js';

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
    issues: [
      {
        ruleId: 'magic-spacing',
        category: 'layout',
        severity: 'medium',
        aiSpecific: false,
        filePath: 'src/components/Card.tsx',
        message: 'Avoid magic spacing values in layout',
        line: 14,
        column: 22,
        advice: 'Replace with a spacing token from the design system.',
      },
      {
        ruleId: 'magic-spacing',
        category: 'layout',
        severity: 'medium',
        aiSpecific: false,
        filePath: 'src/components/Hero.tsx',
        message: 'Avoid magic spacing values in layout',
        line: 8,
        column: 18,
      },
      {
        ruleId: 'zombie-state',
        category: 'logic',
        severity: 'high',
        aiSpecific: true,
        filePath: 'src/pages/Home.tsx',
        message: 'Unused state setter detected',
        line: 42,
        column: 10,
      },
    ],
  };
}

describe('formatSarif', () => {
  it('returns a valid SARIF v2.1.0 log', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);

    expect(parsed.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs).toHaveLength(1);
  });

  it('describes the tool driver', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);
    const driver = parsed.runs[0].tool.driver;

    expect(driver.name).toBe('slop-audit');
    expect(driver.version).toBe('1.0.0');
    expect(driver.informationUri).toBe('https://github.com/brickdotdev/slop-audit');
  });

  it('emits one result per issue', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);

    expect(parsed.runs[0].results).toHaveLength(3);
  });

  it('maps severity to SARIF level', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);
    const results = parsed.runs[0].results;

    expect(results.find((r: { ruleId: string }) => r.ruleId === 'zombie-state').level).toBe('error');
    expect(results.find((r: { ruleId: string }) => r.ruleId === 'magic-spacing').level).toBe('warning');
  });

  it('includes physical locations with line and column', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);
    const result = parsed.runs[0].results.find(
      (r: { ruleId: string }) => r.ruleId === 'magic-spacing',
    );
    const location = result.locations[0].physicalLocation;

    expect(location.artifactLocation.uri).toBe('src/components/Card.tsx');
    expect(location.region.startLine).toBe(14);
    expect(location.region.startColumn).toBe(22);
  });

  it('deduplicates rules in the driver rules array', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);
    const rules = parsed.runs[0].tool.driver.rules;
    const ids = rules.map((r: { id: string }) => r.id);

    expect(rules).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('includes rule short descriptions from issues', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);
    const rules = parsed.runs[0].tool.driver.rules;

    const magic = rules.find((r: { id: string }) => r.id === 'magic-spacing');
    expect(magic.shortDescription.text).toBe('Avoid magic spacing values in layout');

    const zombie = rules.find((r: { id: string }) => r.id === 'zombie-state');
    expect(zombie.shortDescription.text).toBe('Unused state setter detected');
  });

  it('formats with 2-space indentation', () => {
    const output = formatSarif(makeReport());

    expect(output).toMatch(/^\{\n  "\$schema"/);
    expect(output).toContain('\n  "runs"');
    expect(output).toContain('\n}');
    expect(output).not.toContain('"version":"2.1.0"');
    expect(output).toContain('"version": "2.1.0"');
  });

  it('handles reports with no issues', () => {
    const report = { ...makeReport(), issues: [] };
    const output = formatSarif(report);
    const parsed = JSON.parse(output);

    expect(parsed.runs[0].tool.driver.rules).toEqual([]);
    expect(parsed.runs[0].results).toEqual([]);
  });

  it('result.ruleIndex points to the matching rule in tool.driver.rules', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);
    const rules = parsed.runs[0].tool.driver.rules;
    const results = parsed.runs[0].results;

    for (const result of results) {
      expect(rules[result.ruleIndex].id).toBe(result.ruleId);
    }
  });

  it('does not emit a fixes field for issues with advice', () => {
    const output = formatSarif(makeReport());
    const parsed = JSON.parse(output);
    const results = parsed.runs[0].results;

    expect(results.every((r: { fixes?: unknown }) => r.fixes === undefined)).toBe(true);
  });

  it('falls back to "unknown" when filePath is missing', () => {
    const issue: Issue = {
      ruleId: 'no-filepath',
      category: 'logic',
      severity: 'low',
      aiSpecific: false,
      message: 'Issue without a file path',
      line: 1,
      column: 1,
    };
    const report = { ...makeReport(), issues: [issue] };
    const output = formatSarif(report);
    const parsed = JSON.parse(output);
    const location = parsed.runs[0].results[0].locations[0].physicalLocation;

    expect(location.artifactLocation.uri).toBe('unknown');
  });
});

import { describe, expect, it } from 'vitest';
import { VERSION, type Severity, type Issue, type FileScanResult } from '../src/types';

describe('types', () => {
  it('exports version', () => {
    expect(VERSION).toBe('1.0.0');
  });

  it('allows valid severity values', () => {
    const s: Severity = 'high';
    expect(s).toBe('high');
  });

  it('constructs a FileScanResult', () => {
    const issue: Issue = {
      ruleId: 'logic/boundary-violation',
      category: 'logic',
      severity: 'high',
      aiSpecific: true,
      message: 'Hook used in RSC',
      line: 1,
      column: 1,
    };
    const result: FileScanResult = {
      filePath: 'Button.tsx',
      componentCount: 1,
      astNodeCount: 10,
      issues: [issue],
    };
    expect(result.issues[0].ruleId).toBe('logic/boundary-violation');
  });
});

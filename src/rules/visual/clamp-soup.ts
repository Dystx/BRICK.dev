import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const CLAMP_RE = /clamp\([^)]+\)/i;
const VIEWPORT_UNIT_RE = /\d+(?:\.\d+)?(vw|vh)/i;

export const clampSoupRule = createRule<unknown>({
  id: 'visual/clamp-soup',
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const styleProp of facts.styleProps) {
      const clampMatch = CLAMP_RE.exec(styleProp.source);
      if (clampMatch && VIEWPORT_UNIT_RE.test(clampMatch[0])) {
        issues.push({
          ruleId: 'visual/clamp-soup',
          category: 'visual',
          severity: 'high',
          aiSpecific: true,
          message: 'Inline style uses clamp() with raw viewport units',
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Alias the viewport configuration to a design token (e.g., a fluid type or spacing token).',
        });
      }
    }
    return issues;
  },
});

export default clampSoupRule satisfies Rule<unknown>;

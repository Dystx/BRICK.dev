import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const CALC_RAW_PX_RE = /calc\([^)]*\d+\.?\d*px[^)]*\)/i;

export const calcRawPxRule = createRule<unknown>({
  id: 'typo/calc-raw-px',
  category: 'typo',
  severity: 'high',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const styleProp of facts.styleProps) {
      if (CALC_RAW_PX_RE.test(styleProp.source)) {
        issues.push({
          ruleId: 'typo/calc-raw-px',
          category: 'typo',
          severity: 'high',
          aiSpecific: false,
          message:
            'calc() in style prop uses raw px units; prefer rem/em for scalable typography/layout.',
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Replace pixel values in calc() with rem or em units tied to the design system.',
        });
      }
    }
    return issues;
  },
});

export default calcRawPxRule satisfies Rule<unknown>;

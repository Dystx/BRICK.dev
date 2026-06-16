import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const CALC_FONTSIZE_RE = /['"]?(?:fontSize|font-size)['"]?\s*:\s*['"`]calc\([^)]+\)['"`]/i;

export const calcFontSizeRule = createRule<unknown>({
  id: 'typo/calc-fontsize',
  category: 'typo',
  severity: 'medium',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const styleProp of facts.styleProps) {
      if (CALC_FONTSIZE_RE.test(styleProp.source)) {
        issues.push({
          ruleId: 'typo/calc-fontsize',
          category: 'typo',
          severity: 'medium',
          aiSpecific: false,
          message: 'calc() assigned directly to font-size lacks an explicit design token baseline.',
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Use a type-scale token or a clamp() tied to the design system instead of calc().',
        });
      }
    }
    return issues;
  },
});

export default calcFontSizeRule satisfies Rule<unknown>;

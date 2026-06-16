import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isNonTokenFontWeight, splitClassName } from '../utils';

export const nonTokenFontWeightRule = createRule<unknown>({
  id: 'typo/non-token-font-weight',
  category: 'typo',
  severity: 'low',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      const offenders = classes.filter((className) => isNonTokenFontWeight(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'typo/non-token-font-weight',
          category: 'typo',
          severity: 'low',
          aiSpecific: false,
          message: `Non-token font weight ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a font-weight token (e.g., font-normal, font-bold).',
        });
      }
    }
    return issues;
  },
});

export default nonTokenFontWeightRule satisfies Rule<unknown>;

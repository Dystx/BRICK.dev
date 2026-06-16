import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isHardcodedFontSize, splitClassName } from '../utils';

export const hardcodedFontSizeRule = createRule<unknown>({
  id: 'typo/hardcoded-font-size',
  category: 'typo',
  severity: 'medium',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      const offenders = classes.filter((className) => isHardcodedFontSize(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'typo/hardcoded-font-size',
          category: 'typo',
          severity: 'medium',
          aiSpecific: false,
          message: `Hardcoded font size ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a type-scale token (e.g., text-sm, text-lg).',
        });
      }
    }
    return issues;
  },
});

export default hardcodedFontSizeRule satisfies Rule<unknown>;

import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isMagicLetterSpacing, splitClassName } from '../utils';

export const magicLetterSpacingRule = createRule<unknown>({
  id: 'typo/magic-letter-spacing',
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
      const offenders = classes.filter((className) => isMagicLetterSpacing(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'typo/magic-letter-spacing',
          category: 'typo',
          severity: 'low',
          aiSpecific: false,
          message: `Magic letter spacing ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a tracking token (e.g., tracking-wide).',
        });
      }
    }
    return issues;
  },
});

export default magicLetterSpacingRule satisfies Rule<unknown>;

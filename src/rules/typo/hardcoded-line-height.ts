import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isHardcodedLineHeight, splitClassName } from '../utils';

export const hardcodedLineHeightRule = createRule<unknown>({
  id: 'typo/hardcoded-line-height',
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
      const offenders = classes.filter((className) => isHardcodedLineHeight(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'typo/hardcoded-line-height',
          category: 'typo',
          severity: 'low',
          aiSpecific: false,
          message: `Hardcoded line height ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a leading token (e.g., leading-normal, leading-relaxed).',
        });
      }
    }
    return issues;
  },
});

export default hardcodedLineHeightRule satisfies Rule<unknown>;

import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isArbitraryShadow, splitClassName } from '../utils';

export const arbitraryShadowRule = createRule<unknown>({
  id: 'visual/arbitrary-shadow',
  category: 'visual',
  severity: 'low',
  aiSpecific: false,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      const offenders = classes.filter((className) => isArbitraryShadow(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'visual/arbitrary-shadow',
          category: 'visual',
          severity: 'low',
          aiSpecific: false,
          message: `Arbitrary shadow ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a shadow token (e.g., shadow-sm, shadow-md, shadow-lg).',
        });
      }
    }
    return issues;
  },
});

export default arbitraryShadowRule satisfies Rule<unknown>;

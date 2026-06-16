import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isCustomFontFamily, splitClassName } from '../utils';

export const customFontFamilyRule = createRule<unknown>({
  id: 'typo/custom-font-family',
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
      const offenders = classes.filter((className) => isCustomFontFamily(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'typo/custom-font-family',
          category: 'typo',
          severity: 'low',
          aiSpecific: false,
          message: `Custom font family ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Use a font-family token (e.g., font-sans, font-serif).',
        });
      }
    }
    return issues;
  },
});

export default customFontFamilyRule satisfies Rule<unknown>;

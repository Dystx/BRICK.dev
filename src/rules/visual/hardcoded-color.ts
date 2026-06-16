import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { isArbitraryColor, splitClassName } from '../utils';

const STYLE_COLOR_RE = /:\s*['"]?(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|lab\(|lch\(|hwb\()/i;

export const hardcodedColorRule = createRule<unknown>({
  id: 'visual/hardcoded-color',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      const offenders = classes.filter((className) => isArbitraryColor(className));
      if (offenders.length > 0) {
        issues.push({
          ruleId: 'visual/hardcoded-color',
          category: 'visual',
          severity: 'medium',
          aiSpecific: true,
          message: `Hardcoded color utility ${offenders.map((o) => `'${o}'`).join(', ')}`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Replace with a semantic color token (e.g., bg-primary).',
        });
      }
    }
    for (const styleProp of facts.styleProps) {
      if (STYLE_COLOR_RE.test(styleProp.source)) {
        issues.push({
          ruleId: 'visual/hardcoded-color',
          category: 'visual',
          severity: 'medium',
          aiSpecific: true,
          message: 'Inline style contains a hardcoded color value',
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Use a CSS custom property or semantic token instead.',
        });
      }
    }
    return issues;
  },
});

export default hardcodedColorRule satisfies Rule<unknown>;

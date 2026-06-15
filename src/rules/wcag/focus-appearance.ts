import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { splitClassName, isFocusRingClass, isOutlineRemoval } from '../utils';

export interface FocusAppearanceContext {
  globalCssTarget?: string;
}

export const focusAppearanceRule = createRule<FocusAppearanceContext>({
  id: 'wcag/focus-appearance',
  category: 'wcag',
  severity: 'high',
  aiSpecific: false,
  create(context: RuleContext): FocusAppearanceContext {
    return { globalCssTarget: context.config.globalCssTarget };
  },
  analyze(context: FocusAppearanceContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const element of facts.interactiveElements) {
      const classes = element.classNames.flatMap((fact) => splitClassName(fact.value));

      const removesOutline = classes.some((className) => isOutlineRemoval(className));
      const hasFocusRing = classes.some((className) => isFocusRingClass(className));

      if (removesOutline && !hasFocusRing) {
        issues.push({
          ruleId: 'wcag/focus-appearance',
          category: 'wcag',
          severity: 'high',
          aiSpecific: false,
          message: `Interactive '${element.tag}' removes focus outline without adding a focus ring`,
          line: element.line,
          column: element.column,
          advice:
            'Add a focus:ring-* or focus-visible:ring-* class, or remove outline-none.',
          fix: context.globalCssTarget
            ? {
                kind: 'css-anchor',
                description: `Inject focus-ring CSS into ${context.globalCssTarget}`,
                targetFile: context.globalCssTarget,
                anchor: '/* @slop-audit:v1.0.0:fix:focus-ring */',
              }
            : undefined,
        });
      }
    }

    return issues;
  },
});

export default focusAppearanceRule satisfies Rule<FocusAppearanceContext>;

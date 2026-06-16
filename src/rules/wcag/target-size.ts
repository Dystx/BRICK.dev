import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { splitClassName, isSizingToken, matchesAllowlist } from '../utils';

function isPositiveSize(value: string | undefined): boolean {
  if (value === undefined || value.length === 0) return false;
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0;
}

export interface TargetSizeContext {
  exemptSelectors: readonly (string | RegExp)[];
}

export const targetSizeRule = createRule<TargetSizeContext>({
  id: 'wcag/target-size',
  category: 'wcag',
  severity: 'high',
  aiSpecific: false,
  create(context: RuleContext): TargetSizeContext {
    return {
      exemptSelectors: context.config.wcag.targetSizeExemptSelectors,
    };
  },
  analyze(context: TargetSizeContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const element of facts.interactiveElements) {
      const tag = element.tag;
      if (tag !== 'button' && tag !== 'a' && tag !== 'input') {
        continue;
      }

      const classes = element.classNames.flatMap((fact) => splitClassName(fact.value));

      const isExempt = classes.some((className) =>
        matchesAllowlist(className, context.exemptSelectors),
      );
      if (isExempt) {
        continue;
      }

      const hasSizing = classes.some((className) => isSizingToken(className));

      const width = element.attributes.width;
      const height = element.attributes.height;
      const hasExplicitSize = isPositiveSize(width) || isPositiveSize(height);

      if (!hasSizing && !hasExplicitSize) {
        issues.push({
          ruleId: 'wcag/target-size',
          category: 'wcag',
          severity: 'high',
          aiSpecific: false,
          message: `Interactive '${tag}' lacks a sufficient target-size token`,
          line: element.line,
          column: element.column,
          advice:
            'Add h-*, w-*, p-*, min-w-*, min-h-*, size-*, or an explicit width/height attribute.',
        });
      }
    }

    return issues;
  },
});

export default targetSizeRule satisfies Rule<TargetSizeContext>;

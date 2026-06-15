import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { hasAllClasses, splitClassName } from '../utils';

export const REQUIRED_CENTERING_CLASSES = [
  'flex',
  'items-center',
  'justify-center',
  'min-h-screen',
  'text-center',
] as const;

export interface GenericCenteringContext {
  maxInstances: number;
}

function resolveMaxInstances(configured: unknown): number {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return 1;
}

export const genericCenteringRule = createRule<GenericCenteringContext>({
  id: 'visual/generic-centering',
  category: 'visual',
  severity: 'low',
  aiSpecific: true,
  create(context: RuleContext): GenericCenteringContext {
    return {
      maxInstances: resolveMaxInstances(context.config.ruleConfig.genericCenteringMaxInstances),
    };
  },
  analyze(context: GenericCenteringContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    let matches = 0;

    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      if (hasAllClasses(classes, REQUIRED_CENTERING_CLASSES)) {
        matches += 1;
        if (matches > context.maxInstances) {
          issues.push({
            ruleId: 'visual/generic-centering',
            category: 'visual',
            severity: 'low',
            aiSpecific: true,
            message: 'Generic AI centering stack detected',
            line: classNameFact.line,
            column: classNameFact.column,
            advice: 'Replace with a domain-specific layout component or reduce duplication.',
          });
        }
      }
    }

    return issues;
  },
});

export default genericCenteringRule satisfies Rule<GenericCenteringContext>;

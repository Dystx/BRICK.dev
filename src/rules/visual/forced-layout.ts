import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { splitClassName } from '../utils';

export interface ForcedLayoutContext {
  threshold: number;
  gapTokens: readonly string[] | undefined;
}

const DEFAULT_THRESHOLD = 2;

function resolveThreshold(configured: unknown): number {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return DEFAULT_THRESHOLD;
}

function isGapToken(className: string): boolean {
  return className.startsWith('gap-') && !className.startsWith('gap-x-') && !className.startsWith('gap-y-');
}

function isForcedLayoutWrapper(classes: readonly string[]): boolean {
  return classes.includes('flex') && classes.includes('flex-col') && classes.some(isGapToken);
}

export const forcedLayoutRule = createRule<ForcedLayoutContext>({
  id: 'visual/forced-layout',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  create(context: RuleContext): ForcedLayoutContext {
    return {
      threshold: resolveThreshold(context.config.ruleConfig.forcedLayoutThreshold),
      gapTokens: context.config.gapTokens,
    };
  },
  analyze(context: ForcedLayoutContext, facts: ScanFacts): Issue[] {
    // Spec exemption: a restricted gap-token set implies an intentional design system.
    if (context.gapTokens && context.gapTokens.length >= 1) {
      return [];
    }

    let count = 0;
    let first: { line: number; column: number } | undefined;

    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      if (isForcedLayoutWrapper(classes)) {
        count += 1;
        if (!first) {
          first = { line: classNameFact.line, column: classNameFact.column };
        }
      }
    }

    if (count > context.threshold && first) {
      return [
        {
          ruleId: 'visual/forced-layout',
          category: 'visual',
          severity: 'medium',
          aiSpecific: true,
          message: 'Repetitive flex flex-col gap-* wrappers detected; extract a layout primitive.',
          line: first.line,
          column: first.column,
        },
      ];
    }

    return [];
  },
});

export default forcedLayoutRule satisfies Rule<ForcedLayoutContext>;

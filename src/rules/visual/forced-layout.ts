import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

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

    for (const group of facts.forcedLayoutGroups) {
      if (group.count > context.threshold) {
        return [
          {
            ruleId: 'visual/forced-layout',
            category: 'visual',
            severity: 'medium',
            aiSpecific: true,
            message: 'Consecutive flex flex-col gap-* wrappers detected; extract a layout primitive.',
            line: group.line,
            column: group.column,
          },
        ];
      }
    }

    return [];
  },
});

export default forcedLayoutRule satisfies Rule<ForcedLayoutContext>;

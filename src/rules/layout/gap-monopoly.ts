import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { splitClassName } from '../utils';

export interface GapMonopolyContext {
  gapTokens: readonly string[] | undefined;
  configuredTolerance: number | undefined;
}

const GAP_CLASS_RE = /^gap-(.+)$/;

function extractGapValue(className: string): string | undefined {
  const match = GAP_CLASS_RE.exec(className);
  return match ? match[1] : undefined;
}

function resolveConfiguredTolerance(configured: unknown): number | undefined {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 0 && configured <= 1) {
    return configured;
  }
  return undefined;
}

function calculateTolerance(
  gapTokens: readonly string[] | undefined,
  attributeCount: number,
  configuredTolerance: number | undefined,
): number {
  if (configuredTolerance !== undefined) {
    return configuredTolerance;
  }
  const designSystemRestricted = gapTokens !== undefined && gapTokens.length >= 1 && gapTokens.length <= 3;
  if (designSystemRestricted) {
    return 0.95;
  }
  return attributeCount < 20 ? 0.85 : 0.70;
}

export const gapMonopolyRule = createRule<GapMonopolyContext>({
  id: 'layout/gap-monopoly',
  category: 'layout',
  severity: 'medium',
  aiSpecific: true,
  create(context: RuleContext): GapMonopolyContext {
    return {
      gapTokens: context.config.gapTokens,
      configuredTolerance: resolveConfiguredTolerance(context.config.ruleConfig.gapMonopolyTolerance),
    };
  },
  analyze(context: GapMonopolyContext, facts: ScanFacts): Issue[] {
    const classNameAttributeCount = facts.staticClassNames.length;
    if (classNameAttributeCount === 0) {
      return [];
    }

    const gapValues: string[] = [];
    let firstGapFact: { value: string; line: number; column: number } | undefined;

    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      for (const className of classes) {
        const gapValue = extractGapValue(className);
        if (gapValue !== undefined) {
          gapValues.push(gapValue);
          if (firstGapFact === undefined) {
            firstGapFact = { value: className, line: classNameFact.line, column: classNameFact.column };
          }
        }
      }
    }

    if (gapValues.length === 0 || firstGapFact === undefined) {
      return [];
    }

    const freq: Record<string, number> = {};
    let maxFreq = 0;
    let dominantValue = gapValues[0];

    for (const val of gapValues) {
      freq[val] = (freq[val] ?? 0) + 1;
      if (freq[val] > maxFreq) {
        maxFreq = freq[val];
        dominantValue = val;
      }
    }

    const ratio = maxFreq / classNameAttributeCount;
    const tolerance = calculateTolerance(context.gapTokens, classNameAttributeCount, context.configuredTolerance);

    if (ratio <= tolerance) {
      return [];
    }

    const score = (ratio - tolerance) / (1 - tolerance);
    if (score <= 0.5) {
      return [];
    }

    return [
      {
        ruleId: 'layout/gap-monopoly',
        category: 'layout',
        severity: 'medium',
        aiSpecific: true,
        message: `Gap value '${dominantValue}' dominates layout (${(ratio * 100).toFixed(0)}%); introduce layout variety or restrict gapTokens.`,
        line: firstGapFact.line,
        column: firstGapFact.column,
        advice: 'Vary gap values across components or configure a restricted gapTokens set.',
      },
    ];
  },
});

export default gapMonopolyRule satisfies Rule<GapMonopolyContext>;

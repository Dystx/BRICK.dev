import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import type { RuleRegistry } from '../registry';
import { createRule } from '../rule';
import { splitClassName } from '../utils';

export interface GapMonopolyContext {
  gapTokens: readonly string[] | undefined;
  configuredTolerance: number | undefined;
  gapValues: string[];
  attributeCount: number;
  firstGapFact: { value: string; line: number; column: number } | undefined;
  reported: boolean;
  fileContributions: Map<string, FileContribution>;
}

interface FileContribution {
  gapValues: string[];
  attributeCount: number;
  firstGapFact?: { value: string; line: number; column: number };
}

const ACCUMULATOR_KEY = Symbol.for('slop-audit:gap-monopoly-accumulator');

const GAP_CLASS_RE = /^gap-(.+)$/;
const AXIS_GAP_RE = /^gap-[xy]-/;

function extractGapValue(className: string): string | undefined {
  if (AXIS_GAP_RE.test(className)) return undefined;
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

function getAccumulator(registry: RuleRegistry | undefined): GapMonopolyContext {
  if (registry) {
    const existing = (registry as unknown as Record<symbol, GapMonopolyContext>)[ACCUMULATOR_KEY];
    if (existing) return existing;
    const created: GapMonopolyContext = {
      gapTokens: undefined,
      configuredTolerance: undefined,
      gapValues: [],
      attributeCount: 0,
      firstGapFact: undefined,
      reported: false,
      fileContributions: new Map(),
    };
    (registry as unknown as Record<symbol, GapMonopolyContext>)[ACCUMULATOR_KEY] = created;
    return created;
  }
  return {
    gapTokens: undefined,
    configuredTolerance: undefined,
    gapValues: [],
    attributeCount: 0,
    firstGapFact: undefined,
    reported: false,
    fileContributions: new Map(),
  };
}

function gapMonopolyScore(gapValues: string[], containerCount: number, tolerance: number): number {
  if (containerCount === 0) return 0;
  const freq: Record<string, number> = {};
  let maxFreq = 0;
  for (const val of gapValues) {
    freq[val] = (freq[val] ?? 0) + 1;
    if (freq[val] > maxFreq) {
      maxFreq = freq[val];
    }
  }
  const ratio = maxFreq / containerCount;
  if (ratio <= tolerance) return 0;
  return (ratio - tolerance) / (1 - tolerance);
}

export const gapMonopolyRule = createRule<GapMonopolyContext>({
  id: 'layout/gap-monopoly',
  category: 'layout',
  severity: 'medium',
  aiSpecific: true,
  create(context: RuleContext): GapMonopolyContext {
    const accumulator = getAccumulator(context.registry);
    accumulator.gapTokens = context.config.gapTokens;
    accumulator.configuredTolerance = resolveConfiguredTolerance(context.config.ruleConfig.gapMonopolyTolerance);
    return accumulator;
  },
  beforeRescan(context: GapMonopolyContext, filePath: string): void {
    const contribution = context.fileContributions.get(filePath);
    if (!contribution) {
      return;
    }

    // Remove this file's prior contribution so watch-mode rescans don't drift.
    context.attributeCount -= contribution.attributeCount;
    for (const val of contribution.gapValues) {
      const idx = context.gapValues.indexOf(val);
      if (idx !== -1) context.gapValues.splice(idx, 1);
    }
    context.fileContributions.delete(filePath);

    // Recompute the earliest first-gap fact from the remaining contributions.
    let earliest: { value: string; line: number; column: number } | undefined;
    for (const contrib of context.fileContributions.values()) {
      if (contrib.firstGapFact) {
        earliest = contrib.firstGapFact;
        break;
      }
    }
    context.firstGapFact = earliest;

    // Allow re-reporting after a rescan in case the threshold no longer holds.
    context.reported = false;
  },
  analyze(context: GapMonopolyContext, facts: ScanFacts): Issue[] {
    const classNameAttributeCount = facts.staticClassNames.length;
    if (classNameAttributeCount === 0) {
      return [];
    }

    const fileGapValues: string[] = [];
    let firstFileGapFact: { value: string; line: number; column: number } | undefined;

    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      for (const className of classes) {
        const gapValue = extractGapValue(className);
        if (gapValue !== undefined) {
          fileGapValues.push(gapValue);
          if (firstFileGapFact === undefined) {
            firstFileGapFact = { value: className, line: classNameFact.line, column: classNameFact.column };
          }
        }
      }
    }

    if (fileGapValues.length === 0 || firstFileGapFact === undefined) {
      return [];
    }

    // Track per-file contribution so watch-mode rescans are stable.
    context.fileContributions.set(facts.filePath, {
      gapValues: fileGapValues,
      attributeCount: classNameAttributeCount,
      firstGapFact: firstFileGapFact,
    });
    context.gapValues.push(...fileGapValues);
    context.attributeCount += classNameAttributeCount;
    if (context.firstGapFact === undefined) {
      context.firstGapFact = firstFileGapFact;
    }

    if (context.reported) {
      return [];
    }

    const tolerance = calculateTolerance(context.gapTokens, context.attributeCount, context.configuredTolerance);
    const score = gapMonopolyScore(context.gapValues, context.attributeCount, tolerance);

    if (score <= 0.5) {
      return [];
    }

    context.reported = true;

    const freq: Record<string, number> = {};
    let dominantValue = fileGapValues[0];
    let maxFreq = 0;
    for (const val of context.gapValues) {
      freq[val] = (freq[val] ?? 0) + 1;
      if (freq[val] > maxFreq) {
        maxFreq = freq[val];
        dominantValue = val;
      }
    }

    const ratio = maxFreq / context.attributeCount;

    return [
      {
        ruleId: 'layout/gap-monopoly',
        category: 'layout',
        severity: 'medium',
        aiSpecific: true,
        message: `Gap value '${dominantValue}' dominates layout (${(ratio * 100).toFixed(0)}%); introduce layout variety or restrict gapTokens.`,
        line: firstFileGapFact.line,
        column: firstFileGapFact.column,
        advice: 'Vary gap values across components or configure a restricted gapTokens set.',
      },
    ];
  },
});

export default gapMonopolyRule satisfies Rule<GapMonopolyContext>;

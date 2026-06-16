import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { splitClassName, isSizingToken, matchesAllowlist } from '../utils';

const MIN_TARGET_SIZE = 24;

function isPositiveSize(value: string | undefined): boolean {
  if (value === undefined || value.length === 0) return false;
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function parsePixelValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (/^-?\d+(\.\d+)?px$/i.test(trimmed)) {
    const parsed = parseFloat(trimmed.slice(0, -2));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (/^-?\d+(\.\d+)?rem$/i.test(trimmed)) {
    const parsed = parseFloat(trimmed.slice(0, -3));
    return Number.isFinite(parsed) ? parsed * 16 : undefined;
  }
  return undefined;
}

function tokenValueToPx(className: string): number | undefined {
  const match = /^(?:w|h|min-w|min-h|max-w|max-h|size|p|px|py)-(.+)$/.exec(className);
  if (!match) return undefined;
  const suffix = match[1];

  if (suffix.startsWith('[') && suffix.endsWith(']')) {
    return parsePixelValue(suffix.slice(1, -1));
  }

  if (/^-?\d+(\.\d+)?$/.test(suffix)) {
    const parsed = parseFloat(suffix);
    return Number.isFinite(parsed) ? parsed * 4 : undefined;
  }

  // Fractions and named keywords (full, auto, screen, fit, etc.) are indeterminate.
  return undefined;
}

interface EffectiveDimensions {
  width: number | undefined;
  height: number | undefined;
  padX: number | undefined;
  padY: number | undefined;
  hasAnySizing: boolean;
}

function computeEffectiveDimensions(
  classes: string[],
  widthAttr: string | undefined,
  heightAttr: string | undefined,
): EffectiveDimensions {
  const widthValues: number[] = [];
  const heightValues: number[] = [];
  let padX: number | undefined;
  let padY: number | undefined;

  for (const className of classes) {
    if (
      className.startsWith('w-') ||
      className.startsWith('min-w-') ||
      className.startsWith('max-w-') ||
      className.startsWith('size-')
    ) {
      const px = tokenValueToPx(className);
      if (px !== undefined) widthValues.push(px);
    }

    if (
      className.startsWith('h-') ||
      className.startsWith('min-h-') ||
      className.startsWith('max-h-') ||
      className.startsWith('size-')
    ) {
      const px = tokenValueToPx(className);
      if (px !== undefined) heightValues.push(px);
    }

    if (className.startsWith('px-')) {
      const px = tokenValueToPx(className);
      if (px !== undefined) padX = Math.max(padX ?? 0, px);
    }

    if (className.startsWith('py-')) {
      const px = tokenValueToPx(className);
      if (px !== undefined) padY = Math.max(padY ?? 0, px);
    }

    if (className.startsWith('p-') && !className.startsWith('px-') && !className.startsWith('py-')) {
      const px = tokenValueToPx(className);
      if (px !== undefined) {
        padX = Math.max(padX ?? 0, px);
        padY = Math.max(padY ?? 0, px);
      }
    }
  }

  const attrWidth = parsePixelValue(widthAttr);
  if (attrWidth !== undefined) widthValues.push(attrWidth);
  const attrHeight = parsePixelValue(heightAttr);
  if (attrHeight !== undefined) heightValues.push(attrHeight);

  const effectiveWidth =
    widthValues.length > 0 ? Math.max(...widthValues) + (padX ?? 0) * 2 : undefined;
  const effectiveHeight =
    heightValues.length > 0 ? Math.max(...heightValues) + (padY ?? 0) * 2 : undefined;

  const hasAnySizing =
    classes.some((className) => isSizingToken(className)) ||
    isPositiveSize(widthAttr) ||
    isPositiveSize(heightAttr);

  return {
    width: effectiveWidth,
    height: effectiveHeight,
    padX,
    padY,
    hasAnySizing,
  };
}

function meetsMinimumFootprint(dimensions: EffectiveDimensions): boolean {
  const widthKnownBelow = dimensions.width !== undefined && dimensions.width < MIN_TARGET_SIZE;
  const heightKnownBelow =
    dimensions.height !== undefined && dimensions.height < MIN_TARGET_SIZE;

  if (widthKnownBelow || heightKnownBelow) return false;

  const widthOk =
    dimensions.width !== undefined
      ? dimensions.width >= MIN_TARGET_SIZE
      : dimensions.padX !== undefined;
  const heightOk =
    dimensions.height !== undefined
      ? dimensions.height >= MIN_TARGET_SIZE
      : dimensions.padY !== undefined;

  if (widthOk || heightOk) return true;
  return dimensions.hasAnySizing;
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

      const dimensions = computeEffectiveDimensions(
        classes,
        element.attributes.width,
        element.attributes.height,
      );

      if (!meetsMinimumFootprint(dimensions)) {
        issues.push({
          ruleId: 'wcag/target-size',
          category: 'wcag',
          severity: 'high',
          aiSpecific: false,
          message: `Interactive '${tag}' lacks a sufficient target-size token`,
          line: element.line,
          column: element.column,
          advice:
            'Add h-* w-* min-w-* min-h-* size-* or explicit width/height attributes that provide at least a 24×24 CSS pixel footprint.',
        });
      }
    }

    return issues;
  },
});

export default targetSizeRule satisfies Rule<TargetSizeContext>;

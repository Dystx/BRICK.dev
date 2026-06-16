import type { Rule } from '../types';
import { arbitraryEscapeRule } from './visual/arbitrary-escape';
import { forcedLayoutRule } from './visual/forced-layout';
import { genericCenteringRule } from './visual/generic-centering';
import { boundaryViolationRule } from './logic/boundary-violation';
import { ghostDefensiveRule } from './logic/ghost-defensive';
import { zombieStateRule } from './logic/zombie-state';
import { targetSizeRule } from './wcag/target-size';
import { focusAppearanceRule } from './wcag/focus-appearance';
import { focusObscuredRule } from './wcag/focus-obscured';
import { gapMonopolyRule } from './layout/gap-monopoly';
import { calcRawPxRule } from './typo/calc-raw-px';
import { inlineStyleRule } from './visual/inline-style';
import { hardcodedColorRule } from './visual/hardcoded-color';
import { primitiveReinventionRule } from './component/primitive-reinvention';
import { headingHierarchyRule } from './typo/heading-hierarchy';
import { hardcodedFontSizeRule } from './typo/hardcoded-font-size';
import { hardcodedLineHeightRule } from './typo/hardcoded-line-height';
import { magicLetterSpacingRule } from './typo/magic-letter-spacing';
import { nonTokenFontWeightRule } from './typo/non-token-font-weight';
import { customFontFamilyRule } from './typo/custom-font-family';
import { arbitraryDurationRule } from './motion/arbitrary-duration';
import { arbitraryEasingRule } from './motion/arbitrary-easing';
import { arbitraryTransitionRule } from './motion/arbitrary-transition';
import { arbitraryAnimationRule } from './motion/arbitrary-animation';
import { arbitraryZIndexRule } from './visual/arbitrary-z-index';
import { arbitraryShadowRule } from './visual/arbitrary-shadow';
import { arbitraryRadiusRule } from './visual/arbitrary-radius';

export const builtinRules: Rule[] = [
  arbitraryEscapeRule,
  forcedLayoutRule,
  genericCenteringRule,
  boundaryViolationRule,
  ghostDefensiveRule,
  zombieStateRule,
  targetSizeRule,
  focusAppearanceRule,
  focusObscuredRule,
  gapMonopolyRule,
  calcRawPxRule,
  inlineStyleRule,
  hardcodedColorRule,
  primitiveReinventionRule,
  headingHierarchyRule,
  hardcodedFontSizeRule,
  hardcodedLineHeightRule,
  magicLetterSpacingRule,
  nonTokenFontWeightRule,
  customFontFamilyRule,
  arbitraryDurationRule,
  arbitraryEasingRule,
  arbitraryTransitionRule,
  arbitraryAnimationRule,
  arbitraryZIndexRule,
  arbitraryShadowRule,
  arbitraryRadiusRule,
];

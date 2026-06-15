import type { Rule } from '../types';
import { arbitraryEscapeRule } from './visual/arbitrary-escape';
import { genericCenteringRule } from './visual/generic-centering';
import { boundaryViolationRule } from './logic/boundary-violation';
import { ghostDefensiveRule } from './logic/ghost-defensive';
import { zombieStateRule } from './logic/zombie-state';
import { targetSizeRule } from './wcag/target-size';
import { focusAppearanceRule } from './wcag/focus-appearance';

export const builtinRules: Rule[] = [
  arbitraryEscapeRule,
  genericCenteringRule,
  boundaryViolationRule,
  ghostDefensiveRule,
  zombieStateRule,
  targetSizeRule,
  focusAppearanceRule,
];

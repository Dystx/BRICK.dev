const LAYOUT_ARBITRARY_RE = /^(w|h|p|m|gap|px|py|mx|my|min-w|min-h|max-w|max-h|inset)-\[(.*)\]$/;
const COLOR_ARBITRARY_RE = /^(?:bg|text|border|ring|shadow|from|to|via|stroke|fill)-\[([^\]]*)\]$/;
const COLOR_LITERAL_RE = /^#|rgba?\(|hsla?\(|oklch\(|lab\(|lch\(|hwb\(/i;
const FONT_SIZE_RE = /^text-\[(.+)\]$/;
const LINE_HEIGHT_RE = /^leading-\[(.+)\]$/;
const LETTER_SPACING_RE = /^tracking-\[(.+)\]$/;
const FONT_ARBITRARY_RE = /^font-\[(.+)\]$/;
const NUMERIC_UNIT_RE = /^-?\d+(\.\d+)?(px|rem|em|%)?$/;
const TIME_UNIT_RE = /^-?\d+(\.\d+)?(ms|s)$/;
const NAMED_FONT_WEIGHT_RE = /^(bold|bolder|lighter|normal)$/;
const QUOTED_STRING_RE = /^['"].+['"]$/;
const FONT_STACK_RE = /^(?:['"][^'"]+['"]|[a-zA-Z][\w\-]*)(?:[,\s/]+(?:['"][^'"]+['"]|[a-zA-Z][\w\-]*))*$/;
const DURATION_RE = /^duration-\[(.+)\]$/;
const EASING_RE = /^ease-\[([^\]]*)\]$/;
const TRANSITION_RE = /^transition-\[([^\]]*)\]$/;
const ANIMATION_RE = /^animate-\[([^\]]*)\]$/;
const Z_INDEX_RE = /^z-\[([^\]]*)\]$/;
const SHADOW_RE = /^(?:shadow|drop-shadow)-\[([^\]]*)\]$/;
const ROUNDED_RE = /^rounded(?:-[trbl]{1,2})?-\[([^\]]*)\]$/;
const SIZING_TOKEN_RE = /^(?:min-w|min-h|h|w|p|px|py|size|aspect)-.+$/;
const FOCUS_RING_RE = /^(?:focus|focus-visible):ring-.+$/;
const OUTLINE_REMOVAL_RE = /^(?:(focus|focus-visible):)?outline-none$/;

export function splitClassName(value: string): string[] {
  return value.split(/\s+/).filter((part) => part.length > 0);
}

export function isLayoutArbitrary(className: string): boolean {
  return LAYOUT_ARBITRARY_RE.test(className);
}

export function isArbitraryColor(className: string): boolean {
  const match = COLOR_ARBITRARY_RE.exec(className);
  if (!match) return false;
  return COLOR_LITERAL_RE.test(match[1]);
}

export function isHardcodedFontSize(className: string): boolean {
  const match = FONT_SIZE_RE.exec(className);
  return match ? NUMERIC_UNIT_RE.test(match[1].trim()) : false;
}

export function isHardcodedLineHeight(className: string): boolean {
  const match = LINE_HEIGHT_RE.exec(className);
  return match ? NUMERIC_UNIT_RE.test(match[1].trim()) : false;
}

export function isMagicLetterSpacing(className: string): boolean {
  const match = LETTER_SPACING_RE.exec(className);
  return match ? NUMERIC_UNIT_RE.test(match[1].trim()) : false;
}

export function isNonTokenFontWeight(className: string): boolean {
  const match = FONT_ARBITRARY_RE.exec(className);
  if (!match) return false;
  const value = match[1].trim();
  return /^\d+$/.test(value) || NAMED_FONT_WEIGHT_RE.test(value);
}

export function isCustomFontFamily(className: string): boolean {
  const match = FONT_ARBITRARY_RE.exec(className);
  if (!match) return false;
  const value = match[1].trim();
  return QUOTED_STRING_RE.test(value) || FONT_STACK_RE.test(value);
}

export function isArbitraryDuration(className: string): boolean {
  const match = DURATION_RE.exec(className);
  return match ? TIME_UNIT_RE.test(match[1].trim()) : false;
}

export function isArbitraryEasing(className: string): boolean {
  return EASING_RE.test(className);
}

export function isArbitraryTransition(className: string): boolean {
  return TRANSITION_RE.test(className);
}

export function isArbitraryAnimation(className: string): boolean {
  return ANIMATION_RE.test(className);
}

export function isArbitraryZIndex(className: string): boolean {
  return Z_INDEX_RE.test(className);
}

export function isArbitraryShadow(className: string): boolean {
  return SHADOW_RE.test(className);
}

export function isArbitraryBorderRadius(className: string): boolean {
  return ROUNDED_RE.test(className);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
}

export function matchesAllowlist(
  className: string,
  allowlist: readonly (string | RegExp)[],
): boolean {
  return allowlist.some((entry) => {
    if (typeof entry === 'string') {
      if (entry.includes('*')) {
        entry = globToRegex(entry);
      } else {
        return entry === className;
      }
    }
    entry.lastIndex = 0;
    return entry.test(className);
  });
}

export function hasAllClasses(
  classNames: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((requiredClass) => classNames.includes(requiredClass));
}

export function hasAnyClass(
  classNames: readonly string[],
  candidates: readonly string[],
): boolean {
  return candidates.some((candidate) => classNames.includes(candidate));
}

export function isSizingToken(className: string): boolean {
  return SIZING_TOKEN_RE.test(className);
}

export function isFocusRingClass(className: string): boolean {
  return FOCUS_RING_RE.test(className);
}

export function isOutlineRemoval(className: string): boolean {
  return OUTLINE_REMOVAL_RE.test(className);
}

export function nearestSpacingToken(className: string, scale: readonly number[]): string | undefined {
  const match = LAYOUT_ARBITRARY_RE.exec(className);
  if (!match) return undefined;
  const prefix = match[1];
  const rawValue = match[2].trim();

  let px: number | undefined;
  if (rawValue.endsWith('px')) {
    px = parseFloat(rawValue.slice(0, -2));
  } else if (rawValue.endsWith('rem')) {
    px = parseFloat(rawValue.slice(0, -3)) * 16;
  }
  if (px === undefined || Number.isNaN(px)) return undefined;

  let nearest: number | undefined;
  let nearestDiff = Infinity;
  for (const token of scale) {
    const tokenPx = token * 4;
    const diff = Math.abs(tokenPx - px);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearest = token;
    }
  }

  if (nearest === undefined || nearestDiff > 1) return undefined;
  return `${prefix}-${nearest}`;
}

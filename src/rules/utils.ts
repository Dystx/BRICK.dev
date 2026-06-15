const LAYOUT_ARBITRARY_RE = /^(?:w|h|p|m|gap|px|py|mx|my|min-w|min-h|max-w|max-h|inset)-\[.*\]$/;
const COLOR_ARBITRARY_RE = /^(?:bg|text|border|ring|shadow|from|to|via|stroke|fill)-\[.*\]$/;
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
  return COLOR_ARBITRARY_RE.test(className);
}

export function matchesAllowlist(
  className: string,
  allowlist: readonly (string | RegExp)[],
): boolean {
  return allowlist.some((entry) => {
    if (typeof entry === 'string') return entry === className;
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

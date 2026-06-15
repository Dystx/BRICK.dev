import { describe, expect, it } from 'vitest';
import {
  splitClassName,
  isLayoutArbitrary,
  isArbitraryColor,
  matchesAllowlist,
  hasAllClasses,
  hasAnyClass,
  isSizingToken,
  isFocusRingClass,
  isOutlineRemoval,
} from '../../src/rules/utils';

describe('splitClassName', () => {
  it('splits on whitespace', () => {
    expect(splitClassName('a b c')).toEqual(['a', 'b', 'c']);
  });

  it('splits on multiple whitespace characters', () => {
    expect(splitClassName('a  b\tc\n d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores leading, trailing, and duplicate empty entries', () => {
    expect(splitClassName('  a  b  ')).toEqual(['a', 'b']);
  });

  it('returns an empty array for empty input', () => {
    expect(splitClassName('')).toEqual([]);
    expect(splitClassName('   ')).toEqual([]);
  });

  it('preserves duplicate classes', () => {
    expect(splitClassName('a a b')).toEqual(['a', 'a', 'b']);
  });
});

describe('isLayoutArbitrary', () => {
  it('returns true for layout arbitrary values', () => {
    expect(isLayoutArbitrary('w-[100px]')).toBe(true);
    expect(isLayoutArbitrary('h-[calc(100%-1rem)]')).toBe(true);
    expect(isLayoutArbitrary('p-[1rem]')).toBe(true);
    expect(isLayoutArbitrary('m-[10px]')).toBe(true);
    expect(isLayoutArbitrary('gap-[2rem]')).toBe(true);
    expect(isLayoutArbitrary('px-[1rem]')).toBe(true);
    expect(isLayoutArbitrary('py-[1rem]')).toBe(true);
    expect(isLayoutArbitrary('mx-[auto]')).toBe(true);
    expect(isLayoutArbitrary('my-[auto]')).toBe(true);
    expect(isLayoutArbitrary('min-w-[100px]')).toBe(true);
    expect(isLayoutArbitrary('min-h-[100px]')).toBe(true);
    expect(isLayoutArbitrary('max-w-[100px]')).toBe(true);
    expect(isLayoutArbitrary('max-h-[100px]')).toBe(true);
    expect(isLayoutArbitrary('inset-[0]')).toBe(true);
  });

  it('returns true for empty bracket content', () => {
    expect(isLayoutArbitrary('w-[]')).toBe(true);
  });

  it('returns false for non-arbitrary layout values', () => {
    expect(isLayoutArbitrary('w-10')).toBe(false);
    expect(isLayoutArbitrary('h-full')).toBe(false);
    expect(isLayoutArbitrary('p-4')).toBe(false);
  });

  it('returns false for unrelated arbitrary values', () => {
    expect(isLayoutArbitrary('bg-[red]')).toBe(false);
    expect(isLayoutArbitrary('text-[14px]')).toBe(false);
  });
});

describe('isArbitraryColor', () => {
  it('returns true for color arbitrary values', () => {
    expect(isArbitraryColor('bg-[red]')).toBe(true);
    expect(isArbitraryColor('text-[#fff]')).toBe(true);
    expect(isArbitraryColor('border-[blue]')).toBe(true);
    expect(isArbitraryColor('ring-[green]')).toBe(true);
    expect(isArbitraryColor('shadow-[#000]')).toBe(true);
    expect(isArbitraryColor('from-[blue]')).toBe(true);
    expect(isArbitraryColor('to-[purple]')).toBe(true);
    expect(isArbitraryColor('via-[pink]')).toBe(true);
    expect(isArbitraryColor('stroke-[red]')).toBe(true);
    expect(isArbitraryColor('fill-[yellow]')).toBe(true);
  });

  it('returns true for empty bracket content', () => {
    expect(isArbitraryColor('bg-[]')).toBe(true);
  });

  it('returns false for non-arbitrary color values', () => {
    expect(isArbitraryColor('bg-red-500')).toBe(false);
    expect(isArbitraryColor('text-white')).toBe(false);
  });

  it('returns false for layout arbitrary values', () => {
    expect(isArbitraryColor('w-[100px]')).toBe(false);
    expect(isArbitraryColor('p-[1rem]')).toBe(false);
  });
});

describe('matchesAllowlist', () => {
  it('matches exact strings', () => {
    expect(matchesAllowlist('btn', ['btn', 'card'])).toBe(true);
    expect(matchesAllowlist('link', ['btn', 'card'])).toBe(false);
  });

  it('matches regular expressions', () => {
    expect(matchesAllowlist('btn-primary', [/^btn-/])).toBe(true);
    expect(matchesAllowlist('card-primary', [/^btn-/])).toBe(false);
  });

  it('matches mixed allowlist entries', () => {
    const allowlist: (string | RegExp)[] = ['exact', /^prefix-/];
    expect(matchesAllowlist('exact', allowlist)).toBe(true);
    expect(matchesAllowlist('prefix-thing', allowlist)).toBe(true);
    expect(matchesAllowlist('other', allowlist)).toBe(false);
  });

  it('returns false for an empty allowlist', () => {
    expect(matchesAllowlist('btn', [])).toBe(false);
  });

  it('resets global regex lastIndex between calls', () => {
    const allowlist = [/^btn-/g];
    expect(matchesAllowlist('btn-primary', allowlist)).toBe(true);
    expect(matchesAllowlist('btn-secondary', allowlist)).toBe(true);
  });
});

describe('hasAllClasses', () => {
  it('returns true when all required classes are present', () => {
    expect(hasAllClasses(['a', 'b', 'c'], ['a', 'c'])).toBe(true);
  });

  it('returns false when any required class is missing', () => {
    expect(hasAllClasses(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('returns true for empty required list', () => {
    expect(hasAllClasses(['a', 'b'], [])).toBe(true);
  });

  it('handles empty class list', () => {
    expect(hasAllClasses([], [])).toBe(true);
    expect(hasAllClasses([], ['a'])).toBe(false);
  });
});

describe('hasAnyClass', () => {
  it('returns true when at least one candidate is present', () => {
    expect(hasAnyClass(['a', 'b', 'c'], ['c', 'd'])).toBe(true);
  });

  it('returns false when no candidates are present', () => {
    expect(hasAnyClass(['a', 'b'], ['c', 'd'])).toBe(false);
  });

  it('returns false for empty candidates list', () => {
    expect(hasAnyClass(['a', 'b'], [])).toBe(false);
  });

  it('handles empty class list', () => {
    expect(hasAnyClass([], [])).toBe(false);
    expect(hasAnyClass([], ['a'])).toBe(false);
  });
});

describe('isSizingToken', () => {
  it('returns true for sizing tokens', () => {
    expect(isSizingToken('h-10')).toBe(true);
    expect(isSizingToken('w-[100px]')).toBe(true);
    expect(isSizingToken('p-4')).toBe(true);
    expect(isSizingToken('min-w-0')).toBe(true);
    expect(isSizingToken('min-h-full')).toBe(true);
    expect(isSizingToken('px-4')).toBe(true);
    expect(isSizingToken('py-2')).toBe(true);
    expect(isSizingToken('size-4')).toBe(true);
    expect(isSizingToken('aspect-square')).toBe(true);
    expect(isSizingToken('aspect-[16/9]')).toBe(true);
  });

  it('returns false for non-sizing tokens', () => {
    expect(isSizingToken('m-4')).toBe(false);
    expect(isSizingToken('ml-4')).toBe(false);
    expect(isSizingToken('text-lg')).toBe(false);
    expect(isSizingToken('bg-red-500')).toBe(false);
  });

  it('returns false for bare prefixes', () => {
    expect(isSizingToken('h-')).toBe(false);
    expect(isSizingToken('w')).toBe(false);
  });
});

describe('isFocusRingClass', () => {
  it('returns true for focus ring classes', () => {
    expect(isFocusRingClass('focus:ring-2')).toBe(true);
    expect(isFocusRingClass('focus-visible:ring-4')).toBe(true);
    expect(isFocusRingClass('focus:ring-[3px]')).toBe(true);
  });

  it('returns false for non-focus ring classes', () => {
    expect(isFocusRingClass('ring-2')).toBe(false);
    expect(isFocusRingClass('focus:border-2')).toBe(false);
    expect(isFocusRingClass('focus-visible:shadow-lg')).toBe(false);
  });
});

describe('isOutlineRemoval', () => {
  it('returns true for outline removal classes', () => {
    expect(isOutlineRemoval('outline-none')).toBe(true);
    expect(isOutlineRemoval('focus:outline-none')).toBe(true);
    expect(isOutlineRemoval('focus-visible:outline-none')).toBe(true);
  });

  it('returns false for other outline classes', () => {
    expect(isOutlineRemoval('outline-2')).toBe(false);
    expect(isOutlineRemoval('focus:outline-2')).toBe(false);
    expect(isOutlineRemoval('outline')).toBe(false);
  });
});

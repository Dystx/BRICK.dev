import { parseFile as swcParseFile, parseSync } from '@swc/core';
import type { Module } from '@swc/core';
import { readFileSync } from 'node:fs';
import type { ClassNameFact } from '../types.js';

export interface ParseResult {
  ast: Module;
  nodeCount: number;
  /**
   * Byte offset to add to AST spans to map them back to the original source.
   * Used for transformed sources such as Astro templates wrapped in a JSX
   * fragment.
   */
  offset?: number;
  /**
   * Static class names extracted from non-JSX markup (e.g. Vue/Svelte
   * templates) that SWC cannot parse directly.
   */
  extraClassNames?: ClassNameFact[];
}

function syntaxFor(filePath: string): { syntax: 'typescript' | 'ecmascript'; jsx: boolean; tsx?: boolean } {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') {
    return { syntax: 'typescript', jsx: false, tsx: ext === 'tsx' };
  }
  return { syntax: 'ecmascript', jsx: ext === 'jsx' };
}

const ASTRO_FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---/;

function prepareAstroSource(source: string): { transformed: string; offset: number } {
  const match = ASTRO_FRONTMATTER_RE.exec(source);
  if (match) {
    const frontmatterLength = match[0].length;
    // Replace the frontmatter with a block comment of the exact same length
    // followed by a JSX fragment opener. This preserves byte offsets for the
    // template content while letting SWC parse multiple top-level JSX elements.
    const padding = 'A'.repeat(Math.max(0, frontmatterLength - 6));
    const prefix = `/*${padding}*/<>`;
    const transformed = prefix + source.slice(frontmatterLength) + '</>;';
    return { transformed, offset: 0 };
  }
  // No frontmatter: wrap the whole file in a fragment, shifting spans by 2.
  const transformed = '<>' + source + '</>;';
  return { transformed, offset: -2 };
}

const SCRIPT_BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/i;
const STYLE_BLOCK_RE = /<style\b([^>]*)>[\s\S]*?<\/style>/gi;
const VUE_TEMPLATE_RE = /<template\b[^>]*>([\s\S]*?)<\/template>/i;
const STATIC_CLASS_RE = /\sclass=["']([^"']+)["']/g;

function indexToLineColumn(source: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function findSkipRanges(source: string, re: RegExp): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (const match of source.matchAll(global)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function extractStaticClassNames(source: string, ext: 'vue' | 'svelte'): ClassNameFact[] {
  const facts: ClassNameFact[] = [];

  if (ext === 'vue') {
    const templateMatch = VUE_TEMPLATE_RE.exec(source);
    if (!templateMatch) return [];
    const openingTagEnd = templateMatch[0].indexOf('>') + 1;
    const contentStart = (templateMatch.index ?? 0) + openingTagEnd;
    const contentEnd = contentStart + templateMatch[1].length;
    const content = source.slice(contentStart, contentEnd);

    STATIC_CLASS_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STATIC_CLASS_RE.exec(content)) !== null) {
      const value = match[1];
      const valueStart = contentStart + match.index + match[0].indexOf(value);
      const { line, column } = indexToLineColumn(source, valueStart);
      facts.push({ value, line, column });
    }
    return facts;
  }

  // Svelte: search the whole file but skip script/style blocks.
  const skipRanges = [...findSkipRanges(source, SCRIPT_BLOCK_RE), ...findSkipRanges(source, STYLE_BLOCK_RE)];
  STATIC_CLASS_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STATIC_CLASS_RE.exec(source)) !== null) {
    if (skipRanges.some((range) => match!.index >= range.start && match!.index < range.end)) {
      continue;
    }
    const value = match[1];
    const valueStart = match.index + match[0].indexOf(value);
    const { line, column } = indexToLineColumn(source, valueStart);
    facts.push({ value, line, column });
  }
  return facts;
}

function prepareScriptSource(
  source: string,
): { transformed: string; syntax: 'typescript' | 'ecmascript'; jsx: boolean } {
  const match = SCRIPT_BLOCK_RE.exec(source);
  if (!match) {
    return { transformed: '', syntax: 'ecmascript', jsx: false };
  }

  const openingTagEnd = match[0].indexOf('>') + 1;
  const openingTag = match[0].slice(0, openingTagEnd);
  const scriptStart = (match.index ?? 0) + openingTagEnd;
  const scriptEnd = (match.index ?? 0) + match[0].length - '</script>'.length;

  // Preserve original line numbers and byte offsets by replacing every
  // non-newline character before the script content with a space.
  const prefix = source.slice(0, scriptStart).replace(/[^\r\n]/g, ' ');
  const transformed = prefix + source.slice(scriptStart, scriptEnd);
  const isTs = /lang\s*=\s*["']ts["']/i.test(openingTag);
  return { transformed, syntax: isTs ? 'typescript' : 'ecmascript', jsx: false };
}

export async function parseFile(filePath: string): Promise<ParseResult> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'astro') {
    const source = readFileSync(filePath, 'utf-8');
    const { transformed, offset } = prepareAstroSource(source);
    const ast = parseSync(transformed, {
      syntax: 'typescript',
      tsx: true,
      target: 'es2022',
    });
    return { ast, nodeCount: countNodes(ast), offset };
  }

  if (ext === 'vue' || ext === 'svelte') {
    const source = readFileSync(filePath, 'utf-8');
    const { transformed, syntax } = prepareScriptSource(source);
    const extraClassNames = extractStaticClassNames(source, ext);
    const ast =
      syntax === 'typescript'
        ? parseSync(transformed, {
            syntax: 'typescript',
            target: 'es2022',
          })
        : parseSync(transformed, {
            syntax: 'ecmascript',
            target: 'es2022',
          });
    return { ast, nodeCount: countNodes(ast), offset: 0, extraClassNames };
  }

  const { syntax, jsx, tsx } = syntaxFor(filePath);
  const ast = await swcParseFile(filePath, {
    syntax,
    jsx,
    tsx,
    target: 'es2022',
  });
  return { ast, nodeCount: countNodes(ast), offset: 0 };
}

function countNodes(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0;
  let count = 1;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        count += countNodes(item);
      }
    } else if (typeof value === 'object' && value !== null) {
      count += countNodes(value);
    }
  }
  return count;
}

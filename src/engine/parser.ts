import { parseFile as swcParseFile, parseSync } from '@swc/core';
import type { Module } from '@swc/core';
import { readFileSync } from 'node:fs';

export interface ParseResult {
  ast: Module;
  nodeCount: number;
  /**
   * Byte offset to add to AST spans to map them back to the original source.
   * Used for transformed sources such as Astro templates wrapped in a JSX
   * fragment.
   */
  offset?: number;
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
    return { ast, nodeCount: countNodes(ast), offset: 0 };
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

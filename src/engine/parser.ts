import { parseFile as swcParseFile } from '@swc/core';
import type { Module } from '@swc/core';

export interface ParseResult {
  ast: Module;
  nodeCount: number;
}

function syntaxFor(filePath: string): { syntax: 'typescript' | 'ecmascript'; jsx: boolean; tsx?: boolean } {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') {
    return { syntax: 'typescript', jsx: false, tsx: ext === 'tsx' };
  }
  return { syntax: 'ecmascript', jsx: ext === 'jsx' };
}

export async function parseFile(filePath: string): Promise<ParseResult> {
  const { syntax, jsx, tsx } = syntaxFor(filePath);
  const ast = await swcParseFile(filePath, {
    syntax,
    jsx,
    tsx,
    target: 'es2022',
  });
  return { ast, nodeCount: countNodes(ast) };
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

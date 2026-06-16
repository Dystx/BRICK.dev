import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src/engine/parser';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slop-audit-parser-test-'));

describe('parseFile', () => {
  it('parses a TSX file', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Button.tsx');
      writeFileSync(file, `export function Button() { return <button>Hi</button>; }`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(5);
      expect(result.offset).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on invalid syntax', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'bad.tsx');
      writeFileSync(file, `export function Button() { return <button>`);
      await expect(parseFile(file)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses an Astro file with frontmatter', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Page.astro');
      writeFileSync(
        file,
        `---\nconst title = 'Hi';\n---\n<div client:load>{title}</div>\n<button onClick={() => alert('x')}>Click</button>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(5);
      expect(result.offset).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses an Astro file without frontmatter', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Card.astro');
      writeFileSync(file, `<div client:visible>Hello</div>`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(0);
      expect(result.offset).toBe(-2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a Vue SFC script block', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Counter.vue');
      writeFileSync(
        file,
        `<template>\n  <button @click=\"inc\">{{ count }}</button>\n</template>\n<script setup lang=\"ts\">\nconst count = 0;\nfunction inc() { count++; }\n</script>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(5);
      expect(result.offset).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a Svelte component script block', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Counter.svelte');
      writeFileSync(
        file,
        `<script lang=\"ts\">\n  export let count = 0;\n  function inc() { count++; }\n</script>\n<button on:click={inc}>{count}</button>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.nodeCount).toBeGreaterThan(5);
      expect(result.offset).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

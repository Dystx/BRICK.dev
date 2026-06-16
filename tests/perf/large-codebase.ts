import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
// Import uses `.js` extension so `tsx` resolves the ESM module consistently.
import { scanProject } from '../../src/index.js';

const parsedBudget = parseInt(process.env.SLOP_AUDIT_PERF_BUDGET_MS ?? '8000', 10);
const BUDGET_MS = Number.isNaN(parsedBudget) ? 8_000 : parsedBudget;
const WORKER_SCRIPT = resolve('dist/engine/worker.js');

const TOKEN_CLASSES = [
  'p-4',
  'm-4',
  'rounded-md',
  'bg-white',
  'text-red-500',
  'text-blue-600',
  'shadow-lg',
  'border',
  'border-gray-200',
  'hover:bg-gray-50',
  'focus:ring-2',
  'flex',
  'flex-col',
  'gap-4',
];

const ARBITRARY_CLASSES = [
  'w-[100px]',
  'h-[calc(100%-1rem)]',
  'top-[123px]',
  'left-[50%]',
  'p-[20px]',
  'm-[20px]',
  'rounded-[8px]',
  'text-[14px]',
  'leading-[1.5]',
];

const RULE_TRIGGERING_CLASSES = [
  'outline-none',
  'm-[20px]',
  'flex',
  'items-center',
  'justify-center',
  'w-[100px]',
  'h-8',
];

const HOOK_VARIANTS = [
  `const [count, setCount] = useState(0);`,
  `const [value, setValue] = useState('');`,
  `const [open, setOpen] = useState(false);`,
  `const [items, setItems] = useState([]);`,
];

function generateComponent(fileIndex: number, compIndex: number): string {
  const name = `Component${fileIndex}_${compIndex}`;
  const token = TOKEN_CLASSES.slice(compIndex % TOKEN_CLASSES.length).join(' ');
  const arbitrary = ARBITRARY_CLASSES.slice((compIndex + 3) % ARBITRARY_CLASSES.length).join(' ');
  const triggering = RULE_TRIGGERING_CLASSES.slice((compIndex + 7) % RULE_TRIGGERING_CLASSES.length).join(' ');
  const hook = HOOK_VARIANTS[compIndex % HOOK_VARIANTS.length];
  const unusedState = compIndex % 5 === 0 ? `const [unused] = useState(null);` : '';

  return `
export function ${name}() {
  ${hook}
  ${unusedState}
  return (
    <div className="${token} ${arbitrary} ${triggering}">
      <span>Hello ${name}</span>
    </div>
  );
}
`;
}

function generateFile(fileIndex: number): string {
  const componentsPerFile = 10 + (fileIndex % 4);
  const components: string[] = [];
  for (let i = 0; i < componentsPerFile; i++) {
    components.push(generateComponent(fileIndex, i));
  }

  return `import React, { useState } from 'react';

${components.join('\n')}
`;
}

function createFixture(cwd: string): { fileCount: number; componentCount: number } {
  const srcDir = join(cwd, 'src');
  mkdirSync(srcDir, { recursive: true });

  const fileCount = 175;
  let componentCount = 0;
  for (let i = 0; i < fileCount; i++) {
    const filePath = join(srcDir, `page-${i}.tsx`);
    writeFileSync(filePath, generateFile(i), 'utf-8');
    componentCount += 10 + (i % 4);
  }

  return { fileCount, componentCount };
}

async function main(): Promise<void> {
  if (!existsSync(WORKER_SCRIPT)) {
    console.error(
      `Worker script not found: ${WORKER_SCRIPT}\nRun \`pnpm build\` first to build the worker bundle.`,
    );
    process.exit(2);
  }

  const fixtureDir = mkdtempSync(join(tmpdir(), 'slop-audit-perf-'));
  let exitCode: 0 | 1 | 2 = 0;
  let message: string | undefined;

  try {
    const expected = createFixture(fixtureDir);
    const start = performance.now();
    const report = await scanProject({
      cwd: fixtureDir,
      workerScript: WORKER_SCRIPT,
    });
    const elapsed = Math.round(performance.now() - start);

    const issueCount = report.issues.length;
    const passed = elapsed <= BUDGET_MS;
    const status = passed ? 'PASS' : 'FAIL';

    if (report.componentCount !== expected.componentCount) {
      exitCode = 2;
      message = `Component count mismatch: expected ${expected.componentCount}, got ${report.componentCount}`;
    } else {
      exitCode = passed ? 0 : 1;
      message = `${status}: files=${expected.fileCount} components=${report.componentCount}/${expected.componentCount} issues=${issueCount} elapsed=${elapsed}ms budget=${BUDGET_MS}ms`;
    }
  } catch (err) {
    exitCode = 2;
    message = `Benchmark setup/execution failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    try {
      rmSync(fixtureDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }

  if (message) {
    if (exitCode === 0) {
      console.log(message);
    } else {
      console.error(message);
    }
  }
  process.exit(exitCode);
}

main();

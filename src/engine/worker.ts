import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseFile } from './parser';
import { extractFacts } from './visitor';
import { RuleRegistry } from '../rules/registry';
import type { FileScanResult, ResolvedConfig } from '../types';

/**
 * Scan a single file for slop issues.
 *
 * @param registry Optional registry to reuse. When omitted, a fresh registry
 *                 with built-in rules is created automatically.
 */
export async function scanFile(
  filePath: string,
  config: ResolvedConfig,
  registry?: RuleRegistry,
): Promise<FileScanResult> {
  try {
    const { ast, nodeCount, offset } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, nodeCount, offset);

    const activeRegistry = registry ?? new RuleRegistry();
    if (!registry) {
      activeRegistry.loadBuiltins();
    }
    const rules = activeRegistry.createContexts(config, filePath);
    const issues = rules.flatMap(({ rule, context }) => rule.analyze(context, facts));

    return {
      filePath,
      componentCount: facts.components.length,
      astNodeCount: nodeCount,
      issues,
    };
  } catch (err) {
    return {
      filePath,
      componentCount: 0,
      astNodeCount: 0,
      issues: [],
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function run(): Promise<void> {
  if (!workerData || typeof workerData !== 'object' || Array.isArray(workerData)) {
    throw new Error('workerData must be an object with filePaths and config');
  }
  const data = workerData as { filePaths: unknown; config: unknown };
  if (
    !Array.isArray(data.filePaths) ||
    !data.filePaths.every((p): p is string => typeof p === 'string')
  ) {
    throw new Error('workerData.filePaths must be an array of strings');
  }
  if (
    !data.config ||
    typeof data.config !== 'object' ||
    Array.isArray(data.config)
  ) {
    throw new Error('workerData.config must be a ResolvedConfig object');
  }
  const { filePaths, config } = data as { filePaths: string[]; config: ResolvedConfig };

  const registry = new RuleRegistry();
  registry.loadBuiltins();

  for (const filePath of filePaths) {
    const result = await scanFile(filePath, config, registry);
    parentPort?.postMessage(result);
  }
}

if (!isMainThread) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
    parentPort?.close();
  });
}

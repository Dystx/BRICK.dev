import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';
import type { FileScanResult, ResolvedConfig } from '../types';

export interface WorkerPoolOptions {
  threadCount?: number;
  workerScript?: string;
  config: ResolvedConfig;
  workerTimeoutMs?: number;
}

const MAX_RETRIES = 1;
const DEFAULT_WORKER_TIMEOUT_MS = 60_000;

function defaultWorkerScript(): string {
  // When this module is bundled into dist/index.js, the worker lives under
  // dist/engine/worker.js. When used directly from dist/engine/pool.js, the
  // worker is a sibling. Try the sibling first, then fall back to the bundled
  // location so the default works regardless of how WorkerPool is loaded.
  const sibling = fileURLToPath(new URL('./worker.js', import.meta.url));
  if (existsSync(sibling)) return sibling;
  return fileURLToPath(new URL('./engine/worker.js', import.meta.url));
}

export class WorkerPool {
  private workerScript: string;
  private config: ResolvedConfig;
  private threadCount: number;
  private workerTimeoutMs: number;

  constructor(options: WorkerPoolOptions) {
    this.config = options.config;
    this.workerTimeoutMs = options.workerTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
    const requested = options.threadCount ?? Math.max(1, cpus().length - 1);
    if (requested <= 0) throw new Error('threadCount must be > 0');
    this.threadCount = requested;
    this.workerScript = options.workerScript ?? defaultWorkerScript();
  }

  async scan(filePaths: string[]): Promise<FileScanResult[]> {
    if (filePaths.length === 0) return [];
    const results: FileScanResult[] = [];
    const seen = new Set<string>();
    const batches: string[][] = Array.from({ length: this.threadCount }, () => []);
    for (let i = 0; i < filePaths.length; i++) {
      batches[i % this.threadCount].push(filePaths[i]);
    }

    await Promise.all(batches.filter((batch) => batch.length > 0).map((batch) => this.runWorker(batch, results, seen)));
    return results;
  }

  private runWorker(batch: string[], results: FileScanResult[], seen: Set<string>): Promise<void> {
    return new Promise((res) => {
      let retries = 0;
      let settled = false;
      let currentWorker: Worker | undefined;
      let lastError: Error | undefined;

      const cleanup = (worker: Worker, timer: ReturnType<typeof setTimeout>) => {
        clearTimeout(timer);
        worker.terminate().catch(() => {});
      };

      const recordFailures = (reason: string): void => {
        for (const filePath of batch) {
          if (!seen.has(filePath)) {
            seen.add(filePath);
            results.push({
              filePath,
              componentCount: 0,
              astNodeCount: 0,
              issues: [],
              parseError: `PARSE_ERROR: ${reason}`,
            });
          }
        }
      };

      const spawn = () => {
        const worker = new Worker(this.workerScript, {
          workerData: { filePaths: batch, config: this.config },
        });
        currentWorker = worker;

        const timer = setTimeout(() => {
          if (settled) return;
          cleanup(worker, timer);
          if (retries < MAX_RETRIES) {
            retries++;
            console.error(`Worker timed out after ${this.workerTimeoutMs}ms; retrying (${retries}/${MAX_RETRIES})`);
            spawn();
          } else {
            settled = true;
            recordFailures(`worker timed out after ${this.workerTimeoutMs}ms`);
            res();
          }
        }, this.workerTimeoutMs);

        worker.on('message', (msg: FileScanResult) => {
          if (worker !== currentWorker || settled) return;
          if (!seen.has(msg.filePath)) {
            seen.add(msg.filePath);
            results.push(msg);
          }
        });

        worker.on('error', (err) => {
          if (worker !== currentWorker || settled) return;
          cleanup(worker, timer);
          lastError = err;
          console.error('Worker error:', err);
          if (retries < MAX_RETRIES) {
            retries++;
            spawn();
          } else {
            settled = true;
            recordFailures(lastError?.message ?? 'worker crashed');
            res();
          }
        });

        worker.on('exit', (code) => {
          if (worker !== currentWorker || settled) return;
          cleanup(worker, timer);
          if (code === 0) {
            settled = true;
            res();
          } else {
            const err = lastError ?? new Error(`Worker exited with code ${code}`);
            console.error(`Worker exited with code ${code}`);
            if (retries < MAX_RETRIES) {
              retries++;
              lastError = undefined;
              spawn();
            } else {
              settled = true;
              recordFailures(err.message);
              res();
            }
          }
        });
      };

      spawn();
    });
  }
}

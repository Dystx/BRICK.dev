import { readFileSync } from 'node:fs';
import type { Issue, ProjectReport } from '../types.js';
import { applyLayoutTokenFix } from '../fix/layout-token.js';
import { applyUseClientFix } from '../fix/use-client.js';
import { computeFocusRingPatch } from '../fix/focus-ring.js';

type DiffOp =
  | { type: 'equal'; line: string }
  | { type: 'delete'; line: string }
  | { type: 'insert'; line: string };

function diffLines(oldLines: string[], newLines: string[]): DiffOp[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? 1 + dp[i + 1][j + 1]
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'equal', line: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'delete', line: oldLines[i] });
      i++;
    } else {
      ops.push({ type: 'insert', line: newLines[j] });
      j++;
    }
  }
  while (i < m) {
    ops.push({ type: 'delete', line: oldLines[i] });
    i++;
  }
  while (j < n) {
    ops.push({ type: 'insert', line: newLines[j] });
    j++;
  }
  return ops;
}

const CONTEXT = 3;

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

function formatUnifiedDiff(
  oldPath: string,
  newPath: string,
  oldLines: string[],
  newLines: string[],
): string {
  const ops = diffLines(oldLines, newLines);
  if (ops.every((op) => op.type === 'equal')) {
    return '';
  }

  const hunks: Hunk[] = [];
  let current: Hunk | undefined;
  let oldLine = 0;
  let newLine = 0;

  const flush = (nextContextBegin?: number): void => {
    if (!current) return;
    // Trim trailing context to at most CONTEXT lines.
    let trailingContext = 0;
    for (let k = current.lines.length - 1; k >= 0 && current.lines[k].startsWith(' '); k--) {
      trailingContext++;
    }
    const keepContext = Math.min(trailingContext, CONTEXT);
    const removeTrailing = trailingContext - keepContext;
    if (removeTrailing > 0) {
      current.lines.splice(current.lines.length - removeTrailing, removeTrailing);
      current.oldCount -= removeTrailing;
      current.newCount -= removeTrailing;
    }
    hunks.push(current);
    current = undefined;
  };

  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    if (op.type === 'equal') {
      oldLine++;
      newLine++;
      if (current) {
        // Add context lines after a change until we reach the maximum context window.
        current.lines.push(` ${op.line}`);
        current.oldCount++;
        current.newCount++;

        // Look ahead to see if the next change is more than CONTEXT away.
        let nextChange = idx + 1;
        while (nextChange < ops.length && ops[nextChange].type === 'equal') {
          nextChange++;
        }
        if (nextChange - idx > CONTEXT) {
          flush();
        }
      }
      continue;
    }

    if (!current) {
      // Start a new hunk with up to CONTEXT leading context lines.
      const start = Math.max(0, idx - CONTEXT);
      const leadingOps = ops.slice(start, idx);
      const oldStart = oldLine - leadingOps.filter((o) => o.type !== 'insert').length;
      const newStart = newLine - leadingOps.filter((o) => o.type !== 'delete').length;
      const lines: string[] = leadingOps.map((o) => ` ${o.line}`);
      current = {
        oldStart: oldStart + 1,
        oldCount: leadingOps.filter((o) => o.type !== 'insert').length,
        newStart: newStart + 1,
        newCount: leadingOps.filter((o) => o.type !== 'delete').length,
        lines,
      };
    }

    if (op.type === 'delete') {
      oldLine++;
      current.lines.push(`-${op.line}`);
      current.oldCount++;
    } else if (op.type === 'insert') {
      newLine++;
      current.lines.push(`+${op.line}`);
      current.newCount++;
    }
  }
  flush();

  const header = [`--- a/${oldPath}`, `+++ b/${newPath}`];
  const body = hunks.map((hunk) => {
    const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
    return [hunkHeader, ...hunk.lines].join('\n');
  });
  return [...header, ...body].join('\n');
}

interface Patch {
  filePath: string;
  diff: string;
  skipped: { ruleId: string; reason: string }[];
}

function applyFixToSource(source: string, issue: Issue): { source: string; applied: boolean; reason?: string } {
  if (!issue.fix) {
    return { source, applied: false, reason: 'No fix suggestion' };
  }

  switch (issue.fix.kind) {
    case 'insert':
      return applyUseClientFix(source, issue);
    case 'replace':
      return applyLayoutTokenFix(source, issue);
    default:
      return { source, applied: false, reason: 'Unsupported fix kind for source diff' };
  }
}

export function generateFixDiffs(report: ProjectReport): Patch[] {
  const byFile = new Map<string, Issue[]>();
  for (const issue of report.issues) {
    if (!issue.fix) continue;
    const filePath = issue.fix.targetFile ?? issue.filePath;
    if (!filePath) continue;
    const list = byFile.get(filePath) ?? [];
    list.push(issue);
    byFile.set(filePath, list);
  }

  const patches: Patch[] = [];

  for (const [filePath, issues] of byFile.entries()) {
    const sourceIssues = issues.filter((issue) => issue.fix?.kind !== 'css-anchor');
    const cssIssues = issues.filter((issue) => issue.fix?.kind === 'css-anchor');

    let original = '';
    try {
      original = readFileSync(filePath, 'utf-8');
    } catch {
      patches.push({
        filePath,
        diff: '',
        skipped: issues.map((issue) => ({
          ruleId: issue.ruleId,
          reason: 'Could not read source file',
        })),
      });
      continue;
    }

    let modified = original;
    const skipped: { ruleId: string; reason: string }[] = [];

    for (const issue of sourceIssues) {
      const previous = modified;
      const result = applyFixToSource(modified, issue);
      if (result.applied) {
        modified = result.source;
      } else {
        modified = previous;
        skipped.push({
          ruleId: issue.ruleId,
          reason: result.reason ?? 'Could not apply fix',
        });
      }
    }

    if (cssIssues.length > 0) {
      const patch = computeFocusRingPatch(modified, cssIssues[0]);
      if (patch) {
        modified = patch.modified;
      } else {
        for (const issue of cssIssues) {
          skipped.push({
            ruleId: issue.ruleId,
            reason: 'Focus-ring CSS block already present',
          });
        }
      }
    }

    const oldLines = original.split('\n');
    const newLines = modified.split('\n');
    const diff = formatUnifiedDiff(filePath, filePath, oldLines, newLines);

    patches.push({ filePath, diff, skipped });
  }

  return patches;
}

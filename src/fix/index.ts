import { readFileSync, writeFileSync } from 'node:fs';
import type { FixApplication, FixResult, Issue } from '../types.js';
import { applyFocusRingFix } from './focus-ring.js';
import { applyLayoutTokenFix } from './layout-token.js';
import { applyUseClientFix } from './use-client.js';

export type { FixApplication, FixResult };
export { applyFocusRingFix } from './focus-ring.js';
export { applyLayoutTokenFix } from './layout-token.js';
export { applyUseClientFix } from './use-client.js';

function makeApplication(issue: Issue): FixApplication {
  return {
    ruleId: issue.ruleId,
    description: issue.fix?.description ?? issue.message,
    line: issue.line,
    column: issue.column,
  };
}

export function applyFixes(issues: Issue[]): FixResult[] {
  const byFile = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!issue.fix) continue;
    const filePath = issue.fix.targetFile ?? issue.filePath;
    if (!filePath) continue;
    const list = byFile.get(filePath) ?? [];
    list.push(issue);
    byFile.set(filePath, list);
  }

  const results: FixResult[] = [];

  for (const [filePath, fileIssues] of byFile.entries()) {
    const applied: FixApplication[] = [];
    const skipped: FixApplication[] = [];

    // CSS-anchor fixes mutate a shared CSS file directly and do not touch source text.
    const sourceIssues = fileIssues.filter((issue) => issue.fix?.kind !== 'css-anchor');
    const cssIssues = fileIssues.filter((issue) => issue.fix?.kind === 'css-anchor');

    if (sourceIssues.length > 0) {
      let source: string;
      let sourceReadFailed = false;
      try {
        source = readFileSync(filePath, 'utf-8');
      } catch {
        sourceReadFailed = true;
        for (const issue of sourceIssues) {
          skipped.push({ ...makeApplication(issue), reason: 'Could not read source file' });
        }
        source = '';
      }

      if (!sourceReadFailed) {
        let modified = source;
        for (const issue of sourceIssues) {
          const app = makeApplication(issue);
          if (issue.fix?.kind === 'insert') {
            const result = applyUseClientFix(modified, issue);
            if (result.applied) {
              modified = result.source;
              applied.push(app);
            } else {
              skipped.push({ ...app, reason: result.reason ?? 'Could not apply use-client fix' });
            }
          } else if (issue.fix?.kind === 'replace') {
            const result = applyLayoutTokenFix(modified, issue);
            if (result.applied) {
              modified = result.source;
              applied.push(app);
            } else {
              skipped.push({ ...app, reason: result.reason ?? 'Could not apply layout-token fix' });
            }
          } else {
            skipped.push({ ...app, reason: 'Unsupported fix kind' });
          }
        }

        if (modified !== source) {
          try {
            writeFileSync(filePath, modified);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            for (const app of applied.splice(0, applied.length)) {
              skipped.push({ ...app, reason: `Could not write source file: ${message}` });
            }
          }
        }
      }
    }

    for (const issue of cssIssues) {
      const app = makeApplication(issue);
      const result = applyFocusRingFix(issue);
      if (result.applied) {
        applied.push(app);
      } else {
        skipped.push({ ...app, reason: result.reason ?? 'Could not apply focus-ring fix' });
      }
    }

    results.push({ filePath, applied, skipped });
  }

  return results;
}

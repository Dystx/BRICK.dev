import type { ProjectReport } from '../types.js';

export function formatJson(report: ProjectReport): string {
  return JSON.stringify(report, null, 2);
}

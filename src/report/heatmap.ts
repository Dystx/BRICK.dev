import chalk from 'chalk';
import type { GitFileStats } from '../git.js';
import type { ProjectReport } from '../types.js';

interface HeatmapRow {
  filePath: string;
  adjustedScore: number;
  recencyWeight: number;
  churnWeight: number;
  roi: number;
}

function computeRoi(score: number, stats?: GitFileStats): Pick<HeatmapRow, 'recencyWeight' | 'churnWeight' | 'roi'> {
  const recencyWeight = stats?.recent ? 1.5 : 1.0;
  const churnWeight = 1 + Math.min((stats?.editCount ?? 0) / 10, 1.0);
  const roi = score * recencyWeight * churnWeight;

  return {
    recencyWeight,
    churnWeight,
    roi,
  };
}

export function formatHeatmap(
  report: ProjectReport,
  stats: Record<string, GitFileStats>,
): string {
  const rows: HeatmapRow[] = report.components
    .map((component) => {
      const weights = computeRoi(component.adjustedScore, stats[component.filePath]);
      return {
        filePath: component.filePath,
        adjustedScore: component.adjustedScore,
        recencyWeight: weights.recencyWeight,
        churnWeight: weights.churnWeight,
        roi: weights.roi,
      };
    })
    .sort((a, b) => b.roi - a.roi);

  const header = chalk.bold('Migration ROI Heatmap');
  const legend = chalk.dim('(ROI = adjustedScore × recencyWeight × churnWeight)');

  if (rows.length === 0) {
    return [header, legend, '', 'No components to rank.'].join('\n');
  }

  const maxFileLength = Math.max(
    'File'.length,
    ...rows.map((row) => row.filePath.length),
  );

  const tableHeader = [
    'ROI'.padStart(6, ' '),
    'Score'.padStart(6, ' '),
    'Recent'.padStart(6, ' '),
    'Edits'.padStart(5, ' '),
    'File'.padEnd(maxFileLength, ' '),
  ].join('  ');
  const separator = [
    ''.padStart(6, '─'),
    ''.padStart(6, '─'),
    ''.padStart(6, '─'),
    ''.padStart(5, '─'),
    ''.padEnd(maxFileLength, '─'),
  ].join('  ');

  const tableRows = rows.map((row) => {
    const roiCell = row.roi.toFixed(1).padStart(6, ' ');
    const scoreCell = row.adjustedScore.toFixed(1).padStart(6, ' ');
    const recentCell = (row.recencyWeight > 1 ? 'yes' : 'no').padStart(6, ' ');
    const editsCell = String(stats[row.filePath]?.editCount ?? 0).padStart(5, ' ');
    const fileCell = row.filePath.padEnd(maxFileLength, ' ');
    return [roiCell, scoreCell, recentCell, editsCell, fileCell].join('  ');
  });

  return [header, legend, '', tableHeader, separator, ...tableRows].join('\n');
}

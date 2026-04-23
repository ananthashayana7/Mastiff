const ASSEMBLY_LINE_HINT = /(assembly|line|shift|operator|checker|engineer|qa|defect|reject|rework|throughput|cycle[_\s-]?time|downtime|station|production|yield|quality|totalcount)/i;
const FINANCIAL_FILE_HINT = /(revenue|sales|profit|margin|cost|expense|ebit|ebitda|income|refund|gmv|arpu|cash|budget|forecast|pat|pbt|balance\s*sheet|p&l|profit\s*and\s*loss)/i;
const FINANCIAL_QUERY_HINT = /(financial|finance|revenue|income|expense|profit|loss|margin|ebit|ebitda|pat|pbt|cash\s*flow|balance\s*sheet|p&l|profit\s*and\s*loss)/i;

export type DatasetDomain = 'assembly_line' | 'financial' | 'general';

interface GuardFileShape {
  filename?: string | null;
  fileType?: string | null;
  metadata?: {
    columns?: Record<string, unknown> | null;
  } | null;
}

function collectSignalText(files: GuardFileShape[]): string {
  return files
    .map((file) => [
      file.filename || '',
      file.fileType || '',
      ...Object.keys(file.metadata?.columns || {}),
    ].join(' '))
    .join(' ');
}

export function detectDatasetDomain(files: GuardFileShape[]): DatasetDomain {
  const combined = collectSignalText(files);
  if (ASSEMBLY_LINE_HINT.test(combined)) return 'assembly_line';
  if (FINANCIAL_FILE_HINT.test(combined)) return 'financial';
  return 'general';
}

export function shouldWarnOnFinancialDatasetMismatch(
  content: string,
  files: GuardFileShape[],
  hasPastedData: boolean,
): boolean {
  // Domain hints are useful for choosing analysis templates, but they should
  // never block the user from getting best-effort insights on the active data.
  void content;
  void files;
  void hasPastedData;
  return false;
}

export function buildFinancialDatasetMismatchMessage(files: GuardFileShape[]): string {
  const names = files.map((file) => file.filename).filter((value): value is string => Boolean(value));
  const columns = Array.from(new Set(
    files.flatMap((file) => Object.keys(file.metadata?.columns || {}))
  )).slice(0, 8);

  const datasetLabel = names.length > 0 ? names.join(', ') : 'the active dataset';
  const columnHint = columns.length > 0 ? `Visible fields: ${columns.join(', ')}.` : '';

  return [
    `Using ${datasetLabel} as the active dataset for best-effort analysis.`,
    columnHint,
    'I will map the request to the strongest available rows, columns, numeric signals, anomalies, and actions without requiring a special workbook format.',
  ].filter(Boolean).join(' ');
}

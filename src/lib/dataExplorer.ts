import type { DataFile } from '../types';

type ColumnKind = 'numeric' | 'date' | 'categorical' | 'text' | 'boolean' | 'unknown';
type OperationalDomain = 'assembly_line' | 'financial' | 'general';

interface ColumnInfo {
  name: string;
  kind: ColumnKind;
  fillRate: number;
  uniqueCount: number;
  sampleValues: unknown[];
}

export interface FileQualitySummary {
  qualityScore: number;
  completeness: number;
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  sparseColumns: string[];
  suspiciousColumns: string[];
  keyCandidateColumns: string[];
}

const ASSEMBLY_LINE_HINT = /(assembly|line|shift|operator|checker|engineer|qa|defect|reject|rework|throughput|cycle[_\s-]?time|downtime|station|production|yield|quality)/i;
const FINANCIAL_HINT = /(revenue|sales|profit|margin|cost|expense|ebit|ebitda|income|refund|gmv|arpu|cash|budget|forecast)/i;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function looksDateLike(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

export function classifyColumnKind(dtype?: string, sampleValues: unknown[] = []): ColumnKind {
  const normalized = (dtype || '').toLowerCase();

  if (normalized.includes('bool')) return 'boolean';
  if (/(int|float|double|decimal|number|numeric)/.test(normalized)) return 'numeric';
  if (/(date|time|timestamp)/.test(normalized)) return 'date';
  if (/(category|enum)/.test(normalized)) return 'categorical';
  if (/(text|string|object)/.test(normalized)) {
    const dateLikeSamples = sampleValues.filter(looksDateLike).length;
    if (sampleValues.length > 0 && dateLikeSamples >= Math.ceil(sampleValues.length * 0.6)) {
      return 'date';
    }

    return 'text';
  }

  return 'unknown';
}

function buildColumnInventory(file: DataFile): ColumnInfo[] {
  return file.columns.map((columnName) => {
    const info = file.metadata?.columns?.[columnName];
    const kind = classifyColumnKind(info?.dtype, info?.sample_values || []);

    return {
      name: columnName,
      kind,
      fillRate: info ? clamp(100 - info.null_percentage, 0, 100) : 100,
      uniqueCount: info?.unique_count || 0,
      sampleValues: info?.sample_values || [],
    };
  });
}

function collectDomainSignalText(file: DataFile): string {
  const parts = [
    file.name,
    file.type,
    ...file.columns,
  ];

  return parts.join(' ');
}

export function summarizeFileQuality(file: DataFile): FileQualitySummary {
  const inventory = buildColumnInventory(file);
  const rowCount = file.metadata?.row_count || file.preview.length || 0;
  const completeness = inventory.length > 0
    ? inventory.reduce((sum, column) => sum + column.fillRate, 0) / inventory.length
    : 100;

  const suspiciousColumns = file.columns.filter((column) => /^(column_\d+|unnamed:?\s*\d*)$/i.test(column));
  const sparseColumns = inventory.filter((column) => column.fillRate < 55).map((column) => column.name);
  const numericColumns = inventory.filter((column) => column.kind === 'numeric').map((column) => column.name);
  const dateColumns = inventory.filter((column) => column.kind === 'date').map((column) => column.name);
  const categoricalColumns = inventory
    .filter((column) => column.kind === 'categorical' || (column.kind === 'text' && column.uniqueCount > 0 && column.uniqueCount <= Math.max(25, Math.floor(rowCount * 0.25))))
    .map((column) => column.name);
  const keyCandidateColumns = inventory
    .filter((column) => rowCount > 0 && column.fillRate >= 98 && column.uniqueCount >= Math.max(rowCount * 0.85, 1))
    .map((column) => column.name);

  const qualityScore = clamp(
    Math.round(
      completeness
      - suspiciousColumns.length * 9
      - sparseColumns.length * 4
      - (rowCount === 0 ? 12 : 0)
    ),
    0,
    100
  );

  return {
    qualityScore,
    completeness: Math.round(completeness),
    numericColumns,
    categoricalColumns,
    dateColumns,
    sparseColumns,
    suspiciousColumns,
    keyCandidateColumns,
  };
}

export function detectOperationalDomain(files: DataFile[]): OperationalDomain {
  const combined = files.map(collectDomainSignalText).join(' ');
  if (ASSEMBLY_LINE_HINT.test(combined)) return 'assembly_line';
  if (FINANCIAL_HINT.test(combined)) return 'financial';
  return 'general';
}

function formatColumnList(columns: string[], limit = 8): string {
  if (columns.length === 0) return 'none detected';
  const visible = columns.slice(0, limit).join(', ');
  return columns.length > limit ? `${visible}, +${columns.length - limit} more` : visible;
}

export function buildSuggestionContext(files: DataFile[]): string {
  const domain = detectOperationalDomain(files);

  return [
    `Domain: ${domain}`,
    `Dataset count: ${files.length}`,
    ...files.map((file) => {
      const summary = summarizeFileQuality(file);
      return [
        `FILE: ${file.name}`,
        `Rows: ${file.metadata?.row_count || file.preview.length || 0}`,
        `Columns: ${file.columns.length}`,
        `Quality score: ${summary.qualityScore}/100`,
        `Numeric columns: ${formatColumnList(summary.numericColumns)}`,
        `Date columns: ${formatColumnList(summary.dateColumns)}`,
        `Categorical columns: ${formatColumnList(summary.categoricalColumns)}`,
        `Sparse columns: ${formatColumnList(summary.sparseColumns)}`,
      ].join('\n');
    }),
  ].join('\n\n');
}

export function buildSuggestedQuestions(files: DataFile[]): string[] {
  if (files.length === 0) return [];

  const domain = detectOperationalDomain(files);
  const firstFile = files[0];
  const primarySummary = summarizeFileQuality(firstFile);
  const primaryNumeric = primarySummary.numericColumns[0];
  const primaryDate = primarySummary.dateColumns[0];
  const primaryCategory = primarySummary.categoricalColumns[0];
  const isMultiFile = files.length > 1;

  if (domain === 'assembly_line') {
    return [
      'Forecast the next shift and flag the top production risks immediately.',
      'Build an assembly-line dashboard with summary, shift-wise, and operator-wise views.',
      'Which shift, operator, or station is driving the highest defect risk?',
      'Show the top 5 management concerns and the action for each.',
      'Which gaps or anomalies suggest hidden downtime, QA, or process issues?',
      isMultiFile
        ? 'Compare all imported files together and surface the biggest cross-line deviations.'
        : 'Drill into defect, throughput, cycle time, and quality drivers with interactive charts.',
    ];
  }

  if (domain === 'financial') {
    return [
      'Forecast the next period and show the main revenue, cost, and margin drivers.',
      'Show the top 5 concerns, expected business impact, and immediate actions.',
      'Which segments are compressing profit or margin the most?',
      'Where are the biggest anomalies, gaps, or unexplained swings in performance?',
      isMultiFile
        ? 'Compare the imported files together and explain what changed most materially.'
        : 'Build an interactive management dashboard with trends, forecast, and outliers.',
      primaryCategory && primaryNumeric
        ? `Break down ${primaryNumeric} by ${primaryCategory} and rank the biggest winners and laggards.`
        : 'Which metrics should leadership monitor weekly from this dataset?',
    ];
  }

  return [
    primaryDate && primaryNumeric
      ? `Forecast ${primaryNumeric} over ${primaryDate} and call out the next likely move.`
      : 'Forecast the next likely trend and explain confidence and risk.',
    'Summarize the top 5 concerns and give one concrete action for each.',
    primaryCategory && primaryNumeric
      ? `Break down ${primaryNumeric} by ${primaryCategory} and rank the biggest contributors and laggards.`
      : 'Which dimensions matter most, and what should I ask next?',
    'Find anomalies, data gaps, and likely root causes instead of just reporting them.',
    isMultiFile
      ? 'Compare all imported files together and surface the most important differences.'
      : 'Build an interactive dashboard with drill-down filters and management-ready views.',
    'Which rows, columns, or segments deserve immediate investigation?',
  ];
}

export function buildInspectorSuggestedPrompts(file: DataFile, focusTerm?: string): string[] {
  const summary = summarizeFileQuality(file);
  const prompts = new Set<string>();

  prompts.add(`Profile "${file.name}" and summarize its most decision-useful columns, anomalies, and data quality risks.`);

  if (focusTerm?.trim()) {
    prompts.add(`Investigate "${focusTerm.trim()}" in "${file.name}" and explain which rows, columns, or segments are driving it.`);
  }

  if (summary.dateColumns.length > 0 && summary.numericColumns.length > 0) {
    prompts.add(`Using "${file.name}", chart ${summary.numericColumns[0]} over ${summary.dateColumns[0]} and call out the biggest trend shifts or breakpoints.`);
  }

  if (summary.categoricalColumns.length > 0 && summary.numericColumns.length > 0) {
    prompts.add(`Break down ${summary.numericColumns[0]} by ${summary.categoricalColumns[0]} in "${file.name}" and rank the biggest contributors and laggards.`);
  }

  if (summary.sparseColumns.length > 0) {
    prompts.add(`Audit missing data in "${file.name}" and quantify how null-heavy columns could distort the analysis.`);
  }

  if (summary.keyCandidateColumns.length > 0) {
    prompts.add(`Check "${file.name}" for duplicates, unexpected joins, or key integrity issues using ${summary.keyCandidateColumns[0]} as the likely identifier.`);
  }

  return Array.from(prompts).slice(0, 4);
}

export function buildWorkbenchPrompts(file: DataFile): Array<{ label: string; description: string; prompt: string }> {
  const summary = summarizeFileQuality(file);
  const primaryNumeric = summary.numericColumns[0];
  const primaryDate = summary.dateColumns[0];
  const primaryCategory = summary.categoricalColumns[0];

  return [
    {
      label: 'Missingness Audit',
      description: 'Quantify null-heavy fields and the decision risk they create.',
      prompt: `For "${file.name}", quantify missing values by column, show the worst offenders, and recommend whether to drop, impute, or isolate those fields before analysis.`,
    },
    {
      label: 'Outlier Scan',
      description: 'Find extreme values, anomalies, and suspicious records.',
      prompt: primaryNumeric
        ? `For "${file.name}", detect outliers in ${primaryNumeric} and explain the top suspicious rows or segments with exact values.`
        : `For "${file.name}", scan for anomalous rows, duplicate patterns, and suspicious values across the available columns.`,
    },
    {
      label: 'Trend Story',
      description: 'Turn the dataset into a chart-led trend narrative.',
      prompt: primaryNumeric && primaryDate
        ? `For "${file.name}", chart ${primaryNumeric} over ${primaryDate}, explain the major trend changes, and forecast the short-term direction.`
        : `For "${file.name}", identify the most chart-worthy trend or pattern and explain why it matters.`,
    },
    {
      label: 'Segment Breakdown',
      description: 'Rank categories, cohorts, or operational segments.',
      prompt: primaryNumeric && primaryCategory
        ? `For "${file.name}", break down ${primaryNumeric} by ${primaryCategory}, rank the top and bottom segments, and explain the likely drivers.`
        : `For "${file.name}", identify the best segmentation column and use it to rank the most important groups or categories.`,
    },
  ];
}

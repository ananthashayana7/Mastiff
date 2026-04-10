type ColumnStats = {
  min?: number | null;
  max?: number | null;
  std?: number | null;
};

type ColumnDateRange = {
  min?: string | null;
  max?: string | null;
};

export type DatasetColumnMeta = {
  dtype?: string;
  null_percentage?: number;
  unique_count?: number;
  sample_values?: unknown[];
  stats?: ColumnStats;
  date_range?: ColumnDateRange;
};

export type DatasetIntelligenceProfile = {
  generatedAt: string;
  summary: string[];
  businessTerms: string[];
  units: string[];
  measures: string[];
  dimensions: string[];
  dateFields: string[];
  keyCandidates: string[];
  candidateKpis: string[];
  missingnessHotspots: string[];
  anomalies: string[];
  columnRoles: Record<string, 'measure' | 'dimension' | 'date' | 'key' | 'text' | 'unknown'>;
};

export type DatasetAnalysisMemory = {
  lastUpdatedAt: string;
  detectedKpis: string[];
  topFindings: string[];
  commonFilters: string[];
  previousCharts: string[];
  recentPrompts: string[];
  recentActions: string[];
  acceptedMappings: Array<{ from: string; to: string }>;
  renamedBusinessTerms: string[];
};

export type DatasetMetadataLike = {
  row_count?: number;
  column_count?: number;
  selectedColumns?: string[];
  schema_review_notes?: string[];
  extraction_warning?: string;
  columns?: Record<string, DatasetColumnMeta>;
  sample?: Record<string, unknown>[];
  datasetIntelligence?: DatasetIntelligenceProfile;
  analysisMemory?: DatasetAnalysisMemory;
};

export type DatasetMemoryFile = {
  id?: string;
  name: string;
  metadata?: DatasetMetadataLike | null;
};

export type AnalysisEnvelopeLike = {
  headline?: string;
  insights?: string[];
  actions?: string[];
};

export type AnalysisProvenance = {
  sourceFiles: Array<{
    id?: string;
    name: string;
    rowCount: number;
    columnCount: number;
    selectedColumns: string[];
    ignoredColumns: string[];
  }>;
  rowsAnalyzed: number;
  columnsConsidered: string[];
  ignoredColumns: string[];
  dateRange?: {
    field: string;
    min: string;
    max: string;
  };
  reliability: {
    label: 'High' | 'Moderate' | 'Low';
    notes: string[];
  };
  warnings: string[];
};

const DATE_HINT = /(date|time|timestamp|month|quarter|year|week|day)/i;
const KEY_HINT = /(id|sku|code|key|order|batch|serial|lot|invoice|ticket|employee|record)/i;
const KPI_HINT = /(revenue|sales|profit|margin|cost|expense|qty|quantity|count|volume|throughput|yield|utilization|downtime|reject|defect|rate|forecast|ebit|ebitda|pat|pbt)/i;
const DIMENSION_HINT = /(segment|region|country|state|city|team|shift|operator|line|plant|site|channel|status|category|reason|product|customer|vendor|department)/i;
const MANUFACTURING_HINT = /(assembly|production|line|shift|operator|reject|defect|downtime|throughput|yield|machine|station|plant|qa|rework)/i;
const FINANCE_HINT = /(revenue|sales|profit|margin|cost|expense|ebit|ebitda|pat|pbt|budget|variance|cash|income|opex|capex)/i;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: string): string {
  return normalizeText(value).toLowerCase();
}

function dedupeStrings(values: string[], limit = values.length): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values.map((entry) => normalizeText(String(entry || ''))).filter(Boolean)) {
    const key = normalizeKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }

  return result;
}

function formatColumnList(columns: string[], limit = 4): string {
  if (columns.length === 0) return 'none detected';
  const visible = columns.slice(0, limit);
  return columns.length > limit ? `${visible.join(', ')}, +${columns.length - limit} more` : visible.join(', ');
}

function getCandidateColumns(metadata?: DatasetMetadataLike | null): Array<[string, DatasetColumnMeta]> {
  const columns = metadata?.columns || {};
  const selected = Array.isArray(metadata?.selectedColumns) && metadata?.selectedColumns.length > 0
    ? new Set(metadata?.selectedColumns)
    : null;

  return Object.entries(columns).filter(([name]) => !selected || selected.has(name));
}

function inferColumnRole(
  columnName: string,
  meta: DatasetColumnMeta,
  rowCount: number
): DatasetIntelligenceProfile['columnRoles'][string] {
  const normalizedName = columnName.toLowerCase();
  const dtype = String(meta?.dtype || '').toLowerCase();
  const uniqueCount = meta?.unique_count || 0;
  const sampleValues = Array.isArray(meta?.sample_values) ? meta.sample_values : [];
  const looksDateFromSample = sampleValues.some((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)));
  const looksNumeric = /(int|float|double|decimal|number|numeric)/.test(dtype)
    || sampleValues.some((value) => typeof value === 'number');

  if (DATE_HINT.test(normalizedName) || /(date|time|timestamp)/.test(dtype) || looksDateFromSample) {
    return 'date';
  }

  if (KEY_HINT.test(normalizedName) || (rowCount > 0 && uniqueCount >= Math.max(1, Math.floor(rowCount * 0.85)))) {
    return 'key';
  }

  if (looksNumeric || KPI_HINT.test(normalizedName)) {
    return 'measure';
  }

  if (DIMENSION_HINT.test(normalizedName) || /(category|enum|bool)/.test(dtype)) {
    return 'dimension';
  }

  if (/(string|text|object)/.test(dtype)) {
    const uniquenessRatio = rowCount > 0 ? uniqueCount / rowCount : 0;
    return uniquenessRatio <= 0.4 ? 'dimension' : 'text';
  }

  return 'unknown';
}

function inferUnits(columns: Array<[string, DatasetColumnMeta]>): string[] {
  const units: string[] = [];

  for (const [name] of columns) {
    const normalized = name.toLowerCase();
    if (/%|pct|percent|rate/.test(normalized)) units.push('percentage');
    if (/(revenue|sales|cost|expense|profit|income|price|amount|gmv|cash|budget)/.test(normalized)) units.push('currency');
    if (/(qty|quantity|volume|count|units|pieces|orders)/.test(normalized)) units.push('count');
    if (/(hour|hrs|minute|min|second|sec|downtime|cycle[_\s-]?time)/.test(normalized)) units.push('time');
  }

  return dedupeStrings(units, 4);
}

function inferBusinessTerms(datasetName: string, columns: Array<[string, DatasetColumnMeta]>): string[] {
  const signalText = `${datasetName} ${columns.map(([name]) => name).join(' ')}`.toLowerCase();
  const terms: string[] = [];

  if (MANUFACTURING_HINT.test(signalText)) {
    terms.push('operations', 'production', 'quality');
  }

  if (FINANCE_HINT.test(signalText)) {
    terms.push('financial performance', 'cost', 'margin');
  }

  if (!terms.length) {
    const roleDriven = columns
      .map(([name]) => normalizeText(name.replace(/[_-]+/g, ' ')))
      .filter((name) => KPI_HINT.test(name) || DIMENSION_HINT.test(name));
    terms.push(...roleDriven.slice(0, 4));
  }

  return dedupeStrings(terms, 6);
}

function inferCandidateKpis(measures: string[]): string[] {
  const explicit = measures.filter((name) => KPI_HINT.test(name));
  return dedupeStrings(explicit.length > 0 ? explicit : measures, 6);
}

function buildMissingnessHotspots(columns: Array<[string, DatasetColumnMeta]>): string[] {
  return columns
    .filter(([, meta]) => (meta?.null_percentage || 0) >= 20)
    .sort((left, right) => (right[1]?.null_percentage || 0) - (left[1]?.null_percentage || 0))
    .slice(0, 6)
    .map(([name, meta]) => `${name} (${Math.round(meta?.null_percentage || 0)}% null)`);
}

function buildAnomalies(metadata: DatasetMetadataLike | null | undefined, columns: Array<[string, DatasetColumnMeta]>): string[] {
  const anomalies: string[] = [];
  const rowCount = metadata?.row_count || 0;

  if (rowCount === 0) {
    anomalies.push('No rows detected after ingestion.');
  } else if (rowCount < 30) {
    anomalies.push(`Small sample size (${rowCount} rows).`);
  }

  if (metadata?.extraction_warning) {
    anomalies.push('Metadata extraction used a parser fallback.');
  }

  const suspiciousColumns = columns
    .map(([name]) => name)
    .filter((name) => /^(column_\d+|unnamed:?\s*\d*)$/i.test(name));
  if (suspiciousColumns.length > 0) {
    anomalies.push(`Placeholder headers detected: ${formatColumnList(suspiciousColumns, 3)}.`);
  }

  const zeroVariance = columns
    .filter(([, meta]) => {
      const min = meta?.stats?.min;
      const max = meta?.stats?.max;
      const std = meta?.stats?.std;
      return typeof min === 'number'
        && typeof max === 'number'
        && min === max
        && typeof std === 'number'
        && std === 0;
    })
    .map(([name]) => name);
  if (zeroVariance.length > 0) {
    anomalies.push(`Zero-variance fields: ${formatColumnList(zeroVariance, 3)}.`);
  }

  return dedupeStrings([
    ...anomalies,
    ...((metadata?.schema_review_notes || []).slice(0, 4)),
  ], 6);
}

function extractFiltersFromPrompt(prompt: string): string[] {
  const matches: string[] = [];
  const patterns = [
    /\bby\s+([a-z0-9_ -]{2,40})/ig,
    /\bonly\s+([a-z0-9_ -]{2,40})/ig,
    /\bafter\s+([a-z0-9_ -]{2,40})/ig,
    /\bbefore\s+([a-z0-9_ -]{2,40})/ig,
    /\bwhere\s+([a-z0-9_ ='"-]{3,60})/ig,
    /\btop\s+\d+\s+([a-z0-9_ -]{2,40})/ig,
  ];

  for (const pattern of patterns) {
    const patternMatches = prompt.matchAll(pattern);
    for (const match of patternMatches) {
      if (match[1]) matches.push(normalizeText(match[0]));
    }
  }

  return dedupeStrings(matches, 6);
}

function extractMappingsFromPrompt(prompt: string): Array<{ from: string; to: string }> {
  const mappings: Array<{ from: string; to: string }> = [];
  const mappingPatterns = [
    /\brename\s+([a-z0-9_]+)\s+as\s+([a-z0-9_]+)/ig,
    /\bcall\s+([a-z0-9_]+)\s+([a-z0-9_]+)/ig,
  ];

  for (const pattern of mappingPatterns) {
    for (const match of prompt.matchAll(pattern)) {
      const from = normalizeText(match[1] || '');
      const to = normalizeText(match[2] || '');
      if (from && to) mappings.push({ from, to });
    }
  }

  return mappings.filter((mapping, index, all) => (
    all.findIndex((candidate) => (
      normalizeKey(candidate.from) === normalizeKey(mapping.from)
      && normalizeKey(candidate.to) === normalizeKey(mapping.to)
    )) === index
  )).slice(0, 6);
}

function inferChartIntents(prompt: string): string[] {
  const normalized = prompt.toLowerCase();
  const chartIntents: string[] = [];

  if (/(forecast|trend|over time|time series|timeline)/.test(normalized)) chartIntents.push('line');
  if (/(compare|break down|rank|top|bottom|bar|pareto)/.test(normalized)) chartIntents.push('bar');
  if (/(distribution|spread|histogram)/.test(normalized)) chartIntents.push('histogram');
  if (/(relationship|correlation|scatter)/.test(normalized)) chartIntents.push('scatter');
  if (/(waterfall|bridge)/.test(normalized)) chartIntents.push('waterfall');
  if (/(box|quartile)/.test(normalized)) chartIntents.push('box');

  return dedupeStrings(chartIntents, 4);
}

function determineReliability(files: DatasetMemoryFile[], warnings: string[]): AnalysisProvenance['reliability'] {
  const notes: string[] = [];
  let score = 100;

  for (const file of files) {
    const metadata = file.metadata || {};
    const rowCount = metadata.row_count || 0;
    if (rowCount === 0) {
      score -= 50;
      notes.push(`${file.name} has 0 rows after ingestion.`);
    } else if (rowCount < 30) {
      score -= 20;
      notes.push(`${file.name} is a small-sample dataset (${rowCount} rows).`);
    }

    if (metadata.extraction_warning) {
      score -= 20;
      notes.push(`${file.name} required metadata extraction fallback logic.`);
    }

    const highNullColumns = getCandidateColumns(metadata)
      .filter(([, meta]) => (meta?.null_percentage || 0) >= 40)
      .map(([name]) => name);
    if (highNullColumns.length > 0) {
      score -= 10;
      notes.push(`${file.name} has sparse columns: ${formatColumnList(highNullColumns, 3)}.`);
    }
  }

  if (warnings.length > 0) {
    score -= Math.min(25, warnings.length * 5);
    notes.push(...warnings.slice(0, 3));
  }

  const label: AnalysisProvenance['reliability']['label'] = score >= 80
    ? 'High'
    : score >= 55
      ? 'Moderate'
      : 'Low';

  return {
    label,
    notes: dedupeStrings(notes, 5),
  };
}

export function deriveDatasetIntelligenceProfile(
  metadata: DatasetMetadataLike | null | undefined,
  datasetName: string
): DatasetIntelligenceProfile {
  const columns = getCandidateColumns(metadata);
  const rowCount = metadata?.row_count || 0;
  const columnRoles = Object.fromEntries(columns.map(([name, meta]) => [
    name,
    inferColumnRole(name, meta, rowCount),
  ])) as DatasetIntelligenceProfile['columnRoles'];

  const measures = columns.filter(([name]) => columnRoles[name] === 'measure').map(([name]) => name);
  const dimensions = columns.filter(([name]) => columnRoles[name] === 'dimension').map(([name]) => name);
  const dateFields = columns.filter(([name]) => columnRoles[name] === 'date').map(([name]) => name);
  const keyCandidates = columns.filter(([name]) => columnRoles[name] === 'key').map(([name]) => name);
  const candidateKpis = inferCandidateKpis(measures);
  const missingnessHotspots = buildMissingnessHotspots(columns);
  const anomalies = buildAnomalies(metadata, columns);
  const units = inferUnits(columns);
  const businessTerms = inferBusinessTerms(datasetName, columns);

  const summary = dedupeStrings([
    `${rowCount.toLocaleString()} rows and ${columns.length.toLocaleString()} active columns.`,
    `Primary measures: ${formatColumnList(measures)}.`,
    `Primary dimensions: ${formatColumnList(dimensions)}.`,
    dateFields.length > 0 ? `Likely time axis: ${formatColumnList(dateFields, 2)}.` : '',
    keyCandidates.length > 0 ? `Likely entity keys: ${formatColumnList(keyCandidates, 3)}.` : '',
    candidateKpis.length > 0 ? `Candidate KPIs: ${formatColumnList(candidateKpis, 4)}.` : '',
  ], 6);

  return {
    generatedAt: new Date().toISOString(),
    summary,
    businessTerms,
    units,
    measures: dedupeStrings(measures, 12),
    dimensions: dedupeStrings(dimensions, 12),
    dateFields: dedupeStrings(dateFields, 6),
    keyCandidates: dedupeStrings(keyCandidates, 8),
    candidateKpis: dedupeStrings(candidateKpis, 8),
    missingnessHotspots,
    anomalies,
    columnRoles,
  };
}

export function ensureDatasetMetadataProfile(
  metadata: DatasetMetadataLike | null | undefined,
  datasetName: string
): DatasetMetadataLike {
  const nextMetadata = { ...(metadata || {}) };
  nextMetadata.datasetIntelligence = deriveDatasetIntelligenceProfile(nextMetadata, datasetName);
  nextMetadata.analysisMemory = nextMetadata.analysisMemory || {
    lastUpdatedAt: new Date().toISOString(),
    detectedKpis: nextMetadata.datasetIntelligence.candidateKpis.slice(0, 6),
    topFindings: [],
    commonFilters: [],
    previousCharts: [],
    recentPrompts: [],
    recentActions: [],
    acceptedMappings: [],
    renamedBusinessTerms: [],
  };

  return nextMetadata;
}

export function mergeDatasetAnalysisMemory({
  existing,
  userQuery,
  envelope,
  profile,
}: {
  existing?: DatasetAnalysisMemory | null;
  userQuery: string;
  envelope?: AnalysisEnvelopeLike | null;
  profile?: DatasetIntelligenceProfile | null;
}): DatasetAnalysisMemory {
  const nextMappings = extractMappingsFromPrompt(userQuery);
  const topFindings = dedupeStrings([
    ...(existing?.topFindings || []),
    envelope?.headline || '',
    ...((envelope?.insights || []).slice(0, 3)),
  ], 8);
  const recentActions = dedupeStrings([
    ...(existing?.recentActions || []),
    ...((envelope?.actions || []).slice(0, 4)),
  ], 8);

  return {
    lastUpdatedAt: new Date().toISOString(),
    detectedKpis: dedupeStrings([
      ...(existing?.detectedKpis || []),
      ...((profile?.candidateKpis || []).slice(0, 6)),
    ], 8),
    topFindings,
    commonFilters: dedupeStrings([
      ...(existing?.commonFilters || []),
      ...extractFiltersFromPrompt(userQuery),
    ], 8),
    previousCharts: dedupeStrings([
      ...(existing?.previousCharts || []),
      ...inferChartIntents(userQuery),
    ], 6),
    recentPrompts: dedupeStrings([
      userQuery,
      ...(existing?.recentPrompts || []),
    ], 6),
    recentActions,
    acceptedMappings: [
      ...nextMappings,
      ...((existing?.acceptedMappings || []).filter((mapping) => !nextMappings.some((candidate) => (
        normalizeKey(candidate.from) === normalizeKey(mapping.from)
        && normalizeKey(candidate.to) === normalizeKey(mapping.to)
      )))),
    ].slice(0, 8),
    renamedBusinessTerms: dedupeStrings([
      ...(existing?.renamedBusinessTerms || []),
      ...nextMappings.map((mapping) => `${mapping.from} -> ${mapping.to}`),
    ], 8),
  };
}

export function buildDatasetMemoryPromptBlock(files: DatasetMemoryFile[]): string {
  if (files.length === 0) return '';

  return [
    'PERSISTENT DATASET MEMORY:',
    ...files.map((file) => {
      const metadata = ensureDatasetMetadataProfile(file.metadata, file.name);
      const profile = metadata.datasetIntelligence!;
      const memory = metadata.analysisMemory;

      return [
        `- Dataset: ${file.name}`,
        `  Summary: ${profile.summary.slice(0, 3).join(' ')}`,
        `  Measures: ${formatColumnList(profile.measures, 6)}`,
        `  Dimensions: ${formatColumnList(profile.dimensions, 6)}`,
        `  Date fields: ${formatColumnList(profile.dateFields, 4)}`,
        `  Key candidates: ${formatColumnList(profile.keyCandidates, 4)}`,
        profile.candidateKpis.length > 0 ? `  Candidate KPIs: ${formatColumnList(profile.candidateKpis, 5)}` : '',
        profile.anomalies.length > 0 ? `  Known anomalies: ${profile.anomalies.slice(0, 2).join(' ')}` : '',
        memory?.topFindings?.length ? `  Prior findings to reuse: ${memory.topFindings.slice(0, 2).join(' ')}` : '',
        memory?.commonFilters?.length ? `  Repeated filters: ${formatColumnList(memory.commonFilters, 4)}` : '',
        memory?.previousCharts?.length ? `  Prior chart patterns: ${formatColumnList(memory.previousCharts, 4)}` : '',
      ].filter(Boolean).join('\n');
    }),
    '- Reuse accepted business terminology and prior filters when the user asks a follow-up.',
    '- Do not rediscover column roles from scratch if the stored dataset dossier already makes the role clear.',
  ].join('\n');
}

export function buildAnalysisProvenance(
  files: DatasetMemoryFile[],
  warningMessages: string[] = []
): AnalysisProvenance {
  const sourceFiles = files.map((file) => {
    const metadata = file.metadata || {};
    const selectedColumns = Array.isArray(metadata.selectedColumns) && metadata.selectedColumns.length > 0
      ? metadata.selectedColumns
      : getCandidateColumns(metadata).map(([name]) => name);
    const allColumns = Object.keys(metadata.columns || {});
    const ignoredColumns = allColumns.filter((name) => !selectedColumns.includes(name));

    return {
      id: file.id,
      name: file.name,
      rowCount: metadata.row_count || 0,
      columnCount: selectedColumns.length || metadata.column_count || allColumns.length,
      selectedColumns,
      ignoredColumns,
    };
  });

  const rowsAnalyzed = sourceFiles.reduce((sum, file) => sum + file.rowCount, 0);
  const columnsConsidered = dedupeStrings(sourceFiles.flatMap((file) => file.selectedColumns), 16);
  const ignoredColumns = dedupeStrings(sourceFiles.flatMap((file) => file.ignoredColumns), 12);
  let dateRange: AnalysisProvenance['dateRange'] | undefined;

  for (const file of files) {
    for (const [columnName, meta] of getCandidateColumns(file.metadata)) {
      if (!DATE_HINT.test(columnName) && !/(date|time|timestamp)/.test(String(meta?.dtype || '').toLowerCase())) {
        continue;
      }

      const min = meta?.date_range?.min;
      const max = meta?.date_range?.max;
      if (min && max) {
        dateRange = {
          field: columnName,
          min,
          max,
        };
        break;
      }
    }

    if (dateRange) break;
  }

  return {
    sourceFiles,
    rowsAnalyzed,
    columnsConsidered,
    ignoredColumns,
    dateRange,
    reliability: determineReliability(files, warningMessages),
    warnings: dedupeStrings(warningMessages, 5),
  };
}

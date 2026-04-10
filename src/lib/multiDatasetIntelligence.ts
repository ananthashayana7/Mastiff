type DatasetColumnMeta = {
  dtype?: string;
  null_percentage?: number;
  unique_count?: number;
  sample_values?: unknown[];
};

type DatasetMetadata = {
  row_count?: number;
  column_count?: number;
  columns?: Record<string, DatasetColumnMeta>;
  sample?: Record<string, unknown>[];
  selectedColumns?: string[];
  datasetIntelligence?: {
    summary?: string[];
    measures?: string[];
    dimensions?: string[];
    dateFields?: string[];
    keyCandidates?: string[];
    candidateKpis?: string[];
    missingnessHotspots?: string[];
    anomalies?: string[];
    businessTerms?: string[];
  };
  analysisMemory?: {
    topFindings?: string[];
    commonFilters?: string[];
    previousCharts?: string[];
    recentActions?: string[];
    acceptedMappings?: Array<{ from: string; to: string }>;
  };
};

type DatasetInput = {
  name: string;
  metadata?: DatasetMetadata | null;
};

type ColumnKind = 'numeric' | 'date' | 'categorical' | 'text' | 'unknown';

const KEY_COLUMN_HINT = /(id|date|time|shift|operator|station|line|sku|product|part|machine|batch|order|work[_\s-]?order|serial|lot)/i;

function inferColumnKind(name: string, meta?: DatasetColumnMeta): ColumnKind {
  const dtype = String(meta?.dtype || '').toLowerCase();
  const sampleValues = Array.isArray(meta?.sample_values) ? meta?.sample_values : [];
  const normalizedName = name.toLowerCase();

  if (/(int|float|double|decimal|number|numeric)/.test(dtype)) return 'numeric';
  if (/(date|time|timestamp)/.test(dtype)) return 'date';
  if (/(category|enum|bool)/.test(dtype)) return 'categorical';
  if (/(text|string|object)/.test(dtype)) {
    const dateLikeCount = sampleValues.filter((value) => {
      if (typeof value !== 'string') return false;
      return !Number.isNaN(Date.parse(value));
    }).length;
    if (dateLikeCount >= Math.ceil(sampleValues.length * 0.6) && sampleValues.length > 0) {
      return 'date';
    }
  }

  if (/(date|time|month|year|week|day)/.test(normalizedName)) return 'date';
  if (/(rate|qty|quantity|count|cost|price|volume|yield|throughput|defect|reject|rework|margin|revenue|profit)/.test(normalizedName)) return 'numeric';
  if (/(shift|operator|station|line|team|plant|qa|checker|engineer|status|category|reason)/.test(normalizedName)) return 'categorical';

  return sampleValues.some((value) => typeof value === 'number') ? 'numeric' : 'text';
}

function formatColumnList(columns: string[], limit = 8): string {
  if (columns.length === 0) return 'none';
  const visible = columns.slice(0, limit);
  return columns.length > limit ? `${visible.join(', ')}, +${columns.length - limit} more` : visible.join(', ');
}

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase();
}

function getMetadata(file: DatasetInput): DatasetMetadata {
  return (file.metadata || {}) as DatasetMetadata;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function inferEntityLabel(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildCompactFileContext(file: DatasetInput): { name: string; schema: string; sample: Record<string, unknown>[] } {
  const metadata = getMetadata(file);
  const columns = metadata.columns || {};
  const entries = Object.entries(columns);

  const numericColumns = entries
    .filter(([name, meta]) => inferColumnKind(name, meta) === 'numeric')
    .map(([name]) => name);
  const dateColumns = entries
    .filter(([name, meta]) => inferColumnKind(name, meta) === 'date')
    .map(([name]) => name);
  const categoricalColumns = entries
    .filter(([name, meta]) => inferColumnKind(name, meta) === 'categorical')
    .map(([name]) => name);
  const keyCandidates = entries
    .filter(([name, meta]) => {
      const rowCount = metadata.row_count || 0;
      const uniqueCount = meta?.unique_count || 0;
      return KEY_COLUMN_HINT.test(name) || (rowCount > 0 && uniqueCount >= Math.max(1, Math.floor(rowCount * 0.65)));
    })
    .map(([name]) => name);
  const sparseColumns = entries
    .filter(([, meta]) => (meta?.null_percentage || 0) >= 35)
    .map(([name]) => name);

  const compactColumns = Object.fromEntries(
    entries.slice(0, 24).map(([name, meta]) => [
      name,
      {
        dtype: meta?.dtype || 'unknown',
        null_percentage: Number((meta?.null_percentage || 0).toFixed(1)),
        unique_count: meta?.unique_count || 0,
        sample_values: Array.isArray(meta?.sample_values) ? meta.sample_values.slice(0, 4) : [],
      },
    ]),
  );

  return {
    name: file.name,
    schema: JSON.stringify({
      row_count: metadata.row_count || 0,
      column_count: metadata.column_count || entries.length,
      selected_columns: metadata.selectedColumns || undefined,
      numeric_columns: numericColumns.slice(0, 16),
      date_columns: dateColumns.slice(0, 8),
      categorical_columns: categoricalColumns.slice(0, 16),
      key_candidates: keyCandidates.slice(0, 8),
      sparse_columns: sparseColumns.slice(0, 8),
      dataset_intelligence: metadata.datasetIntelligence ? {
        summary: metadata.datasetIntelligence.summary?.slice(0, 4),
        measures: metadata.datasetIntelligence.measures?.slice(0, 10),
        dimensions: metadata.datasetIntelligence.dimensions?.slice(0, 10),
        date_fields: metadata.datasetIntelligence.dateFields?.slice(0, 6),
        key_candidates: metadata.datasetIntelligence.keyCandidates?.slice(0, 6),
        candidate_kpis: metadata.datasetIntelligence.candidateKpis?.slice(0, 6),
        missingness_hotspots: metadata.datasetIntelligence.missingnessHotspots?.slice(0, 4),
        anomalies: metadata.datasetIntelligence.anomalies?.slice(0, 4),
        business_terms: metadata.datasetIntelligence.businessTerms?.slice(0, 6),
      } : undefined,
      analysis_memory: metadata.analysisMemory ? {
        top_findings: metadata.analysisMemory.topFindings?.slice(0, 3),
        common_filters: metadata.analysisMemory.commonFilters?.slice(0, 4),
        previous_charts: metadata.analysisMemory.previousCharts?.slice(0, 4),
        recent_actions: metadata.analysisMemory.recentActions?.slice(0, 3),
        accepted_mappings: metadata.analysisMemory.acceptedMappings?.slice(0, 4),
      } : undefined,
      columns: compactColumns,
    }, null, 2),
    sample: Array.isArray(metadata.sample) ? metadata.sample.slice(0, 6) : [],
  };
}

export function buildMultiDatasetPromptBlock(files: DatasetInput[]): string {
  if (files.length <= 1) return '';

  const normalizedFileColumns = files.map((file) => {
    const metadata = getMetadata(file);
    const columns = Object.entries(metadata.columns || {}).map(([name, meta]) => ({
      name,
      normalized: normalizeColumnName(name),
      kind: inferColumnKind(name, meta),
      uniqueCount: meta?.unique_count || 0,
      rowCount: metadata.row_count || 0,
    }));

    return {
      name: file.name,
      entity: inferEntityLabel(file.name),
      rowCount: metadata.row_count || 0,
      columns,
    };
  });

  const totalRows = normalizedFileColumns.reduce((sum, file) => sum + file.rowCount, 0);
  const zeroRowFiles = normalizedFileColumns.filter((file) => file.rowCount === 0).map((file) => file.name);

  const frequency = new Map<string, number>();
  const canonicalName = new Map<string, string>();
  const kindFrequency = new Map<string, Map<ColumnKind, number>>();

  for (const file of normalizedFileColumns) {
    const seen = new Set<string>();
    for (const column of file.columns) {
      if (seen.has(column.normalized)) continue;
      seen.add(column.normalized);
      frequency.set(column.normalized, (frequency.get(column.normalized) || 0) + 1);
      if (!canonicalName.has(column.normalized)) canonicalName.set(column.normalized, column.name);
      if (!kindFrequency.has(column.normalized)) kindFrequency.set(column.normalized, new Map<ColumnKind, number>());
      const kindMap = kindFrequency.get(column.normalized)!;
      kindMap.set(column.kind, (kindMap.get(column.kind) || 0) + 1);
    }
  }

  const datasetCount = files.length;
  const majorityThreshold = Math.max(2, Math.ceil(datasetCount * 0.6));
  const sharedColumns = Array.from(frequency.entries())
    .filter(([, count]) => count >= majorityThreshold)
    .map(([normalized]) => canonicalName.get(normalized) || normalized);

  const allPairRatios: number[] = [];
  for (let left = 0; left < normalizedFileColumns.length; left += 1) {
    for (let right = left + 1; right < normalizedFileColumns.length; right += 1) {
      const leftSet = new Set(normalizedFileColumns[left].columns.map((column) => column.normalized));
      const rightSet = new Set(normalizedFileColumns[right].columns.map((column) => column.normalized));
      const union = new Set([...leftSet, ...rightSet]);
      let intersectionCount = 0;
      for (const value of leftSet) {
        if (rightSet.has(value)) intersectionCount += 1;
      }
      allPairRatios.push(union.size > 0 ? intersectionCount / union.size : 0);
    }
  }

  const overlapScore = average(allPairRatios);
  const sharedMetrics = Array.from(frequency.keys())
    .filter((normalized) => (frequency.get(normalized) || 0) >= majorityThreshold)
    .filter((normalized) => {
      const kindMap = kindFrequency.get(normalized);
      if (!kindMap) return false;
      return (kindMap.get('numeric') || 0) >= Math.ceil((frequency.get(normalized) || 0) * 0.5);
    })
    .map((normalized) => canonicalName.get(normalized) || normalized);

  const sharedDimensions = Array.from(frequency.keys())
    .filter((normalized) => (frequency.get(normalized) || 0) >= majorityThreshold)
    .filter((normalized) => {
      const kindMap = kindFrequency.get(normalized);
      if (!kindMap) return false;
      return (kindMap.get('categorical') || 0) + (kindMap.get('date') || 0) >= Math.ceil((frequency.get(normalized) || 0) * 0.5);
    })
    .map((normalized) => canonicalName.get(normalized) || normalized);

  const candidateKeys = Array.from(frequency.keys())
    .filter((normalized) => (frequency.get(normalized) || 0) >= majorityThreshold)
    .filter((normalized) => {
      const representative = normalizedFileColumns.find((file) => file.columns.some((column) => column.normalized === normalized));
      const column = representative?.columns.find((entry) => entry.normalized === normalized);
      if (!column) return false;
      const uniquenessRatio = column.rowCount > 0 ? column.uniqueCount / column.rowCount : 0;
      return KEY_COLUMN_HINT.test(column.name) || uniquenessRatio >= 0.55;
    })
    .map((normalized) => canonicalName.get(normalized) || normalized);

  const inferredEntities = normalizedFileColumns.map((file) => file.entity);
  let strategy = 'compare shared KPIs by source file and lower confidence when schemas diverge.';
  let confidence = 'moderate';

  if (overlapScore >= 0.62 && sharedMetrics.length > 0) {
    strategy = 'vertically harmonize aligned datasets, add a source_file column, and compare lines or entities side by side.';
    confidence = zeroRowFiles.length > 0 ? 'moderate' : 'high';
  } else if (candidateKeys.length > 0) {
    strategy = 'compare or join on shared business keys before forecasting; do not blindly stack mismatched schemas.';
    confidence = zeroRowFiles.length > 0 ? 'low-to-moderate' : 'moderate';
  } else if (overlapScore < 0.3) {
    strategy = 'analyze each dataset separately first, then compare only the common KPIs and operational outliers.';
    confidence = 'low-to-moderate';
  }

  return [
    'MULTI-DATASET BRIEF:',
    `- Dataset count: ${datasetCount}`,
    `- Total rows available: ${totalRows.toLocaleString()}`,
    `- Inferred source entities: ${formatColumnList(inferredEntities, 10)}`,
    `- Schema overlap score: ${(overlapScore * 100).toFixed(0)}%`,
    `- Shared dimensions across the majority of files: ${formatColumnList(sharedDimensions)}`,
    `- Shared metrics across the majority of files: ${formatColumnList(sharedMetrics)}`,
    `- Candidate join or comparison keys: ${formatColumnList(candidateKeys)}`,
    zeroRowFiles.length > 0
      ? `- Files with 0 rows or parsing failure risk: ${formatColumnList(zeroRowFiles, 10)}`
      : '- Files with 0 rows or parsing failure risk: none detected',
    `- Recommended cross-file strategy: ${strategy}`,
    `- Reliability expectation for cross-file conclusions: ${confidence}. If overlap is weak, state that explicitly before making management recommendations.`,
    '- For multi-file assembly-line analysis, compare rejection rate, throughput, downtime, shift efficiency, operator performance, and anomaly clusters across source_file.',
    '- Always print a short dataset coverage note to stdout before the final business summary so the response shows what files were used.',
  ].join('\n');
}

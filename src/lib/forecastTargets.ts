import { DataFile } from '../types';

export interface ForecastTargetGroup {
  fileId: string;
  fileName: string;
  metrics: string[];
  dateFields: string[];
  defaultMetric: string;
  defaultHorizon: number;
}

const NUMERIC_DTYPE_HINT = /(int|float|double|decimal|numeric|number|currency|percent|ratio)/i;
const DATE_DTYPE_HINT = /(date|time|timestamp)/i;
const EXCLUDED_METRIC_HINT = /(^id$|_id$|identifier|index|postal|zip|phone|mobile|latitude|longitude)/i;
const FORECAST_FRIENDLY_HINT = /(revenue|sales|profit|margin|cost|expense|volume|throughput|yield|downtime|defect|utilization|inventory|demand|count|rate|kpi|score|pat|ebit|ebitda)/i;

function dedupe(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function rankMetrics(metrics: string[], preferred: string[]): string[] {
  const preferredRank = new Map<string, number>();
  preferred.forEach((metric, index) => {
    preferredRank.set(metric.toLowerCase(), index);
  });

  return [...metrics].sort((left, right) => {
    const leftRank = preferredRank.get(left.toLowerCase());
    const rightRank = preferredRank.get(right.toLowerCase());

    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      return leftRank - rightRank;
    }

    const leftForecastLike = FORECAST_FRIENDLY_HINT.test(left);
    const rightForecastLike = FORECAST_FRIENDLY_HINT.test(right);
    if (leftForecastLike !== rightForecastLike) {
      return leftForecastLike ? -1 : 1;
    }

    return left.localeCompare(right);
  });
}

function collectMetrics(file: DataFile): string[] {
  const metadata = file.metadata;
  if (!metadata) return [];

  const intelligence = metadata.datasetIntelligence;
  const dateFields = new Set((intelligence?.dateFields || []).map((value) => value.toLowerCase()));
  const selectedColumns = new Set((metadata.selectedColumns || file.columns).map((value) => value.toLowerCase()));

  const intelligenceMetrics = dedupe([
    ...(intelligence?.candidateKpis || []),
    ...(intelligence?.measures || []),
  ]);

  const numericColumns = Object.entries(metadata.columns || {})
    .filter(([column, definition]) => {
      const normalized = column.toLowerCase();
      if (!selectedColumns.has(normalized)) return false;
      if (dateFields.has(normalized)) return false;
      if (EXCLUDED_METRIC_HINT.test(column)) return false;

      return Boolean(definition?.stats) || NUMERIC_DTYPE_HINT.test(definition?.dtype || '');
    })
    .map(([column]) => column);

  return rankMetrics(
    dedupe([...intelligenceMetrics, ...numericColumns]).filter((metric) => !EXCLUDED_METRIC_HINT.test(metric)),
    intelligenceMetrics
  ).slice(0, 6);
}

function collectDateFields(file: DataFile): string[] {
  const metadata = file.metadata;
  if (!metadata) return [];

  const intelligenceDates = metadata.datasetIntelligence?.dateFields || [];
  const inferredDates = Object.entries(metadata.columns || {})
    .filter(([column, definition]) => DATE_DTYPE_HINT.test(definition?.dtype || '') || /(date|month|quarter|year|week|period)/i.test(column))
    .map(([column]) => column);

  return dedupe([...intelligenceDates, ...inferredDates]).slice(0, 4);
}

export function buildForecastTargetGroups(files: DataFile[]): ForecastTargetGroup[] {
  return files
    .map((file) => {
      const metrics = collectMetrics(file);
      if (metrics.length === 0) {
        return null;
      }

      const dateFields = collectDateFields(file);
      return {
        fileId: file.id,
        fileName: file.name,
        metrics,
        dateFields,
        defaultMetric: metrics[0],
        defaultHorizon: 6,
      } satisfies ForecastTargetGroup;
    })
    .filter((group): group is ForecastTargetGroup => Boolean(group));
}

export function buildFocusedForecastPrompt(
  group: ForecastTargetGroup,
  metric: string,
  horizon: number
): string {
  const normalizedMetric = metric.trim() || group.defaultMetric;
  const normalizedHorizon = Number.isFinite(horizon) ? Math.max(1, Math.round(horizon)) : group.defaultHorizon;
  const timelineInstruction = group.dateFields[0]
    ? `Use "${group.dateFields[0]}" as the primary timeline if it behaves like a reliable sequence.`
    : 'If no explicit timeline column is reliable, infer sequential order from the dataset and state that assumption clearly.';

  return [
    `Use only the dataset "${group.fileName}".`,
    `Build a focused forecast for "${normalizedMetric}".`,
    timelineInstruction,
    `Forecast the next ${normalizedHorizon} period${normalizedHorizon === 1 ? '' : 's'} with base, upside, and downside cases.`,
    `Show the observed trend, forecast line, confidence band, what could change the outcome, and the two most important management actions tied specifically to ${normalizedMetric}.`,
  ].join(' ');
}

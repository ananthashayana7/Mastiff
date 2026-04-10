export type AutoChartType = 'bar' | 'line' | 'pie' | 'area' | 'forecast';
export type ForecastModel = 'linear' | 'movingAverage' | 'momentum';

export interface AutoChartAnalysis {
  xAxis: string;
  numericCols: string[];
  categoricalCols: string[];
  metricKeys: string[];
  forecastMetric: string;
  defaultType: AutoChartType;
  availableChartTypes: AutoChartType[];
  pieData: Array<{ name: string; value: number }>;
  financeLike: boolean;
  timeSeriesLike: boolean;
  resolvedTitle: string;
}

const TIME_AXIS_HINT = /^(period|date|date2|month|months|quarter|year|fy|ytd)/i;
const TIME_LABEL_HINT = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|fy\d{2}|ytd|\d{4}-\d{2}|\d{2}\/\d{2}\/\d{4})/i;
const FINANCE_HINT = /(revenue|income|expense|profit|margin|pat|pbt|ebit|ebitda|tax|inventory|depreciation|amort|cash|operations)/i;

const FINANCE_PRIORITY = [
  /profit for the year|\bpat\b/i,
  /profit before tax|\bpbt\b|\bebit\b/i,
  /total income/i,
  /revenue from operations|revenue|sales/i,
  /total expenses|expense|cost/i,
  /other income/i,
  /current tax|deferred tax|tax/i,
];

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned || cleaned === '-' || cleaned.toLowerCase() === 'n/a') return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function looksTimeLikeHeader(header: string): boolean {
  return TIME_AXIS_HINT.test(header);
}

function looksTimeLikeValue(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (typeof value !== 'string') return false;
  return !Number.isNaN(Date.parse(value)) || TIME_LABEL_HINT.test(value);
}

function getNumericColumns(data: Record<string, unknown>[], headers: string[]): string[] {
  return headers.filter((header) => {
    const values = data.map((row) => row[header]).filter((value) => value != null && value !== '');
    if (values.length === 0) return false;
    const numericCount = values.filter((value) => toFiniteNumber(value) !== null && typeof value !== 'boolean').length;
    return numericCount >= Math.ceil(values.length * 0.7);
  });
}

function getCategoricalColumns(headers: string[], numericCols: string[]): string[] {
  return headers.filter((header) => !numericCols.includes(header));
}

function detectFinanceLike(headers: string[]): boolean {
  return headers.some((header) => FINANCE_HINT.test(header));
}

function detectTimeSeriesLike(data: Record<string, unknown>[], xAxis: string): boolean {
  if (looksTimeLikeHeader(xAxis)) return true;
  const sample = data.map((row) => row[xAxis]).filter((value) => value != null).slice(0, 8);
  if (sample.length === 0) return false;
  const timeLikeCount = sample.filter(looksTimeLikeValue).length;
  return timeLikeCount >= Math.ceil(sample.length * 0.6);
}

function chooseXAxis(headers: string[], categoricalCols: string[], data: Record<string, unknown>[]): string {
  const preferred = headers.find((header) => looksTimeLikeHeader(header));
  if (preferred) return preferred;

  const timeLikeCategory = categoricalCols.find((header) => detectTimeSeriesLike(data, header));
  if (timeLikeCategory) return timeLikeCategory;

  return categoricalCols[0] || headers[0];
}

function metricPriority(metric: string): number {
  const matchedIndex = FINANCE_PRIORITY.findIndex((pattern) => pattern.test(metric));
  return matchedIndex === -1 ? FINANCE_PRIORITY.length : matchedIndex;
}

function metricSpread(data: Record<string, unknown>[], metric: string): number {
  const values = data
    .map((row) => toFiniteNumber(row[metric]))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function rankMetrics(data: Record<string, unknown>[], numericCols: string[], financeLike: boolean): string[] {
  return [...numericCols].sort((left, right) => {
    if (financeLike) {
      const priorityGap = metricPriority(left) - metricPriority(right);
      if (priorityGap !== 0) return priorityGap;
    }

    const spreadGap = metricSpread(data, right) - metricSpread(data, left);
    if (spreadGap !== 0) return spreadGap;

    return left.localeCompare(right);
  });
}

function buildResolvedTitle(forecastMetric: string, xAxis: string, financeLike: boolean, timeSeriesLike: boolean): string {
  if (financeLike && timeSeriesLike) {
    return `${forecastMetric} trend and forecast`;
  }
  if (timeSeriesLike) {
    return `${forecastMetric} over ${xAxis}`;
  }
  return `${forecastMetric} by ${xAxis}`;
}

export function analyzeAutoChartData(input: any[]): AutoChartAnalysis | null {
  if (!Array.isArray(input) || input.length === 0 || typeof input[0] !== 'object' || input[0] === null) {
    return null;
  }

  const data = input as Record<string, unknown>[];
  const headers = Object.keys(data[0] || {});
  if (headers.length < 2) return null;

  const numericCols = getNumericColumns(data, headers);
  if (numericCols.length === 0) return null;

  const categoricalCols = getCategoricalColumns(headers, numericCols);
  const xAxis = chooseXAxis(headers, categoricalCols, data);
  const financeLike = detectFinanceLike(headers);
  const timeSeriesLike = detectTimeSeriesLike(data, xAxis);
  const rankedMetrics = rankMetrics(data, numericCols, financeLike);
  const metricKeys = rankedMetrics.slice(0, financeLike ? 4 : 3);
  const forecastMetric = rankedMetrics[0];
  const uniqueX = new Set(data.map((row) => String(row[xAxis] ?? ''))).size;
  const pieEligible = !financeLike && !timeSeriesLike && uniqueX <= 6 && rankedMetrics.length >= 1;

  const defaultType: AutoChartType = timeSeriesLike ? 'line' : pieEligible && rankedMetrics.length === 1 ? 'pie' : 'bar';
  const availableChartTypes: AutoChartType[] = pieEligible
    ? ['bar', 'line', 'pie', 'area', 'forecast']
    : ['bar', 'line', 'area', 'forecast'];

  const pieData = data.slice(0, 8).map((row, index) => ({
    name: String(row[xAxis] ?? `Item ${index + 1}`),
    value: Math.abs(toFiniteNumber(row[forecastMetric]) || 0),
  })).filter((entry) => entry.value > 0);

  return {
    xAxis,
    numericCols,
    categoricalCols,
    metricKeys,
    forecastMetric,
    defaultType,
    availableChartTypes,
    pieData,
    financeLike,
    timeSeriesLike,
    resolvedTitle: buildResolvedTitle(forecastMetric, xAxis, financeLike, timeSeriesLike),
  };
}

export function buildForecastBasisLabel(
  metric: string,
  model: ForecastModel,
  periods: string[],
): string {
  const modelLabel = model === 'movingAverage'
    ? '3-point moving average'
    : model === 'momentum'
      ? 'recent momentum'
      : 'linear trend';

  const observedWindow = periods.length >= 2
    ? `${periods[0]} to ${periods[periods.length - 1]}`
    : periods[0] || 'the observed window';

  return `Forecasting ${metric} using ${modelLabel} across ${periods.length} observed period${periods.length === 1 ? '' : 's'} (${observedWindow}).`;
}
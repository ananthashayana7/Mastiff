import type { DatasetMetadataLike } from './datasetMemory';

type PreviewFileInput = {
  filename: string;
  metadata?: DatasetMetadataLike | null;
};

function dedupe(values: Array<string | null | undefined>, limit = values.length): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }

  return result;
}

function punctuate(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function formatList(values: Array<string | null | undefined>, fallback: string, limit = 3): string {
  const cleaned = dedupe(values, limit);
  return cleaned.length > 0 ? cleaned.join(', ') : fallback;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.max(0, Math.round(value || 0)));
}

function shrink(value: string, max = 180): string {
  const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

type ProfileSnapshot = {
  filename: string;
  rowCount: number;
  columnCount: number;
  kpis: string[];
  measures: string[];
  dimensions: string[];
  dateFields: string[];
  keys: string[];
  businessTerms: string[];
  missingnessHotspots: string[];
  anomalies: string[];
  extractionWarning: string;
};

function buildProfileSnapshot(file: PreviewFileInput): ProfileSnapshot {
  const metadata = file.metadata || {};
  const profile = metadata.datasetIntelligence || undefined;

  return {
    filename: file.filename,
    rowCount: Number(metadata.row_count || 0),
    columnCount: Number(metadata.column_count || Object.keys(metadata.columns || {}).length || 0),
    kpis: asStringList(profile?.candidateKpis),
    measures: asStringList(profile?.measures),
    dimensions: asStringList(profile?.dimensions),
    dateFields: asStringList(profile?.dateFields),
    keys: asStringList(profile?.keyCandidates),
    businessTerms: asStringList(profile?.businessTerms),
    missingnessHotspots: asStringList(profile?.missingnessHotspots),
    anomalies: asStringList(profile?.anomalies),
    extractionWarning: String(metadata.extraction_warning || '').trim(),
  };
}

function buildPreviewDataQuality(
  profiles: ProfileSnapshot[],
  warnings: string[],
  basisLabel: string
): string {
  const rowTotal = profiles.reduce((sum, profile) => sum + profile.rowCount, 0);
  const explicitWarnings = dedupe(warnings, 2).map((warning) => shrink(warning, 160));
  const profileWarnings = dedupe(
    profiles.flatMap((profile) => [
      ...profile.anomalies.slice(0, 1),
      ...profile.missingnessHotspots.slice(0, 1).map((spot) => `${profile.filename}: ${spot}`),
      profile.extractionWarning ? `${profile.filename}: parser fallback used during ingestion` : '',
    ]),
    2
  ).map((warning) => shrink(warning, 160));

  const caveats = dedupe([...explicitWarnings, ...profileWarnings], 2);
  const core = caveats.length > 0
    ? `Schema-backed ${basisLabel} preview across ${formatCount(rowTotal)} rows. Main caveats: ${caveats.join(' | ')}`
    : `Schema-backed ${basisLabel} preview across ${formatCount(rowTotal)} rows with no major ingestion warnings surfaced in the current sample`;

  return punctuate(core);
}

export function buildInsightPreviewSummaryFromFiles(
  files: PreviewFileInput[],
  warnings: string[]
): string {
  const profiles = files.map(buildProfileSnapshot);
  const totalRows = profiles.reduce((sum, profile) => sum + profile.rowCount, 0);
  const totalColumns = profiles.reduce((sum, profile) => sum + profile.columnCount, 0);
  const datasetCount = profiles.length;
  const primary = [...profiles].sort((left, right) => {
    const leftScore = (left.kpis.length * 3) + (left.measures.length * 2) + left.dimensions.length + left.dateFields.length;
    const rightScore = (right.kpis.length * 3) + (right.measures.length * 2) + right.dimensions.length + right.dateFields.length;
    return rightScore - leftScore;
  })[0];

  const sharedKpis = dedupe(profiles.flatMap((profile) => profile.kpis.length > 0 ? profile.kpis : profile.measures), 4);
  const sharedDimensions = dedupe(profiles.flatMap((profile) => profile.dimensions), 4);
  const sharedDates = dedupe(profiles.flatMap((profile) => profile.dateFields), 3);
  const sharedTerms = dedupe(profiles.flatMap((profile) => profile.businessTerms), 4);
  const sharedKeys = dedupe(profiles.flatMap((profile) => profile.keys), 3);
  const hotspot = dedupe(profiles.flatMap((profile) => profile.missingnessHotspots.map((value) => `${profile.filename}: ${value}`)), 2);
  const anomaly = dedupe(profiles.flatMap((profile) => profile.anomalies.map((value) => `${profile.filename}: ${value}`)), 2);

  const headline = datasetCount > 1
    ? `${datasetCount} datasets are ready for an insight-first comparison across ${formatCount(totalRows)} rows and ${formatCount(totalColumns)} active columns, with ${formatList(sharedKpis, 'the detected measures', 3)} as the strongest starting KPIs`
    : `${primary?.filename || 'The active dataset'} is ready for an insight-first read across ${formatCount(totalRows)} rows and ${formatCount(totalColumns)} active columns, with ${formatList(primary?.kpis || primary?.measures || [], 'the detected measures', 3)} as the clearest starting KPIs`;

  const insightOne = datasetCount > 1
    ? punctuate(`Coverage spans ${datasetCount} active datasets. The most reusable business lens right now is ${formatList(sharedTerms, 'the currently selected schema', 3)}`)
    : punctuate(`Coverage is strongest around ${primary?.filename || 'the active dataset'}, with ${formatList(primary?.dateFields || [], 'no reliable time axis yet', 2)} serving as the best timeline anchor`);
  const insightTwo = punctuate(`The cleanest metrics to pressure-test first are ${formatList(sharedKpis, 'the available numeric measures', 4)}`);
  const insightThree = punctuate(`The most decision-useful cuts appear to be ${formatList(sharedDimensions, 'the exposed categorical fields', 4)}${sharedDates.length > 0 ? `, with ${formatList(sharedDates, 'the detected date fields', 2)} available for sequence-aware reads` : ''}`);
  const insightFour = punctuate(hotspot.length > 0 || anomaly.length > 0
    ? `Preview watchouts are ${formatList([...anomaly, ...hotspot], 'sample caveats', 2)}`
    : `No major sample anomalies surfaced immediately, so the next improvement should come from narrowing the business question rather than fixing ingestion`);
  const insightFive = punctuate(datasetCount > 1
    ? `Do not blend the datasets yet. Compare them on ${formatList(sharedKpis, 'shared KPIs', 2)} and validate ${formatList(sharedKeys, 'shared business keys', 2)} before treating the comparison as one operating story`
    : `The next sharp question should tie ${formatList(primary?.kpis || primary?.measures || [], 'the strongest KPI', 1)} to ${formatList(primary?.dimensions || primary?.dateFields || [], 'one concrete business slice', 2)} so the insight moves from profiling to diagnosis`);

  const actionOne = punctuate(datasetCount > 1
    ? `Break ${formatList(sharedKpis, 'the top KPI', 1)} down by dataset first, then by ${formatList(sharedDimensions, 'the main operating slice', 2)}`
    : `Start with ${formatList(primary?.kpis || primary?.measures || [], 'the main KPI', 1)} by ${formatList(primary?.dimensions || primary?.dateFields || [], 'the best available slice', 2)}`);
  const actionTwo = punctuate(hotspot.length > 0 || anomaly.length > 0
    ? `Pressure-test ${formatList([...anomaly, ...hotspot], 'the top caveat', 1)} before turning the preview into a management call`
    : `Inspect the top 1 to 2 dimensions for concentration, spread, and outlier behavior before scaling the conclusion`);
  const actionThree = punctuate(datasetCount > 1
    ? `Keep the files separate until KPI definitions and shared keys are aligned cleanly`
    : `Use the next follow-up to isolate one driver, one period, or one segment instead of asking for a broader recap`);

  return [
    `Executive Signal: ${punctuate(headline)}`,
    `1) ${insightOne}`,
    `2) ${insightTwo}`,
    `3) ${insightThree}`,
    `4) ${insightFour}`,
    `5) ${insightFive}`,
    `Action: ${actionOne}`,
    `Action: ${actionTwo}`,
    `Action: ${actionThree}`,
    'Forecast: Forecasting is intentionally skipped in Insights Only mode; keep the focus on current drivers unless a computed sandbox run is explicitly requested.',
    `Data Quality: ${buildPreviewDataQuality(profiles, warnings, 'metadata')}`,
  ].join('\n');
}

function isProbablyDateLike(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && !Number.isNaN(Date.parse(trimmed));
}

function isProbablyNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const cleaned = value.replace(/,/g, '').trim();
  return cleaned.length > 0 && !Number.isNaN(Number(cleaned));
}

export function buildInsightPreviewSummaryFromInlineRows(
  content: string,
  sampleRows: Record<string, unknown>[]
): string {
  const columns = sampleRows[0] ? Object.keys(sampleRows[0]) : [];
  const numericColumns = columns.filter((column) => sampleRows.some((row) => isProbablyNumeric(row?.[column])));
  const dateColumns = columns.filter((column) => sampleRows.some((row) => isProbablyDateLike(row?.[column])));
  const dimensionColumns = columns.filter((column) => !numericColumns.includes(column) && !dateColumns.includes(column));
  const headline = `Inline tabular content was parsed into ${formatCount(sampleRows.length)} representative row${sampleRows.length === 1 ? '' : 's'} and ${formatCount(columns.length)} detected columns, which is enough for an insight-first triage pass`;
  const dataQuality = punctuate(
    `Inline preview is based on pasted rows only. It is useful for direction, but it is not a computed aggregation and may miss hidden formatting or parser issues from the original source`
  );

  return [
    `Executive Signal: ${punctuate(headline)}`,
    `1) ${punctuate(`The clearest numeric starting points are ${formatList(numericColumns, 'the detected numeric fields', 4)}`)}`,
    `2) ${punctuate(`The best grouping or segmentation cuts appear to be ${formatList(dimensionColumns, 'the non-numeric fields', 4)}`)}`,
    `3) ${punctuate(dateColumns.length > 0 ? `A usable time anchor may exist in ${formatList(dateColumns, 'the detected date fields', 2)}` : 'No explicit time axis was detected immediately, so trend language should stay conservative in preview mode')}`,
    `4) ${punctuate(`This pass only sees ${formatCount(sampleRows.length)} sample row${sampleRows.length === 1 ? '' : 's'} from a ${formatCount(content.length)}-character paste, so the strongest value comes from spotting the right next cut rather than declaring a final answer`)}`,
    `5) ${punctuate(`The next sharp question should connect ${formatList(numericColumns, 'the strongest numeric field', 1)} to ${formatList(dimensionColumns.length > 0 ? dimensionColumns : dateColumns, 'one concrete slice', 2)} so the insight moves from structure to business meaning`)}`,
    `Action: ${punctuate(`Break ${formatList(numericColumns, 'the top numeric field', 1)} down by ${formatList(dimensionColumns, 'the best available slice', 2)}`)}`,
    `Action: ${punctuate(dateColumns.length > 0 ? `Use ${formatList(dateColumns, 'the detected timeline', 1)} to compare the latest visible periods before asking for root cause` : 'Pressure-test the largest visible row or category before broadening the question')}`,
    'Action: Keep the next follow-up narrow: one KPI, one slice, and one operating question at a time.',
    'Forecast: Forecasting is intentionally skipped in Insights Only mode; keep the focus on current drivers unless a computed sandbox run is explicitly requested.',
    `Data Quality: ${dataQuality}`,
  ].join('\n');
}

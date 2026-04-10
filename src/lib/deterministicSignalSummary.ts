const SIGNAL_MARKER = '__MASTIFF_SIGNAL__=';

type FinancialStatementSignal = {
  kind: 'financial_statement';
  datasetName?: string;
  coverageNote?: string;
  months?: string[];
  ytdPat?: number;
  ytdTotalIncome?: number;
  ytdPatMarginPct?: number;
  worstMonthLabel?: string;
  worstMonthPat?: number;
  priorMonthLabel?: string;
  priorMonthPat?: number;
  patDropPct?: number;
  worstMonthRevenue?: number;
  highestRevenueMonthLabel?: string;
  highestRevenueValue?: number;
  primaryObservedDriver?: string;
  primaryObservedDriverDelta?: number;
  inventoryCurrent?: number;
  inventoryPrior?: number;
  otherIncomeSpikeLabel?: string | null;
  otherIncomeSpikeValue?: number;
  otherIncomeRecurring?: boolean;
  depreciationAnomalyLabel?: string | null;
  depreciationAnomalyValue?: number;
  nextPeriodLabel?: string;
  forecastPat?: number;
  forecastBandStd?: number;
  revenueCvPct?: number;
  patCvPct?: number;
  monthlyCount?: number;
  dataQuality?: string;
};

type MultiDatasetSignal = {
  kind: 'multi_dataset_overview';
  datasetCount?: number;
  datasetNames?: string[];
  sharedColumnsCount?: number;
  primaryMetric?: string | null;
  topDataset?: string | null;
  topDatasetMetricSum?: number;
  totalRows?: number;
  coverageNote?: string;
  dataQuality?: string;
};

type SingleDatasetNumericSignal = {
  kind: 'single_dataset_numeric';
  rows?: number;
  columns?: number;
  primaryMetric?: string;
  topSegmentLabel?: string;
  topSegmentValue?: number;
  forecastValue?: number;
  timeAxis?: string | null;
  timeGrain?: string | null;
  periodCount?: number;
  latestPeriodLabel?: string | null;
  latestPeriodValue?: number;
  lowestPeriodLabel?: string | null;
  lowestPeriodValue?: number;
  baselineValue?: number;
  changeVsBaselinePct?: number;
  volatilityPct?: number;
  forecastChangePct?: number;
  driverDimension?: string | null;
  driverLabel?: string | null;
  driverValue?: number;
  driverSharePct?: number;
  forecastBasis?: string | null;
  coverageNote?: string;
  dataQuality?: string;
};

export type DeterministicExecutionSignal =
  | FinancialStatementSignal
  | MultiDatasetSignal
  | SingleDatasetNumericSignal;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function appendVisualCue(text: string, hasChart: boolean): string {
  if (!hasChart) return text;
  if (/see interactive visuals below/i.test(text)) return text;
  return `${text} See interactive visuals below.`;
}

function extractSignalLine(executionResultText: string): string | null {
  const lines = String(executionResultText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const signalLine = [...lines].reverse().find((line) => line.startsWith(SIGNAL_MARKER));
  return signalLine ? signalLine.slice(SIGNAL_MARKER.length) : null;
}

function parseSignal(raw: string): DeterministicExecutionSignal | null {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.kind !== 'string') return null;

    if (parsed.kind === 'financial_statement') {
      return parsed as unknown as FinancialStatementSignal;
    }
    if (parsed.kind === 'multi_dataset_overview') {
      return parsed as unknown as MultiDatasetSignal;
    }
    if (parsed.kind === 'single_dataset_numeric') {
      return parsed as unknown as SingleDatasetNumericSignal;
    }
  } catch {
    return null;
  }

  return null;
}

export function extractDeterministicExecutionSignal(executionResultText: string): DeterministicExecutionSignal | null {
  const raw = extractSignalLine(executionResultText);
  if (!raw) return null;
  return parseSignal(raw);
}

function buildFinancialStatementSummary(signal: FinancialStatementSignal, hasChart: boolean): string {
  const ytdPat = toFiniteNumber(signal.ytdPat);
  const ytdIncome = toFiniteNumber(signal.ytdTotalIncome);
  const ytdMargin = toFiniteNumber(signal.ytdPatMarginPct);
  const worstMonthLabel = signal.worstMonthLabel || 'the weakest month';
  const priorMonthLabel = signal.priorMonthLabel || 'the prior month';
  const worstMonthPat = toFiniteNumber(signal.worstMonthPat);
  const priorMonthPat = toFiniteNumber(signal.priorMonthPat);
  const patDropPct = toFiniteNumber(signal.patDropPct);
  const worstMonthRevenue = toFiniteNumber(signal.worstMonthRevenue);
  const highestRevenueMonthLabel = signal.highestRevenueMonthLabel || worstMonthLabel;
  const highestRevenueValue = toFiniteNumber(signal.highestRevenueValue);
  const driver = signal.primaryObservedDriver || 'the largest observed cost driver';
  const driverDelta = toFiniteNumber(signal.primaryObservedDriverDelta);
  const inventoryPrior = toFiniteNumber(signal.inventoryPrior);
  const inventoryCurrent = toFiniteNumber(signal.inventoryCurrent);
  const nextPeriodLabel = signal.nextPeriodLabel || 'the next period';
  const forecastPat = toFiniteNumber(signal.forecastPat);
  const forecastBand = toFiniteNumber(signal.forecastBandStd);
  const revenueCv = toFiniteNumber(signal.revenueCvPct);
  const patCv = toFiniteNumber(signal.patCvPct);
  const otherIncomeSpikeValue = toFiniteNumber(signal.otherIncomeSpikeValue);
  const otherIncomeSpikeLabel = signal.otherIncomeSpikeLabel || 'the spike month';
  const depreciationAnomalyValue = toFiniteNumber(signal.depreciationAnomalyValue);
  const depreciationAnomalyLabel = signal.depreciationAnomalyLabel || 'the flagged month';
  const oneOffSentence = otherIncomeSpikeValue > 0
    ? ` A one-off other-income spike of **${formatAmount(otherIncomeSpikeValue)} T INR** in **${otherIncomeSpikeLabel}** also lowers confidence in a smooth run-rate.`
    : '';
  const oneOffAction = otherIncomeSpikeValue > 0
    ? `→ Action: Separate recurring operating earnings from one-offs in management reporting, especially if **${otherIncomeSpikeLabel}** included **${formatAmount(otherIncomeSpikeValue)} T INR** of non-core income.`
    : '→ Action: Separate recurring operating earnings from one-offs in management reporting before locking targets against this run-rate.';
  const normalizedForecastPat = Math.max(forecastPat, 0);
  const recoveryForecastPat = Math.max(normalizedForecastPat + Math.max(Math.abs(driverDelta) * 0.2, forecastBand * 0.35), 0);
  const stressForecastPat = Math.max(normalizedForecastPat - Math.max(Math.abs(driverDelta) * 0.25, forecastBand * 0.5), 0);
  const revenuePeakContext = highestRevenueValue > 0
    ? `Revenue still peaked at **${formatAmount(highestRevenueValue)} T INR** in **${highestRevenueMonthLabel}**, so the model should focus on earnings conversion instead of demand rescue.`
    : `Revenue in the weakest period remained materially above zero, so the break sits inside the cost and accounting bridge rather than the top line.`;
  const volatilityGap = Math.max(patCv - revenueCv, 0);
  const driverDirection = driverDelta < 0 ? 'deteriorated' : 'improved';

  const hiddenRiskInsight = signal.depreciationAnomalyLabel
    ? `Revenue volatility is low at **${formatPercent(revenueCv)}**, but PAT volatility is **${formatPercent(patCv)}**, so earnings instability is being created inside the cost stack. A positive depreciation entry of **${formatAmount(depreciationAnomalyValue)} T INR** in **${depreciationAnomalyLabel}** should be validated.${oneOffSentence}`
    : `Revenue volatility is low at **${formatPercent(revenueCv)}**, but PAT volatility is **${formatPercent(patCv)}**, so earnings instability is being created inside the cost stack. The period should be managed as a conversion problem, not a demand problem.`;

  return [
    `Executive Signal: YTD PAT is **${formatAmount(ytdPat)} T INR** on **${formatAmount(ytdIncome)} T INR** of total income, a **${formatPercent(ytdMargin)}** PAT margin, but the series hides a sharp conversion failure in ${worstMonthLabel}.`,
    `1) Earnings conversion is the core issue, not revenue sufficiency. ${revenuePeakContext}`,
    `2) PAT fell **${formatPercent(patDropPct)}** to **${formatAmount(worstMonthPat)} T INR** in **${worstMonthLabel}** from **${formatAmount(priorMonthPat)} T INR** in **${priorMonthLabel}**, even while revenue stayed high at **${formatAmount(worstMonthRevenue)} T INR**. That means the break is operational or accounting-driven, not demand-led.`,
    `3) The main bridge driver was **${driver}**, which ${driverDirection} by **${formatAmount(Math.abs(driverDelta))} T INR** versus ${priorMonthLabel}. Inventory moved from **${formatAmount(inventoryPrior)}** to **${formatAmount(inventoryCurrent)} T INR**, and ${appendVisualCue(`${hiddenRiskInsight} PAT volatility exceeds revenue volatility by **${formatPercent(volatilityGap)}**, which means management is dealing with an unstable cost bridge, not a normal sales swing.`, hasChart)}`,
    `→ Action: Audit the ${worstMonthLabel} inventory journals, valuation logic, and cut-off entries before taking any pricing or spend decision.`,
    oneOffAction,
    `→ Action: Put a monthly bridge from revenue to PAT into the operating review so large swings in ${driver.toLowerCase()} are flagged before they distort YTD decisions.`,
    `Forecast: Base case keeps PAT near **${formatAmount(normalizedForecastPat)} T INR** for **${nextPeriodLabel}**. If ${driver.toLowerCase()} normalizes, recovery can move toward **${formatAmount(recoveryForecastPat)} T INR**; if volatility persists, downside can compress toward **${formatAmount(stressForecastPat)} T INR**.${hasChart ? ' See interactive visuals below.' : ''}`,
    `Data Quality: ${signal.dataQuality || 'Directional finance read with enough structure for action, but accounting-style line items still need validation.'}`,
  ].join('\n');
}

function buildMultiDatasetSummary(signal: MultiDatasetSignal, hasChart: boolean): string {
  const datasetCount = Math.max(1, Math.round(toFiniteNumber(signal.datasetCount, 1)));
  const totalRows = Math.round(toFiniteNumber(signal.totalRows));
  const sharedColumnsCount = Math.round(toFiniteNumber(signal.sharedColumnsCount));
  const topMetricSum = toFiniteNumber(signal.topDatasetMetricSum);
  const primaryMetric = signal.primaryMetric || 'the main shared metric';
  const topDataset = signal.topDataset || 'the leading dataset';
  const datasetNames = Array.isArray(signal.datasetNames) ? signal.datasetNames.slice(0, 4).join(', ') : 'the active datasets';

  return [
    `Executive Signal: Cross-file fallback compared **${datasetCount}** unique datasets across **${totalRows}** total rows, so this read is useful for prioritization but not yet a full reconciliation.`,
    `1) ${signal.coverageNote || `Dataset coverage included ${datasetNames}.`}`,
    `2) Shared schema depth is limited to **${sharedColumnsCount}** common columns, so only the aligned KPI layer should drive immediate comparison decisions.`,
    `3) On the shared metric **${primaryMetric}**, the current leader is **${topDataset}** at roughly **${formatAmount(topMetricSum)}** in total value. ${appendVisualCue('The fallback also removed alias duplicates before comparison, which avoids the false “same file counted twice” problem.', hasChart)}`,
    '→ Action: Validate the shared metric definition and unit consistency before treating the leader board as a true performance ranking.',
    '→ Action: Run the next pass on the highest-value dataset and the highest-gap dataset rather than averaging across weakly aligned schemas.',
    '→ Action: Treat low-overlap columns as confidence limits and ask for a join-key-based comparison if the business decision is material.',
    `Forecast: This path is a prioritization forecast, not a financial forecast.${hasChart ? ' See interactive visuals below.' : ''} Use it to decide where deeper driver analysis should happen next.`,
    `Data Quality: ${signal.dataQuality || 'Cross-file result is reproducible, but schema overlap constrains causal claims.'}`,
  ].join('\n');
}

function buildSingleDatasetNumericSummary(signal: SingleDatasetNumericSignal, hasChart: boolean): string {
  const rows = Math.round(toFiniteNumber(signal.rows));
  const columns = Math.round(toFiniteNumber(signal.columns));
  const topValue = toFiniteNumber(signal.topSegmentValue);
  const forecastValue = toFiniteNumber(signal.forecastValue);
  const metric = signal.primaryMetric || 'the primary metric';
  const topSegment = signal.topSegmentLabel || 'the top segment';
  const timeAxis = signal.timeAxis || null;
  const timeGrain = signal.timeGrain || (timeAxis ? 'Observed' : null);
  const periodCount = Math.round(toFiniteNumber(signal.periodCount));
  const latestPeriodLabel = signal.latestPeriodLabel || 'the latest observed period';
  const latestPeriodValue = toFiniteNumber(signal.latestPeriodValue);
  const lowestPeriodLabel = signal.lowestPeriodLabel || 'the weakest period';
  const lowestPeriodValue = toFiniteNumber(signal.lowestPeriodValue);
  const baselineValue = toFiniteNumber(signal.baselineValue);
  const changeVsBaselinePct = toFiniteNumber(signal.changeVsBaselinePct);
  const volatilityPct = toFiniteNumber(signal.volatilityPct);
  const forecastChangePct = toFiniteNumber(signal.forecastChangePct);
  const driverDimension = signal.driverDimension || null;
  const driverLabel = signal.driverLabel || 'the leading operational slice';
  const driverValue = toFiniteNumber(signal.driverValue);
  const driverSharePct = toFiniteNumber(signal.driverSharePct);
  const forecastBasis = signal.forecastBasis
    || (timeAxis
      ? `${timeGrain || 'Observed'} sequence aligned on ${timeAxis}`
      : 'row-order proxy because no reliable time axis was available');
  const hasAlignedTimeAxis = Boolean(timeAxis);
  const driverLine = driverDimension
    ? `The largest concentration sits in **${driverDimension} = ${driverLabel}** at **${formatAmount(driverValue)}**, or about **${formatPercent(driverSharePct)}** of the observed total. That is the first operational slice to isolate before broad policy changes are made.`
    : `The leading concentration point is still **${topSegment}** at **${formatAmount(topValue)}**, but the dataset does not expose a clean categorical driver beyond the peak segment label.`;
  const timeComparisonLine = hasAlignedTimeAxis
    ? `Using **${timeAxis}** as the time axis, the peak period **${topSegment}** reached **${formatAmount(topValue)}**, while the latest **${timeGrain?.toLowerCase() || 'observed'}** period **${latestPeriodLabel}** sits at **${formatAmount(latestPeriodValue)}** versus a baseline of **${formatAmount(baselineValue)}** (${formatPercent(changeVsBaselinePct)} vs baseline).`
    : `No reliable date axis was detected, so the strongest visible concentration remains **${topSegment}** at **${formatAmount(topValue)}** and every directional comparison should be treated as provisional until the data is time-aligned.`;
  const executiveSignal = hasAlignedTimeAxis
    ? `Executive Signal: **${metric}** peaked at **${formatAmount(topValue)}** in **${topSegment}**, and the latest **${timeGrain?.toLowerCase() || 'observed'}** period **${latestPeriodLabel}** is the best read on whether that spike is repeating or fading.`
    : `Executive Signal: The fallback selected **${metric}** as the strongest numeric readout, and **${topSegment}** is currently the largest visible concentration point.`;
  const forecastLine = hasAlignedTimeAxis
    ? `Forecast: Directional only. The current short-term read for **${metric}** is **${formatAmount(forecastValue)}**, based on a ${forecastBasis.toLowerCase()}. It should be used for monitoring, not for committed target setting.${hasChart ? ' See interactive visuals below.' : ''}`
    : `Forecast: Directional only. The current fallback run-rate for **${metric}** is **${formatAmount(forecastValue)}**, and it should be treated as provisional until the sequence is aligned to a real time axis.`;
  const volatilityLine = hasAlignedTimeAxis
    ? `Across **${periodCount || 'the observed'}** ${timeGrain?.toLowerCase() || 'observed'} periods, **${metric}** bottomed at **${formatAmount(lowestPeriodValue)}** in **${lowestPeriodLabel}** and is running at roughly **${formatPercent(volatilityPct)}** volatility versus its baseline. That tells management whether the series is structurally unstable or just temporarily spiking.`
    : `The dataset lacks a reliable time axis, so volatility and weakest-period interpretation remain directional until the sequence can be aligned chronologically.`;
  const forecastChangeLine = hasAlignedTimeAxis
    ? `The current forecast implies **${formatPercent(forecastChangePct)}** versus the latest observed period, which is useful for monitoring whether recovery is emerging or whether the recent softness is persisting.`
    : `The forecast remains a row-order proxy, so treat any implied change as directional rather than operationally commit-worthy.`;
  const hiddenRiskLine = driverDimension
    ? `Because **${driverDimension} = ${driverLabel}** already represents **${formatPercent(driverSharePct)}** of observed volume, a localized issue in that slice can distort the whole run-rate faster than the headline average suggests.`
    : `The top concentration point may be overstating the run-rate, so management should validate whether that peak is representative before generalizing the trend.`;

  return [
    executiveSignal,
    `1) ${signal.coverageNote || `Single-dataset fallback ran on ${rows} rows and ${columns} columns.`}`,
    `2) ${timeComparisonLine}`,
    `3) ${driverLine}`,
    `4) ${volatilityLine}`,
    `5) ${appendVisualCue(`${forecastChangeLine} ${hiddenRiskLine} This fallback is reproducible across **${rows}** rows and **${columns}** columns, which makes it a strong first operating read but not a full root-cause analysis.`, hasChart)}`,
    `→ Action: Validate that **${metric}** is the right decision KPI and not just the first clean numeric field in the table.`,
    driverDimension
      ? `→ Action: Drill into **${driverDimension} = ${driverLabel}** next and compare it against the median slice before changing targets or spend.`
      : `→ Action: Drill into **${topSegment}** next and compare it against the median segment before changing targets or spend.`,
    hasAlignedTimeAxis
      ? `→ Action: Pressure-test the periods immediately before and after **${topSegment}** so the team can distinguish a one-off spike from a recurring operating pattern on **${timeAxis}**.`
      : '→ Action: Add a true date axis or business key in the next pass so the forecast moves from row-order logic to real time logic.',
    forecastLine,
    `Data Quality: ${signal.dataQuality || 'Fallback result is reproducible, but row-order forecasts only hold when row order approximates time.'}`,
  ].join('\n');
}

export function buildDeterministicSignalSummary(
  signal: DeterministicExecutionSignal,
  options: { hasChart: boolean }
): string {
  if (signal.kind === 'financial_statement') {
    return buildFinancialStatementSummary(signal, options.hasChart);
  }
  if (signal.kind === 'multi_dataset_overview') {
    return buildMultiDatasetSummary(signal, options.hasChart);
  }
  return buildSingleDatasetNumericSummary(signal, options.hasChart);
}

export function buildDeterministicSignalSummaryFromExecution(
  executionResultText: string,
  options: { hasChart: boolean }
): string | null {
  const signal = extractDeterministicExecutionSignal(executionResultText);
  if (!signal) return null;
  return buildDeterministicSignalSummary(signal, options);
}

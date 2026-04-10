import { describe, expect, it } from 'vitest';

import {
  buildDeterministicSignalSummaryFromExecution,
  extractDeterministicExecutionSignal,
} from '../src/lib/deterministicSignalSummary';
import { validateSummaryContract } from '../src/lib/chatResponseContract';

const FINANCE_SIGNAL_LINE = '__MASTIFF_SIGNAL__=' + JSON.stringify({
  kind: 'financial_statement',
  coverageNote: 'Single workbook financial statement parsed across 6 monthly periods with YTD totals where available.',
  ytdPat: 33917,
  ytdTotalIncome: 678999.67383,
  ytdPatMarginPct: 4.9951423111,
  worstMonthLabel: "May'25",
  worstMonthPat: 535,
  priorMonthLabel: "Apr'25",
  priorMonthPat: 3992,
  patDropPct: 86.5981963928,
  worstMonthRevenue: 118799.90049,
  highestRevenueMonthLabel: "May'25",
  highestRevenueValue: 118799.90049,
  primaryObservedDriver: 'Inventory swing',
  primaryObservedDriverDelta: -29459.811,
  inventoryCurrent: -24324.98315,
  inventoryPrior: 5134.82785,
  otherIncomeSpikeLabel: "Apr'25",
  otherIncomeSpikeValue: 2703.018,
  otherIncomeRecurring: false,
  depreciationAnomalyLabel: "Mar'25",
  depreciationAnomalyValue: 457.0394,
  nextPeriodLabel: 'P7',
  forecastPat: 648.7333,
  forecastBandStd: 4234.7503,
  revenueCvPct: 3.5767,
  patCvPct: 74.9138,
  monthlyCount: 6,
  dataQuality: 'Directional finance read with strong monthly coverage, but accounting-style line items still need validation before policy changes.',
});

describe('deterministic signal summary', () => {
  it('extracts structured execution signals from execution text', () => {
    const signal = extractDeterministicExecutionSignal([
      'Coverage note: parsed workbook',
      FINANCE_SIGNAL_LINE,
      'Interactive chart generated: Deterministic fallback dashboard: financial statement analysis',
    ].join('\n'));

    expect(signal).toBeTruthy();
    expect(signal?.kind).toBe('financial_statement');
    expect((signal as any)?.worstMonthLabel).toBe("May'25");
  });

  it('builds an exact finance summary from the emitted execution signal', () => {
    const summary = buildDeterministicSignalSummaryFromExecution(FINANCE_SIGNAL_LINE, { hasChart: true });

    expect(summary).toBeTruthy();
    expect(summary).toContain('Executive Signal: YTD PAT is **33,917 T INR**');
    expect(summary).toContain('**5.0%** PAT margin');
    expect(summary).toContain('PAT fell **86.6%**');
    expect(summary).toContain('**Inventory swing**');
    expect(summary).toContain('**29,459.8 T INR**');
    expect(summary).toContain('See interactive visuals below.');
    expect(summary).toContain('Forecast: Base case keeps PAT near');
    expect(summary).not.toContain('Base case:');
    expect(summary).not.toContain('Recovery case:');
    expect(summary).not.toContain('Stress case:');
  });

  it('keeps the finance summary compliant with the route response contract', () => {
    const summary = buildDeterministicSignalSummaryFromExecution(FINANCE_SIGNAL_LINE, { hasChart: true }) || '';

    const validation = validateSummaryContract(
      'Start immediately. Exactly 3 actionable bullets. No introductory text. Analysis this financial statement.',
      summary,
      true,
      true
    );

    expect(validation.valid).toBe(true);
    expect(validation.violations).toEqual([]);
  });

  it('builds a time-aware operating summary from a non-financial single-dataset signal', () => {
    const summary = buildDeterministicSignalSummaryFromExecution('__MASTIFF_SIGNAL__=' + JSON.stringify({
      kind: 'single_dataset_numeric',
      rows: 312,
      columns: 28,
      primaryMetric: 'TotalCount',
      topSegmentLabel: '10 Apr 2026 10:00 PM',
      topSegmentValue: 1218,
      forecastValue: 742,
      timeAxis: 'Date',
      timeGrain: 'Hourly',
      periodCount: 42,
      latestPeriodLabel: '10 Apr 2026 09:00 PM',
      latestPeriodValue: 681,
      lowestPeriodLabel: '09 Apr 2026 04:00 PM',
      lowestPeriodValue: 402,
      baselineValue: 612,
      changeVsBaselinePct: 11.3,
      volatilityPct: 18.4,
      forecastChangePct: 9.0,
      driverDimension: 'Shifts',
      driverLabel: 'Shift B',
      driverValue: 84210,
      driverSharePct: 37.5,
      forecastBasis: 'Hourly sequence aligned on Date',
      coverageNote: 'Single dataset fallback ran on 312 rows and 28 columns, aligned on Date at hourly grain, and ranked Shifts as the main categorical driver.',
      dataQuality: 'Fallback result is reproducible and time-aligned on Date at hourly grain, but causal diagnosis still depends on operational driver fields.',
    }), { hasChart: true });

    expect(summary).toContain('**TotalCount** peaked at **1,218**');
    expect(summary).toContain('Using **Date** as the time axis');
    expect(summary).toContain('**Shifts = Shift B**');
    expect(summary).toContain('**37.5%** of the observed total');
    expect(summary).toContain('hourly sequence aligned on date');
    expect(summary).toContain('**42** hourly periods');
    expect(summary).toContain('**18.4%** volatility');
  });
});

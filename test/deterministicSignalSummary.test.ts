import { describe, expect, it } from 'vitest';

import {
  buildDeterministicSignalSummaryFromExecution,
  extractDeterministicExecutionSignal,
} from '../src/lib/deterministicSignalSummary';

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
    expect(summary).toContain('Forecast: Low-confidence run-rate only.');
  });
});

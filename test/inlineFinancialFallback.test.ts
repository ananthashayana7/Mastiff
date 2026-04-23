import { describe, expect, it } from 'vitest';
import { buildInlineFinancialFallbackCode } from '../src/app/api/chat/route';
import { buildAutoChartRowsFromInlineTable } from '../src/lib/autoChart';
import { buildDeterministicSignalSummaryFromExecution } from '../src/lib/deterministicSignalSummary';

describe('inline financial fallback code generation', () => {
  it('uses valid Python string labels for forecast points and trims note columns from pasted P&L rows', () => {
    const code = buildInlineFinancialFallbackCode('Particulars\tNotes\tJan\'25\tFeb\'25');

    expect(code).toContain('candidates = candidates[-12:]');
    expect(code).toContain('x=["Jun\'25", "Jul\'25 (F)"]');
    expect(code).not.toContain("x=['Jun\\'25', 'Jul\\'25 (F)']");
  });

  it('keeps a chartable inline sample available for pasted financial tables', () => {
    const rows = buildAutoChartRowsFromInlineTable([
      "Particulars\tNotes\tJan 25\tFeb 25\tMar 25\tApr 25\tMay 25\tJun 25\tJan 25\tFeb 25\tMar 25\tApr 25\tMay 25\tJun 25",
      "Revenue from operations\t1\t100000\t101000\t98000\t105000\t104000\t107000\t100000\t201000\t299000\t404000\t508000\t615000",
      "Profit for the year (PAT)\t2\t5000\t5200\t4800\t3992\t535\t6200\t5000\t10200\t15000\t18992\t19527\t25727",
    ].join('\n'));

    expect(rows[4]).toEqual({
      period: 'May 25',
      'Revenue from operations': 104000,
      'Profit for the year (PAT)': 535,
    });
  });

  it('emits a finance signal that upgrades the deterministic fallback summary', () => {
    const code = buildInlineFinancialFallbackCode('Particulars\tNotes\tJan\'25\tFeb\'25');

    expect(code).toContain('SIGNAL_MARKER = "__SPARTA_SIGNAL__="');
    expect(code).toContain("'kind': 'financial_statement'");
    expect(code).toContain('print(SIGNAL_MARKER + json.dumps(signal');

    const summary = buildDeterministicSignalSummaryFromExecution(
      '__SPARTA_SIGNAL__=' + JSON.stringify({
        kind: 'financial_statement',
        ytdPat: 25727,
        ytdTotalIncome: 615000,
        ytdPatMarginPct: 4.1832520325203255,
        worstMonthLabel: 'May 25',
        worstMonthPat: 535,
        priorMonthLabel: 'Apr 25',
        priorMonthPat: 3992,
        patDropPct: 86.59819639278557,
        worstMonthRevenue: 104000,
        highestRevenueMonthLabel: 'Jun 25',
        highestRevenueValue: 107000,
        primaryObservedDriver: 'Inventory swing',
        primaryObservedDriverDelta: -29459.811,
        inventoryCurrent: -24324.98315,
        inventoryPrior: 5134.82785,
        otherIncomeSpikeLabel: 'Apr 25',
        otherIncomeSpikeValue: 2703.018,
        otherIncomeRecurring: false,
        depreciationAnomalyLabel: 'Mar 25',
        depreciationAnomalyValue: 457.0394,
        nextPeriodLabel: 'Jul 25',
        forecastPat: 648.7333,
        forecastBandStd: 4234.7503,
        revenueCvPct: 3.5767,
        patCvPct: 74.9138,
        monthlyCount: 6,
        dataQuality: 'Directional finance read from pasted inline P&L structure; suitable for management triage, but accounting-style line items still need validation.',
      }),
      { hasChart: true }
    );

    expect(summary).toContain('Executive Signal: YTD PAT is **25,727 T INR**');
    expect(summary).toContain('PAT fell **86.6%**');
    expect(summary).toContain('Inventory moved from **5,134.8** to **-24,325 T INR**');
    expect(summary).toContain('Forecast: Base case keeps PAT near');
  });
});

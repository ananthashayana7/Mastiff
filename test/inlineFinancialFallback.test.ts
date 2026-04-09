import { describe, expect, it } from 'vitest';
import { buildInlineFinancialFallbackCode } from '../src/app/api/chat/route';
import { buildAutoChartRowsFromInlineTable } from '../src/lib/autoChart';

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
});
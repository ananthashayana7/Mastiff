import { describe, expect, it } from 'vitest';
import {
  buildAutoChartRowsFromFiles,
  buildAutoChartRowsFromInlineTable,
  hasAutoChartableData,
  normalizeChartRows,
} from '../src/lib/autoChart';

describe('auto chart helpers', () => {
  it('detects chartable numeric rows', () => {
    expect(hasAutoChartableData([
      { month: 'Jan', revenue: 12 },
      { month: 'Feb', revenue: 18 },
      { month: 'Mar', revenue: 21 },
    ])).toBe(true);
  });

  it('rejects non-numeric row sets', () => {
    expect(hasAutoChartableData([
      { region: 'North', owner: 'A' },
      { region: 'South', owner: 'B' },
    ])).toBe(false);
  });

  it('normalizes mixed inputs to chart rows only', () => {
    expect(normalizeChartRows([
      { month: 'Jan', revenue: 12 },
      null,
      'bad-row',
      { month: 'Feb', revenue: 15 },
    ])).toEqual([
      { month: 'Jan', revenue: 12 },
      { month: 'Feb', revenue: 15 },
    ]);
  });

  it('builds file-sample fallback rows with source labels for multi-file contexts', () => {
    const rows = buildAutoChartRowsFromFiles([
      {
        filename: 'sales.csv',
        metadata: { sample: [{ month: 'Jan', revenue: 12 }] },
      },
      {
        filename: 'costs.csv',
        metadata: { sample: [{ month: 'Jan', cost: 9 }] },
      },
    ]);

    expect(rows).toEqual([
      { source_file: 'sales.csv', month: 'Jan', revenue: 12 },
      { source_file: 'costs.csv', month: 'Jan', cost: 9 },
    ]);
  });

  it('parses pasted financial tables into chartable monthly rows', () => {
    const rows = buildAutoChartRowsFromInlineTable([
      "Particulars\tNotes\tJan'25\tFeb'25\tMar'25\tApr'25\tMay'25\tJun'25\tJan'25\tFeb'25\tMar'25\tApr'25\tMay'25\tJun'25",
      "Revenue from operations\t1\t100\t120\t125\t130\t128\t132\t100\t220\t345\t475\t603\t735",
      "Total expenses\t2\t90\t110\t118\t126\t127\t129\t90\t200\t318\t444\t571\t700",
      "Profit for the year (PAT)\t3\t10\t10\t7\t4\t1\t3\t10\t20\t27\t31\t32\t35",
    ].join('\n'));

    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      period: "Jan'25",
      'Revenue from operations': 100,
      'Total expenses': 90,
      'Profit for the year (PAT)': 10,
    });
    expect(hasAutoChartableData(rows)).toBe(true);
  });
});
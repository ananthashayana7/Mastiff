import { describe, expect, it } from 'vitest';

import {
  buildFinancialDatasetMismatchMessage,
  detectDatasetDomain,
  shouldWarnOnFinancialDatasetMismatch,
} from '../src/lib/domainMismatchGuard';

describe('domainMismatchGuard', () => {
  it('detects assembly line datasets from file metadata', () => {
    expect(detectDatasetDomain([
      {
        filename: 'S4_LineRejection.xlsx',
        fileType: 'xlsx',
        metadata: {
          columns: {
            Date: {},
            Shifts: {},
            TotalCount: {},
            'QA Sign': {},
          },
        },
      },
    ])).toBe('assembly_line');
  });

  it('warns when a finance prompt targets a non-financial dataset', () => {
    const files = [
      {
        filename: 'S4_LineRejection.xlsx',
        fileType: 'xlsx',
        metadata: {
          columns: {
            Date: {},
            Shifts: {},
            TotalCount: {},
          },
        },
      },
    ];

    expect(shouldWarnOnFinancialDatasetMismatch('Analyze PAT and margin trends.', files, false)).toBe(true);
    expect(buildFinancialDatasetMismatchMessage(files)).toContain('S4_LineRejection.xlsx');
    expect(buildFinancialDatasetMismatchMessage(files)).toContain('TotalCount');
  });

  it('does not warn when financial data was pasted inline', () => {
    expect(shouldWarnOnFinancialDatasetMismatch('Analyze PAT and margin trends.', [], true)).toBe(false);
  });
});
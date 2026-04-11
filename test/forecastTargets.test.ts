import { describe, expect, it } from 'vitest';

import { buildFocusedForecastPrompt, buildForecastTargetGroups } from '../src/lib/forecastTargets';
import type { DataFile } from '../src/types';

function buildFile(overrides: Partial<DataFile>): DataFile {
  return {
    id: 'file-1',
    name: 'operations.csv',
    type: 'csv',
    content: '',
    preview: [],
    columns: ['Date', 'Revenue', 'Defect Rate'],
    metadata: {
      row_count: 120,
      column_count: 3,
      selectedColumns: ['Date', 'Revenue', 'Defect Rate'],
      datasetIntelligence: {
        generatedAt: '2026-04-11T00:00:00.000Z',
        summary: [],
        businessTerms: [],
        units: [],
        measures: ['Revenue', 'Defect Rate'],
        dimensions: [],
        dateFields: ['Date'],
        keyCandidates: [],
        candidateKpis: ['Revenue'],
        missingnessHotspots: [],
        anomalies: [],
        columnRoles: {
          Date: 'date',
          Revenue: 'measure',
          'Defect Rate': 'measure',
        },
      },
      columns: {
        Date: { dtype: 'date', null_count: 0, null_percentage: 0, unique_count: 120, sample_values: [] },
        Revenue: { dtype: 'float64', null_count: 0, null_percentage: 0, unique_count: 118, sample_values: [], stats: { min: 1, max: 2, mean: 1.5, median: 1.5, std: 0.2, q1: 1.3, q3: 1.7 } },
        'Defect Rate': { dtype: 'float64', null_count: 0, null_percentage: 0, unique_count: 90, sample_values: [], stats: { min: 0, max: 1, mean: 0.2, median: 0.18, std: 0.05, q1: 0.15, q3: 0.23 } },
      },
      sample: [],
    },
    ...overrides,
  };
}

describe('forecast target extraction', () => {
  it('builds dataset groups from metadata intelligence and numeric columns', () => {
    const groups = buildForecastTargetGroups([
      buildFile({
        id: 'sales',
        name: 'sales.csv',
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.fileName).toBe('sales.csv');
    expect(groups[0]?.metrics).toEqual(['Revenue', 'Defect Rate']);
    expect(groups[0]?.dateFields).toEqual(['Date']);
  });

  it('creates a focused forecast prompt that names the dataset, metric, and horizon', () => {
    const [group] = buildForecastTargetGroups([buildFile({ name: 'finance.xlsx' })]);
    const prompt = buildFocusedForecastPrompt(group, 'Revenue', 12);

    expect(prompt).toContain('finance.xlsx');
    expect(prompt).toContain('"Revenue"');
    expect(prompt).toContain('next 12 periods');
    expect(prompt).toContain('base, upside, and downside cases');
  });
});

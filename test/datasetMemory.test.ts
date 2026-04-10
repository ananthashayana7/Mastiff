import { describe, expect, it } from 'vitest';

import {
  buildAnalysisProvenance,
  deriveDatasetIntelligenceProfile,
  mergeDatasetAnalysisMemory,
} from '../src/lib/datasetMemory';

describe('dataset memory', () => {
  it('derives a reusable dataset dossier from metadata', () => {
    const profile = deriveDatasetIntelligenceProfile({
      row_count: 1200,
      selectedColumns: ['posting_date', 'plant', 'reject_qty', 'total_produced', 'sku'],
      columns: {
        posting_date: {
          dtype: 'datetime64[ns]',
          unique_count: 365,
          sample_values: ['2026-01-01', '2026-01-02'],
          date_range: { min: '2026-01-01', max: '2026-12-31' },
        },
        plant: {
          dtype: 'object',
          unique_count: 4,
          sample_values: ['Plant A', 'Plant B'],
        },
        reject_qty: {
          dtype: 'float64',
          unique_count: 234,
          null_percentage: 0,
          sample_values: [10, 12],
          stats: { min: 0, max: 51, std: 5.2 },
        },
        total_produced: {
          dtype: 'float64',
          unique_count: 640,
          null_percentage: 0,
          sample_values: [1000, 980],
          stats: { min: 120, max: 1400, std: 82.5 },
        },
        sku: {
          dtype: 'object',
          unique_count: 1175,
          null_percentage: 0,
          sample_values: ['SKU-1', 'SKU-2'],
        },
      },
    }, 'rejections.csv');

    expect(profile.dateFields).toContain('posting_date');
    expect(profile.measures).toContain('reject_qty');
    expect(profile.dimensions).toContain('plant');
    expect(profile.keyCandidates).toContain('sku');
    expect(profile.candidateKpis).toContain('reject_qty');
  });

  it('merges follow-up memory from prompts and envelopes', () => {
    const memory = mergeDatasetAnalysisMemory({
      existing: null,
      userQuery: 'Rename rejection_qty as rejects and compare rejects by shift after March with a forecast chart.',
      envelope: {
        headline: 'Rejects fell overall, but one shift still drives most of the quality loss.',
        insights: ['Shift B still explains the largest reject concentration.'],
        actions: ['Audit Shift B changeovers this week.'],
      },
      profile: {
        generatedAt: '2026-04-10T00:00:00.000Z',
        summary: [],
        businessTerms: [],
        units: [],
        measures: ['rejection_qty'],
        dimensions: ['shift'],
        dateFields: ['posting_date'],
        keyCandidates: [],
        candidateKpis: ['rejection_qty'],
        missingnessHotspots: [],
        anomalies: [],
        columnRoles: {},
      },
    });

    expect(memory.commonFilters.some((value) => /by shift/i.test(value))).toBe(true);
    expect(memory.previousCharts).toContain('line');
    expect(memory.acceptedMappings).toEqual([{ from: 'rejection_qty', to: 'rejects' }]);
    expect(memory.topFindings[0]).toContain('Rejects fell overall');
  });

  it('builds provenance and reliability notes from file metadata', () => {
    const provenance = buildAnalysisProvenance([
      {
        id: 'file-1',
        name: 'ops.xlsx',
        metadata: {
          row_count: 24,
          selectedColumns: ['shift', 'reject_qty', 'posting_date'],
          extraction_warning: 'Fallback parser used.',
          columns: {
            shift: { dtype: 'object', unique_count: 2, null_percentage: 0 },
            reject_qty: { dtype: 'float64', unique_count: 22, null_percentage: 0 },
            posting_date: {
              dtype: 'datetime64[ns]',
              unique_count: 24,
              null_percentage: 0,
              date_range: { min: '2026-03-01', max: '2026-03-24' },
            },
            notes: { dtype: 'object', unique_count: 20, null_percentage: 72 },
          },
        },
      },
    ], ['Small sample warning']);

    expect(provenance.rowsAnalyzed).toBe(24);
    expect(provenance.dateRange?.field).toBe('posting_date');
    expect(provenance.reliability.label).toBe('Low');
    expect(provenance.reliability.notes.some((note) => /small-sample/i.test(note) || /small sample/i.test(note))).toBe(true);
  });
});

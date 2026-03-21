import { describe, it, expect } from 'vitest';
import {
    checkSampleSize,
    checkLinearDependency,
    checkOutlierSkew,
    checkSyntheticPatterns,
    checkNegativeMargins,
    checkUniversalPatterns,
    generateDataIntelligenceReport,
    formatWarningsForPrompt,
    type FileMetadata,
    type FileContext,
} from '../src/services/dataIntelligenceService';

// ---------------------------------------------------------------------------
// Helpers to build metadata fixtures
// ---------------------------------------------------------------------------

function makeNumericColumn(overrides: Record<string, any> = {}) {
    return {
        dtype: 'float64',
        null_count: 0,
        null_percentage: 0,
        unique_count: 10,
        sample_values: [100, 200, 300],
        stats: {
            min: 50,
            max: 500,
            mean: 250,
            median: 240,
            std: 80,
            q1: 150,
            q3: 350,
        },
        ...overrides,
    };
}

function makeCategoricalColumn(topCategories: { value: string; count: number }[], uniqueCount?: number) {
    return {
        dtype: 'object',
        null_count: 0,
        null_percentage: 0,
        unique_count: uniqueCount ?? topCategories.length,
        sample_values: topCategories.map((c) => c.value),
        top_categories: topCategories,
    };
}

// ---------------------------------------------------------------------------
// 1. Sample Size Check
// ---------------------------------------------------------------------------

describe('checkSampleSize', () => {
    it('returns a critical warning for very small datasets (< 10 rows)', () => {
        const metadata: FileMetadata = {
            row_count: 5,
            column_count: 3,
            columns: {},
            sample: [],
        };
        const warnings = checkSampleSize(metadata);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].type).toBe('low_sample_size');
        expect(warnings[0].severity).toBe('critical');
        expect(warnings[0].message).toContain('5 row(s)');
        expect(warnings[0].message).toContain('snapshots, not patterns');
    });

    it('returns a warning for datasets below threshold but >= 10 rows', () => {
        const metadata: FileMetadata = {
            row_count: 20,
            column_count: 5,
            columns: {},
            sample: [],
        };
        const warnings = checkSampleSize(metadata);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].severity).toBe('warning');
        expect(warnings[0].message).toContain('20 row(s)');
    });

    it('returns no warning when row count meets the threshold', () => {
        const metadata: FileMetadata = {
            row_count: 100,
            column_count: 5,
            columns: {},
            sample: [],
        };
        const warnings = checkSampleSize(metadata);
        expect(warnings).toHaveLength(0);
    });

    it('returns no warning for exactly 30 rows', () => {
        const metadata: FileMetadata = {
            row_count: 30,
            column_count: 3,
            columns: {},
            sample: [],
        };
        const warnings = checkSampleSize(metadata);
        expect(warnings).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 2. Linear Dependency / Correlation Scanner
// ---------------------------------------------------------------------------

describe('checkLinearDependency', () => {
    it('detects perfect positive correlation (one col = k * other)', () => {
        const sample = [
            { Revenue: 100, Total_Cost: 108 },
            { Revenue: 200, Total_Cost: 216 },
            { Revenue: 300, Total_Cost: 324 },
            { Revenue: 400, Total_Cost: 432 },
            { Revenue: 500, Total_Cost: 540 },
        ];
        const metadata: FileMetadata = {
            row_count: 5,
            column_count: 2,
            columns: {
                Revenue: makeNumericColumn(),
                Total_Cost: makeNumericColumn(),
            },
            sample,
        };
        const warnings = checkLinearDependency(metadata, sample);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].type).toBe('perfect_correlation');
        expect(warnings[0].message).toContain('Revenue');
        expect(warnings[0].message).toContain('Total_Cost');
        expect(warnings[0].message).toContain('formulaic');
    });

    it('does not flag columns with normal correlation', () => {
        const sample = [
            { Revenue: 100, Cost: 80 },
            { Revenue: 200, Cost: 130 },
            { Revenue: 300, Cost: 250 },
            { Revenue: 400, Cost: 290 },
            { Revenue: 500, Cost: 510 },
        ];
        const metadata: FileMetadata = {
            row_count: 5,
            column_count: 2,
            columns: {
                Revenue: makeNumericColumn(),
                Cost: makeNumericColumn(),
            },
            sample,
        };
        const warnings = checkLinearDependency(metadata, sample);
        expect(warnings).toHaveLength(0);
    });

    it('skips check when fewer than 3 sample rows', () => {
        const sample = [
            { Revenue: 100, Cost: 108 },
            { Revenue: 200, Cost: 216 },
        ];
        const metadata: FileMetadata = {
            row_count: 2,
            column_count: 2,
            columns: {
                Revenue: makeNumericColumn(),
                Cost: makeNumericColumn(),
            },
            sample,
        };
        const warnings = checkLinearDependency(metadata, sample);
        expect(warnings).toHaveLength(0);
    });

    it('skips check when fewer than 2 numeric columns', () => {
        const metadata: FileMetadata = {
            row_count: 10,
            column_count: 2,
            columns: {
                Revenue: makeNumericColumn(),
                Name: makeCategoricalColumn([{ value: 'Alice', count: 5 }]),
            },
            sample: [{ Revenue: 100, Name: 'Alice' }],
        };
        const warnings = checkLinearDependency(metadata, [{ Revenue: 100, Name: 'Alice' }]);
        expect(warnings).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 3. Outlier / Segment-Skew Check
// ---------------------------------------------------------------------------

describe('checkOutlierSkew', () => {
    it('flags a single row that dominates a column value', () => {
        const sample = [
            { id: 'TXN-1', Revenue: 10 },
            { id: 'TXN-2', Revenue: 15 },
            { id: 'TXN-1008', Revenue: 500 },
            { id: 'TXN-4', Revenue: 5 },
        ];
        const metadata: FileMetadata = {
            row_count: 4,
            column_count: 2,
            columns: {
                Revenue: makeNumericColumn(),
            },
            sample,
        };
        const warnings = checkOutlierSkew(metadata, sample);
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        const skewWarning = warnings.find((w) => w.type === 'outlier_skew');
        expect(skewWarning).toBeDefined();
        expect(skewWarning!.message).toContain('TXN-1008');
        expect(skewWarning!.message).toContain('median');
    });

    it('does not flag when values are evenly distributed', () => {
        const sample = [
            { Revenue: 100 },
            { Revenue: 120 },
            { Revenue: 110 },
            { Revenue: 105 },
        ];
        const metadata: FileMetadata = {
            row_count: 4,
            column_count: 1,
            columns: {
                Revenue: makeNumericColumn(),
            },
            sample,
        };
        const warnings = checkOutlierSkew(metadata, sample);
        expect(warnings).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 4. Synthetic / Zero-Variance Detection
// ---------------------------------------------------------------------------

describe('checkSyntheticPatterns', () => {
    it('flags columns with zero variance', () => {
        const metadata: FileMetadata = {
            row_count: 10,
            column_count: 2,
            columns: {
                Price: makeNumericColumn({ stats: { min: 10, max: 20, mean: 15, median: 15, std: 0, q1: 12, q3: 18 } }),
            },
            sample: [],
        };
        const warnings = checkSyntheticPatterns(metadata);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].type).toBe('zero_variance');
        expect(warnings[0].message).toContain('Price');
    });

    it('flags columns where all rows have the same value', () => {
        const metadata: FileMetadata = {
            row_count: 10,
            column_count: 1,
            columns: {
                Status: makeNumericColumn({ unique_count: 1, stats: { min: 5, max: 5, mean: 5, median: 5, std: 0, q1: 5, q3: 5 } }),
            },
            sample: [],
        };
        const warnings = checkSyntheticPatterns(metadata);
        expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('does not flag columns with normal variance', () => {
        const metadata: FileMetadata = {
            row_count: 100,
            column_count: 1,
            columns: {
                Revenue: makeNumericColumn({ stats: { min: 50, max: 500, mean: 250, median: 240, std: 80, q1: 150, q3: 350 } }),
            },
            sample: [],
        };
        const warnings = checkSyntheticPatterns(metadata);
        expect(warnings).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 5. Negative Margin Check
// ---------------------------------------------------------------------------

describe('checkNegativeMargins', () => {
    it('flags when 100% of rows show cost > revenue', () => {
        const sample = [
            { Revenue: 100, Total_Cost: 108 },
            { Revenue: 200, Total_Cost: 216 },
            { Revenue: 300, Total_Cost: 324 },
        ];
        const metadata: FileMetadata = {
            row_count: 3,
            column_count: 2,
            columns: {
                Revenue: makeNumericColumn(),
                Total_Cost: makeNumericColumn(),
            },
            sample,
        };
        const warnings = checkNegativeMargins(metadata, sample);
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        const marginWarning = warnings.find((w) => w.type === 'negative_margin');
        expect(marginWarning).toBeDefined();
        expect(marginWarning!.severity).toBe('critical');
        expect(marginWarning!.message).toContain('100%');
    });

    it('does not flag when costs are below revenue', () => {
        const sample = [
            { Revenue: 200, Total_Cost: 150 },
            { Revenue: 300, Total_Cost: 250 },
        ];
        const metadata: FileMetadata = {
            row_count: 2,
            column_count: 2,
            columns: {
                Revenue: makeNumericColumn(),
                Total_Cost: makeNumericColumn(),
            },
            sample,
        };
        const warnings = checkNegativeMargins(metadata, sample);
        expect(warnings).toHaveLength(0);
    });

    it('flags universally negative profit column', () => {
        const metadata: FileMetadata = {
            row_count: 10,
            column_count: 1,
            columns: {
                Profit: makeNumericColumn({
                    stats: { min: -200, max: -5, mean: -80, median: -70, std: 40, q1: -120, q3: -30 },
                }),
            },
            sample: [],
        };
        const warnings = checkNegativeMargins(metadata, []);
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        const profitWarning = warnings.find((w) => w.message.includes('Profit'));
        expect(profitWarning).toBeDefined();
        expect(profitWarning!.severity).toBe('critical');
    });
});

// ---------------------------------------------------------------------------
// 6. Universal Pattern Detection
// ---------------------------------------------------------------------------

describe('checkUniversalPatterns', () => {
    it('flags a categorical column with virtually no variation', () => {
        const metadata: FileMetadata = {
            row_count: 100,
            column_count: 1,
            columns: {
                Status: makeCategoricalColumn([{ value: 'Active', count: 98 }, { value: 'Inactive', count: 2 }], 2),
            },
            sample: [],
        };
        const warnings = checkUniversalPatterns(metadata);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].type).toBe('universal_pattern');
        expect(warnings[0].message).toContain('Active');
    });

    it('does not flag columns with adequate variation', () => {
        const metadata: FileMetadata = {
            row_count: 100,
            column_count: 1,
            columns: {
                Region: makeCategoricalColumn([
                    { value: 'North', count: 30 },
                    { value: 'South', count: 25 },
                    { value: 'East', count: 25 },
                    { value: 'West', count: 20 },
                ], 4),
            },
            sample: [],
        };
        const warnings = checkUniversalPatterns(metadata);
        expect(warnings).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 7. Orchestrator
// ---------------------------------------------------------------------------

describe('generateDataIntelligenceReport', () => {
    it('collects warnings from all checks for a small synthetic dataset', () => {
        const sample = [
            { Revenue: 100, Total_Cost: 108, Profit: -8 },
            { Revenue: 200, Total_Cost: 216, Profit: -16 },
            { Revenue: 300, Total_Cost: 324, Profit: -24 },
            { Revenue: 400, Total_Cost: 432, Profit: -32 },
            { Revenue: 500, Total_Cost: 540, Profit: -40 },
        ];

        const metadata: FileMetadata = {
            row_count: 5,
            column_count: 3,
            columns: {
                Revenue: makeNumericColumn({ stats: { min: 100, max: 500, mean: 300, median: 300, std: 158.11, q1: 200, q3: 400 } }),
                Total_Cost: makeNumericColumn({ stats: { min: 108, max: 540, mean: 324, median: 324, std: 170.76, q1: 216, q3: 432 } }),
                Profit: makeNumericColumn({ stats: { min: -40, max: -8, mean: -24, median: -24, std: 12.65, q1: -32, q3: -16 } }),
            },
            sample,
        };

        const files: FileContext[] = [{
            name: 'sales.csv',
            schema: JSON.stringify(metadata),
            sample,
        }];

        const warnings = generateDataIntelligenceReport(files);

        // Should detect: low sample size, perfect correlation (Rev↔Cost), negative margins, negative profit
        expect(warnings.length).toBeGreaterThanOrEqual(2);

        const types = warnings.map((w) => w.type);
        expect(types).toContain('low_sample_size');
        expect(types).toContain('perfect_correlation');
    });

    it('returns no warnings for a clean large dataset', () => {
        const sample = Array.from({ length: 10 }, (_, i) => ({
            Revenue: 100 + i * 20 + Math.random() * 50,
            Cost: 80 + i * 10 + Math.random() * 30,
        }));

        const metadata: FileMetadata = {
            row_count: 500,
            column_count: 2,
            columns: {
                Revenue: makeNumericColumn({ stats: { min: 100, max: 1000, mean: 500, median: 490, std: 200, q1: 300, q3: 700 } }),
                Cost: makeNumericColumn({ stats: { min: 80, max: 700, mean: 350, median: 340, std: 150, q1: 200, q3: 500 } }),
            },
            sample,
        };

        const files: FileContext[] = [{
            name: 'healthy.csv',
            schema: JSON.stringify(metadata),
            sample,
        }];

        const warnings = generateDataIntelligenceReport(files);
        // No low_sample_size, no perfect correlation (randomized), no negative margins
        const critical = warnings.filter((w) => w.severity === 'critical');
        expect(critical).toHaveLength(0);
    });

    it('handles files with unparseable schema gracefully', () => {
        const files: FileContext[] = [{
            name: 'bad.csv',
            schema: 'not-valid-json',
            sample: [],
        }];

        const warnings = generateDataIntelligenceReport(files);
        expect(warnings).toHaveLength(0); // should not throw
    });
});

// ---------------------------------------------------------------------------
// 8. Prompt Formatter
// ---------------------------------------------------------------------------

describe('formatWarningsForPrompt', () => {
    it('returns empty string when there are no warnings', () => {
        expect(formatWarningsForPrompt([])).toBe('');
    });

    it('formats warnings sorted by severity (critical first)', () => {
        const warnings = [
            { type: 'low_sample_size' as const, severity: 'warning' as const, message: 'Small sample' },
            { type: 'negative_margin' as const, severity: 'critical' as const, message: 'All losses' },
            { type: 'universal_pattern' as const, severity: 'info' as const, message: 'No variation' },
        ];
        const result = formatWarningsForPrompt(warnings);
        const lines = result.split('\n');

        // Critical should appear before warning, which should appear before info
        const criticalIdx = lines.findIndex((l) => l.includes('[CRITICAL]'));
        const warningIdx = lines.findIndex((l) => l.includes('[WARNING]'));
        const infoIdx = lines.findIndex((l) => l.includes('[INFO]'));

        expect(criticalIdx).toBeLessThan(warningIdx);
        expect(warningIdx).toBeLessThan(infoIdx);
    });

    it('includes handling instructions', () => {
        const warnings = [
            { type: 'low_sample_size' as const, severity: 'warning' as const, message: 'Small sample' },
        ];
        const result = formatWarningsForPrompt(warnings);
        expect(result).toContain('INSTRUCTIONS FOR HANDLING THESE WARNINGS');
        expect(result).toContain('tentative');
    });
});

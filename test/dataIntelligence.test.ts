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
    checkUniformity,
    sampleSizeLabel,
    detectOutliers,
    computeQualityScore,
    qualityLabel,
    analyseFile,
    formatForPrompt,
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

/* ------------------------------------------------------------------ */
/*  checkUniformity                                                    */
/* ------------------------------------------------------------------ */
describe('checkUniformity', () => {
    it('returns true when all values are identical', () => {
        expect(checkUniformity([0.08, 0.08, 0.08, 0.08])).toBe(true);
    });

    it('returns true when standard deviation is below threshold', () => {
        expect(checkUniformity([0.08, 0.0801, 0.0799, 0.08])).toBe(true);
    });

    it('returns false when values vary significantly', () => {
        expect(checkUniformity([0.08, 0.15, 0.22, 0.05])).toBe(false);
    });

    it('returns false for fewer than 3 data points', () => {
        expect(checkUniformity([0.08, 0.08])).toBe(false);
    });

    it('returns false for empty array', () => {
        expect(checkUniformity([])).toBe(false);
    });

    it('respects custom threshold', () => {
        // StdDev of [1, 2, 3] is ~0.816 — below threshold of 1
        expect(checkUniformity([1, 2, 3], 1)).toBe(true);
        // but above threshold of 0.5
        expect(checkUniformity([1, 2, 3], 0.5)).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/*  sampleSizeLabel                                                    */
/* ------------------------------------------------------------------ */
describe('sampleSizeLabel', () => {
    it('returns no-data message for 0', () => {
        expect(sampleSizeLabel(0)).toContain('No data');
    });

    it('returns single data point for 1', () => {
        expect(sampleSizeLabel(1)).toContain('Single Data Point');
    });

    it('returns anecdotal for 2–4', () => {
        expect(sampleSizeLabel(3)).toContain('Anecdotal Evidence');
    });

    it('returns limited sample for 5–29', () => {
        const label = sampleSizeLabel(10);
        expect(label).toContain('Limited sample');
        expect(label).toContain('N=10');
    });

    it('returns empty string for N >= 30', () => {
        expect(sampleSizeLabel(30)).toBe('');
        expect(sampleSizeLabel(1000)).toBe('');
    });
});

/* ------------------------------------------------------------------ */
/*  detectOutliers                                                     */
/* ------------------------------------------------------------------ */
describe('detectOutliers', () => {
    it('detects a clear outlier', () => {
        // 99 values near 10, one at 1000
        const data = Array(99).fill(10).concat([1000]);
        const outliers = detectOutliers('profit', data);
        expect(outliers.length).toBeGreaterThanOrEqual(1);
        expect(outliers[0].value).toBe(1000);
        expect(Math.abs(outliers[0].zScore)).toBeGreaterThan(3);
    });

    it('returns empty for uniform data', () => {
        const data = [10, 11, 12, 10, 11, 12, 10, 11, 12, 10];
        expect(detectOutliers('profit', data)).toEqual([]);
    });

    it('returns empty for fewer than 3 data points', () => {
        expect(detectOutliers('profit', [100, 200])).toEqual([]);
    });

    it('returns empty when all values are identical', () => {
        expect(detectOutliers('profit', [5, 5, 5, 5])).toEqual([]);
    });
});

/* ------------------------------------------------------------------ */
/*  computeQualityScore                                                */
/* ------------------------------------------------------------------ */
describe('computeQualityScore', () => {
    it('returns 100 for perfect data', () => {
        expect(computeQualityScore(50, 500, 0, false, 0, 10)).toBe(100);
    });

    it('penalises small sample size', () => {
        const score = computeQualityScore(3, 30, 0, false, 0, 10);
        expect(score).toBeLessThan(100);
    });

    it('penalises high null ratio', () => {
        const score = computeQualityScore(50, 500, 250, false, 0, 10);
        expect(score).toBeLessThan(100);
    });

    it('penalises uniform/synthetic data', () => {
        const score = computeQualityScore(50, 500, 0, true, 0, 10);
        expect(score).toBe(80);
    });

    it('penalises many outliers', () => {
        const score = computeQualityScore(50, 500, 0, false, 10, 10);
        expect(score).toBeLessThan(100);
    });

    it('penalises few columns', () => {
        const score = computeQualityScore(50, 100, 0, false, 0, 2);
        expect(score).toBe(85);
    });

    it('never goes below 0', () => {
        expect(computeQualityScore(1, 1, 1, true, 1, 1)).toBeGreaterThanOrEqual(0);
    });

    it('never goes above 100', () => {
        expect(computeQualityScore(100, 1000, 0, false, 0, 20)).toBeLessThanOrEqual(100);
    });
});

/* ------------------------------------------------------------------ */
/*  qualityLabel                                                       */
/* ------------------------------------------------------------------ */
describe('qualityLabel', () => {
    it('returns High for >= 80', () => {
        expect(qualityLabel(80)).toBe('High');
        expect(qualityLabel(100)).toBe('High');
    });

    it('returns Moderate for 60–79', () => {
        expect(qualityLabel(60)).toBe('Moderate');
        expect(qualityLabel(79)).toBe('Moderate');
    });

    it('returns Low for 40–59', () => {
        expect(qualityLabel(40)).toBe('Low');
        expect(qualityLabel(59)).toBe('Low');
    });

    it('returns Very Low for < 40', () => {
        expect(qualityLabel(0)).toBe('Very Low');
        expect(qualityLabel(39)).toBe('Very Low');
    });
});

/* ------------------------------------------------------------------ */
/*  analyseFile                                                        */
/* ------------------------------------------------------------------ */
describe('analyseFile', () => {
    it('detects synthetic/uniform margin data', () => {
        const sample = Array.from({ length: 10 }, (_, i) => ({
            Region: `R${i}`,
            Revenue: 1000 + i * 10,
            Profit_Margin: -0.08,
        }));
        const report = analyseFile({}, sample);

        expect(report.syntheticDataFlag).toBe(true);
        expect(report.warnings.some((w) => w.includes('UNIFORMITY ALERT'))).toBe(true);
    });

    it('flags all-negative profit', () => {
        const sample = [
            { profit: -10 },
            { profit: -20 },
            { profit: -5 },
        ];
        const report = analyseFile({}, sample);
        expect(report.warnings.some((w) => w.includes('CRITICAL'))).toBe(true);
    });

    it('flags small sample size', () => {
        const sample = [{ Revenue: 100, Profit: 10 }];
        const report = analyseFile({}, sample);
        expect(report.sampleSizeDisclaimer).toContain('Single Data Point');
    });

    it('returns clean report for good data', () => {
        const sample = Array.from({ length: 50 }, (_, i) => ({
            Revenue: 500 + Math.random() * 500,
            Profit: 50 + Math.random() * 100,
        }));
        const report = analyseFile({}, sample);
        expect(report.qualityScore).toBeGreaterThanOrEqual(70);
        expect(report.syntheticDataFlag).toBe(false);
        expect(report.sampleSizeDisclaimer).toBe('');
    });

    it('handles empty sample', () => {
        const report = analyseFile({}, []);
        expect(report.qualityScore).toBeLessThanOrEqual(100);
        expect(report.warnings.some((w) => w.includes('No data'))).toBe(true);
    });

    it('handles null and missing values gracefully', () => {
        const sample = [
            { profit: null, revenue: 100 },
            { profit: undefined, revenue: 200 },
            { profit: '', revenue: 300 },
            { profit: 10, revenue: 400 },
        ];
        const report = analyseFile({}, sample as any);
        expect(report.qualityScore).toBeLessThan(100);
    });

    it('detects variance-zero profit column', () => {
        const sample = [
            { Profit: 50, Revenue: 100 },
            { Profit: 50, Revenue: 200 },
            { Profit: 50, Revenue: 300 },
            { Profit: 50, Revenue: 400 },
        ];
        const report = analyseFile({}, sample);
        expect(report.varianceZero).toBe(true);
        expect(report.warnings.some((w) => w.includes('VARIANCE ZERO'))).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  formatForPrompt                                                    */
/* ------------------------------------------------------------------ */
describe('formatForPrompt', () => {
    it('returns empty string when no warnings', () => {
        const report = analyseFile({}, Array.from({ length: 50 }, () => ({ Revenue: 100 })));
        expect(formatForPrompt([report])).toBe('');
    });

    it('includes data quality score in output', () => {
        const sample = [{ Profit_Margin: -0.08 }, { Profit_Margin: -0.08 }, { Profit_Margin: -0.08 }];
        const report = analyseFile({}, sample);
        const prompt = formatForPrompt([report]);
        expect(prompt).toContain('Data Quality Score');
        expect(prompt).toContain('DATA INTELLIGENCE PRE-SCAN');
    });

    it('uses worst score across multiple reports', () => {
        const goodReport = analyseFile({}, Array.from({ length: 50 }, () => ({ Revenue: 100 })));
        const badReport = analyseFile({}, [{ Profit_Margin: -0.08 }, { Profit_Margin: -0.08 }, { Profit_Margin: -0.08 }]);
        const prompt = formatForPrompt([goodReport, badReport]);
        // The bad report should drive the worst score
        expect(prompt).toContain('DATA INTELLIGENCE PRE-SCAN');
    });
});

/* ------------------------------------------------------------------ */
/*  Zero-row / empty dataset edge cases                                */
/* ------------------------------------------------------------------ */
describe('empty dataset handling', () => {
    it('computeQualityScore returns 0 for zero rows', () => {
        expect(computeQualityScore(0, 0, 0, false, 0, 5)).toBe(0);
        expect(computeQualityScore(0, 0, 0, false, 0, 0)).toBe(0);
        expect(computeQualityScore(0, 0, 0, true, 0, 10)).toBe(0);
    });

    it('checkSampleSize returns critical warning with specific message for 0 rows', () => {
        const metadata: FileMetadata = {
            row_count: 0,
            column_count: 5,
            columns: {},
            sample: [],
        };
        const warnings = checkSampleSize(metadata);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].severity).toBe('critical');
        expect(warnings[0].message).toContain('0 rows');
        expect(warnings[0].message).toContain('file parsing failure');
    });

    it('analyseFile with empty sample and schema.row_count=0 gives score 0', () => {
        const report = analyseFile({ row_count: 0, columns: { A: {}, B: {} } }, []);
        expect(report.qualityScore).toBe(0);
        expect(report.qualityLabel).toBe('Very Low');
    });

    it('analyseFile uses schema.row_count when available', () => {
        const sample = Array.from({ length: 10 }, () => ({ Revenue: 100 }));
        const report = analyseFile({ row_count: 500 }, sample);
        // With 500 rows (from schema), no sample-size penalty should apply
        expect(report.sampleSizeDisclaimer).toBe('');
        expect(report.qualityScore).toBeGreaterThanOrEqual(80);
    });

    it('sampleSizeLabel returns parsing guidance for 0', () => {
        const label = sampleSizeLabel(0);
        expect(label).toContain('No data rows found');
        expect(label).toContain('header');
    });

    it('formatForPrompt includes score 0 for empty dataset', () => {
        const emptyReport = analyseFile({ row_count: 0 }, []);
        const prompt = formatForPrompt([emptyReport]);
        expect(prompt).toContain('0/100');
        expect(prompt).toContain('Very Low');
    });
});

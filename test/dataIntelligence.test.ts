import { describe, it, expect } from 'vitest';
import {
    checkUniformity,
    sampleSizeLabel,
    detectOutliers,
    computeQualityScore,
    qualityLabel,
    analyseFile,
    formatForPrompt,
} from '../src/services/dataIntelligenceService';

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

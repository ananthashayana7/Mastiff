/**
 * Mastiff AI — Data Intelligence Service
 *
 * Pre-analysis intelligence layer that examines file metadata and sample data
 * to detect potential data quality issues, statistical anomalies, and contextual
 * problems *before* the LLM generates analysis code.
 *
 * Three executive-level questions answered:
 *   1. Is there enough data?      (volume / sample-size check)
 *   2. Is the data too perfect?   (synthetic / linear-dependency check)
 *   3. Is one row "The Villain"?  (outlier / segment-skew check)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataQualityWarning {
    type:
        | 'low_sample_size'
        | 'perfect_correlation'
        | 'outlier_skew'
        | 'synthetic_data'
        | 'negative_margin'
        | 'zero_variance'
        | 'universal_pattern';
    severity: 'info' | 'warning' | 'critical';
    message: string;
}

export interface ColumnMeta {
    dtype: string;
    null_count: number;
    null_percentage: number;
    unique_count: number;
    sample_values: any[];
    stats?: {
        min: number;
        max: number;
        mean: number;
        median: number;
        std: number;
        q1: number;
        q3: number;
        skew?: number;
        kurtosis?: number;
    };
    top_categories?: { value: string; count: number }[];
}

export interface FileMetadata {
    row_count: number;
    column_count: number;
    columns: Record<string, ColumnMeta>;
    sample: Record<string, any>[];
}

export interface FileContext {
    name: string;
    schema: string;
    sample: any;
}

// ---------------------------------------------------------------------------
// Thresholds (configurable)
// ---------------------------------------------------------------------------

const SAMPLE_SIZE_THRESHOLD = 30;
const CORRELATION_THRESHOLD = 0.998;   // ≈ R = 1.0 with floating-point tolerance
const OUTLIER_SEGMENT_RATIO = 0.5;     // single row > 50 % of segment total
const MIN_VARIANCE_THRESHOLD = 1e-10;  // effectively zero variance

const ID_COLUMN_CANDIDATES = ['id', 'ID', 'Id', 'Transaction_ID', 'transaction_id', 'txn_id', 'order_id', 'Order_ID'];

const REVENUE_PATTERN = /revenue|sales|income/i;
const COST_PATTERN = /cost|cogs|expense/i;
const PROFIT_PATTERN = /profit|margin|net/i;

// ---------------------------------------------------------------------------
// 1. Sample Size Sanity Check
// ---------------------------------------------------------------------------

export function checkSampleSize(metadata: FileMetadata): DataQualityWarning[] {
    const warnings: DataQualityWarning[] = [];

    if (metadata.row_count < SAMPLE_SIZE_THRESHOLD) {
        warnings.push({
            type: 'low_sample_size',
            severity: metadata.row_count < 10 ? 'critical' : 'warning',
            message:
                `Dataset contains only ${metadata.row_count} row(s). ` +
                `With N < ${SAMPLE_SIZE_THRESHOLD}, trend analysis lacks statistical significance. ` +
                `Treat findings as snapshots, not patterns. ` +
                `Avoid words like "Universal" or "Consistent" unless explicitly justified.`,
        });
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// 2. Linear Dependency / Correlation Scanner
// ---------------------------------------------------------------------------

/**
 * Compute Pearson correlation between two numeric arrays.
 * Returns NaN if there are fewer than 3 paired values or zero variance.
 */
function pearsonCorrelation(xs: number[], ys: number[]): number {
    const pairs: [number, number][] = [];
    const len = Math.min(xs.length, ys.length);
    for (let i = 0; i < len; i++) {
        if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) {
            pairs.push([xs[i], ys[i]]);
        }
    }
    if (pairs.length < 3) return NaN;

    const n = pairs.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (const [x, y] of pairs) {
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
    }

    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom === 0) return NaN;

    return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Extract a numeric column from sample rows (best-effort parsing).
 */
function extractNumericColumn(sample: Record<string, any>[], col: string): number[] {
    return sample.map((row) => {
        const v = row[col];
        if (v == null) return NaN;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : NaN;
    });
}

export function checkLinearDependency(
    metadata: FileMetadata,
    sample: Record<string, any>[],
): DataQualityWarning[] {
    const warnings: DataQualityWarning[] = [];
    if (sample.length < 3) return warnings;

    const numericCols = Object.entries(metadata.columns)
        .filter(([, meta]) => meta.stats != null)
        .map(([name]) => name);

    if (numericCols.length < 2) return warnings;

    const vectors: Record<string, number[]> = {};
    for (const col of numericCols) {
        vectors[col] = extractNumericColumn(sample, col);
    }

    const flagged: string[] = [];
    for (let i = 0; i < numericCols.length; i++) {
        for (let j = i + 1; j < numericCols.length; j++) {
            const colA = numericCols[i];
            const colB = numericCols[j];
            const r = pearsonCorrelation(vectors[colA], vectors[colB]);
            if (Number.isFinite(r) && Math.abs(r) >= CORRELATION_THRESHOLD) {
                flagged.push(`${colA} ↔ ${colB} (R=${r.toFixed(4)})`);
            }
        }
    }

    if (flagged.length > 0) {
        warnings.push({
            type: 'perfect_correlation',
            severity: 'warning',
            message:
                `Perfect or near-perfect correlations detected: ${flagged.join('; ')}. ` +
                `Data may be formulaic or synthetic (e.g. one column is a fixed multiplier of another). ` +
                `Analysis may not reflect real-world volatility. Verify data authenticity.`,
        });
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// 3. Outlier / Segment-Skew Detection
// ---------------------------------------------------------------------------

export function checkOutlierSkew(
    metadata: FileMetadata,
    sample: Record<string, any>[],
): DataQualityWarning[] {
    const warnings: DataQualityWarning[] = [];
    if (sample.length < 2) return warnings;

    const numericCols = Object.entries(metadata.columns)
        .filter(([, meta]) => meta.stats != null)
        .map(([name]) => name);

    for (const col of numericCols) {
        const values = extractNumericColumn(sample, col).filter(Number.isFinite);
        if (values.length < 2) continue;

        const total = values.reduce((a, b) => a + Math.abs(b), 0);
        if (total === 0) continue;

        for (let i = 0; i < values.length; i++) {
            const share = Math.abs(values[i]) / total;
            if (share > OUTLIER_SEGMENT_RATIO) {
                const rowLabel = ID_COLUMN_CANDIDATES.reduce<string | undefined>(
                    (found, key) => found || (sample[i]?.[key] != null ? String(sample[i][key]) : undefined),
                    undefined,
                ) || `row ${i + 1}`;
                warnings.push({
                    type: 'outlier_skew',
                    severity: 'warning',
                    message:
                        `In column "${col}", a single entry (${rowLabel}) accounts for ` +
                        `${(share * 100).toFixed(1)}% of the total absolute value. ` +
                        `This can heavily skew averages and segment-level conclusions. ` +
                        `Consider reporting median-based metrics alongside averages and isolating this entry.`,
                });
                break; // one warning per column is enough
            }
        }
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// 4. Synthetic / Zero-Variance Detection
// ---------------------------------------------------------------------------

export function checkSyntheticPatterns(metadata: FileMetadata): DataQualityWarning[] {
    const warnings: DataQualityWarning[] = [];
    const zeroVarCols: string[] = [];

    for (const [col, meta] of Object.entries(metadata.columns)) {
        if (!meta.stats) continue;

        // Zero or near-zero standard deviation on a non-constant column
        if (
            Math.abs(meta.stats.std) < MIN_VARIANCE_THRESHOLD &&
            meta.stats.min !== meta.stats.max
        ) {
            zeroVarCols.push(col);
        }

        // All values same sign and perfectly spaced (heuristic for synthetic data)
        if (meta.unique_count === 1 && metadata.row_count > 1) {
            zeroVarCols.push(col);
        }
    }

    if (zeroVarCols.length > 0) {
        warnings.push({
            type: 'zero_variance',
            severity: 'info',
            message:
                `Column(s) with zero or near-zero variance detected: ${zeroVarCols.join(', ')}. ` +
                `These provide no analytical differentiation and may indicate synthetic or placeholder data.`,
        });
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// 5. Negative Margin / "Common Sense" Heuristics
// ---------------------------------------------------------------------------

export function checkNegativeMargins(
    metadata: FileMetadata,
    sample: Record<string, any>[],
): DataQualityWarning[] {
    const warnings: DataQualityWarning[] = [];

    // Look for revenue/cost/profit column pairs (case-insensitive)
    const colNames = Object.keys(metadata.columns).map((c) => c.toLowerCase());
    const hasRevenue = colNames.some((c) => REVENUE_PATTERN.test(c));
    const hasCost = colNames.some((c) => COST_PATTERN.test(c));
    const hasProfit = colNames.some((c) => PROFIT_PATTERN.test(c));

    if (hasRevenue && hasCost && sample.length > 0) {
        const revenueCol = Object.keys(metadata.columns).find((c) => REVENUE_PATTERN.test(c));
        const costCol = Object.keys(metadata.columns).find((c) => COST_PATTERN.test(c));

        if (revenueCol && costCol) {
            const revValues = extractNumericColumn(sample, revenueCol).filter(Number.isFinite);
            const costValues = extractNumericColumn(sample, costCol).filter(Number.isFinite);
            const minLen = Math.min(revValues.length, costValues.length);

            if (minLen > 0) {
                let lossCount = 0;
                for (let i = 0; i < minLen; i++) {
                    if (costValues[i] > revValues[i]) lossCount++;
                }

                const lossRatio = lossCount / minLen;
                if (lossRatio === 1) {
                    warnings.push({
                        type: 'negative_margin',
                        severity: 'critical',
                        message:
                            `100% of sampled rows show costs exceeding revenue ("${costCol}" > "${revenueCol}"). ` +
                            `This is unusual for real business data. Please verify if "${costCol}" includes ` +
                            `non-operational overhead, or if unit prices are missing a markup. ` +
                            `Treat margin figures with caution until data quality is confirmed.`,
                    });
                } else if (lossRatio > 0.8) {
                    warnings.push({
                        type: 'negative_margin',
                        severity: 'warning',
                        message:
                            `${(lossRatio * 100).toFixed(0)}% of sampled rows show costs exceeding revenue. ` +
                            `This may indicate a pricing issue or a data quality problem. ` +
                            `Recommend verifying the "${costCol}" and "${revenueCol}" columns.`,
                    });
                }
            }
        }
    }

    // Check for a dedicated profit/margin column that is always negative
    if (hasProfit) {
        const profitCol = Object.keys(metadata.columns).find((c) => PROFIT_PATTERN.test(c));
        if (profitCol) {
            const stats = metadata.columns[profitCol]?.stats;
            if (stats && stats.max < 0 && metadata.row_count > 1) {
                warnings.push({
                    type: 'negative_margin',
                    severity: 'critical',
                    message:
                        `Every value in "${profitCol}" is negative (max = ${stats.max}). ` +
                        `A universally negative profit across all entries often signals a ` +
                        `data error (e.g. cost column includes overhead not reflected in price). ` +
                        `Trigger a Data Quality Alert before drawing strategic conclusions.`,
                });
            }
        }
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// 6. Universal Pattern Detection
// ---------------------------------------------------------------------------

export function checkUniversalPatterns(metadata: FileMetadata): DataQualityWarning[] {
    const warnings: DataQualityWarning[] = [];

    // Detect columns where a categorical value covers >90% of rows (e.g., every row is "Loss")
    for (const [col, meta] of Object.entries(metadata.columns)) {
        if (!meta.top_categories || meta.top_categories.length === 0) continue;
        if (metadata.row_count < 2) continue;

        const topCount = meta.top_categories[0].count;
        const share = topCount / metadata.row_count;
        if (share > 0.9 && meta.unique_count <= 2) {
            warnings.push({
                type: 'universal_pattern',
                severity: 'info',
                message:
                    `Column "${col}" has virtually no variation — ` +
                    `"${meta.top_categories[0].value}" accounts for ${(share * 100).toFixed(0)}% of entries. ` +
                    `This dimension provides minimal analytical differentiation.`,
            });
        }
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function generateDataIntelligenceReport(
    files: FileContext[],
): DataQualityWarning[] {
    const allWarnings: DataQualityWarning[] = [];

    for (const file of files) {
        let metadata: FileMetadata;
        try {
            metadata = typeof file.schema === 'string'
                ? JSON.parse(file.schema)
                : file.schema;
        } catch {
            continue; // skip unparseable metadata
        }

        if (!metadata || !metadata.columns) continue;

        const sample: Record<string, any>[] = Array.isArray(file.sample)
            ? file.sample
            : Array.isArray(metadata.sample)
                ? metadata.sample
                : [];

        allWarnings.push(...checkSampleSize(metadata));
        allWarnings.push(...checkLinearDependency(metadata, sample));
        allWarnings.push(...checkOutlierSkew(metadata, sample));
        allWarnings.push(...checkSyntheticPatterns(metadata));
        allWarnings.push(...checkNegativeMargins(metadata, sample));
        allWarnings.push(...checkUniversalPatterns(metadata));
    }

    return allWarnings;
}

/**
 * Format warnings into a text block suitable for injection into LLM prompts.
 */
export function formatWarningsForPrompt(warnings: DataQualityWarning[]): string {
    if (warnings.length === 0) return '';

    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const sorted = [...warnings].sort(
        (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
    );

    const lines = sorted.map(
        (w) => `[${w.severity.toUpperCase()}] ${w.message}`,
    );

    return [
        'DATA QUALITY INTELLIGENCE (pre-analysis diagnostics):',
        ...lines,
        '',
        'INSTRUCTIONS FOR HANDLING THESE WARNINGS:',
        '- Acknowledge relevant warnings in your analysis output.',
        '- For low_sample_size: do NOT use words like "Universal", "Consistent", or "Definitive". Use "tentative", "preliminary", or "indicative" instead.',
        '- For perfect_correlation: flag the formulaic relationship and note that real-world data typically has noise.',
        '- For outlier_skew: report BOTH the average and the median. Isolate the outlier and show results with and without it.',
        '- For negative_margin: trigger a Data Quality Alert in the output and suggest verification steps.',
        '- For synthetic_data or zero_variance: note that analysis may not reflect real-world volatility.',
        '- Prioritize findings by impact: rank issues that affect the largest revenue/cost share first.',
    ].join('\n');
}

/**
 * Data Intelligence Service
 *
 * Pre-analysis "skepticism layer" that checks data quality, detects patterns,
 * and injects contextual warnings into LLM prompts. Transforms the app from
 * a "Table Reporter" into a "Business Strategist" (Digital Twin).
 */

export interface DataColumn {
    name: string;
    values: (string | number | null | undefined)[];
}

export interface DataIntelligenceReport {
    warnings: string[];
    qualityScore: number;          // 0–100
    qualityLabel: string;          // "High" | "Moderate" | "Low" | "Very Low"
    sampleSizeDisclaimer: string;  // empty when N >= 30
    syntheticDataFlag: boolean;
    outliers: OutlierInfo[];
    varianceZero: boolean;
}

export interface OutlierInfo {
    rowIndex: number;
    columnName: string;
    value: number;
    zScore: number;
}

/* ------------------------------------------------------------------ */
/*  Pure numeric helpers                                               */
/* ------------------------------------------------------------------ */

function toNumbers(values: (string | number | null | undefined)[]): number[] {
    const nums: number[] = [];
    for (const v of values) {
        if (v == null) continue;
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n)) continue;
        nums.push(n);
    }
    return nums;
}

function mean(nums: number[]): number {
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]): number {
    if (nums.length < 2) return 0;
    const m = mean(nums);
    const variance = nums.reduce((sum, v) => sum + (v - m) ** 2, 0) / nums.length;
    return Math.sqrt(variance);
}

function zScore(value: number, m: number, sd: number): number {
    if (sd === 0) return 0;
    return (value - m) / sd;
}

/* ------------------------------------------------------------------ */
/*  Core analysis functions (exported for testing)                     */
/* ------------------------------------------------------------------ */

/**
 * Filter 1 – Integrity / Uniformity check.
 * If the standard deviation of a margin-like column is < 0.01, the data
 * looks formulaic or synthetic.
 */
export function checkUniformity(nums: number[], threshold = 0.01): boolean {
    if (nums.length < 3) return false;
    return stdDev(nums) < threshold;
}

/**
 * Filter 2 – Significance / N-size check.
 * Returns appropriate language depending on sample size.
 */
export function sampleSizeLabel(n: number): string {
    if (n === 0) return 'No data points available.';
    if (n === 1) return 'Single Data Point — treat as anecdotal evidence only.';
    if (n < 5) return 'Anecdotal Evidence — fewer than 5 data points; not statistically meaningful.';
    if (n < 30) return `Limited sample (N=${n}). Findings are directional signals, not conclusive trends.`;
    return '';
}

/**
 * Filter 3 – Outlier isolation via Z-score.
 * Returns rows whose absolute Z-score exceeds the threshold (default 3).
 */
export function detectOutliers(
    columnName: string,
    nums: number[],
    absThreshold = 3
): OutlierInfo[] {
    if (nums.length < 3) return [];

    const m = mean(nums);
    const sd = stdDev(nums);
    if (sd === 0) return [];

    const outliers: OutlierInfo[] = [];
    for (let i = 0; i < nums.length; i++) {
        const z = zScore(nums[i], m, sd);
        if (Math.abs(z) > absThreshold) {
            outliers.push({
                rowIndex: i,
                columnName,
                value: nums[i],
                zScore: Math.round(z * 100) / 100,
            });
        }
    }
    return outliers;
}

/**
 * Compute a simple data-quality score (0–100) based on:
 *   - null/missing ratio  (-30 max)
 *   - uniformity flag     (-20)
 *   - sample size         (-20 for N<5, -10 for N<30)
 *   - outlier ratio       (-15 max)
 *   - column count        (-15 if < 3 columns)
 */
export function computeQualityScore(
    totalRows: number,
    totalCells: number,
    nullCells: number,
    isUniform: boolean,
    outlierCount: number,
    columnCount: number
): number {
    let score = 100;

    // Null penalty
    if (totalCells > 0) {
        const nullRatio = nullCells / totalCells;
        score -= Math.min(30, Math.round(nullRatio * 100));
    }

    // Uniformity penalty
    if (isUniform) score -= 20;

    // Sample-size penalty
    if (totalRows < 5) score -= 20;
    else if (totalRows < 30) score -= 10;

    // Outlier penalty
    if (totalRows > 0) {
        const outlierRatio = outlierCount / totalRows;
        score -= Math.min(15, Math.round(outlierRatio * 50));
    }

    // Column-count penalty
    if (columnCount < 3) score -= 15;

    return Math.max(0, Math.min(100, score));
}

export function qualityLabel(score: number): string {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Moderate';
    if (score >= 40) return 'Low';
    return 'Very Low';
}

/* ------------------------------------------------------------------ */
/*  Main entry point – runs all checks on a file's sample data        */
/* ------------------------------------------------------------------ */

const MARGIN_COLUMN_PATTERN = /margin|profit[_ ]?%|markup|gross[_ ]?%/i;
const PROFIT_COLUMN_PATTERN = /profit|net[_ ]?income|earnings|margin/i;

/**
 * Analyse a single file's metadata sample and return a DataIntelligenceReport
 * that the LLM service can inject into its prompt context.
 */
export function analyseFile(
    schema: Record<string, unknown>,
    sample: Record<string, unknown>[]
): DataIntelligenceReport {
    const warnings: string[] = [];
    const rows = Array.isArray(sample) ? sample : [];
    const totalRows = rows.length;
    const columnNames = totalRows > 0 ? Object.keys(rows[0]) : Object.keys(schema);

    /* ---- count nulls ---- */
    let nullCells = 0;
    const totalCells = totalRows * columnNames.length;
    for (const row of rows) {
        for (const col of columnNames) {
            const v = (row as Record<string, unknown>)[col];
            if (v == null || v === '' || v === 'NaN') nullCells++;
        }
    }

    /* ---- uniformity check on margin-like columns ---- */
    let syntheticFlag = false;
    for (const col of columnNames) {
        if (MARGIN_COLUMN_PATTERN.test(col)) {
            const nums = toNumbers(rows.map((r) => (r as Record<string, unknown>)[col] as string | number));
            if (checkUniformity(nums)) {
                syntheticFlag = true;
                warnings.push(
                    `⚠ UNIFORMITY ALERT: Column "${col}" has near-identical values (StdDev < 0.01). ` +
                    'This data appears formulaic or synthetic. Regional/segment analysis is irrelevant — ' +
                    'the pricing model is mathematically broken at the source.'
                );
            }
        }
    }

    /* ---- sample-size disclaimer ---- */
    const sizeDisclaimer = sampleSizeLabel(totalRows);
    if (sizeDisclaimer) {
        warnings.push(`📊 SAMPLE SIZE: ${sizeDisclaimer}`);
    }

    /* ---- outlier detection on profit-like columns ---- */
    const allOutliers: OutlierInfo[] = [];
    for (const col of columnNames) {
        if (PROFIT_COLUMN_PATTERN.test(col)) {
            const nums = toNumbers(rows.map((r) => (r as Record<string, unknown>)[col] as string | number));
            const found = detectOutliers(col, nums);
            allOutliers.push(...found);
        }
    }
    if (allOutliers.length > 0) {
        const ids = allOutliers.map((o) => `Row ${o.rowIndex} (${o.columnName}=${o.value}, Z=${o.zScore})`);
        warnings.push(
            `🔍 OUTLIER ALERT: ${allOutliers.length} anomalous transaction(s) detected: ${ids.join('; ')}. ` +
            'Consider isolating these rows and showing analysis both with and without them.'
        );
    }

    /* ---- negative-margin flag ---- */
    for (const col of columnNames) {
        if (PROFIT_COLUMN_PATTERN.test(col)) {
            const nums = toNumbers(rows.map((r) => (r as Record<string, unknown>)[col] as string | number));
            if (nums.length > 0 && nums.every((n) => n < 0)) {
                warnings.push(
                    `🚨 CRITICAL: Every value in "${col}" is negative — you are losing money on every sale. ` +
                    'This is an immediate pricing/cost crisis, not just a segment issue.'
                );
            }
        }
    }

    /* ---- variance-zero flag (all profit values identical) ---- */
    let varianceZero = false;
    for (const col of columnNames) {
        if (PROFIT_COLUMN_PATTERN.test(col)) {
            const nums = toNumbers(rows.map((r) => (r as Record<string, unknown>)[col] as string | number));
            if (nums.length >= 3 && stdDev(nums) === 0) {
                varianceZero = true;
                warnings.push(
                    `⚠ VARIANCE ZERO: "${col}" is identical in every row. Segmenting by region or category is pointless — ` +
                    'the issue is systemic.'
                );
            }
        }
    }

    /* ---- quality score ---- */
    const qualityScore = computeQualityScore(
        totalRows,
        totalCells,
        nullCells,
        syntheticFlag,
        allOutliers.length,
        columnNames.length
    );

    return {
        warnings,
        qualityScore,
        qualityLabel: qualityLabel(qualityScore),
        sampleSizeDisclaimer: sizeDisclaimer,
        syntheticDataFlag: syntheticFlag,
        outliers: allOutliers,
        varianceZero,
    };
}

/* ------------------------------------------------------------------ */
/*  Format intelligence report as a prompt block                       */
/* ------------------------------------------------------------------ */

export function formatForPrompt(reports: DataIntelligenceReport[]): string {
    const allWarnings = reports.flatMap((r) => r.warnings);
    if (allWarnings.length === 0) return '';

    const worstScore = Math.min(...reports.map((r) => r.qualityScore));
    const worstLabel = qualityLabel(worstScore);

    return [
        'DATA INTELLIGENCE PRE-SCAN:',
        `Data Quality Score: ${worstScore}/100 (${worstLabel})`,
        '',
        ...allWarnings,
        '',
        'IMPORTANT: Incorporate the above warnings into your analysis. ' +
        'If data is flagged as synthetic or uniform, say so explicitly instead of segmenting. ' +
        'For small samples, use hedging language ("signal", "anecdotal") rather than "Key Finding" or "Trend". ' +
        'For outliers, show analysis with and without the anomalous rows.',
    ].join('\n');
}

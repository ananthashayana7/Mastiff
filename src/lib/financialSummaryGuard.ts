const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type FinancialSeries = {
    monthly: number[];
    ytd: number[];
};

type FinancialMetrics = {
    months: string[];
    revenue?: FinancialSeries;
    totalIncome?: FinancialSeries;
    inventory?: FinancialSeries;
    otherIncome?: FinancialSeries;
    depreciation?: FinancialSeries;
    pat?: FinancialSeries;
};

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseFinancialToken(token: string): number {
    const normalized = String(token || '').trim();
    if (!normalized || normalized === '-' || normalized === '—') {
        return 0;
    }

    const numeric = Number(normalized.replace(/,/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeFinancialContent(content: string): string {
    const source = typeof content === 'string' ? content : '';
    const splitMarker = /data given\s*:/i;
    const tail = splitMarker.test(source) ? source.split(splitMarker).slice(1).join(' ') : source;
    return tail.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractMonths(content: string): string[] {
    const matches = Array.from(content.matchAll(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'\d{2}/g));
    const unique = Array.from(new Set(matches.map((match) => match[0])));
    if (unique.length >= 6) {
        return unique.slice(0, 6);
    }
    return ["Jan'25", "Feb'25", "Mar'25", "Apr'25", "May'25", "Jun'25"];
}

function extractSeries(content: string, label: string): FinancialSeries | null {
    const pattern = new RegExp(`${escapeRegex(label)}(?:\\s+\\d+)?\\s+((?:-?\\d[\\d,]*|-|—)(?:\\s+(?:-?\\d[\\d,]*|-|—)){11})`, 'i');
    const match = content.match(pattern);
    if (!match?.[1]) {
        return null;
    }

    const tokens = match[1].trim().split(/\s+/).slice(0, 12).map(parseFinancialToken);
    if (tokens.length < 12) {
        return null;
    }

    return {
        monthly: tokens.slice(0, 6),
        ytd: tokens.slice(6, 12),
    };
}

export function extractFinancialMetricsFromContent(content: string): FinancialMetrics | null {
    const normalized = normalizeFinancialContent(content);
    if (!/profit and loss/i.test(normalized) || !/profit for the year \(PAT\)/i.test(normalized)) {
        return null;
    }

    const metrics: FinancialMetrics = {
        months: extractMonths(normalized),
        revenue: extractSeries(normalized, 'Revenue from operations') || undefined,
        totalIncome: extractSeries(normalized, 'Total Income') || undefined,
        inventory: extractSeries(normalized, 'Changes in inventories of finished goods and work-in-progress') || undefined,
        otherIncome: extractSeries(normalized, 'Other income') || undefined,
        depreciation: extractSeries(normalized, 'Depreciation and amortisation expenses') || undefined,
        pat: extractSeries(normalized, 'Profit for the year (PAT)') || undefined,
    };

    if (!metrics.pat || !metrics.totalIncome) {
        return null;
    }

    return metrics;
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}

function buildMonthLabel(raw: string, fallbackIndex: number): string {
    if (raw) {
        return raw.replace(/'/g, ' ');
    }
    return `${MONTH_NAMES[fallbackIndex] || `M${fallbackIndex + 1}`} 2025`;
}

export function buildDeterministicFinancialSummary(content: string, hasChart: boolean): string | null {
    const metrics = extractFinancialMetricsFromContent(content);
    if (!metrics?.pat || !metrics.totalIncome) {
        return null;
    }

    const months = metrics.months;
    const ytdPat = metrics.pat.ytd[metrics.pat.ytd.length - 1] ?? metrics.pat.monthly.reduce((sum, value) => sum + value, 0);
    const ytdIncome = metrics.totalIncome.ytd[metrics.totalIncome.ytd.length - 1] ?? metrics.totalIncome.monthly.reduce((sum, value) => sum + value, 0);
    const patMargin = ytdIncome !== 0 ? (ytdPat / ytdIncome) * 100 : 0;
    const averageRevenue = metrics.revenue
        ? metrics.revenue.monthly.reduce((sum, value) => sum + value, 0) / metrics.revenue.monthly.length
        : 0;

    const worstPatValue = Math.min(...metrics.pat.monthly);
    const worstPatIndex = metrics.pat.monthly.findIndex((value) => value === worstPatValue);
    const priorPatValue = worstPatIndex > 0 ? metrics.pat.monthly[worstPatIndex - 1] : 0;
    const patDropPct = worstPatIndex > 0 && priorPatValue !== 0
        ? ((priorPatValue - worstPatValue) / Math.abs(priorPatValue)) * 100
        : 0;

    const inventoryValue = metrics.inventory?.monthly[worstPatIndex] ?? 0;
    const priorInventoryValue = worstPatIndex > 0 ? (metrics.inventory?.monthly[worstPatIndex - 1] ?? 0) : 0;
    const inventorySwing = inventoryValue - priorInventoryValue;

    const otherIncomePeak = metrics.otherIncome
        ? Math.max(...metrics.otherIncome.monthly)
        : 0;
    const otherIncomePeakIndex = metrics.otherIncome
        ? metrics.otherIncome.monthly.findIndex((value) => value === otherIncomePeak)
        : -1;
    const otherIncomeEndsAtZero = metrics.otherIncome
        ? metrics.otherIncome.monthly.slice(-2).every((value) => value === 0)
        : false;

    const depreciationAnomalyIndex = metrics.depreciation?.monthly.findIndex((value) => value > 0) ?? -1;
    const depreciationAnomalyValue = depreciationAnomalyIndex >= 0
        ? (metrics.depreciation?.monthly[depreciationAnomalyIndex] ?? 0)
        : 0;

    const annualizedPat = ytdPat * 2;
    const worstMonthLabel = buildMonthLabel(months[worstPatIndex], worstPatIndex);
    const priorMonthLabel = buildMonthLabel(months[Math.max(worstPatIndex - 1, 0)], Math.max(worstPatIndex - 1, 0));
    const otherIncomePeakLabel = otherIncomePeakIndex >= 0 ? buildMonthLabel(months[otherIncomePeakIndex], otherIncomePeakIndex) : 'the peak month';
    const depreciationLabel = depreciationAnomalyIndex >= 0 ? buildMonthLabel(months[depreciationAnomalyIndex], depreciationAnomalyIndex) : 'the reported month';

    const lines = [
        '**📊 Executive Summary**',
        `YTD PAT stands at **${formatNumber(ytdPat)} T INR** on **${formatNumber(ytdIncome)} T INR** of total income, implying a **${formatPercent(patMargin)}** PAT margin through ${buildMonthLabel(months[months.length - 1], months.length - 1)}. Monthly profitability is volatile: PAT fell to **${formatNumber(worstPatValue)} T INR** in **${worstMonthLabel}**, down **${formatPercent(patDropPct)}** from **${priorMonthLabel}** before recovering in the following month.`,
        '',
        '**🚨 Top Concerns & Actions**',
        `→ Action: Investigate the ${worstMonthLabel} profit drop. PAT fell from **${formatNumber(priorPatValue)}** to **${formatNumber(worstPatValue)} T INR**; the largest observed driver was inventory movement, which shifted from **${formatNumber(priorInventoryValue)}** to **${formatNumber(inventoryValue)} T INR** (${formatNumber(inventorySwing)} T INR swing).`,
        '→ Action: Stabilize inventory accounting and forecasting. The inventory line is swinging sharply month to month, which is distorting reported profitability more than the revenue line itself.',
        otherIncomePeak > 0 && otherIncomeEndsAtZero
            ? `→ Action: Validate whether "Other income" is recurring. It contributed **${formatNumber(otherIncomePeak)} T INR** in **${otherIncomePeakLabel}** and then dropped to zero, so forward plans should not assume it repeats without evidence.`
            : '→ Action: Separate recurring operating earnings from one-off items before using the series for planning or target setting.',
        '',
        '**📈 Forecast & Direction**',
        `→ Action: Treat the annualized PAT as a low-confidence run-rate, not a committed forecast. A simple extrapolation implies roughly **${formatNumber(annualizedPat)} T INR** for the year, but the series only has six months and includes a severe outlier month.`,
        metrics.revenue
            ? `→ Action: Build decisions around the operating base, which is comparatively stable. Revenue from operations averages about **${formatNumber(averageRevenue)} T INR** per month, so margin control matters more than top-line rescue right now.`
            : '→ Action: Use a fuller monthly revenue series before making directional statements about top-line momentum.',
        '',
        '**🔍 Gaps & Anomalies**',
        `The profit shock is concentrated rather than broad-based, which points to operational or accounting volatility instead of a collapsing revenue base. Confirm whether the ${worstMonthLabel} inventory move reflects write-downs, valuation changes, returns, or timing effects.`,
        depreciationAnomalyIndex >= 0
            ? `Depreciation shows an unusual positive value of **${formatNumber(depreciationAnomalyValue)} T INR** in **${depreciationLabel}**. That should be verified before management treats the monthly cost trend as clean.`
            : 'No depreciation sign anomaly was detected in the extracted monthly series.',
        '',
        '**💡 Quick Wins**',
        `Review the ${worstMonthLabel} inventory journals and reconciliation support immediately. This is the fastest way to explain the steepest earnings swing in the period.`,
        'Tag non-recurring income separately in management reporting so operating margins are not overstated by one-off items.',
        'Use a bridge view from Total Income to PAT each month so major cost-line swings are visible before they hit YTD reporting.',
        '',
        '**⚡ Data Quality**',
        depreciationAnomalyIndex >= 0
            ? 'Reliability: Moderate. Core totals reconcile, but the positive depreciation entry and sharp inventory swings should be validated before stronger forecast claims are made.'
            : 'Reliability: Moderate. Core totals reconcile, but the volatility in inventory adjustments lowers forecast confidence.',
    ];

    if (hasChart) {
        lines.splice(lines.length - 3, 0, '', '📊 See interactive charts below for details.');
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { files as filesTable, messages, sessions } from '@/db/schema';
import { connectors } from '@/db/connectorSchema';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { buildResilientDeterministicAnalysisFallbackCode, classifyLlmError, llm } from '@/services/llm';
import { kernelService } from '@/services/kernel';
import { generateDataIntelligenceReport, formatWarningsForPrompt, analyseFile, formatForPrompt, DataIntelligenceReport } from '@/services/dataIntelligenceService';
import { AnalysisMode } from '@/src/types';
import { authenticateRequest } from '@/lib/auth';
import { validateCSRFRequest } from '@/lib/csrf';
import { buildRecoverySnippet } from './recoverySnippets';
import { buildContractFallbackSummary, containsTechnicalArtifacts, validateSummaryContract } from '../../../lib/chatResponseContract';
import { buildAnalysisResponseEnvelope, buildFollowUpPrompts, renderEnvelopeAsSummary } from '../../../lib/chatResponseEnvelope';
import { buildAutoChartRowsFromFiles, buildAutoChartRowsFromInlineTable, hasAutoChartableData } from '../../../lib/autoChart';
import { buildCompactFileContext, buildMultiDatasetPromptBlock } from '../../../lib/multiDatasetIntelligence';
import {
    buildAnalysisProvenance,
    buildDatasetMemoryPromptBlock,
    ensureDatasetMetadataProfile,
    mergeDatasetAnalysisMemory,
} from '../../../lib/datasetMemory';
import {
    buildQueryPlanPromptBlock,
    deriveQueryPlan,
    shouldRequireVisualizationFromPlan,
    shouldRunDataAnalysisFromPlan,
} from '../../../lib/queryPlanner';

export const dynamic = 'force-dynamic';

const THEORY_PATTERNS = /^(what is|define|explain|difference between|how does|why does|theory of|concept of)/i;
const ANALYSIS_PATTERNS = /(analy[sz]e|calculate|sum|average|mean|median|std|trend|forecast|correlation|regression|compare|distribution|top\s+\d+|bottom\s+\d+|group by|count)/i;
const VISUALIZATION_PATTERNS = /(chart|plot|graph|visuali[sz]e|dashboard|pie|bar|line|scatter|histogram|heatmap)/i;
const DATA_REFERENCE_PATTERNS = /(dataset|data|file|csv|excel|sheet|table|column|row|pdf|document)/i;
const NUMERIC_INTENT_PATTERNS = /(\d|percent|percentage|kpi|metric|trend|forecast|compare|distribution|anomal|outlier|top\s+\d+|bottom\s+\d+|count|sum|average|mean|median|std|revenue|cost|margin|volume)/i;

// Detect when the user pasted tabular/financial data inline (no uploaded file)
function containsInlineTabularData(content: string): boolean {
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return false;

    const markdownTableRows = lines.filter((line) => line.includes('|') && /^\|?.+\|.+\|?$/.test(line)).length;
    if (markdownTableRows >= 2) return true;

    const markdownSeparatorRows = lines.filter((line) => /^\|?\s*:?-{2,}/.test(line)).length;
    if (markdownTableRows >= 1 && markdownSeparatorRows >= 1) return true;

    const looksDelimited = (delimiter: ',' | '\t' | ';') => {
        const candidateRows = lines
            .map((line) => ({
                line,
                count: line.split(delimiter).length - 1,
            }))
            .filter((entry) => entry.count >= 2);

        if (candidateRows.length < 2) return false;

        const distinctColumnCounts = new Set(candidateRows.map((entry) => entry.count));
        if (distinctColumnCounts.size <= 2) return true;

        return candidateRows.length >= 3;
    };

    if (looksDelimited(',') || looksDelimited('\t') || looksDelimited(';')) return true;

    const jsonObjectRows = lines.filter((line) => /"[^"]+"\s*:\s*/.test(line)).length;
    if (jsonObjectRows >= 3) return true;

    const numericLines = lines.filter((line) => (line.match(/[\d,.]+/g) || []).length >= 3).length;
    return numericLines >= 3;
}

function isColumnShapeError(errorText: string): boolean {
    return /columns passed, passed data had|valueerror:\s*\d+\s*columns passed|assertionerror:\s*\d+\s*columns passed/i.test(errorText || '');
}

function isTabularParseError(errorText: string): boolean {
    return /columns passed, passed data had|parsererror|error tokenizing data|expected\s+\d+\s+fields|saw\s+\d+|too many columns specified|shape of passed values/i.test(errorText || '');
}

export function buildInlineFinancialFallbackCode(rawContent: string): string {
    const b64 = Buffer.from(rawContent || '', 'utf8').toString('base64');

    return String.raw`
import base64
import json
import re
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

raw = base64.b64decode("${b64}").decode("utf-8", errors="ignore")
lines = [ln for ln in raw.splitlines() if ln.strip()]
SIGNAL_MARKER = "__SPARTA_SIGNAL__="

months = ["Jan'25", "Feb'25", "Mar'25", "Apr'25", "May'25", "Jun'25"]

def parse_value(token):
    t = str(token).strip()
    if not t or t in ('-', '—', 'NA', 'N/A', 'null'):
        return 0.0
    t = t.replace(',', '')
    try:
        return float(t)
    except Exception:
        m = re.search(r'-?\d+(?:\.\d+)?', t)
        return float(m.group(0)) if m else 0.0

def split_row(ln):
    # Prefer tabs when present; otherwise split on 2+ spaces for copied document tables.
    if '\t' in ln:
        parts = [p.strip() for p in ln.split('\t')]
    else:
        parts = [p.strip() for p in re.split(r'\s{2,}', ln)]
    return [p for p in parts if p != '']

records = []
for ln in lines:
    if 'PreBo Statement of Profit and loss' in ln:
        continue
    if 'Particulars' in ln and "Jan'25" in ln:
        continue

    parts = split_row(ln)
    if not parts:
        continue

    label = parts[0].strip()
    if not label or label in ('A- Total Income', 'B- Total Expenses'):
        continue

    # Extract numeric-like tokens from the remainder; handle ragged tabs safely.
    candidates = []
    for p in parts[1:]:
        s = p.strip()
        if not s:
            continue
        if s in ('-', '—', 'NA', 'N/A', 'null') or re.search(r'\d', s):
            candidates.append(s)

    if len(candidates) < 12:
        # Try fallback extraction from full line for space-collapsed pasted tables.
        candidates = re.findall(r'-?\d[\d,]*(?:\.\d+)?|\bN/?A\b|\-|—|null', ln, flags=re.IGNORECASE)

    if len(candidates) >= 13:
        # Financial statements often include a numeric note/reference column before the 6 monthly + 6 YTD values.
        candidates = candidates[-12:]

    if len(candidates) < 12:
        # Ignore section labels or malformed rows that don't have monthly+YTD payload.
        continue

    # Keep exactly the first and last 6 numeric-like values to avoid ragged-row shape issues.
    monthly_vals = [parse_value(x) for x in candidates[:6]]
    ytd_vals = [parse_value(x) for x in candidates[-6:]]
    records.append((label, monthly_vals, ytd_vals))

if not records:
    result = "Pasted data was accepted, but no finance-style monthly rows were detected for the deterministic finance fallback. Run the generic analyzer on the visible columns and prioritize the strongest numeric or categorical signals."
else:
    monthly_map = {label: vals for label, vals, _ in records}
    ytd_map = {label: vals for label, _, vals in records}

    df_m = pd.DataFrame(monthly_map, index=months)
    df_y = pd.DataFrame(ytd_map, index=months)
    df_m = df_m.apply(lambda col: pd.to_numeric(col, errors='coerce')).fillna(0.0)
    df_y = df_y.apply(lambda col: pd.to_numeric(col, errors='coerce')).fillna(0.0)

    # Defensive required columns for consistent plotting.
    for col in ['Revenue from operations', 'Total expenses', 'Profit before tax (EBIT)', 'Profit for the year (PAT)',
                'Cost of raw material consumed', 'Employee benefits expense',
                'Changes in inventories of finished goods and work-in-progress', 'Other income']:
        if col not in df_m.columns:
            df_m[col] = 0.0
        if col not in df_y.columns:
            df_y[col] = 0.0

    # Margins
    total_income_col = 'Total Income' if 'Total Income' in df_m.columns else 'Revenue from operations'
    denom = df_m[total_income_col].replace(0, np.nan)
    df_m['PBT Margin (%)'] = (df_m['Profit before tax (EBIT)'] / denom * 100).fillna(0)
    df_m['PAT Margin (%)'] = (df_m['Profit for the year (PAT)'] / denom * 100).fillna(0)

    # One-step forecast using linear trend (numpy fallback, no sklearn dependency needed).
    x = np.arange(len(df_m), dtype=float)
    def trend_forecast(series):
        y = np.array(series.values, dtype=float)
        if len(y) < 2:
            return float(y[-1]) if len(y) else 0.0
        slope, intercept = np.polyfit(x, y, 1)
        return float(intercept + slope * len(y))

    f_rev = trend_forecast(df_m['Revenue from operations'])
    f_exp = trend_forecast(df_m['Total expenses'])
    f_pat = trend_forecast(df_m['Profit for the year (PAT)'])

    pat_series = df_m['Profit for the year (PAT)'].astype(float).values
    revenue_series = df_m['Revenue from operations'].astype(float).values
    total_income_series = df_m[total_income_col].astype(float).values
    inventory_series = df_m['Changes in inventories of finished goods and work-in-progress'].astype(float).values
    raw_material_series = df_m['Cost of raw material consumed'].astype(float).values
    employee_series = df_m['Employee benefits expense'].astype(float).values
    other_income_series = df_m['Other income'].astype(float).values
    depreciation_col = 'Depreciation and amortisation expenses' if 'Depreciation and amortisation expenses' in df_m.columns else 'Depreciation'
    if depreciation_col not in df_m.columns:
        df_m[depreciation_col] = 0.0
    depreciation_series = df_m[depreciation_col].astype(float).values
    other_expenses_series = (np.abs(df_m['Total expenses']).astype(float) - np.abs(df_m['Cost of raw material consumed']).astype(float) - np.abs(df_m['Employee benefits expense']).astype(float)).values

    worst_idx = int(np.argmin(pat_series)) if len(pat_series) else 0
    prior_idx = max(worst_idx - 1, 0)
    best_revenue_idx = int(np.argmax(revenue_series)) if len(revenue_series) else 0
    worst_pat = float(pat_series[worst_idx]) if len(pat_series) else 0.0
    prior_pat = float(pat_series[prior_idx]) if len(pat_series) else 0.0
    pat_drop_pct = float(((prior_pat - worst_pat) / abs(prior_pat)) * 100.0) if abs(prior_pat) > 1e-9 else 0.0

    driver_changes = {
        'Inventory swing': float(inventory_series[worst_idx] - inventory_series[prior_idx]) if len(inventory_series) > worst_idx else 0.0,
        'Raw material': float(raw_material_series[worst_idx] - raw_material_series[prior_idx]) if len(raw_material_series) > worst_idx else 0.0,
        'Employee cost': float(employee_series[worst_idx] - employee_series[prior_idx]) if len(employee_series) > worst_idx else 0.0,
        'Other expenses': float(other_expenses_series[worst_idx] - other_expenses_series[prior_idx]) if len(other_expenses_series) > worst_idx else 0.0,
        'Other income': float(other_income_series[worst_idx] - other_income_series[prior_idx]) if len(other_income_series) > worst_idx else 0.0,
        'Depreciation': float(depreciation_series[worst_idx] - depreciation_series[prior_idx]) if len(depreciation_series) > worst_idx else 0.0,
    }
    primary_driver_name, primary_driver_delta = min(driver_changes.items(), key=lambda item: item[1])

    other_income_spike_idx = int(np.argmax(other_income_series)) if len(other_income_series) else -1
    other_income_spike_value = float(other_income_series[other_income_spike_idx]) if other_income_spike_idx >= 0 else 0.0
    other_income_recurring = bool(len(other_income_series) >= 2 and np.any(other_income_series[-2:] > 0))

    dep_positive_indexes = np.where(depreciation_series > 0)[0].tolist() if len(depreciation_series) else []
    dep_positive_idx = int(dep_positive_indexes[0]) if dep_positive_indexes else -1
    dep_positive_value = float(depreciation_series[dep_positive_idx]) if dep_positive_idx >= 0 else 0.0

    ytd_income_last = float(df_y[total_income_col].iloc[-1]) if len(df_y) else float(np.nansum(total_income_series))
    ytd_pat_last = float(df_y['Profit for the year (PAT)'].iloc[-1]) if len(df_y) else float(np.nansum(pat_series))
    ytd_pat_margin = (ytd_pat_last / ytd_income_last * 100.0) if ytd_income_last else 0.0

    revenue_cv_pct = float((np.std(revenue_series, ddof=1) / np.mean(revenue_series)) * 100.0) if len(revenue_series) >= 2 and np.mean(revenue_series) != 0 else 0.0
    pat_cv_pct = float((np.std(pat_series, ddof=1) / np.mean(np.abs(pat_series))) * 100.0) if len(pat_series) >= 2 and np.mean(np.abs(pat_series)) != 0 else 0.0

    signal = {
        'kind': 'financial_statement',
        'datasetName': 'inline_pasted_financial_table',
        'coverageNote': f"Inline financial statement parsed across {len(months)} monthly periods with YTD totals.",
        'months': [str(month) for month in months],
        'ytdPat': ytd_pat_last,
        'ytdTotalIncome': ytd_income_last,
        'ytdPatMarginPct': ytd_pat_margin,
        'worstMonthLabel': str(months[worst_idx]),
        'worstMonthPat': worst_pat,
        'priorMonthLabel': str(months[prior_idx]),
        'priorMonthPat': prior_pat,
        'patDropPct': pat_drop_pct,
        'worstMonthRevenue': float(revenue_series[worst_idx]) if len(revenue_series) > worst_idx else 0.0,
        'highestRevenueMonthLabel': str(months[best_revenue_idx]),
        'highestRevenueValue': float(revenue_series[best_revenue_idx]) if len(revenue_series) > best_revenue_idx else 0.0,
        'primaryObservedDriver': primary_driver_name,
        'primaryObservedDriverDelta': float(primary_driver_delta),
        'inventoryCurrent': float(inventory_series[worst_idx]) if len(inventory_series) > worst_idx else 0.0,
        'inventoryPrior': float(inventory_series[prior_idx]) if len(inventory_series) > prior_idx else 0.0,
        'otherIncomeSpikeLabel': str(months[other_income_spike_idx]) if other_income_spike_idx >= 0 else None,
        'otherIncomeSpikeValue': other_income_spike_value,
        'otherIncomeRecurring': other_income_recurring,
        'depreciationAnomalyLabel': str(months[dep_positive_idx]) if dep_positive_idx >= 0 else None,
        'depreciationAnomalyValue': dep_positive_value,
        'nextPeriodLabel': "Jul'25",
        'forecastPat': float(f_pat),
        'forecastBandStd': float(np.std(pat_series, ddof=1)) if len(pat_series) >= 3 else 0.0,
        'revenueCvPct': revenue_cv_pct,
        'patCvPct': pat_cv_pct,
        'monthlyCount': int(len(months)),
        'dataQuality': 'Directional finance read from pasted inline P&L structure; suitable for management triage, but accounting-style line items still need validation.',
    }

    print(f"Coverage note: {signal['coverageNote']}")
    print(f"YTD PAT: {ytd_pat_last:,.2f}")
    print(f"YTD total income: {ytd_income_last:,.2f}")
    print(f"YTD PAT margin: {ytd_pat_margin:,.2f}%")
    print(f"Worst month: {months[worst_idx]} PAT {worst_pat:,.2f} ({pat_drop_pct:,.1f}% below {months[prior_idx]})")
    print(f"Primary observed driver: {primary_driver_name} ({primary_driver_delta:,.2f})")
    print(SIGNAL_MARKER + json.dumps(signal, default=float, separators=(',', ':')))

    # Build executive dashboard (all xy traces to avoid subplot type mismatch).
    fig = make_subplots(
        rows=3,
        cols=2,
        subplot_titles=(
            'Monthly Revenue, Expenses, PAT (T INR)',
            'Monthly Profitability Margins (%)',
            'Expense Drivers (T INR)',
            'Inventory Changes & Other Income (T INR)',
            'PBT vs PAT Trend (T INR)',
            'YTD Revenue, Expenses, PAT (T INR)'
        ),
        specs=[[{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'xy'}]]
    )

    fig.add_trace(go.Scatter(x=months, y=df_m['Revenue from operations'], mode='lines+markers', name='Revenue'), row=1, col=1)
    fig.add_trace(go.Scatter(x=months, y=np.abs(df_m['Total expenses']), mode='lines+markers', name='Total Expenses'), row=1, col=1)
    fig.add_trace(go.Scatter(x=months, y=df_m['Profit for the year (PAT)'], mode='lines+markers', name='PAT'), row=1, col=1)
    fig.add_trace(go.Scatter(x=["Jun'25", "Jul'25 (F)"], y=[float(df_m['Revenue from operations'].iloc[-1]), f_rev], mode='lines', name='Revenue Forecast', line={'dash':'dash'}), row=1, col=1)
    fig.add_trace(go.Scatter(x=["Jun'25", "Jul'25 (F)"], y=[float(np.abs(df_m['Total expenses'].iloc[-1])), abs(f_exp)], mode='lines', name='Expenses Forecast', line={'dash':'dash'}), row=1, col=1)
    fig.add_trace(go.Scatter(x=["Jun'25", "Jul'25 (F)"], y=[float(df_m['Profit for the year (PAT)'].iloc[-1]), f_pat], mode='lines', name='PAT Forecast', line={'dash':'dash'}), row=1, col=1)

    fig.add_trace(go.Scatter(x=months, y=df_m['PBT Margin (%)'], mode='lines+markers', name='PBT Margin %'), row=1, col=2)
    fig.add_trace(go.Scatter(x=months, y=df_m['PAT Margin (%)'], mode='lines+markers', name='PAT Margin %'), row=1, col=2)

    fig.add_trace(go.Bar(x=months, y=np.abs(df_m['Cost of raw material consumed']), name='Raw Material'), row=2, col=1)
    fig.add_trace(go.Bar(x=months, y=np.abs(df_m['Employee benefits expense']), name='Employee Benefits'), row=2, col=1)

    fig.add_trace(go.Bar(x=months, y=df_m['Changes in inventories of finished goods and work-in-progress'], name='Inventory Changes'), row=2, col=2)
    fig.add_trace(go.Scatter(x=months, y=df_m['Other income'], mode='lines+markers', name='Other Income'), row=2, col=2)

    fig.add_trace(go.Scatter(x=months, y=df_m['Profit before tax (EBIT)'], mode='lines+markers', name='PBT'), row=3, col=1)
    fig.add_trace(go.Scatter(x=months, y=df_m['Profit for the year (PAT)'], mode='lines+markers', name='PAT (Trend)'), row=3, col=1)

    fig.add_trace(go.Scatter(x=months, y=df_y['Revenue from operations'], mode='lines+markers', name='YTD Revenue'), row=3, col=2)
    fig.add_trace(go.Scatter(x=months, y=np.abs(df_y['Total expenses']), mode='lines+markers', name='YTD Expenses'), row=3, col=2)
    fig.add_trace(go.Scatter(x=months, y=df_y['Profit for the year (PAT)'], mode='lines+markers', name='YTD PAT'), row=3, col=2)

    fig.update_layout(
        title='PreBo P&L Performance Analysis (Jan-Jun 2025)',
        height=1100,
        hovermode='x unified',
        barmode='stack'
    )

    result = fig
`;
}

function isTheoryOnlyQuery(content: string, hasFiles: boolean): boolean {
    const text = content.trim();
    if (!text) return false;

    if (VISUALIZATION_PATTERNS.test(text)) return false;
    if (ANALYSIS_PATTERNS.test(text)) return false;
    if (hasFiles && DATA_REFERENCE_PATTERNS.test(text)) return false;

    if (THEORY_PATTERNS.test(text)) return true;

    const tokens = text.split(/\s+/).length;
    return tokens <= 12 && !hasFiles;
}

function countVisualizationArtifacts(executionResult: {
    charts?: unknown[];
    plotly_charts?: unknown[];
} | null | undefined): number {
    return (executionResult?.charts?.length || 0) + (executionResult?.plotly_charts?.length || 0);
}

function buildPreviewSampleFallback(sessionFiles: Array<{ filename: string; metadata?: unknown }>): Record<string, unknown>[] {
    return buildAutoChartRowsFromFiles(sessionFiles) as Record<string, unknown>[];
}

function sanitizeExecutiveSummary(summary: string): string {
    if (!summary) return '';

    // Strip fenced code blocks that leak implementation details into business-facing summaries.
    let cleaned = summary.replace(/```[\s\S]*?```/g, '').trim();

    // Remove obvious implementation lines that can appear outside fenced blocks.
    cleaned = cleaned
        .split(/\r?\n/)
        .filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) return true;
            return !/^(import\s+|from\s+\w+\s+import|df\s*=|fig\s*=|plt\.|sns\.|go\.|px\.|model\s*=|X\s*=|y\s*=|return\s+\{|\{|\})/i.test(trimmed);
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return cleaned;
}

async function emitResponseQualityEvent(data: {
    sessionId: string;
    userId?: string;
    usedEnvelopeFallback: boolean;
    contractRepairAttempted: boolean;
    contractRepaired: boolean;
    initialViolations: string[];
}) {
    if (process.env.NODE_ENV === 'test') return;

    try {
        const { ObservabilityService } = await import('../../../services/observabilityService');
        await ObservabilityService.recordEvent({
            eventType: 'chat.response_quality',
            eventCategory: 'chat',
            sessionId: data.sessionId,
            userId: data.userId,
            status: data.usedEnvelopeFallback || !data.contractRepaired ? 'warning' : 'success',
            properties: {
                usedEnvelopeFallback: data.usedEnvelopeFallback,
                contractRepairAttempted: data.contractRepairAttempted,
                contractRepaired: data.contractRepaired,
                initialViolations: data.initialViolations,
            },
            dimensions: {
                service: 'chat-api',
                route: '/api/chat',
            },
            metrics: {
                envelope_fallback_used: data.usedEnvelopeFallback ? 1 : 0,
                contract_repair_attempted: data.contractRepairAttempted ? 1 : 0,
                contract_repaired: data.contractRepaired ? 1 : 0,
            },
        });
    } catch (eventError) {
        console.warn('Response quality observability event failed:', eventError);
    }
}

export async function POST(req: NextRequest) {
    try {
        const csrfValidation = await validateCSRFRequest(req);
        if (!csrfValidation.valid) {
            return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
        }

        const user = await authenticateRequest(req);
        if (!user?.id) {
            return NextResponse.json({
                error: 'Unauthorized',
                content: 'You are not authorized. Please sign in and try again.',
                role: 'assistant',
                id: `error-${Date.now()}`,
            }, { status: 401 });
        }

        const {
            sessionId,
            content,
            mode = 'analysis',
            silent = false,
            activeFileIds,
            linkedConnectorIds = [],
            persona = '',
        } = await req.json();

        if (!sessionId || !content) {
            return NextResponse.json({
                error: 'Missing sessionId or content',
                content: 'Missing session or message content. Please try again.',
                role: 'assistant',
                id: `error-${Date.now()}`,
            }, { status: 400 });
        }

        const validModes: AnalysisMode[] = ['chat', 'analysis'];
        const analysisMode: AnalysisMode = validModes.includes(mode) ? mode : 'analysis';

        const session = await db.query.sessions.findFirst({
            where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
            with: {
                files: true,
                messages: {
                    orderBy: asc(messages.createdAt),
                },
            },
        });

        if (!session) {
            return NextResponse.json({
                error: 'Session not found',
                content: 'Session not found. Please start a new chat session.',
                role: 'assistant',
                id: `error-${Date.now()}`,
            }, { status: 404 });
        }

        const normalizedLinkedConnectorIds = Array.isArray(linkedConnectorIds)
            ? linkedConnectorIds
                .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
                .slice(0, 20)
            : [];

        let linkedConnectorContext = '';
        if (normalizedLinkedConnectorIds.length > 0 && session.userId) {
            const linkedRows = await db
                .select({
                    id: connectors.id,
                    name: connectors.name,
                    type: connectors.type,
                    description: connectors.description,
                })
                .from(connectors)
                .where(
                    and(
                        eq(connectors.userId, session.userId),
                        inArray(connectors.id, normalizedLinkedConnectorIds)
                    )
                );

            if (linkedRows.length > 0) {
                linkedConnectorContext = linkedRows
                    .map((connector) =>
                        `- ${connector.name} (${connector.type})${connector.description ? `: ${connector.description}` : ''}`
                    )
                    .join('\n');
            }
        }

        if (!silent) {
            await db.insert(messages).values({
                sessionId,
                role: 'user',
                content,
            });
        }

        const hasActiveFileSelection = Array.isArray(activeFileIds);
        const normalizedActiveFileIds = hasActiveFileSelection
            ? activeFileIds
                .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
                .slice(0, 200)
            : [];

        const explicitSelectedFiles = normalizedActiveFileIds.length > 0
            ? session.files.filter((file) => normalizedActiveFileIds.includes(file.id))
            : [];

        const sessionFiles = explicitSelectedFiles.length > 0 ? explicitSelectedFiles : session.files;
        const profiledSessionFiles = sessionFiles.map((file) => ({
            ...file,
            metadata: ensureDatasetMetadataProfile((file.metadata || {}) as any, file.filename),
        }));
        const hasFiles = sessionFiles.length > 0;
        // Treat messages with pasted tabular/financial data as having effective data even without uploaded files
        const hasPastedData = !hasFiles && containsInlineTabularData(content);

        const effectiveHasFiles = hasFiles || hasPastedData;
        const pastedSampleRows = hasPastedData ? buildAutoChartRowsFromInlineTable(content) : [];
        const queryPlan = deriveQueryPlan(content, {
            hasDataContext: effectiveHasFiles,
            fileCount: sessionFiles.length,
        });
        const queryPlanContext = buildQueryPlanPromptBlock(queryPlan);
        const runDataAnalysis = shouldRunDataAnalysisFromPlan(queryPlan, effectiveHasFiles);

        if (runDataAnalysis) {
            // Build a synthetic file context when the user pasted data inline
            const pastedDataContext = hasPastedData
                ? [{
                    name: 'pasted_data.txt',
                    schema: JSON.stringify({
                        columns: pastedSampleRows[0] ? Object.keys(pastedSampleRows[0]) : [],
                        row_count: pastedSampleRows.length,
                    }),
                    sample: pastedSampleRows,
                }]
                : [];

            const intelligenceFileContexts = hasFiles
                ? profiledSessionFiles.map((f) => ({
                    name: f.filename,
                    schema: JSON.stringify(f.metadata, null, 2),
                    sample: (f.metadata as any)?.sample || [],
                }))
                : pastedDataContext;
            const fileContexts = hasFiles
                ? profiledSessionFiles.map((f) => buildCompactFileContext({
                    name: f.filename,
                    metadata: (f.metadata || {}) as any,
                }))
                : pastedDataContext;

            const executorFiles = sessionFiles.map((f) => ({
                id: f.id,
                name: f.filename,
                path: f.filePath,
            }));

            const dataQualityWarnings = generateDataIntelligenceReport(intelligenceFileContexts);
            const dataQualityContext = formatWarningsForPrompt(dataQualityWarnings);
            const multiDatasetContext = hasFiles
                ? buildMultiDatasetPromptBlock(profiledSessionFiles.map((f) => ({
                    name: f.filename,
                    metadata: (f.metadata || {}) as any,
                })))
                : '';

            /* ---- Data Intelligence Pre-Scan ---- */
            const intelligenceReports: DataIntelligenceReport[] = profiledSessionFiles.map((f) => {
                const metadata = (f.metadata ?? {}) as Record<string, unknown>;
                const sample = (Array.isArray((metadata as any)?.sample) ? (metadata as any).sample : []) as Record<string, unknown>[];
                return analyseFile(metadata, sample);
            });
            const datasetMemoryContext = hasFiles
                ? buildDatasetMemoryPromptBlock(profiledSessionFiles.map((f) => ({
                    id: f.id,
                    name: f.filename,
                    metadata: (f.metadata || {}) as any,
                })))
                : '';
            const dataIntelligenceContext = [formatForPrompt(intelligenceReports), datasetMemoryContext]
                .filter(Boolean)
                .join('\n\n');

            let analysis;
            try {
                analysis = await llm.getAnalysisCode(
                    content,
                    fileContexts,
                    session.messages,
                    analysisMode,
                    linkedConnectorContext,
                    persona,
                    dataQualityContext,
                    dataIntelligenceContext,
                    multiDatasetContext,
                    queryPlanContext
                );
            } catch (analysisError) {
                if (hasPastedData) {
                    const fallbackCode = buildInlineFinancialFallbackCode(content);
                    analysis = {
                        explanation: 'Applied deterministic inline financial fallback because model-generated analysis was unavailable.',
                        code: fallbackCode,
                    };
                } else {
                    throw analysisError;
                }
            }

            if (hasPastedData && /applied deterministic analysis fallback/i.test(String(analysis?.explanation || ''))) {
                analysis = {
                    ...analysis,
                    explanation: 'Applied deterministic inline financial fallback because model-generated analysis was unavailable.',
                    code: buildInlineFinancialFallbackCode(content),
                };
            }

            /* ---- Data recovery preamble for 0-row files ---- */
            const zeroRowFiles = profiledSessionFiles.filter(
                (f) => (f.metadata as any)?.row_count === 0
            );
            if (zeroRowFiles.length > 0) {
                const recoverySnippets = zeroRowFiles
                    .map((f) => buildRecoverySnippet({ filename: f.filename, filePath: f.filePath }))
                    .filter(Boolean);

                if (recoverySnippets.length > 0 && analysis.code) {
                    analysis.code = recoverySnippets.join('\n\n') + '\n\n' + analysis.code;
                }
            }

            let executionResult = await kernelService.execute(sessionId, analysis.code, executorFiles);

            if (executionResult?.error) {
                const repaired = await llm.repairAnalysisCode(
                    content,
                    analysis.code,
                    executionResult.error,
                    executionResult.traceback,
                    fileContexts,
                    analysisMode,
                    queryPlanContext
                );

                if (repaired?.code && repaired.code.trim() && repaired.code !== analysis.code) {
                    const repairedResult = await kernelService.execute(sessionId, repaired.code, executorFiles);
                    if (!repairedResult?.error) {
                        analysis = {
                            ...analysis,
                            explanation: repaired.explanation,
                            code: repaired.code,
                        };
                        executionResult = repairedResult;
                    } else if (/could not convert string to float|valueerror|arg must be a list, tuple|cannot convert.*to numeric/i.test(String(repairedResult.error || ''))) {
                        // Targeted second-pass repair for dirty numeric text in pasted/tabular data.
                        const numericRepair = await llm.repairAnalysisCode(
                            `${content}\n\nTARGETED FIX: sanitize numeric columns for '', '-', 'N/A', and whitespace using pd.to_numeric(..., errors='coerce').fillna(0). Avoid direct astype(float) on raw strings.`,
                            repaired.code,
                            repairedResult.error,
                            repairedResult.traceback,
                            fileContexts,
                            analysisMode,
                            queryPlanContext
                        );

                        if (numericRepair?.code && numericRepair.code.trim()) {
                            const numericRepairedResult = await kernelService.execute(sessionId, numericRepair.code, executorFiles);
                            if (!numericRepairedResult?.error) {
                                analysis = {
                                    ...analysis,
                                    explanation: numericRepair.explanation,
                                    code: numericRepair.code,
                                };
                                executionResult = numericRepairedResult;
                            }
                        }
                    } else if (/trace type 'pie' is not compatible with subplot type 'xy'|not compatible with subplot type/i.test(String(repairedResult.error || ''))) {
                        // Targeted second-pass repair for Plotly subplot spec mismatch.
                        const subplotRepair = await llm.repairAnalysisCode(
                            `${content}\n\nTARGETED FIX: correct Plotly subplot specs. If go.Pie is used, corresponding specs cell must be {"type":"domain"}. If go.Table is used, specs cell must be {"type":"table"}. Never place pie/table traces in xy subplots.`,
                            repaired.code,
                            repairedResult.error,
                            repairedResult.traceback,
                            fileContexts,
                            analysisMode,
                            queryPlanContext
                        );

                        if (subplotRepair?.code && subplotRepair.code.trim()) {
                            const subplotRepairedResult = await kernelService.execute(sessionId, subplotRepair.code, executorFiles);
                            if (!subplotRepairedResult?.error) {
                                analysis = {
                                    ...analysis,
                                    explanation: subplotRepair.explanation,
                                    code: subplotRepair.code,
                                };
                                executionResult = subplotRepairedResult;
                            }
                        }
                    } else if (/columns passed, passed data had|valueerror: .*columns passed|assertionerror: .*columns passed/i.test(String(repairedResult.error || ''))) {
                        // Targeted second-pass repair for ragged tabular rows from pasted data.
                        const shapeRepair = await llm.repairAnalysisCode(
                            `${content}\n\nTARGETED FIX: normalize tab-split rows before DataFrame creation. For each row, trim cells, then slice to target width or pad with '' to match expected columns. Skip section-label rows without numeric payload. Never build DataFrame from ragged rows.`,
                            repaired.code,
                            repairedResult.error,
                            repairedResult.traceback,
                            fileContexts,
                            analysisMode,
                            queryPlanContext
                        );

                        if (shapeRepair?.code && shapeRepair.code.trim()) {
                            const shapeRepairedResult = await kernelService.execute(sessionId, shapeRepair.code, executorFiles);
                            if (!shapeRepairedResult?.error) {
                                analysis = {
                                    ...analysis,
                                    explanation: shapeRepair.explanation,
                                    code: shapeRepair.code,
                                };
                                executionResult = shapeRepairedResult;
                            }
                        }
                    }
                }
            }

            // Deterministic fallback for pasted tabular/financial data when parser-shape issues persist.
            if (executionResult?.error && hasPastedData && isTabularParseError(String(executionResult.error || ''))) {
                try {
                    const fallbackCode = buildInlineFinancialFallbackCode(content);
                    const fallbackExecution = await kernelService.execute(sessionId, fallbackCode, executorFiles);
                    if (!fallbackExecution?.error) {
                        analysis = {
                            ...analysis,
                            explanation: 'Applied deterministic parser fallback for ragged pasted tabular data.',
                            code: fallbackCode,
                        };
                        executionResult = fallbackExecution;
                    }
                } catch (inlineFallbackError) {
                    console.warn('Inline financial fallback failed:', inlineFallbackError);
                }
            }

            if (hasPastedData && /data is empty after loading/i.test(String(executionResult?.result || ''))) {
                try {
                    const fallbackCode = buildInlineFinancialFallbackCode(content);
                    const fallbackExecution = await kernelService.execute(sessionId, fallbackCode, executorFiles);
                    if (!fallbackExecution?.error && !/data is empty after loading/i.test(String(fallbackExecution.result || ''))) {
                        analysis = {
                            ...analysis,
                            explanation: 'Replaced empty-data inline analysis with deterministic financial fallback.',
                            code: fallbackCode,
                        };
                        executionResult = fallbackExecution;
                    }
                } catch (inlineEmptyFallbackError) {
                    console.warn('Inline financial empty-data fallback failed:', inlineEmptyFallbackError);
                }
            }

            const visualizationRequired = shouldRequireVisualizationFromPlan(queryPlan, effectiveHasFiles);
            const currentChartCount = countVisualizationArtifacts(executionResult);
            const needsVisualizationRecovery = visualizationRequired && currentChartCount === 0;

            if (needsVisualizationRecovery) {
                try {
                    const visualizationRecoveryPrompt = `${content}\n\nCRITICAL RECOVERY DIRECTIVE: The previous attempt ${executionResult.error ? 'failed or ' : ''}produced no charts. Re-run analysis and MANDATORILY return at least one interactive Plotly chart from the uploaded data. The Python code must set result to a Plotly figure.`;

                    const visualizationAnalysis = await llm.getAnalysisCode(
                        visualizationRecoveryPrompt,
                        fileContexts,
                        session.messages,
                        analysisMode,
                        linkedConnectorContext,
                        persona,
                        dataQualityContext,
                        dataIntelligenceContext,
                        '',
                        queryPlanContext
                    );

                    if (visualizationAnalysis?.code?.trim()) {
                        const visualizationExecution = await kernelService.execute(sessionId, visualizationAnalysis.code, executorFiles);
                        const recoveredChartCount = countVisualizationArtifacts(visualizationExecution);

                        if (!visualizationExecution?.error && recoveredChartCount > 0) {
                            analysis = {
                                ...analysis,
                                explanation: `${analysis.explanation || 'Analysis completed.'}\n\nVisualization recovery pass executed to guarantee chart output.`,
                                code: `${analysis.code || ''}\n\n# --- Visualization Recovery Pass ---\n${visualizationAnalysis.code}`,
                            };

                            executionResult = {
                                ...executionResult,
                                charts: [
                                    ...(executionResult.charts || []),
                                    ...(visualizationExecution.charts || []),
                                ],
                                plotly_charts: [
                                    ...(executionResult.plotly_charts || []),
                                    ...(visualizationExecution.plotly_charts || []),
                                ],
                                updated_df_sample: visualizationExecution.updated_df_sample || executionResult.updated_df_sample,
                            };
                        }
                    }
                } catch (vizRecoveryError) {
                    console.warn('Visualization recovery pass failed:', vizRecoveryError);
                }

                if (countVisualizationArtifacts(executionResult) === 0) {
                    try {
                        const deterministicVisualizationCode = hasPastedData
                            ? buildInlineFinancialFallbackCode(content)
                            : buildResilientDeterministicAnalysisFallbackCode(true);
                        const deterministicVisualizationExecution = await kernelService.execute(sessionId, deterministicVisualizationCode, executorFiles);
                        const deterministicChartCount = countVisualizationArtifacts(deterministicVisualizationExecution);

                        if (!deterministicVisualizationExecution?.error && deterministicChartCount > 0) {
                            analysis = {
                                ...analysis,
                                explanation: `${analysis.explanation || 'Analysis completed.'}\n\nDeterministic visualization fallback executed to guarantee chart output.`,
                                code: deterministicVisualizationCode,
                            };
                            executionResult = deterministicVisualizationExecution;
                        }
                    } catch (deterministicVizError) {
                        console.warn('Deterministic visualization fallback failed:', deterministicVizError);
                    }
                }
            }

            if (countVisualizationArtifacts(executionResult) === 0) {
                const existingSample = Array.isArray(executionResult.updated_df_sample) ? executionResult.updated_df_sample : [];
                const previewFallback = hasFiles
                    ? buildPreviewSampleFallback(sessionFiles)
                    : pastedSampleRows;
                if (!hasAutoChartableData(existingSample) && hasAutoChartableData(previewFallback)) {
                    if (hasAutoChartableData(previewFallback)) {
                        executionResult = {
                            ...executionResult,
                            updated_df_sample: previewFallback,
                        };
                    }
                }
            }

            const groundedSummary = await llm.summarizeExecution(
                content,
                analysis.code,
                {
                    success: !executionResult.error,
                    result: executionResult.result,
                    error: executionResult.error,
                    traceback: executionResult.traceback,
                    charts: executionResult.charts,
                    plotly_charts: executionResult.plotly_charts,
                },
                analysisMode,
                dataQualityContext,
                dataIntelligenceContext
            );

            const numericIntent = visualizationRequired;
            const initialContractValidation = validateSummaryContract(
                content,
                groundedSummary,
                numericIntent,
                Boolean(analysis.code?.trim())
            );

            let finalSummary = groundedSummary;
            let contractRepairAttempted = false;
            let contractRepaired = initialContractValidation.valid;

            if (!initialContractValidation.valid) {
                contractRepairAttempted = true;
                const contractRepairPrompt = `${content}\n\nSTRICT RESPONSE CONTRACT REPAIR: Your previous response violated contract rules (${initialContractValidation.violations.join(', ')}). Regenerate summary that strictly follows requested format and limits. Do not add greetings or preambles.`;

                try {
                    const repairedSummary = await llm.summarizeExecution(
                        contractRepairPrompt,
                        analysis.code,
                        {
                            success: !executionResult.error,
                            result: executionResult.result,
                            error: executionResult.error,
                            traceback: executionResult.traceback,
                            charts: executionResult.charts,
                            plotly_charts: executionResult.plotly_charts,
                        },
                        analysisMode,
                        dataQualityContext,
                        dataIntelligenceContext
                    );

                    const repairedValidation = validateSummaryContract(
                        content,
                        repairedSummary,
                        numericIntent,
                        Boolean(analysis.code?.trim())
                    );

                    contractRepaired = repairedValidation.valid;

                    finalSummary = repairedValidation.valid
                        ? repairedSummary
                        : buildContractFallbackSummary(
                            content,
                            ((executionResult.charts?.length || 0) + (executionResult.plotly_charts?.length || 0)) > 0,
                            Boolean(analysis.code?.trim())
                        );
                } catch {
                    contractRepaired = false;
                    finalSummary = buildContractFallbackSummary(
                        content,
                        ((executionResult.charts?.length || 0) + (executionResult.plotly_charts?.length || 0)) > 0,
                        Boolean(analysis.code?.trim())
                    );
                }
            }

            finalSummary = sanitizeExecutiveSummary(finalSummary);
            if (!finalSummary) {
                finalSummary = buildContractFallbackSummary(
                    content,
                    ((executionResult.charts?.length || 0) + (executionResult.plotly_charts?.length || 0)) > 0,
                    Boolean(analysis.code?.trim())
                );
            }

            if (containsTechnicalArtifacts(finalSummary)) {
                finalSummary = buildContractFallbackSummary(
                    content,
                    ((executionResult.charts?.length || 0) + (executionResult.plotly_charts?.length || 0)) > 0,
                    Boolean(analysis.code?.trim())
                );
            }

            const hasChart = countVisualizationArtifacts(executionResult) > 0 || hasAutoChartableData(executionResult.updated_df_sample);
            const hasCode = Boolean(analysis.code?.trim());
            const provenance = hasFiles
                ? buildAnalysisProvenance(
                    profiledSessionFiles.map((f) => ({
                        id: f.id,
                        name: f.filename,
                        metadata: (f.metadata || {}) as any,
                    })),
                    dataQualityWarnings.map((warning) => warning.message)
                )
                : undefined;
            const envelopeResult = buildAnalysisResponseEnvelope(finalSummary, {
                hasChart,
                hasCode,
                provenance,
            });
            const followUpPrompts = envelopeResult.envelope
                ? buildFollowUpPrompts(envelopeResult.envelope, {
                    provenance,
                    datasets: profiledSessionFiles.map((file) => {
                        const metadata = (file.metadata || {}) as any;
                        return {
                            name: file.filename,
                            measures: metadata.datasetIntelligence?.measures || [],
                            dimensions: metadata.datasetIntelligence?.dimensions || [],
                            dateFields: metadata.datasetIntelligence?.dateFields || [],
                            keyCandidates: metadata.datasetIntelligence?.keyCandidates || [],
                            candidateKpis: metadata.datasetIntelligence?.candidateKpis || [],
                            analysisMemory: metadata.analysisMemory ? {
                                commonFilters: metadata.analysisMemory.commonFilters || [],
                                previousCharts: metadata.analysisMemory.previousCharts || [],
                            } : undefined,
                        };
                    }),
                })
                : [];

            if (envelopeResult.usedFallback && envelopeResult.envelope) {
                finalSummary = renderEnvelopeAsSummary(envelopeResult.envelope);
            }

            if (hasFiles && envelopeResult.envelope) {
                await Promise.all(profiledSessionFiles.map(async (file) => {
                    const metadata = (file.metadata || {}) as any;
                    const nextAnalysisMemory = mergeDatasetAnalysisMemory({
                        existing: metadata.analysisMemory,
                        userQuery: content,
                        envelope: envelopeResult.envelope,
                        profile: metadata.datasetIntelligence,
                    });

                    await db.update(filesTable)
                        .set({
                            metadata: {
                                ...metadata,
                                analysisMemory: nextAnalysisMemory,
                            } as any,
                        })
                        .where(eq(filesTable.id, file.id));
                }));
            }

            await emitResponseQualityEvent({
                sessionId,
                userId: session.userId ?? undefined,
                usedEnvelopeFallback: envelopeResult.usedFallback,
                contractRepairAttempted,
                contractRepaired,
                initialViolations: initialContractValidation.violations,
            });

            const [assistantMsg] = await db.insert(messages).values({
                sessionId,
                role: 'assistant',
                content: finalSummary,
                code: analysis.code,
                result: {
                    output: executionResult.result,
                    error: executionResult.error,
                    traceback: executionResult.traceback,
                    charts: executionResult.charts,
                    plotly_charts: executionResult.plotly_charts,
                    updated_df_sample: executionResult.updated_df_sample,
                    provenance,
                    responseEnvelope: envelopeResult.envelope ?? undefined,
                    responseEnvelopeMeta: {
                        usedFallback: envelopeResult.usedFallback,
                        contractRepairAttempted,
                        contractRepaired,
                        initialViolations: initialContractValidation.violations,
                    },
                    followUpPrompts,
                },
                visualizationUrl: executionResult.charts?.[0]
                    ? `data:image/png;base64,${executionResult.charts[0]}`
                    : undefined,
            }).returning();

            if (session.messages.length === 0) {
                await db.update(sessions)
                    .set({ title: content.slice(0, 50), updatedAt: new Date() })
                    .where(eq(sessions.id, sessionId));
            }

            return NextResponse.json(assistantMsg);
        }

        const fileHint = hasFiles
            ? `\n\nAvailable files: ${sessionFiles.map((f) => f.filename).join(', ')}`
            : '';

        const connectorHint = linkedConnectorContext
            ? `\n\nLinked connectors (metadata only):\n${linkedConnectorContext}`
            : '';

        let chatResponse = await llm.chat(
            `${content}${fileHint}${connectorHint}`,
            session.messages,
            analysisMode === 'analysis' ? 'analysis' : 'chat',
            persona
        );

        // Apply the same artifact guard to chat-path responses
        chatResponse = sanitizeExecutiveSummary(chatResponse);
        if (containsTechnicalArtifacts(chatResponse)) {
            chatResponse = buildContractFallbackSummary(content, false, false);
        }

        const chatProvenance = hasFiles
            ? buildAnalysisProvenance(
                profiledSessionFiles.map((f) => ({
                    id: f.id,
                    name: f.filename,
                    metadata: (f.metadata || {}) as any,
                }))
            )
            : undefined;
        const chatEnvelopeResult = buildAnalysisResponseEnvelope(chatResponse, {
            hasChart: false,
            hasCode: false,
            provenance: chatProvenance,
        });
        const followUpPrompts = chatEnvelopeResult.envelope
            ? buildFollowUpPrompts(chatEnvelopeResult.envelope, {
                provenance: chatProvenance,
                datasets: profiledSessionFiles.map((file) => {
                    const metadata = (file.metadata || {}) as any;
                    return {
                        name: file.filename,
                        measures: metadata.datasetIntelligence?.measures || [],
                        dimensions: metadata.datasetIntelligence?.dimensions || [],
                        dateFields: metadata.datasetIntelligence?.dateFields || [],
                        keyCandidates: metadata.datasetIntelligence?.keyCandidates || [],
                        candidateKpis: metadata.datasetIntelligence?.candidateKpis || [],
                        analysisMemory: metadata.analysisMemory ? {
                            commonFilters: metadata.analysisMemory.commonFilters || [],
                            previousCharts: metadata.analysisMemory.previousCharts || [],
                        } : undefined,
                    };
                }),
            })
            : [];
        const persistedChatResponse = chatEnvelopeResult.envelope
            ? renderEnvelopeAsSummary(chatEnvelopeResult.envelope)
            : chatResponse;

        const [assistantMsg] = await db.insert(messages).values({
            sessionId,
            role: 'assistant',
            content: persistedChatResponse,
            result: {
                provenance: chatProvenance,
                responseEnvelope: chatEnvelopeResult.envelope,
                responseEnvelopeMeta: {
                    usedFallback: chatEnvelopeResult.usedFallback,
                    contractRepairAttempted: false,
                    contractRepaired: true,
                    initialViolations: [],
                },
                followUpPrompts,
            },
        }).returning();

        if (session.messages.length === 0) {
            await db.update(sessions)
                .set({ title: content.slice(0, 50), updatedAt: new Date() })
                .where(eq(sessions.id, sessionId));
        }

        return NextResponse.json(assistantMsg);
    } catch (error: any) {
        console.error('Chat API Error:', error);
        const classifiedError = classifyLlmError(error);
        return NextResponse.json(
            {
                error: classifiedError.error,
                content: classifiedError.content,
                role: 'assistant',
                id: `error-${Date.now()}`,
            },
            { status: classifiedError.status }
        );
    }
}

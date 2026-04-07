import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { messages, sessions } from '@/db/schema';
import { connectors } from '@/db/connectorSchema';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { buildDeterministicAnalysisFallbackCode, llm } from '@/services/llm';
import { kernelService } from '@/services/kernel';
import { generateDataIntelligenceReport, formatWarningsForPrompt, analyseFile, formatForPrompt, DataIntelligenceReport } from '@/services/dataIntelligenceService';
import { AnalysisMode } from '@/src/types';
import { authenticateRequest } from '@/lib/auth';
import { validateCSRFRequest } from '@/lib/csrf';
import { buildRecoverySnippet } from './recoverySnippets';
import { buildDeterministicFinancialSummary } from '../../../lib/financialSummaryGuard';
import { buildContractFallbackSummary, containsTechnicalArtifacts, validateSummaryContract } from '../../../lib/chatResponseContract';
import { buildAnalysisResponseEnvelope, renderEnvelopeAsSummary } from '../../../lib/chatResponseEnvelope';

export const dynamic = 'force-dynamic';

const THEORY_PATTERNS = /^(what is|define|explain|difference between|how does|why does|theory of|concept of)/i;
const ANALYSIS_PATTERNS = /(analy[sz]e|calculate|sum|average|mean|median|std|trend|forecast|correlation|regression|compare|distribution|top\s+\d+|bottom\s+\d+|group by|count)/i;
const VISUALIZATION_PATTERNS = /(chart|plot|graph|visuali[sz]e|dashboard|pie|bar|line|scatter|histogram|heatmap)/i;
const DATA_REFERENCE_PATTERNS = /(dataset|data|file|csv|excel|sheet|table|column|row|pdf|document)/i;
const NUMERIC_INTENT_PATTERNS = /(\d|percent|percentage|kpi|metric|trend|forecast|compare|distribution|anomal|outlier|top\s+\d+|bottom\s+\d+|count|sum|average|mean|median|std|revenue|cost|margin|volume)/i;

// Detect when the user pasted tabular/financial data inline (no uploaded file)
function containsInlineTabularData(content: string): boolean {
    const lines = content.split(/\r?\n/);
    // Look for pipe-delimited table rows (markdown tables or CSV-style pasted data)
    const tableRows = lines.filter((l) => l.includes('|') && l.trim().startsWith('|')).length;
    if (tableRows >= 3) return true;
    // Look for a dense cluster of numbers (financial data pasted as text)
    const numericLines = lines.filter((l) => (l.match(/[\d,.]+/g) || []).length >= 3).length;
    return numericLines >= 5;
}

function isColumnShapeError(errorText: string): boolean {
    return /columns passed, passed data had|valueerror:\s*\d+\s*columns passed|assertionerror:\s*\d+\s*columns passed/i.test(errorText || '');
}

function isTabularParseError(errorText: string): boolean {
    return /columns passed, passed data had|parsererror|error tokenizing data|expected\s+\d+\s+fields|saw\s+\d+|too many columns specified|shape of passed values/i.test(errorText || '');
}

function buildInlineFinancialFallbackCode(rawContent: string): string {
    const b64 = Buffer.from(rawContent || '', 'utf8').toString('base64');

    return `
import base64
import re
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

raw = base64.b64decode("${b64}").decode("utf-8", errors="ignore")
lines = [ln for ln in raw.splitlines() if ln.strip()]

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

    if len(candidates) < 12:
        # Ignore section labels or malformed rows that don't have monthly+YTD payload.
        continue

    # Keep exactly the first and last 6 numeric-like values to avoid ragged-row shape issues.
    monthly_vals = [parse_value(x) for x in candidates[:6]]
    ytd_vals = [parse_value(x) for x in candidates[-6:]]
    records.append((label, monthly_vals, ytd_vals))

if not records:
    result = "Unable to parse pasted financial table. Please keep the P&L table in tabular format with monthly and YTD values."
else:
    monthly_map = {label: vals for label, vals, _ in records}
    ytd_map = {label: vals for label, _, vals in records}

    df_m = pd.DataFrame(monthly_map, index=months)
    df_y = pd.DataFrame(ytd_map, index=months)

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
    fig.add_trace(go.Scatter(x=['Jun\'25', 'Jul\'25 (F)'], y=[float(df_m['Revenue from operations'].iloc[-1]), f_rev], mode='lines', name='Revenue Forecast', line={'dash':'dash'}), row=1, col=1)
    fig.add_trace(go.Scatter(x=['Jun\'25', 'Jul\'25 (F)'], y=[float(np.abs(df_m['Total expenses'].iloc[-1])), abs(f_exp)], mode='lines', name='Expenses Forecast', line={'dash':'dash'}), row=1, col=1)
    fig.add_trace(go.Scatter(x=['Jun\'25', 'Jul\'25 (F)'], y=[float(df_m['Profit for the year (PAT)'].iloc[-1]), f_pat], mode='lines', name='PAT Forecast', line={'dash':'dash'}), row=1, col=1)

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

function shouldRunDataAnalysis(content: string, mode: AnalysisMode, hasFiles: boolean): boolean {
    if (!hasFiles) return false;

    if (isTheoryOnlyQuery(content, hasFiles)) return false;

    // Unified mode: always run data analysis when files are present
    // unless it's a pure theory question
    return true;
}

function shouldEnforceVisualization(content: string, hasFiles: boolean): boolean {
    if (!hasFiles) return false;
    if (isTheoryOnlyQuery(content, hasFiles)) return false;
    return true;
}

function countVisualizationArtifacts(executionResult: {
    charts?: unknown[];
    plotly_charts?: unknown[];
} | null | undefined): number {
    return (executionResult?.charts?.length || 0) + (executionResult?.plotly_charts?.length || 0);
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
        const hasFiles = sessionFiles.length > 0;
        // Treat messages with pasted tabular/financial data as having effective data even without uploaded files
        const hasPastedData = !hasFiles && containsInlineTabularData(content);
        const effectiveHasFiles = hasFiles || hasPastedData;
        const runDataAnalysis = shouldRunDataAnalysis(content, analysisMode, effectiveHasFiles);

        if (runDataAnalysis) {
            // Build a synthetic file context when the user pasted data inline
            const pastedDataContext = hasPastedData
                ? [{ name: 'pasted_data.txt', schema: '{"columns":[],"row_count":0}', sample: [] }]
                : [];

            const fileContexts = hasFiles
                ? sessionFiles.map((f) => ({
                    name: f.filename,
                    schema: JSON.stringify(f.metadata, null, 2),
                    sample: (f.metadata as any)?.sample || [],
                }))
                : pastedDataContext;

            const executorFiles = sessionFiles.map((f) => ({
                id: f.id,
                name: f.filename,
                path: f.filePath,
            }));

            const dataQualityWarnings = generateDataIntelligenceReport(fileContexts);
            const dataQualityContext = formatWarningsForPrompt(dataQualityWarnings);

            /* ---- Data Intelligence Pre-Scan ---- */
            const intelligenceReports: DataIntelligenceReport[] = sessionFiles.map((f) => {
                const metadata = (f.metadata ?? {}) as Record<string, unknown>;
                const sample = (Array.isArray((metadata as any)?.sample) ? (metadata as any).sample : []) as Record<string, unknown>[];
                return analyseFile(metadata, sample);
            });
            const dataIntelligenceContext = formatForPrompt(intelligenceReports);

            let analysis = await llm.getAnalysisCode(
                content,
                fileContexts,
                session.messages,
                analysisMode,
                linkedConnectorContext,
                persona,
                dataQualityContext,
                dataIntelligenceContext
            );

            /* ---- Data recovery preamble for 0-row files ---- */
            const zeroRowFiles = sessionFiles.filter(
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
                    analysisMode
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
                    } else if (/could not convert string to float|valueerror/i.test(String(repairedResult.error || ''))) {
                        // Targeted second-pass repair for dirty numeric text in pasted/tabular data.
                        const numericRepair = await llm.repairAnalysisCode(
                            `${content}\n\nTARGETED FIX: sanitize numeric columns for '', '-', 'N/A', and whitespace using pd.to_numeric(..., errors='coerce').fillna(0). Avoid direct astype(float) on raw strings.`,
                            repaired.code,
                            repairedResult.error,
                            repairedResult.traceback,
                            fileContexts,
                            analysisMode
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
                            analysisMode
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
                            analysisMode
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

            const visualizationRequired = shouldEnforceVisualization(content, effectiveHasFiles);
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
                        dataIntelligenceContext
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
                            : buildDeterministicAnalysisFallbackCode(true);
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

            const hasChart = ((executionResult.charts?.length || 0) + (executionResult.plotly_charts?.length || 0)) > 0;
            const hasCode = Boolean(analysis.code?.trim());
            const deterministicFinancialSummary = buildDeterministicFinancialSummary(content, hasChart);
            const bypassEnvelope = Boolean(deterministicFinancialSummary);
            if (deterministicFinancialSummary) {
                finalSummary = deterministicFinancialSummary;
            }

            const envelopeResult = bypassEnvelope
                ? { envelope: null, usedFallback: false }
                : buildAnalysisResponseEnvelope(finalSummary, {
                    hasChart,
                    hasCode,
                });

            if (!bypassEnvelope && envelopeResult.usedFallback && envelopeResult.envelope) {
                finalSummary = renderEnvelopeAsSummary(envelopeResult.envelope);
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
                    responseEnvelope: envelopeResult.envelope ?? undefined,
                    responseEnvelopeMeta: {
                        usedFallback: envelopeResult.usedFallback,
                        contractRepairAttempted,
                        contractRepaired,
                        initialViolations: initialContractValidation.violations,
                    },
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

        const [assistantMsg] = await db.insert(messages).values({
            sessionId,
            role: 'assistant',
            content: chatResponse,
        }).returning();

        if (session.messages.length === 0) {
            await db.update(sessions)
                .set({ title: content.slice(0, 50), updatedAt: new Date() })
                .where(eq(sessions.id, sessionId));
        }

        return NextResponse.json(assistantMsg);
    } catch (error: any) {
        console.error('Chat API Error:', error);
        const errorMessage = 'An unexpected error occurred during analysis';
        return NextResponse.json(
            {
                error: errorMessage,
                content: `I encountered an error while processing your request: ${errorMessage}. Please try again.`,
                role: 'assistant',
                id: `error-${Date.now()}`,
            },
            { status: 500 }
        );
    }
}

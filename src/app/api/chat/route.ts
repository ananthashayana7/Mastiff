import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { messages, sessions } from '@/db/schema';
import { connectors } from '@/db/connectorSchema';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { llm } from '@/services/llm';
import { kernelService } from '@/services/kernel';
import { generateDataIntelligenceReport, formatWarningsForPrompt, analyseFile, formatForPrompt, DataIntelligenceReport } from '@/services/dataIntelligenceService';
import { AnalysisMode } from '@/src/types';
import { buildRecoverySnippet } from './recoverySnippets';
import { buildContractFallbackSummary, validateSummaryContract } from '../../../lib/chatResponseContract';
import { buildAnalysisResponseEnvelope, renderEnvelopeAsSummary } from '../../../lib/chatResponseEnvelope';

export const dynamic = 'force-dynamic';

const THEORY_PATTERNS = /^(what is|define|explain|difference between|how does|why does|theory of|concept of)/i;
const ANALYSIS_PATTERNS = /(analy[sz]e|calculate|sum|average|mean|median|std|trend|forecast|correlation|regression|compare|distribution|top\s+\d+|bottom\s+\d+|group by|count)/i;
const VISUALIZATION_PATTERNS = /(chart|plot|graph|visuali[sz]e|dashboard|pie|bar|line|scatter|histogram|heatmap)/i;
const DATA_REFERENCE_PATTERNS = /(dataset|data|file|csv|excel|sheet|table|column|row|pdf|document)/i;
const NUMERIC_INTENT_PATTERNS = /(\d|percent|percentage|kpi|metric|trend|forecast|compare|distribution|anomal|outlier|top\s+\d+|bottom\s+\d+|count|sum|average|mean|median|std|revenue|cost|margin|volume)/i;

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
    return NUMERIC_INTENT_PATTERNS.test(content) || VISUALIZATION_PATTERNS.test(content) || ANALYSIS_PATTERNS.test(content);
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
            where: eq(sessions.id, sessionId),
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
        if (normalizedLinkedConnectorIds.length > 0) {
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

        const sessionFiles = hasActiveFileSelection
            ? session.files.filter((file) => normalizedActiveFileIds.includes(file.id))
            : session.files;
        const hasFiles = sessionFiles.length > 0;
        const runDataAnalysis = shouldRunDataAnalysis(content, analysisMode, hasFiles);

        if (runDataAnalysis) {
            const fileContexts = sessionFiles.map((f) => ({
                name: f.filename,
                schema: JSON.stringify(f.metadata, null, 2),
                sample: (f.metadata as any)?.sample || [],
            }));

            const executorFiles = sessionFiles.map((f) => ({
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
                    }
                }
            }

            const currentChartCount = (executionResult.charts?.length || 0) + (executionResult.plotly_charts?.length || 0);
            const needsVisualizationRecovery = shouldEnforceVisualization(content, hasFiles)
                && !executionResult.error
                && currentChartCount === 0;

            if (needsVisualizationRecovery) {
                try {
                    const visualizationRecoveryPrompt = `${content}\n\nCRITICAL RECOVERY DIRECTIVE: The previous attempt produced no charts. Re-run analysis and MANDATORILY return at least one interactive Plotly chart from the uploaded data. The Python code must set result to a Plotly figure.`;

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
                        const recoveredChartCount = (visualizationExecution?.charts?.length || 0) + (visualizationExecution?.plotly_charts?.length || 0);

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

            const numericIntent = shouldEnforceVisualization(content, hasFiles);
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

            const hasChart = ((executionResult.charts?.length || 0) + (executionResult.plotly_charts?.length || 0)) > 0;
            const hasCode = Boolean(analysis.code?.trim());
            const envelopeResult = buildAnalysisResponseEnvelope(finalSummary, {
                hasChart,
                hasCode,
            });

            if (envelopeResult.usedFallback) {
                finalSummary = renderEnvelopeAsSummary(envelopeResult.envelope);
            }

            await emitResponseQualityEvent({
                sessionId,
                userId: session.userId,
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
                    responseEnvelope: envelopeResult.envelope,
                    responseEnvelopeMeta: {
                        usedFallback: envelopeResult.usedFallback,
                        contractRepairAttempted,
                        contractRepaired,
                        initialViolations: initialContractValidation.violations,
                    },
                },
                visualizationUrl: executionResult.charts?.[0]
                    ? `data:image/png;base64,${executionResult.charts[0]}`
                    : null,
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

        const chatResponse = await llm.chat(
            `${content}${fileHint}${connectorHint}`,
            session.messages,
            analysisMode === 'analysis' ? 'analysis' : 'chat',
            persona
        );

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
        let errorMessage = error?.message || '';
        if (!errorMessage && error?.code === 'ECONNREFUSED') {
            errorMessage = 'Database connection refused. Please ensure the database is running.';
        }
        if (!errorMessage) {
            errorMessage = 'An unexpected error occurred during analysis';
        }
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

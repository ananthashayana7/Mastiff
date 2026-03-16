import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { messages, sessions } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { llm } from '@/services/llm';
import { kernelService } from '@/services/kernel';
import { AnalysisMode } from '@/types';

export const dynamic = 'force-dynamic';

const THEORY_PATTERNS = /^(what is|define|explain|difference between|how does|why does|theory of|concept of)/i;
const ANALYSIS_PATTERNS = /(analy[sz]e|calculate|sum|average|mean|median|std|trend|forecast|correlation|regression|compare|distribution|top\s+\d+|bottom\s+\d+|group by|count)/i;
const VISUALIZATION_PATTERNS = /(chart|plot|graph|visuali[sz]e|dashboard|pie|bar|line|scatter|histogram|heatmap)/i;
const DATA_REFERENCE_PATTERNS = /(dataset|data|file|csv|excel|sheet|table|column|row|pdf|document)/i;

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

    if (VISUALIZATION_PATTERNS.test(content) || ANALYSIS_PATTERNS.test(content)) {
        return true;
    }

    return mode === 'analysis';
}

export async function POST(req: NextRequest) {
    try {
        const { sessionId, content, mode = 'analysis', silent = false } = await req.json();

        if (!sessionId || !content) {
            return NextResponse.json({ error: 'Missing sessionId or content' }, { status: 400 });
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
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (!silent) {
            await db.insert(messages).values({
                sessionId,
                role: 'user',
                content,
            });
        }

        const sessionFiles = session.files;
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

            const analysis = await llm.getAnalysisCode(content, fileContexts, session.messages, analysisMode);
            const executionResult = await kernelService.execute(sessionId, analysis.code, executorFiles);

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
                analysisMode
            );

            const [assistantMsg] = await db.insert(messages).values({
                sessionId,
                role: 'assistant',
                content: groundedSummary,
                code: analysis.code,
                result: {
                    output: executionResult.result,
                    error: executionResult.error,
                    traceback: executionResult.traceback,
                    charts: executionResult.charts,
                    plotly_charts: executionResult.plotly_charts,
                    updated_df_sample: executionResult.updated_df_sample,
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

        const chatResponse = await llm.chat(`${content}${fileHint}`, session.messages, analysisMode === 'analysis' ? 'analysis' : 'chat');

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
        return NextResponse.json(
            {
                error: error.message || 'An error occurred during analysis',
                content: `I encountered an error while processing your request: ${error.message}. Please try again.`,
                role: 'assistant',
                id: `error-${Date.now()}`,
            },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { messages, sessions, files as dbFiles } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { llm } from "@/services/llm";
import { kernelService } from "@/services/kernel";
import { AnalysisMode } from "@/types";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { sessionId, content, mode = 'standard', silent = false } = await req.json();

        if (!sessionId || !content) {
            return NextResponse.json({ error: "Missing sessionId or content" }, { status: 400 });
        }

        // Validate mode
        const validModes: AnalysisMode[] = ['chat', 'analysis'];
        const analysisMode: AnalysisMode = validModes.includes(mode) ? mode : 'analysis';

        // 1. Get session context
        const session = await db.query.sessions.findFirst({
            where: eq(sessions.id, sessionId),
            with: {
                files: true,
                messages: {
                    orderBy: asc(messages.createdAt),
                },
            },
        });

        if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

        // 2. Save user message first (skip if silent)
        if (!silent) {
            await db.insert(messages).values({
                sessionId,
                role: 'user',
                content: content,
            });
        }

        // 3. Check if we have files for data analysis mode
        const sessionFiles = session.files;
        const hasFiles = sessionFiles.length > 0;

        if (hasFiles) {
            // === DATA ANALYSIS MODE ===
            const fileContexts = sessionFiles.map(f => ({
                name: f.filename,
                schema: JSON.stringify(f.metadata, null, 2),
                sample: (f.metadata as any)?.sample || []
            }));

            const executorFiles = sessionFiles.map(f => ({
                name: f.filename,
                path: f.filePath
            }));

            const analysis = await llm.getAnalysisCode(content, fileContexts, session.messages, analysisMode);
            const executionResult = await kernelService.execute(sessionId, analysis.code, executorFiles);

            const [assistantMsg] = await db.insert(messages).values({
                sessionId,
                role: 'assistant',
                content: analysis.explanation,
                code: analysis.code,
                result: {
                    output: executionResult.result,
                    error: executionResult.error,
                    charts: executionResult.charts,
                    plotly_charts: executionResult.plotly_charts,
                    updated_df_sample: executionResult.updated_df_sample
                },
                visualizationUrl: executionResult.charts?.[0] ? `data:image/png;base64,${executionResult.charts[0]}` : null
            }).returning();

            if (session.messages.length === 0) {
                await db.update(sessions)
                    .set({ title: content.slice(0, 50), updatedAt: new Date() })
                    .where(eq(sessions.id, sessionId));
            }

            return NextResponse.json(assistantMsg);
        } else {
            // === CONVERSATIONAL AI MODE ===
            const chatResponse = await llm.chat(content, session.messages, analysisMode);

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
        }
    } catch (error: any) {
        console.error("Chat API Error:", error);
        return NextResponse.json({
            error: error.message || "An error occurred during analysis",
            content: `I encountered an error while processing your request: ${error.message}. Please try again.`,
            role: 'assistant',
            id: `error-${Date.now()}`
        }, { status: 500 });
    }
}

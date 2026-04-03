import express from 'express';
import { PrismaClient } from '@prisma/client';
import { llm } from '../services/llm';
import { executor } from '../services/executor';

const router = express.Router();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

// Send message and get analysis
router.post('/message', async (req, res) => {
    const { sessionId, content } = req.body;
    const userId = String(req.headers['x-user-id'] || '');

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!sessionId || !content) {
        return res.status(400).json({ error: 'Missing sessionId or content' });
    }

    try {
        // 1. Get session and file context
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: { files: true, messages: { orderBy: { createdAt: 'asc' } } }
        });

        if (!session) return res.status(404).json({ error: "Session not found" });
        if (session.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

        const activeFile = session.files[0]; // Simplification for MVP
        if (!activeFile) return res.status(400).json({ error: "No file uploaded for this session" });

        // 2. Prepare LLM inputs
        const schema = JSON.stringify(activeFile.metadata, null, 2);
        const sample = (activeFile.metadata as any)?.sample || [];

        // 3. Generate Analysis Code
        const analysis = await llm.getAnalysisCode(content, schema, sample, session.messages);

        // 4. Run Code
        const executionResult = await executor.executeCode(analysis.code, activeFile.filePath);

        // 5. Save and Return
        const assistantMsg = await prisma.message.create({
            data: {
                sessionId,
                role: 'assistant',
                content: analysis.explanation,
                code: analysis.code,
                result: executionResult.success ? { output: executionResult.result } : { error: executionResult.error },
                visualizationUrl: (executionResult as any).chart ? `data:image/png;base64,${(executionResult as any).chart}` : null
            }
        });

        res.json(assistantMsg);
    } catch (error: any) {
        console.error('Backend chat route error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;

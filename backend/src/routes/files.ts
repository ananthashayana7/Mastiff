import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolveRequestUserId } from '../middleware/auth';
import type { Request, Response } from 'express';

const router = express.Router();
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    const sessionId = String(req.body?.sessionId || '');
    const userId = resolveRequestUserId(req);
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    try {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

        // 1. Run Metadata Extraction (Python)
        const metadata = await new Promise((resolve, reject) => {
            const py = spawn('python', [path.join(__dirname, '../services/metadata.py'), file.path]);
            let stdout = '';
            let stderr = '';
            const timeout = setTimeout(() => {
                try { py.kill('SIGTERM'); } catch { }
                reject(new Error('Metadata extraction timed out'));
            }, 30000);
            py.stdout.on('data', data => stdout += data);
            py.stderr.on('data', data => stderr += data);
            py.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
            py.on('close', (code) => {
                clearTimeout(timeout);
                try {
                    if (code !== 0) {
                        reject(new Error(stderr || `Metadata process exited with code ${code}`));
                        return;
                    }
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    reject(new Error("Failed to parse metadata"));
                }
            });
        });

        // 2. Save to DB
        const dbFile = await prisma.file.create({
            data: {
                userId,
                sessionId,
                filename: file.originalname,
                fileType: path.extname(file.originalname).substring(1),
                filePath: file.path,
                fileSize: file.size,
                metadata: metadata as any
            }
        });

        res.json(dbFile);
    } catch (error: any) {
        console.error('Backend file upload route error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

router.get('/:id/preview', async (req: Request, res: Response) => {
    const userId = resolveRequestUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const file = await prisma.file.findUnique({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ error: "File not found" });
    if (file.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
    res.json((file.metadata as any)?.sample || []);
});

export default router;

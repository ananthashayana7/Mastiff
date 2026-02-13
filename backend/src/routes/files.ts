import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), async (req, res) => {
    const { userId, sessionId } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
        // 1. Run Metadata Extraction (Python)
        const metadata = await new Promise((resolve, reject) => {
            const py = spawn('python', [path.join(__dirname, '../services/metadata.py'), file.path]);
            let stdout = '';
            py.stdout.on('data', data => stdout += data);
            py.on('close', () => {
                try {
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
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id/preview', async (req, res) => {
    const file = await prisma.file.findUnique({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ error: "File not found" });
    res.json((file.metadata as any)?.sample || []);
});

export default router;

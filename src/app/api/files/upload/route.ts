import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { files as dbFiles } from '@/db/schema';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import mammoth from 'mammoth';

export const dynamic = 'force-dynamic';

const TABULAR_TYPES = ['.csv', '.xlsx', '.xls', '.json', '.parquet', '.tsv'];
const DOCUMENT_TYPES = ['.txt', '.pdf', '.docx', '.doc'];
const ACCEPTED_TYPES = [...TABULAR_TYPES, ...DOCUMENT_TYPES];
const MAX_SIZE = 50 * 1024 * 1024;

function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildDocumentMetadata(
    extractedText: string,
    originalName: string,
    ext: string
): Record<string, any> {
    const lines = extractedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const sample = lines.slice(0, 10).map((text, i) => ({
        line_number: i + 1,
        text,
    }));

    const words = extractedText.trim().split(/\s+/).filter(Boolean);

    return {
        row_count: lines.length,
        column_count: 2,
        document_type: ext.substring(1),
        original_filename: originalName,
        text_length: extractedText.length,
        word_count: words.length,
        columns: {
            line_number: {
                dtype: 'int64',
                null_count: 0,
                null_percentage: 0,
                unique_count: lines.length,
                sample_values: sample.slice(0, 5).map((r) => r.line_number),
            },
            text: {
                dtype: 'object',
                null_count: 0,
                null_percentage: 0,
                unique_count: new Set(lines).size,
                sample_values: sample.slice(0, 5).map((r) => r.text),
            },
        },
        sample,
    };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;

    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        disableFontFace: true,
    });

    const pdf = await loadingTask.promise;
    const chunks: string[] = [];

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const content = await page.getTextContent();
        const pageText = (content.items || [])
            .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
            .join(' ')
            .trim();

        if (pageText) {
            chunks.push(pageText);
        }
    }

    return chunks.join('\n\n');
}

async function extractDocumentText(buffer: Buffer, ext: string): Promise<string> {
    if (ext === '.txt' || ext === '.doc') {
        return buffer.toString('utf-8');
    }

    if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value || '';
    }

    if (ext === '.pdf') {
        return extractPdfText(buffer);
    }

    return '';
}

async function runMetadataExtraction(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(process.cwd(), 'src/services/metadata.py');
        const pythonCommands = ['python3', 'python', 'py'];
        let attemptIndex = 0;

        const trySpawn = () => {
            if (attemptIndex >= pythonCommands.length) {
                reject(new Error(`No Python interpreter found. Tried: ${pythonCommands.join(', ')}`));
                return;
            }

            const cmd = pythonCommands[attemptIndex];
            const py = spawn(cmd, [scriptPath, filePath]);
            let stdout = '';
            let stderr = '';

            const timeout = setTimeout(() => {
                py.kill();
                reject(new Error('Metadata extraction timed out after 30 seconds'));
            }, 30000);

            py.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            py.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            py.on('error', () => {
                clearTimeout(timeout);
                attemptIndex += 1;
                trySpawn();
            });

            py.on('close', (code) => {
                clearTimeout(timeout);
                if (code !== 0 && !stdout) {
                    reject(new Error(`Metadata extraction failed (code ${code}): ${stderr}`));
                    return;
                }

                try {
                    const output = stdout.trim();
                    if (!output) {
                        reject(new Error('Python metadata extraction returned no output'));
                        return;
                    }
                    resolve(JSON.parse(output));
                } catch (e: any) {
                    reject(new Error(`Failed to parse metadata JSON: ${e.message}`));
                }
            });
        };

        trySpawn();
    });
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const userId = formData.get('userId') as string;
        const sessionId = formData.get('sessionId') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        if (!userId || !sessionId) {
            return NextResponse.json({ error: 'Missing userId or sessionId' }, { status: 400 });
        }

        const ext = path.extname(file.name).toLowerCase();
        if (!ACCEPTED_TYPES.includes(ext)) {
            return NextResponse.json(
                { error: `Unsupported file type: ${ext}. Accepted: ${ACCEPTED_TYPES.join(', ')}` },
                { status: 400 }
            );
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                {
                    error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 50MB`,
                },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadDir = path.join(process.cwd(), 'uploads');
        await fs.mkdir(uploadDir, { recursive: true });

        const safeName = sanitizeFileName(file.name);
        const rawStoredPath = path.join(uploadDir, `${Date.now()}-${safeName}`);
        await fs.writeFile(rawStoredPath, buffer);

        let analysisPath = rawStoredPath;
        let metadata: any;

        if (TABULAR_TYPES.includes(ext)) {
            metadata = await runMetadataExtraction(analysisPath);
        } else {
            const text = (await extractDocumentText(buffer, ext)).trim();
            if (!text) {
                return NextResponse.json(
                    { error: 'Could not extract text from the uploaded document.' },
                    { status: 400 }
                );
            }

            const extractedPath = path.join(
                uploadDir,
                `${Date.now()}-${uuidv4()}-${safeName}.txt`
            );
            await fs.writeFile(extractedPath, text, 'utf-8');

            analysisPath = extractedPath;
            metadata = buildDocumentMetadata(text, file.name, ext);
        }

        const [dbFile] = await db.insert(dbFiles).values({
            userId,
            sessionId,
            filename: file.name,
            fileType: path.extname(file.name).substring(1),
            filePath: analysisPath,
            fileSize: file.size,
            metadata: metadata as any,
        }).returning();

        return NextResponse.json(dbFile);
    } catch (error: any) {
        console.error('Upload Route Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

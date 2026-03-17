import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { files as dbFiles } from '@/db/schema';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import mammoth from 'mammoth';
import xlsx from 'xlsx';

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

function detectDelimiter(lines: string[]): string {
    const candidates = [',', ';', '\t', '|'];
    let selected = ',';
    let selectedScore = -1;

    for (const candidate of candidates) {
        const score = lines.reduce((total, line) => total + Math.max(0, line.split(candidate).length - 1), 0);
        if (score > selectedScore) {
            selected = candidate;
            selectedScore = score;
        }
    }

    return selected;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];

        if (ch === '"') {
            const next = line[i + 1];
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === delimiter && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += ch;
    }

    values.push(current.trim());
    return values.map((value) => value.replace(/^"(.*)"$/, '$1').trim());
}

function parseScalar(rawValue: string): any {
    const value = String(rawValue ?? '').trim();
    if (!value) return null;

    if (/^(true|false)$/i.test(value)) {
        return value.toLowerCase() === 'true';
    }

    if (/^-?\d+(\.\d+)?$/.test(value)) {
        const num = Number(value);
        if (Number.isFinite(num)) return num;
    }

    return value;
}

function normalizeHeader(value: string, index: number): string {
    const normalized = String(value ?? '').trim();
    return normalized || `column_${index + 1}`;
}

function buildColumnMetadata(
    rows: Record<string, any>[],
    headers: string[]
): Record<string, any> {
    const columns: Record<string, any> = {};

    for (const header of headers) {
        const values = rows.map((row) => row[header]);
        const nonNullValues = values.filter(
            (value) => value !== null && value !== undefined && String(value).trim() !== ''
        );

        const nullCount = values.length - nonNullValues.length;
        const uniqueCount = new Set(nonNullValues.map((value) => JSON.stringify(value))).size;

        const isBoolean =
            nonNullValues.length > 0 &&
            nonNullValues.every((value) => typeof value === 'boolean');

        const isNumeric =
            nonNullValues.length > 0 &&
            nonNullValues.every((value) => typeof value === 'number' && Number.isFinite(value));

        columns[header] = {
            dtype: isBoolean ? 'bool' : isNumeric ? 'float64' : 'object',
            null_count: nullCount,
            null_percentage: rows.length > 0 ? Number(((nullCount / rows.length) * 100).toFixed(2)) : 0,
            unique_count: uniqueCount,
            sample_values: nonNullValues.slice(0, 5),
        };
    }

    return columns;
}

async function buildTabularMetadataFallback(
    filePath: string,
    originalName: string,
    ext: string
): Promise<Record<string, any>> {
    try {
        let headers: string[] = [];
        let rows: Record<string, any>[] = [];

        if (ext === '.json') {
            const rawJson = await fs.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(rawJson);

            let records: any[] = [];
            if (Array.isArray(parsed)) {
                records = parsed;
            } else if (parsed && typeof parsed === 'object') {
                const firstArrayValue = Object.values(parsed).find((value) => Array.isArray(value));
                records = Array.isArray(firstArrayValue) ? firstArrayValue : [parsed];
            }

            const objectRows = records
                .filter((value) => value && typeof value === 'object' && !Array.isArray(value))
                .map((value) => value as Record<string, any>);

            headers = Array.from(new Set(objectRows.flatMap((row) => Object.keys(row))));
            rows = objectRows.map((row) => {
                const normalized: Record<string, any> = {};
                headers.forEach((header) => {
                    normalized[header] = row[header] ?? null;
                });
                return normalized;
            });
        } else if (ext === '.xlsx' || ext === '.xls') {
            const workbook = xlsx.readFile(filePath, { cellDates: true });
            let bestGrid: any[][] = [];
            let bestScore = -1;

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                if (!sheet) continue;

                const grid = xlsx.utils.sheet_to_json<any[]>(sheet, {
                    header: 1,
                    defval: null,
                    raw: false,
                }) as any[][];

                const score = grid.length * (grid[0]?.length || 0);
                if (score > bestScore) {
                    bestGrid = grid;
                    bestScore = score;
                }
            }

            const [headerRow = [], ...dataRows] = bestGrid;
            headers = headerRow.map((cell, index) => normalizeHeader(String(cell ?? ''), index));
            rows = dataRows
                .filter((line) => Array.isArray(line) && line.some((cell) => cell !== null && String(cell).trim() !== ''))
                .map((line) => {
                    const row: Record<string, any> = {};
                    headers.forEach((header, index) => {
                        const value = line[index];
                        row[header] = value === undefined || value === '' ? null : value;
                    });
                    return row;
                });
        } else if (ext === '.parquet') {
            return {
                row_count: 0,
                column_count: 0,
                original_filename: originalName,
                extraction_mode: 'fallback',
                extraction_warning: 'Parquet fallback parser is unavailable without Python parquet dependencies.',
                columns: {},
                sample: [],
            };
        } else {
            const rawBuffer = await fs.readFile(filePath);
            let text = rawBuffer.toString('utf-8');
            if (text.includes('\uFFFD')) {
                text = rawBuffer.toString('latin1');
            }

            const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
            const delimiter = ext === '.tsv' ? '\t' : detectDelimiter(lines.slice(0, 20));

            const [headerLine = '', ...dataLines] = lines;
            headers = splitDelimitedLine(headerLine, delimiter).map((value, index) =>
                normalizeHeader(value, index)
            );

            rows = dataLines
                .map((line) => splitDelimitedLine(line, delimiter))
                .filter((values) => values.some((value) => value.trim().length > 0))
                .map((values) => {
                    const row: Record<string, any> = {};
                    headers.forEach((header, index) => {
                        row[header] = parseScalar(values[index] ?? '');
                    });
                    return row;
                });
        }

        if (headers.length === 0 && rows.length > 0) {
            headers = Object.keys(rows[0]);
        }

        return {
            row_count: rows.length,
            column_count: headers.length,
            original_filename: originalName,
            extraction_mode: 'fallback',
            columns: buildColumnMetadata(rows, headers),
            sample: rows.slice(0, 10),
        };
    } catch (error: any) {
        return {
            row_count: 0,
            column_count: 0,
            original_filename: originalName,
            extraction_mode: 'fallback',
            extraction_warning: error?.message || 'Fallback metadata extraction failed',
            columns: {},
            sample: [],
        };
    }
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
                try {
                    const output = stdout.trim();
                    if (!output) {
                        if (code !== 0) {
                            reject(new Error(`Metadata extraction failed (code ${code}): ${stderr || 'No stderr output'}`));
                        } else {
                            reject(new Error('Python metadata extraction returned no output'));
                        }
                        return;
                    }

                    const parsed = JSON.parse(output);
                    if (parsed?.error) {
                        reject(new Error(`Metadata extraction failed: ${parsed.error}`));
                        return;
                    }

                    if (code !== 0) {
                        reject(new Error(`Metadata extraction failed (code ${code}): ${stderr || 'Unknown Python error'}`));
                        return;
                    }

                    resolve(parsed);
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
            try {
                metadata = await runMetadataExtraction(analysisPath);
            } catch (metadataError: any) {
                console.warn('Python metadata extraction failed, using fallback parser:', metadataError?.message || metadataError);
                metadata = await buildTabularMetadataFallback(analysisPath, file.name, ext);
                metadata.extraction_warning = metadataError?.message || 'Metadata fallback parser used';
            }
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

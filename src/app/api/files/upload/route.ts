import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { files as dbFiles, sessions as dbSessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { authenticateRequest } from '@/lib/auth';
import { validateCSRFRequest } from '@/lib/csrf';
import {
    ACCEPTED_TYPES,
    TABULAR_TYPES,
    buildDocumentMetadata,
    buildTabularMetadataFallback,
    extractDocumentText,
    formatMetadataExtractionWarning,
    preferRicherTabularMetadata,
    sanitizeFileName,
} from '@/lib/fileIngestion';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 50 * 1024 * 1024;

function splitNameAndExtension(filename: string): { basename: string; extension: string } {
    const extension = path.extname(filename);
    const basename = extension ? filename.slice(0, -extension.length) : filename;
    return {
        basename: basename || filename,
        extension,
    };
}

function buildVersionedFilename(filename: string, existingNames: string[]): string {
    const normalizedExisting = new Set(existingNames.map((value) => value.trim().toLowerCase()));
    if (!normalizedExisting.has(filename.trim().toLowerCase())) {
        return filename;
    }

    const { basename, extension } = splitNameAndExtension(filename);
    let version = 2;
    let candidate = `${basename} (v${version})${extension}`;

    while (normalizedExisting.has(candidate.trim().toLowerCase())) {
        version += 1;
        candidate = `${basename} (v${version})${extension}`;
    }

    return candidate;
}

async function deleteFileRecordsById(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;

    for (const fileId of fileIds) {
        await db.delete(dbFiles).where(eq(dbFiles.id, fileId));
    }
}

async function runMetadataExtraction(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(process.cwd(), 'src/services/metadata.py');
        const pythonCommands = process.platform === 'win32'
            ? [
                { cmd: 'py', args: ['-3'] },
                { cmd: 'python', args: [] },
                { cmd: 'python3', args: [] },
            ]
            : [
                { cmd: 'python3', args: [] },
                { cmd: 'python', args: [] },
                { cmd: 'py', args: ['-3'] },
            ];
        let attemptIndex = 0;
        const attemptErrors: string[] = [];

        const missingPathHint = (detail?: string) =>
            detail ? `The Python metadata extractor could not be started (${detail}).` : 'The Python metadata extractor could not be started.';

        const trySpawn = () => {
            if (attemptIndex >= pythonCommands.length) {
                const detail = attemptErrors.length > 0
                    ? ` ${attemptErrors.join(' | ')}`
                    : '';
                reject(new Error(`No Python interpreter found for metadata extraction. Tried: ${pythonCommands.map((candidate) => candidate.cmd).join(', ')}.${detail}`));
                return;
            }

            const candidate = pythonCommands[attemptIndex];
            const py = spawn(candidate.cmd, [...candidate.args, scriptPath, filePath], {
                windowsHide: true,
            });
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

            py.on('error', (error: NodeJS.ErrnoException) => {
                clearTimeout(timeout);
                attemptErrors.push(`${candidate.cmd}: ${error.code || error.message}`);
                attemptIndex += 1;
                trySpawn();
            });

            py.on('close', (code) => {
                clearTimeout(timeout);

                const normalizedStderr = stderr.trim();
                const likelyMissingInterpreter = code === -4058 || code === 9009;
                if (likelyMissingInterpreter) {
                    attemptErrors.push(`${candidate.cmd}: ${normalizedStderr || `exit code ${code}`}`);
                    attemptIndex += 1;
                    trySpawn();
                    return;
                }

                try {
                    const output = stdout.trim();
                    if (!output) {
                        if (code !== 0) {
                            reject(new Error(`Metadata extraction failed (code ${code}): ${normalizedStderr || missingPathHint(`exit code ${code}`)}`));
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
                        reject(new Error(`Metadata extraction failed (code ${code}): ${normalizedStderr || 'Unknown Python error'}`));
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
        const csrfValidation = await validateCSRFRequest(req);
        if (!csrfValidation.valid) {
            return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
        }

        const user = await authenticateRequest(req);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const sessionId = formData.get('sessionId') as string;
        const uploadMode = String(formData.get('uploadMode') || 'new_version').toLowerCase();

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        const session = await db.query.sessions.findFirst({
            where: and(eq(dbSessions.id, sessionId), eq(dbSessions.userId, user.id)),
        });

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const effectiveUserId = session.userId;
        if (!effectiveUserId) {
            return NextResponse.json({ error: 'Session has no owner' }, { status: 400 });
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

        const existingFiles = await db.query.files.findMany({
            where: and(eq(dbFiles.sessionId, sessionId), eq(dbFiles.userId, effectiveUserId)),
        });

        const conflictingFiles = existingFiles.filter(
            (existing) => existing.filename.trim().toLowerCase() === file.name.trim().toLowerCase()
        );
        const conflictingFileIds = conflictingFiles.map((existing) => existing.id);
        let duplicateResolution: 'none' | 'replaced' | 'versioned' = 'none';
        let storedFilename = file.name;

        if (conflictingFiles.length > 0) {
            if (uploadMode === 'replace') {
                duplicateResolution = 'replaced';
                await Promise.all(conflictingFiles.map(async (existing) => {
                    try {
                        await fs.rm(existing.filePath, { force: true });
                    } catch {
                        // Ignore missing temp files and continue DB cleanup.
                    }
                }));
                await deleteFileRecordsById(conflictingFileIds);
            } else {
                storedFilename = buildVersionedFilename(file.name, existingFiles.map((existing) => existing.filename));
                duplicateResolution = storedFilename === file.name ? 'none' : 'versioned';
            }
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadDir = path.join(process.cwd(), 'uploads');
        await fs.mkdir(uploadDir, { recursive: true });

        const safeName = sanitizeFileName(storedFilename);
        const rawStoredPath = path.join(uploadDir, `${Date.now()}-${safeName}`);
        await fs.writeFile(rawStoredPath, buffer);

        let analysisPath = rawStoredPath;
        let metadata: any;

        if (TABULAR_TYPES.includes(ext)) {
            const supportsFallbackComparison = ext !== '.parquet';
            try {
                metadata = await runMetadataExtraction(analysisPath);
                const metadataLooksWeak = !metadata
                    || typeof metadata !== 'object'
                    || Number(metadata.row_count || 0) === 0
                    || Number(metadata.column_count || 0) === 0
                    || !Array.isArray(metadata.sample)
                    || metadata.sample.length === 0;

                if (supportsFallbackComparison && metadataLooksWeak) {
                    const fallbackMetadata = await buildTabularMetadataFallback(analysisPath, storedFilename, ext);
                    metadata = preferRicherTabularMetadata(metadata, fallbackMetadata);
                }
            } catch (metadataError: any) {
                console.warn('Python metadata extraction failed, using fallback parser:', metadataError?.message || metadataError);
                metadata = await buildTabularMetadataFallback(analysisPath, storedFilename, ext);
                metadata.extraction_warning = formatMetadataExtractionWarning(metadataError);
            }

            metadata = {
                ...(metadata || {}),
                original_filename: file.name,
            };
        } else {
            const text = await extractDocumentText(buffer, ext);
            const extractedPath = path.join(
                uploadDir,
                `${Date.now()}-${crypto.randomUUID()}-${safeName}.txt`
            );
            await fs.writeFile(extractedPath, text, 'utf-8');

            analysisPath = extractedPath;
            metadata = buildDocumentMetadata(text, storedFilename, ext);
            metadata.original_filename = file.name;
        }

        const [dbFile] = await db.insert(dbFiles).values({
            userId: effectiveUserId,
            sessionId,
            filename: storedFilename,
            fileType: path.extname(file.name).substring(1),
            filePath: analysisPath,
            fileSize: file.size,
            metadata: {
                ...(metadata || {}),
                validationStatus: 'pending',
                duplicate_resolution: duplicateResolution,
                replaced_file_ids: conflictingFileIds,
                version_label: duplicateResolution === 'versioned' ? storedFilename : undefined,
            } as any,
        }).returning();

        return NextResponse.json({
            ...dbFile,
            duplicateResolution,
            replacedFileIds: conflictingFileIds,
            storedFilename,
        });
    } catch (error: any) {
        console.error('Upload Route Error:', error);
        return NextResponse.json({ error: error?.message || 'File upload failed' }, { status: 500 });
    }
}

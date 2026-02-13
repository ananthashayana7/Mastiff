import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { files as dbFiles } from "@/db/schema";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const userId = formData.get("userId") as string;
        const sessionId = formData.get("sessionId") as string;

        console.log(`Uploading file: ${file?.name} for session: ${sessionId}`);

        if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

        // File type validation
        const ext = path.extname(file.name).toLowerCase();
        const ACCEPTED_TYPES = ['.csv', '.xlsx', '.xls', '.json', '.parquet', '.tsv', '.txt'];
        if (!ACCEPTED_TYPES.includes(ext)) {
            return NextResponse.json({
                error: `Unsupported file type: ${ext}. Accepted: ${ACCEPTED_TYPES.join(', ')}`
            }, { status: 400 });
        }

        // File size limit (50MB)
        const MAX_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return NextResponse.json({
                error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 50MB`
            }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadDir = path.join(process.cwd(), "uploads");
        await fs.mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, `${Date.now()}-${file.name}`);
        await fs.writeFile(filePath, buffer);

        // 1. Run Metadata Extraction (Python)
        const metadata = await new Promise((resolve, reject) => {
            const scriptPath = path.join(process.cwd(), 'src/services/metadata.py');
            const pythonCommands = ['python3', 'python', 'py'];
            let attemptIndex = 0;

            const trySpawn = () => {
                if (attemptIndex >= pythonCommands.length) {
                    reject(new Error("No Python interpreter found. Tried: " + pythonCommands.join(', ')));
                    return;
                }

                const cmd = pythonCommands[attemptIndex];
                console.log(`Trying Python command: ${cmd}`);
                const py = spawn(cmd, [scriptPath, filePath]);
                let stdout = '';
                let stderr = '';

                const timeout = setTimeout(() => {
                    py.kill();
                    reject(new Error("Metadata extraction timed out after 30 seconds"));
                }, 30000);

                py.stdout.on('data', (data) => {
                    const str = data.toString();
                    stdout += str;
                });
                py.stderr.on('data', (data) => {
                    const str = data.toString();
                    stderr += str;
                    console.error("Python Stderr:", str);
                });

                py.on('error', () => {
                    clearTimeout(timeout);
                    attemptIndex++;
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
                            reject(new Error("Python script returned no output"));
                            return;
                        }
                        resolve(JSON.parse(output));
                    } catch (e: any) {
                        reject(new Error(`Failed to parse metadata JSON: ${e.message}. Raw: ${stdout}`));
                    }
                });
            };

            trySpawn();
        });

        // 2. Save to DB
        const [dbFile] = await db.insert(dbFiles).values({
            userId,
            sessionId,
            filename: file.name,
            fileType: path.extname(file.name).substring(1),
            filePath: filePath,
            fileSize: file.size,
            metadata: metadata as any
        }).returning();

        return NextResponse.json(dbFile);
    } catch (error: any) {
        console.error("Upload Route Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

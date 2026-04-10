import { NextRequest, NextResponse } from "next/server";
import fs from 'fs/promises';
import { db } from "@/db";
import { sessions, messages, files } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateRequest } from '@/lib/auth';
import { validateCSRFRequest } from '@/lib/csrf';
import { kernelService } from '@/services/kernel';

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const csrfValidation = await validateCSRFRequest(req);
        if (!csrfValidation.valid) {
            return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
        }

        const user = await authenticateRequest(req);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const id = params.id;
        if (!id) return NextResponse.json({ error: "Missing session ID" }, { status: 400 });

        const session = await db.query.sessions.findFirst({
            where: and(eq(sessions.id, id), eq(sessions.userId, user.id)),
        });
        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const sessionFiles = await db.query.files.findMany({
            where: and(eq(files.sessionId, id), eq(files.userId, user.id)),
        });

        console.log(`Deleting session: ${id} for user ${user.id}`);

        for (const file of sessionFiles) {
            await fs.rm(file.filePath, { force: true });
        }

        await db.transaction(async (tx) => {
            // Delete session data after uploaded file cleanup succeeds.
            await tx.delete(messages).where(eq(messages.sessionId, id));
            await tx.delete(files).where(eq(files.sessionId, id));
            await tx.delete(sessions).where(eq(sessions.id, id));
        });

        kernelService.terminate(id);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Delete Session Error:", error);
        return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }
}

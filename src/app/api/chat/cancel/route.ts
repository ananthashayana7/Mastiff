import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { sessions } from '@/db/schema';
import { authenticateRequest } from '@/lib/auth';
import { validateCSRFRequest } from '@/lib/csrf';
import { kernelService } from '@/services/kernel';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const csrfValidation = await validateCSRFRequest(request);
    if (!csrfValidation.valid) {
        return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
    }

    const user = await authenticateRequest(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : '';

    if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const session = await db.query.sessions.findFirst({
        where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
    });

    if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    kernelService.terminate(sessionId);
    return NextResponse.json({ success: true });
}
